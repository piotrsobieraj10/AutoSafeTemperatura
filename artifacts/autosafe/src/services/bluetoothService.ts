// bluetoothService.ts v5.1 — ELA Blue PUCK T/RHT przez BLE Advertising
//
// Ustalony format z realnych ramek nRF Connect:
// 02 01 06 | 05 16 6E 2A 1C 09 | 0E 09 50 ...
// AD Type 0x16 + UUID 0x2A6E: int16LE / 100 = temperatura °C
// AD Type 0x16 + UUID 0x2A6F: uint16LE / 100 = wilgotność %
// AD Type 0xFF + Company ID 0x0757: ostatnie 2 bajty payloadu = bateria mV

import type { DecodedData, Sensor } from "@/types/sensor";
import {
  ALL_COMPANY_IDS,
  COMPANY_IDS,
  detectProfileByCompanyId,
  detectProfileByName,
  ELA_HUMIDITY_UUID,
  ELA_TEMP_UUID,
  getProfile,
} from "./sensorProfiles";

interface NavWithBT extends Navigator { bluetooth?: BTAPI; }
interface BTAPI {
  requestDevice: (o: RequestDeviceOptions) => Promise<BTDevice>;
  getAvailability?: () => Promise<boolean>;
  getDevices?: () => Promise<BTDevice[]>;
  requestLEScan?: (o?: RequestLEScanOptions) => Promise<{ active: boolean; stop: () => void }>;
}
interface RequestDeviceOptions {
  acceptAllDevices?: boolean;
  filters?: Array<{ services?: string[]; namePrefix?: string; name?: string }>;
  optionalServices?: string[];
  optionalManufacturerData?: number[];
}
interface RequestLEScanOptions {
  acceptAllAdvertisements?: boolean;
  filters?: Array<{ services?: string[]; namePrefix?: string; name?: string }>;
  keepRepeatedDevices?: boolean;
}
export interface BTDevice {
  id: string;
  name?: string | null;
  gatt?: {
    connected: boolean;
    connect: () => Promise<BTGATTServer>;
    disconnect: () => void;
  };
  watchAdvertisements?: (o?: { signal?: AbortSignal }) => Promise<void>;
  addEventListener?: (t: string, l: (e: BTAdvEvent) => void) => void;
  removeEventListener?: (t: string, l: (e: BTAdvEvent) => void) => void;
}
interface BTGATTServer { getPrimaryService: (u: string) => Promise<BTGATTService>; }
interface BTGATTService { getCharacteristic: (u: string) => Promise<BTGATTChar>; }
interface BTGATTChar {
  readValue: () => Promise<DataView>;
  startNotifications?: () => Promise<BTGATTChar>;
  addEventListener?: (t: string, l: (e: Event) => void) => void;
}
export interface BTAdvEvent extends Event {
  device: BTDevice;
  rssi?: number;
  manufacturerData?: Map<number, DataView>;
  serviceData?: Map<string, DataView>;
}

export type ScanMode = "ela" | "all";

const deviceCache = new Map<string, BTDevice>();
const advControllers = new Map<string, AbortController>();
const getBT = (): BTAPI | undefined => (navigator as NavWithBT).bluetooth;

const ELA_NAME_FILTERS = [
  { namePrefix: "P T" },
  { namePrefix: "P T EN" },
  { namePrefix: "P RHT" },
  { namePrefix: "P RHT EN" },
  { namePrefix: "BPUCK" },
  { namePrefix: "ELA" },
];

const OPTIONAL_SERVICES = [
  "0000181a-0000-1000-8000-00805f9b34fb",
  "environmental_sensing",
  ELA_TEMP_UUID,
  ELA_HUMIDITY_UUID,
  "health_thermometer",
  "ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6",
  "ef090000-11d6-42ba-93b8-9dd7ec090ab0",
  "0000fff0-0000-1000-8000-00805f9b34fb",
];

