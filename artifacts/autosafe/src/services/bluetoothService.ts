import type { DecodedData, Sensor } from "@/types/sensor";
import {
  ALL_COMPANY_IDS,
  COMPANY_IDS,
  ELA_ENVIRONMENTAL_SERVICE_UUID,
  ELA_HUMIDITY_UUID,
  ELA_TEMP_UUID,
  decodeELAManufacturerFrame,
  decodeELAServiceFrame,
  detectProfileByCompanyId,
  detectProfileByName,
  getProfile,
} from "./sensorProfiles";

interface NavWithBT extends Navigator { bluetooth?: BTAPI; }
interface BTAPI {
  requestDevice: (o: RequestDeviceOptions) => Promise<BTDevice>;
  getAvailability?: () => Promise<boolean>;
  getDevices?: () => Promise<BTDevice[]>;
}
interface RequestDeviceOptions {
  acceptAllDevices?: boolean;
  filters?: Array<{ services?: string[]; name?: string; namePrefix?: string }>;
  optionalServices?: string[];
  optionalManufacturerData?: number[];
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
interface BTGATTServer {
  getPrimaryService: (u: string) => Promise<BTGATTService>;
}
interface BTGATTService {
  getCharacteristic: (u: string) => Promise<BTGATTChar>;
}
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

const deviceCache    = new Map<string, BTDevice>();
const advControllers = new Map<string, AbortController>();

const getBT = (): BTAPI | undefined => (navigator as NavWithBT).bluetooth;
const nowMessage = (e: unknown) => e instanceof Error ? e.message : String(e);

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
  note?: string;
}
export type ScanCallback = (r: ScanResult) => void;
export type ScanMode = "ela" | "all";

const optionalServices = [
  ELA_ENVIRONMENTAL_SERVICE_UUID,
  ELA_TEMP_UUID,
  ELA_HUMIDITY_UUID,
  "battery_service",
  "device_information",
  "health_thermometer",
  "environmental_sensing",
  "ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6",
  "ef090000-11d6-42ba-93b8-9dd7ec090ab0",
  "0000fff0-0000-1000-8000-00805f9b34fb",
];

const ELA_NAME_FILTERS = [
  { namePrefix: "P RHT" },
  { namePrefix: "P RHT " },
  { namePrefix: "P T" },
  { namePrefix: "P T " },
  { namePrefix: "BPUCK" },
  { namePrefix: "BLUE PUCK" },
  { namePrefix: "Blue PUCK" },
  { namePrefix: "ELA" },
  { services: [ELA_ENVIRONMENTAL_SERVICE_UUID] },
] as Array<{ services?: string[]; namePrefix?: string }>;

const COMMON_BLE_FILTERS = [
  ...ELA_NAME_FILTERS,
  { services: ["health_thermometer"] },
  { services: ["environmental_sensing"] },
  { services: ["ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6"] },
  { services: ["ef090000-11d6-42ba-93b8-9dd7ec090ab0"] },
  { services: ["0000fff0-0000-1000-8000-00805f9b34fb"] },
];

const hasUsefulPayload = (data: DecodedData) =>
  data.temperature !== undefined || data.humidity !== undefined || data.pressure !== undefined || data.battery !== undefined || data.rssi !== undefined;

const mergeDecoded = (target: DecodedData, incoming: DecodedData) => {
  if (incoming.temperature !== undefined) target.temperature = incoming.temperature;
  if (incoming.humidity !== undefined) target.humidity = incoming.humidity;
  if (incoming.pressure !== undefined) target.pressure = incoming.pressure;
  if (incoming.battery !== undefined) target.battery = incoming.battery;
  if (incoming.batteryVoltage !== undefined) target.batteryVoltage = incoming.batteryVoltage;
  if (incoming.rssi !== undefined) target.rssi = incoming.rssi;
  return target;
};

