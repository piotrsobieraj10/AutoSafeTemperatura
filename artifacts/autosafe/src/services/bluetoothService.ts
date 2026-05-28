// bluetoothService.ts v5.6 — ELA Blue PUCK T/RHT przez BLE Advertising
//
// Kluczowa zmiana względem v5.3:
// - kliknięcie Nasłuchuj BLE najpierw uruchamia requestLEScan i dopasowuje ramki po nazwie,
//   więc nie wymusza ciągłego ponownego wyboru czujnika po rozłączeniu/odświeżeniu.
// - requestDevice/watchAdvertisements zostaje tylko jako awaryjny fallback, gdy requestLEScan nie działa.
// - dekodowanie działa na realnym formacie z nRF Connect:
//   0x16 / UUID 0x2A6E = temperatura int16LE / 100
//   0x16 / UUID 0x2A6F = wilgotność uint16LE / 100
//   0xFF / Company 0x0757 = bateria z dwóch ostatnich bajtów payloadu jako uint16LE mV

import type { DecodedData, Sensor } from "@/types/sensor";
import { isNativeBleAvailable, reconnectSensorNative, scanForDeviceNative, stopAllNativeBleActivity } from "./nativeBleService";
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
interface BTAPI extends EventTarget {
  requestDevice: (o: RequestDeviceOptions) => Promise<BTDevice>;
  getAvailability?: () => Promise<boolean>;
  getDevices?: () => Promise<BTDevice[]>;
  requestLEScan?: (o?: RequestLEScanOptions) => Promise<BTLEScan>;
  addEventListener: (t: "advertisementreceived", l: (e: BTAdvEvent) => void) => void;
  removeEventListener: (t: "advertisementreceived", l: (e: BTAdvEvent) => void) => void;
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
interface BTLEScan { active: boolean; stop: () => void; }
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
  name?: string | null;
  rssi?: number;
  txPower?: number;
  manufacturerData?: Map<number, DataView>;
  serviceData?: Map<string, DataView>;
  uuids?: string[];
}

export type ScanMode = "ela" | "all";

const deviceCache = new Map<string, BTDevice>();
const advControllers = new Map<string, AbortController>();
const leScans = new Map<string, { scan: BTLEScan; handler: (e: BTAdvEvent) => void }>();
let sharedLEScan: BTLEScan | null = null;
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

const LE_SCAN_TIMEOUT_MS = 45_000;

export const isBluetoothAvailable = async (): Promise<boolean> => {
  if (isNativeBleAvailable()) return true;
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

export const isLEScanSupported = (): boolean => {
  const bt = getBT();
  return typeof bt?.requestLEScan === "function";
};

export interface ScanResult {
  device: BTDevice;
  detectedProfileId: string | null;
  data: DecodedData;
}
export type ScanCallback = (r: ScanResult) => void;

const nowIso = () => new Date().toISOString();

const dvToHex = (dv?: DataView): string | undefined => {
  if (!dv) return undefined;
  return Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
};

const normalizeName = (value?: string | null) => (value ?? "")
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "")
  .trim();

const getAdvertisementName = (event: BTAdvEvent): string | null | undefined => event.name ?? event.device?.name;

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

const adDebug = (parts: Array<string | undefined>) => parts.filter(Boolean).join("; ") || undefined;