export const isBluetoothAvailable = async (): Promise<boolean> => {
  const bt = getBT();
  if (!bt) return false;
  try { return bt.getAvailability ? await bt.getAvailability() : true; }
  catch { return false; }
};

export const isAdvertisementScanSupported = (): boolean => {
  try {
    const p = (window as unknown as { BluetoothDevice?: { prototype: unknown } }).BluetoothDevice?.prototype as Record<string, unknown> | undefined;
    return typeof p?.watchAdvertisements === "function";
  } catch { return false; }
};

export interface ScanResult {
  device: BTDevice;
  detectedProfileId: string | null;
  data: DecodedData;
}
export type ScanCallback = (r: ScanResult) => void;

const dvToHex = (dv?: DataView): string | undefined => {
  if (!dv) return undefined;
  return Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
};

const uuidLooksLike = (uuid: string, shortHex: string) => uuid.toLowerCase().replace(/[^a-f0-9]/g, "").includes(shortHex.toLowerCase());

const decodeTempValue = (dv: DataView): number | undefined => {
  if (dv.byteLength < 2) return undefined;
  const offset = dv.byteLength >= 4 && dv.getUint16(0, true) === 0x2A6E ? 2 : 0;
  if (dv.byteLength < offset + 2) return undefined;
  const temp = dv.getInt16(offset, true) / 100;
  return temp >= -80 && temp <= 120 ? Math.round(temp * 100) / 100 : undefined;
};

const decodeHumidityValue = (dv: DataView): number | undefined => {
  if (dv.byteLength < 2) return undefined;
  const offset = dv.byteLength >= 4 && dv.getUint16(0, true) === 0x2A6F ? 2 : 0;
  if (dv.byteLength < offset + 2) return undefined;
  const humidity = dv.getUint16(offset, true) / 100;
  return humidity >= 0 && humidity <= 100 ? Math.round(humidity * 100) / 100 : undefined;
};

const decodeBatteryFromElaManufacturer = (dv: DataView): Pick<DecodedData, "battery" | "batteryVoltage"> => {
  if (dv.byteLength < 3) return {};
  const mv = dv.getUint16(dv.byteLength - 2, true);
  if (mv < 1500 || mv > 4000) return {};
  return {
    batteryVoltage: mv,
    battery: Math.max(0, Math.min(100, Math.round(((mv - 2000) / 1200) * 100))),
  };
};

export const decodeAdvertisementEvent = (event: BTAdvEvent, hintProfileId?: string | null): { data: DecodedData; profileId: string | null } => {
  const data: DecodedData = { rssi: event.rssi ?? undefined };
  const serviceParts: string[] = [];
  const manufacturerParts: string[] = [];
  let profileId = hintProfileId ?? detectProfileByName(event.device?.name) ?? null;

  if (event.serviceData) {
    for (const [uuid, view] of event.serviceData) {
      const hex = dvToHex(view);
      serviceParts.push(`${uuid}=${hex ?? ""}`);
      if (uuidLooksLike(uuid, "2a6e")) {
        const t = decodeTempValue(view);
        if (t !== undefined) {
          data.temperature = t;
          profileId = profileId ?? "ela-blue-puck-t";
        }
      }
      if (uuidLooksLike(uuid, "2a6f")) {
        const h = decodeHumidityValue(view);
        if (h !== undefined) {
          data.humidity = h;
          profileId = "ela-blue-puck-rht";
        }
      }
    }
  }

  if (event.manufacturerData) {
    for (const [companyId, view] of event.manufacturerData) {
      const hex = dvToHex(view);
      manufacturerParts.push(`0x${companyId.toString(16).toUpperCase().padStart(4, "0")}=${hex ?? ""}`);
      if (companyId === COMPANY_IDS.ELA) {
        Object.assign(data, decodeBatteryFromElaManufacturer(view));
        profileId = profileId ?? detectProfileByName(event.device?.name) ?? "ela-blue-puck-t";
      } else {
        const pid = detectProfileByCompanyId(companyId);
        const profile = getProfile(pid ?? undefined);
        if (pid && profile?.decodeAdvertisement) {
          try {
            Object.assign(data, profile.decodeAdvertisement(view, event.rssi));
            profileId = profileId ?? pid;
          } catch { /* ignoruj niepasującą ramkę */ }
        }
      }
    }
  }

  data.rawServiceData = serviceParts.join(" | ") || undefined;
  data.rawManufacturerData = manufacturerParts.join(" | ") || undefined;
  data.bleDebug = [
    event.device?.name ? `name=${event.device.name}` : undefined,
    event.rssi != null ? `rssi=${event.rssi}` : undefined,
    data.rawServiceData ? `serviceData=${data.rawServiceData}` : undefined,
    data.rawManufacturerData ? `manufacturerData=${data.rawManufacturerData}` : undefined,
  ].filter(Boolean).join("; ") || undefined;

  return { data, profileId };
};