const decodeAdvertisementEvent = (event: BTAdvEvent, hintProfileId: string | null): { profileId: string | null; data: DecodedData } => {
  let profileId = hintProfileId ?? detectProfileByName(event.device.name);
  const data: DecodedData = {};
  if (event.rssi !== undefined) data.rssi = event.rssi;

  if (event.serviceData) {
    for (const [uuid, raw] of event.serviceData) {
      const decodedEla = decodeELAServiceFrame(uuid, raw);
      if (hasUsefulPayload(decodedEla)) {
        mergeDecoded(data, decodedEla);
        profileId = profileId ?? (data.humidity !== undefined ? "ela-blue-puck-rht" : "ela-blue-puck-t");
      }

      const profile = profileId ? getProfile(profileId) : undefined;
      if (profile?.decodeAdvertisement && !uuid.toLowerCase().includes("2a6")) {
        try { mergeDecoded(data, profile.decodeAdvertisement(raw, event.rssi)); } catch {}
      }
    }
  }

  if (event.manufacturerData) {
    for (const [companyId, rawData] of event.manufacturerData) {
      if (companyId === COMPANY_IDS.ELA) {
        const decodedEla = decodeELAManufacturerFrame(rawData);
        if (hasUsefulPayload(decodedEla)) {
          mergeDecoded(data, decodedEla);
          profileId = profileId ?? (decodedEla.humidity !== undefined ? "ela-blue-puck-rht" : "ela-blue-puck-t");
        }
        continue;
      }

      const detected = detectProfileByCompanyId(companyId);
      const profile = getProfile(detected ?? undefined);
      if (!profile?.decodeAdvertisement) continue;
      try {
        const decoded = profile.decodeAdvertisement(rawData, event.rssi);
        if (hasUsefulPayload(decoded)) {
          mergeDecoded(data, decoded);
          profileId = detected;
        }
      } catch {}
    }
  }

  return { profileId, data };
};

const requestBTDevice = async (mode: ScanMode): Promise<BTDevice> => {
  const bt = getBT();
  if (!bt) throw new Error("Web Bluetooth niedostępne. Użyj Chrome na Androidzie albo wersji APK.");

  const opts: RequestDeviceOptions = mode === "all"
    ? { acceptAllDevices: true, optionalServices, optionalManufacturerData: ALL_COMPANY_IDS }
    : { filters: COMMON_BLE_FILTERS, optionalServices, optionalManufacturerData: ALL_COMPANY_IDS };

  return bt.requestDevice(opts);
};

export const scanForDevice = async (
  onData: ScanCallback,
  onError?: (e: Error) => void,
  options: { mode?: ScanMode } = {},
): Promise<BTDevice | null> => {
  const bt = getBT();
  if (!bt) throw new Error("Web Bluetooth niedostępne. Na iPhone PWA nie ma dostępu do Bluetooth — użyj Android Chrome albo APK.");

  const device = await requestBTDevice(options.mode ?? "ela");
  if (!device?.id) return null;

  deviceCache.set(device.id, device);
  const hintProfileId = detectProfileByName(device.name) ?? "ela-blue-puck-rht";

  // Ważne: po wyborze urządzenia od razu przechodzimy do konfiguracji.
  // Wcześniej ekran czekał na temperaturę, a Blue PUCK RHT jest głównie advertising-only.
  onData({ device, detectedProfileId: hintProfileId, data: {}, note: "selected" });

  if (typeof device.watchAdvertisements === "function" && device.addEventListener) {
    startAdvWatch(device, hintProfileId, onData, onError).catch((e) => {
      onError?.(new Error(`Nie udało się uruchomić nasłuchu ramek BLE: ${nowMessage(e)}`));
    });
  }

  // Fallback GATT. Dla ELA brak charakterystyki nie jest błędem krytycznym, bo dane lecą w reklamach BLE.
  connectGATTWithNotifications(device, hintProfileId, onData, (e) => {
    const msg = e.message.toLowerCase();
    if (msg.includes("nie znaleziono") || msg.includes("gatt") || msg.includes("not found")) return;
    onError?.(e);
  }).catch(() => {});

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

    const serviceUUIDs = [
      ELA_ENVIRONMENTAL_SERVICE_UUID,
      "environmental_sensing",
      "health_thermometer",
    ];
    const charUUIDs = [
      ELA_TEMP_UUID,
      ELA_HUMIDITY_UUID,
      "temperature_measurement",
      "temperature",
      "humidity",
    ];

    for (const svcUUID of serviceUUIDs) {
      let service: BTGATTService;
      try { service = await server.getPrimaryService(svcUUID); }
      catch { continue; }

      for (const chUUID of charUUIDs) {
        try {
          const char = await service.getCharacteristic(chUUID);
          const emitValue = (value: DataView) => {
            const uuid = chUUID.toLowerCase().includes("2a6f") || chUUID.toLowerCase().includes("humidity") ? ELA_HUMIDITY_UUID : ELA_TEMP_UUID;
            const decoded = decodeELAServiceFrame(uuid, value);
            if (hasUsefulPayload(decoded)) {
              onData({
                device,
                detectedProfileId: hintProfileId ?? (decoded.humidity !== undefined ? "ela-blue-puck-rht" : "ela-blue-puck-t"),
                data: decoded,
              });
            }
          };

          try { emitValue(await char.readValue()); } catch {}

          if (char.startNotifications && char.addEventListener) {
            try {
              await char.startNotifications();
              char.addEventListener("characteristicvaluechanged", (e: Event) => {
                const ev = e as Event & { target?: { value?: DataView } };
                if (ev.target?.value) emitValue(ev.target.value);
              });
            } catch {}
          }
        } catch { /* next characteristic */ }
      }
    }
  } catch (e) {
    onError?.(new Error(`Błąd GATT: ${nowMessage(e)}`));
  }
};