export const decodeAdvertisementEvent = (event: BTAdvEvent, hintProfileId?: string | null): { data: DecodedData; profileId: string | null } => {
  const data: DecodedData = { rssi: event.rssi ?? undefined };
  const serviceParts: string[] = [];
  const manufacturerParts: string[] = [];
  const eventName = getAdvertisementName(event);
  let profileId = hintProfileId ?? detectProfileByName(eventName) ?? detectProfileByName(event.device?.name) ?? null;

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
  data.bleDebug = adDebug([
    eventName ? `name=${eventName}` : undefined,
    event.device?.id ? `id=${event.device.id}` : undefined,
    event.rssi != null ? `rssi=${event.rssi}` : undefined,
    data.temperature != null ? `temperature=${data.temperature}` : undefined,
    data.humidity != null ? `humidity=${data.humidity}` : undefined,
    data.batteryVoltage != null ? `batteryMv=${data.batteryVoltage}` : undefined,
    data.rawServiceData ? `serviceData=${data.rawServiceData}` : undefined,
    data.rawManufacturerData ? `manufacturerData=${data.rawManufacturerData}` : undefined,
    `ts=${nowIso()}`,
  ]);

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

const buildDeviceOptionsForSensor = (sensor: Sensor): RequestDeviceOptions => {
  const filters: Array<{ name?: string; namePrefix?: string }> = [];
  if (sensor.bluetoothName) filters.push({ name: sensor.bluetoothName });
  ELA_NAME_FILTERS.forEach((f) => filters.push(f));
  return { filters, optionalServices: OPTIONAL_SERVICES, optionalManufacturerData: ALL_COMPANY_IDS };
};

const matchesSensorName = (sensor: Sensor, deviceName?: string | null): boolean => {
  const target = normalizeName(sensor.bluetoothName);
  const candidate = normalizeName(deviceName);
  if (!target || !candidate) return false;
  return candidate === target || candidate.includes(target) || target.includes(candidate);
};

const hasUsefulDecodedData = (data: DecodedData): boolean => (
  data.temperature !== undefined ||
  data.humidity !== undefined ||
  data.battery !== undefined ||
  data.batteryVoltage !== undefined ||
  data.rssi !== undefined ||
  Boolean(data.rawServiceData) ||
  Boolean(data.rawManufacturerData)
);

export const scanForDevice = async (
  onData: ScanCallback,
  onError?: (e: Error) => void,
  mode: ScanMode = "ela"
): Promise<BTDevice | null> => {
  if (isNativeBleAvailable()) {
    return scanForDeviceNative(onData, onError, mode);
  }
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
    onError?.(new Error("Przeglądarka nie udostępnia watchAdvertisements. Czujnik zapisano; do odczytu użyj przycisku Nasłuchuj BLE lub aplikacji Android."));
  }

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
      if (temp !== undefined) onData({ device, detectedProfileId: hintProfileId ?? "gatt-ess", data: { temperature: temp, bleDebug: `GATT temperature=${temp}; ts=${nowIso()}` } });
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
    if (!hasUsefulDecodedData(decoded.data)) return;
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
export const stopNameScan = (id: string) => {
  const item = leScans.get(id);
  if (!item) return;
  try { getBT()?.removeEventListener("advertisementreceived", item.handler); } catch { /* ignore */ }
  leScans.delete(id);
  if (leScans.size === 0 && sharedLEScan) {
    try { sharedLEScan.stop(); } catch { /* ignore */ }
    sharedLEScan = null;
  }
};

export const stopAllBleActivity = () => {
  if (isNativeBleAvailable()) stopAllNativeBleActivity().catch(() => {});
  advControllers.forEach((controller) => { try { controller.abort(); } catch { /* ignore */ } });
  advControllers.clear();
  leScans.forEach(({ handler }) => { try { getBT()?.removeEventListener("advertisementreceived", handler); } catch { /* ignore */ } });
  leScans.clear();
  if (sharedLEScan) { try { sharedLEScan.stop(); } catch { /* ignore */ } }
  sharedLEScan = null;
};
export const getCachedDevice = (id: string) => deviceCache.get(id);
export const disconnectGATT = (d: BTDevice) => d.gatt?.disconnect();

export const startNameBasedElaScan = async (
  sensor: Sensor,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<boolean> => {
  const bt = getBT();
  if (!bt?.requestLEScan) return false;

  stopNameScan(sensor.id);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const targetName = sensor.bluetoothName;

  const handler = (event: BTAdvEvent) => {
    const eventName = getAdvertisementName(event);
    if (!matchesSensorName(sensor, eventName)) return;
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = undefined; }
    if (event.device?.id) deviceCache.set(event.device.id, event.device);
    const decoded = decodeAdvertisementEvent(event, sensor.profileId);
    decoded.data.bleDebug = adDebug([
      decoded.data.bleDebug,
      `matchedByName=${targetName}`,
      `eventName=${eventName ?? ""}`,
      "scan=requestLEScan",
      !decoded.data.rawServiceData && !decoded.data.rawManufacturerData ? "event bez serviceData/manufacturerData" : undefined,
    ]);
    onData({ device: event.device, detectedProfileId: decoded.profileId ?? sensor.profileId, data: decoded.data });
  };

  try {
    bt.addEventListener("advertisementreceived", handler);
    const scan = sharedLEScan?.active
      ? sharedLEScan
      : await bt.requestLEScan({ acceptAllAdvertisements: true, keepRepeatedDevices: true });
    sharedLEScan = scan;
    leScans.set(sensor.id, { scan, handler });
    timeoutId = setTimeout(() => {
      onError?.(new Error(`Nasłuch BLE aktywny — nadal szukam ${targetName}. Zbliż telefon do czujnika; nie trzeba wybierać go ponownie, dopóki skan jest aktywny.`));
    }, LE_SCAN_TIMEOUT_MS);
    return scan.active !== false;
  } catch (e) {
    bt.removeEventListener("advertisementreceived", handler);
    leScans.delete(sensor.id);
    const msg = e instanceof Error ? e.message : String(e);
    onError?.(new Error(`Chrome nie uruchomił requestLEScan: ${msg}`));
    return false;
  }
};

const requestDeviceAgainAndWatch = async (
  sensor: Sensor,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<boolean> => {
  const bt = getBT();
  if (!bt) return false;
  try {
    const device = await bt.requestDevice(buildDeviceOptionsForSensor(sensor));
    if (!device?.id) return false;
    if (device.name && !matchesSensorName(sensor, device.name) && sensor.bluetoothName) {
      onError?.(new Error(`Wybrano ${device.name ?? "urządzenie"}, ale zapisany czujnik to ${sensor.bluetoothName}. Wybierz właściwy czujnik.`));
      return false;
    }
    deviceCache.set(device.id, device);
    if (typeof device.watchAdvertisements === "function" && device.addEventListener) {
      onError?.(new Error(`Wybrano ${device.name ?? sensor.bluetoothName}. Nasłuch BLE aktywny — czekam na advertisementreceived.`));
      await startAdvWatch(device, sensor.profileId, onData, onError);
      return true;
    }
    onError?.(new Error("Ta wersja Chrome nie udostępnia watchAdvertisements dla wybranego urządzenia. Spróbuję GATT fallback, ale ELA zwykle nadaje dane w reklamach BLE."));
    await connectGATTWithNotifications(device, sensor.profileId, onData, onError);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("user")) {
      onError?.(new Error(`Nie udało się ponownie wybrać czujnika: ${msg}`));
    }
    return false;
  }
};

export const reconnectSensor = async (
  sensor: Sensor,
  onData: ScanCallback,
  onError?: (e: Error) => void,
  options?: { forcePicker?: boolean }
): Promise<boolean> => {
  const isElaAdv = sensor.profileId.startsWith("ela-blue-puck") || getProfile(sensor.profileId)?.source === "advertisement";

  if (isNativeBleAvailable() && isElaAdv) {
    return reconnectSensorNative(sensor, onData, onError);
  }

  if (isElaAdv && options?.forcePicker) {
    onError?.(new Error(`Nasłuch BLE aktywny — skanuję reklamy i szukam ${sensor.bluetoothName} po nazwie.`));
    const scanned = await startNameBasedElaScan(sensor, onData, onError);
    if (scanned) return true;

    onError?.(new Error(`Chrome nie uruchomił automatycznego skanu po nazwie. Awaryjnie wybierz ${sensor.bluetoothName} w oknie Bluetooth.`));
    return requestDeviceAgainAndWatch(sensor, onData, onError);
  }

  let device = deviceCache.get(sensor.deviceId);
  if (!device) {
    const granted = await cacheGrantedDevices();
    device = granted.find((d) => d.id === sensor.deviceId || d.name === sensor.bluetoothName);
  }

  if (device) {
    deviceCache.set(device.id, device);
    stopAdvWatch(device.id);

    if (isElaAdv) {
      await startAdvWatch(device, sensor.profileId, onData, onError);
      return true;
    }

    await connectGATTWithNotifications(device, sensor.profileId, onData, onError);
    return true;
  }

  if (isElaAdv) {
    onError?.(new Error(`Brak cache Chrome — uruchamiam skan reklam BLE po nazwie ${sensor.bluetoothName}.`));
    const scanned = await startNameBasedElaScan(sensor, onData, onError);
    if (scanned) return true;

    onError?.(new Error(`Automatyczny scan po nazwie nie działa. Awaryjnie wybierz ${sensor.bluetoothName} w oknie Bluetooth.`));
    return requestDeviceAgainAndWatch(sensor, onData, onError);
  }

  return requestDeviceAgainAndWatch(sensor, onData, onError);
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