export const cacheGrantedDevices = async (): Promise<BTDevice[]> => {
  const bt = getBT();
  if (!bt?.getDevices) return [];
  try {
    const devices = await bt.getDevices();
    devices.forEach((d) => { if (d.id) deviceCache.set(d.id, d); });
    return devices;
  } catch { return []; }
};

// Główna funkcja wyboru urządzenia. Dla ELA najważniejszy jest watchAdvertisements, nie GATT.
export const scanForDevice = async (
  onData: ScanCallback,
  onError?: (e: Error) => void,
  mode: ScanMode = "ela"
): Promise<BTDevice | null> => {
  const bt = getBT();
  if (!bt) throw new Error("Web Bluetooth niedostępne. Użyj Chrome na Androidzie i HTTPS.");

  const options: RequestDeviceOptions = mode === "all"
    ? { acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES, optionalManufacturerData: ALL_COMPANY_IDS }
    : { filters: ELA_NAME_FILTERS, optionalServices: OPTIONAL_SERVICES, optionalManufacturerData: ALL_COMPANY_IDS };

  const device = await bt.requestDevice(options);
  if (!device?.id) return null;
  deviceCache.set(device.id, device);

  const hintProfileId = detectProfileByName(device.name) ?? "ela-blue-puck-t";

  if (typeof device.watchAdvertisements === "function" && device.addEventListener) {
    await startAdvWatch(device, hintProfileId, onData, onError).catch((e) => {
      onError?.(new Error(`Czujnik zapisany, ale nie udało się uruchomić nasłuchu reklam BLE: ${e instanceof Error ? e.message : String(e)}`));
    });
  } else {
    onError?.(new Error("Przeglądarka nie udostępnia danych reklamowych BLE. Czujnik można zapisać, ale pełny odczyt może wymagać aplikacji Android."));
  }

  // GATT tylko jako fallback dla profili nie-ELA. Blue PUCK T/RHT nie wymaga CONNECT.
  const isEla = (device.name ?? "").toLowerCase().startsWith("p t") || (device.name ?? "").toLowerCase().includes("rht") || hintProfileId.startsWith("ela-blue-puck");
  if (!isEla) {
    connectGATTWithNotifications(device, hintProfileId, onData, onError).catch(() => {});
  }

  return device;
};