export const startAdvWatch = async (
  device: BTDevice,
  hintProfileId: string | null,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<AbortController> => {
  stopAdvWatch(device.id);
  const controller = new AbortController();
  advControllers.set(device.id, controller);

  const handler = (event: BTAdvEvent) => {
    try {
      const decoded = decodeAdvertisementEvent(event, hintProfileId);
      if (hasUsefulPayload(decoded.data)) {
        onData({ device, detectedProfileId: decoded.profileId, data: decoded.data });
      }
    } catch (e) {
      onError?.(new Error(`Błąd dekodowania ramki BLE: ${nowMessage(e)}`));
    }
  };

  device.addEventListener?.("advertisementreceived", handler);
  try {
    await device.watchAdvertisements?.({ signal: controller.signal });
  } catch (e) {
    device.removeEventListener?.("advertisementreceived", handler);
    advControllers.delete(device.id);
    throw e;
  }

  controller.signal.addEventListener("abort", () => {
    device.removeEventListener?.("advertisementreceived", handler);
  });
  return controller;
};

export const stopAdvWatch    = (id: string)    => { advControllers.get(id)?.abort(); advControllers.delete(id); };
export const getCachedDevice = (id: string)    => deviceCache.get(id);
export const disconnectGATT  = (d: BTDevice)   => d.gatt?.disconnect();

export const restoreGrantedDevices = async (): Promise<BTDevice[]> => {
  const bt = getBT();
  if (!bt?.getDevices) return [];
  const devices = await bt.getDevices();
  devices.forEach((d) => deviceCache.set(d.id, d));
  return devices;
};

export const reconnectSensor = async (
  sensor: Sensor,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<boolean> => {
  let device = deviceCache.get(sensor.deviceId);
  if (!device) {
    const restored = await restoreGrantedDevices();
    device = restored.find((d) => d.id === sensor.deviceId || d.name === sensor.bluetoothName);
    if (device) deviceCache.set(device.id, device);
  }
  if (!device) return false;

  stopAdvWatch(device.id);
  if (typeof device.watchAdvertisements === "function" && device.addEventListener) {
    startAdvWatch(device, sensor.profileId, onData, onError).catch((e) => onError?.(e instanceof Error ? e : new Error(String(e))));
  }
  await connectGATTWithNotifications(device, sensor.profileId, onData, onError);
  return true;
};

export const readSensorGATT = async (device: BTDevice, profileId: string): Promise<DecodedData> => {
  const profile = getProfile(profileId);
  if (!profile?.serviceUuid || !profile?.characteristicUuid || !profile.decodeGatt) {
    throw new Error("Profil GATT niekompletny.");
  }
  if (!device.gatt) throw new Error("Urządzenie bez GATT. Ten czujnik najpewniej wysyła dane tylko w ramkach BLE advertising.");
  const server  = await device.gatt.connect();
  const service = await server.getPrimaryService(profile.serviceUuid);
  const char    = await service.getCharacteristic(profile.characteristicUuid);
  const value   = await char.readValue();
  return profile.decodeGatt(value);
};