export const connectGATTWithNotifications = async (
  device: BTDevice,
  hintProfileId: string | null,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<void> => {
  if (!device.gatt) return;
  try {
    const server = await device.gatt.connect();
    const serviceUUIDs = ["0000181a-0000-1000-8000-00805f9b34fb", "environmental_sensing", "health_thermometer"];
    const charUUIDs = [ELA_TEMP_UUID, "temperature_measurement", "temperature"];
    let char: BTGATTChar | null = null;

    for (const svcUUID of serviceUUIDs) {
      if (char) break;
      try {
        const svc = await server.getPrimaryService(svcUUID);
        for (const chUUID of charUUIDs) {
          try { char = await svc.getCharacteristic(chUUID); break; } catch { /* next */ }
        }
      } catch { /* next */ }
    }

    if (!char) return;

    const emitValue = (value: DataView) => {
      const temp = decodeTempValue(value);
      if (temp !== undefined) onData({ device, detectedProfileId: hintProfileId ?? "gatt-ess", data: { temperature: temp } });
    };

    try { emitValue(await char.readValue()); } catch { /* optional */ }
    if (char.startNotifications && char.addEventListener) {
      try {
        await char.startNotifications();
        char.addEventListener("characteristicvaluechanged", (e: Event) => {
          const ev = e as Event & { target: { value?: DataView } };
          if (ev.target?.value) emitValue(ev.target.value);
        });
      } catch { /* optional */ }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.toLowerCase().includes("gatt") && !msg.toLowerCase().includes("disconnect")) {
      onError?.(new Error(`Błąd GATT: ${msg}`));
    }
  }
};

export const startAdvWatch = async (
  device: BTDevice,
  hintProfileId: string | null,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<AbortController> => {
  if (!device.watchAdvertisements || !device.addEventListener) {
    throw new Error("watchAdvertisements niedostępne w tej przeglądarce.");
  }

  const old = advControllers.get(device.id);
  old?.abort();

  const controller = new AbortController();
  advControllers.set(device.id, controller);

  const handler = (event: BTAdvEvent) => {
    const decoded = decodeAdvertisementEvent(event, hintProfileId);
    const hasUsefulData = decoded.data.temperature !== undefined || decoded.data.humidity !== undefined || decoded.data.battery !== undefined || decoded.data.batteryVoltage !== undefined || decoded.data.rssi !== undefined || decoded.data.rawServiceData || decoded.data.rawManufacturerData;
    if (!hasUsefulData) return;
    onData({ device, detectedProfileId: decoded.profileId ?? hintProfileId, data: decoded.data });
  };

  device.addEventListener("advertisementreceived", handler);
  controller.signal.addEventListener("abort", () => {
    device.removeEventListener?.("advertisementreceived", handler);
  });

  try {
    await device.watchAdvertisements({ signal: controller.signal });
  } catch (e) {
    device.removeEventListener?.("advertisementreceived", handler);
    advControllers.delete(device.id);
    const msg = e instanceof Error ? e.message : String(e);
    onError?.(new Error(`Nie udało się uruchomić BLE advertising: ${msg}`));
    throw e;
  }
  return controller;
};

export const stopAdvWatch = (id: string) => { advControllers.get(id)?.abort(); advControllers.delete(id); };
export const getCachedDevice = (id: string) => deviceCache.get(id);
export const disconnectGATT = (d: BTDevice) => d.gatt?.disconnect();

export const reconnectSensor = async (
  sensor: Sensor,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<boolean> => {
  let device = deviceCache.get(sensor.deviceId);
  if (!device) {
    const granted = await cacheGrantedDevices();
    device = granted.find((d) => d.id === sensor.deviceId || d.name === sensor.bluetoothName);
  }
  if (!device) return false;

  deviceCache.set(device.id, device);
  stopAdvWatch(device.id);

  const profile = getProfile(sensor.profileId);
  if (profile?.source === "advertisement" || sensor.profileId.startsWith("ela-blue-puck")) {
    await startAdvWatch(device, sensor.profileId, onData, onError);
    return true;
  }

  await connectGATTWithNotifications(device, sensor.profileId, onData, onError);
  return true;
};

export const readSensorGATT = async (device: BTDevice, profileId: string): Promise<DecodedData> => {
  const profile = getProfile(profileId);
  if (!profile?.serviceUuid || !profile?.characteristicUuid || !profile.decodeGatt) throw new Error("Profil GATT niekompletny.");
  if (!device.gatt) throw new Error("Urządzenie bez GATT.");
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(profile.serviceUuid);
  const char = await service.getCharacteristic(profile.characteristicUuid);
  return profile.decodeGatt(await char.readValue());
};
