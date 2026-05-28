// bluetoothService.ts v4 — naprawiony dla Android Chrome + ELA Blue Puck T
//
// PROBLEMY z poprzedniej wersji:
// 1. "Nieznane lub nieobsługiwane urządzenie" na Android Chrome
//    → NAPRAWKA: filtruj po services UUID zamiast acceptAllDevices
//      ELA Blue Puck T ogłasza 0x181A (ESS) w Advertisement
// 2. Temperatura nie pojawia się po sparowaniu
//    → NAPRAWKA: GATT connect + readValue + startNotifications
//      działa bez żadnych flag Chrome
// 3. insertBefore React error
//    → NAPRAWKA: useSensors hook nie mutuje state podczas render

import type { DecodedData, Sensor } from "@/types/sensor";
import {
  ALL_COMPANY_IDS,
  detectProfileByCompanyId,
  detectProfileByName,
  ELA_SERVICE_UUID,
  ELA_TEMP_UUID,
  getProfile,
  sensorProfiles,
} from "./sensorProfiles";

interface NavWithBT extends Navigator { bluetooth?: BTAPI; }
interface BTAPI {
  requestDevice: (o: RequestDeviceOptions) => Promise<BTDevice>;
  getAvailability?: () => Promise<boolean>;
}
interface RequestDeviceOptions {
  acceptAllDevices?: boolean;
  filters?: Array<{ services?: string[]; namePrefix?: string }>;
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

export const isBluetoothAvailable = async (): Promise<boolean> => {
  const bt = getBT();
  if (!bt) return false;
  try { return bt.getAvailability ? await bt.getAvailability() : true; }
  catch { return false; }
};

export const isAdvertisementScanSupported = (): boolean => {
  try {
    const p = (window as unknown as { BluetoothDevice?: { prototype: unknown } }).BluetoothDevice?.prototype as unknown as Record<string, unknown>;
    return typeof p?.watchAdvertisements === "function";
  } catch { return false; }
};

export interface ScanResult {
  device: BTDevice;
  detectedProfileId: string | null;
  data: DecodedData;
}
export type ScanCallback = (r: ScanResult) => void;

// ── Dekoder temperatury ELA (int16 LE / 100) ─────────────────
const decodeTemp = (dv: DataView): number | undefined => {
  if (dv.byteLength < 2) return undefined;
  const raw = dv.getInt16(0, true);
  // ELA format: /100 (np. 2441 = 24.41°C)
  let temp = raw / 100;
  if (temp >= -40 && temp <= 100) return Math.round(temp * 100) / 100;
  // Alternatywny format: /10
  temp = raw / 10;
  if (temp >= -40 && temp <= 100) return Math.round(temp * 10) / 10;
  return undefined;
};

// ── Główna funkcja skanowania ────────────────────────────────
export const scanForDevice = async (
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<BTDevice | null> => {
  const bt = getBT();
  if (!bt) throw new Error("Web Bluetooth niedostępne. Użyj Chrome na Androidzie.");

  const optionalServices = [
    "0000181a-0000-1000-8000-00805f9b34fb", // ESS
    ELA_SERVICE_UUID,
    ELA_TEMP_UUID,
    "health_thermometer",
    "environmental_sensing",
    "ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6",
    "ef090000-11d6-42ba-93b8-9dd7ec090ab0",
    "0000fff0-0000-1000-8000-00805f9b34fb",
  ];

  // KLUCZOWE: filters po serviceUUID zamiast acceptAllDevices
  // Dzięki temu Android Chrome pokazuje urządzenia z nazwą
  const device = await bt.requestDevice({
    filters: [
      { services: ["0000181a-0000-1000-8000-00805f9b34fb"] }, // ELA ESS
      { services: ["health_thermometer"] },
      { services: ["environmental_sensing"] },
      { services: ["ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6"] },
      { services: ["ef090000-11d6-42ba-93b8-9dd7ec090ab0"] },
      { services: ["0000fff0-0000-1000-8000-00805f9b34fb"] },
    ],
    optionalServices,
    optionalManufacturerData: ALL_COMPANY_IDS,
  });

  if (!device?.id) return null;
  deviceCache.set(device.id, device);

  const hintProfileId = detectProfileByName(device.name);

  // Krok 1: GATT connect + natychmiastowy odczyt + notifications
  // Robi to zawsze — działa bez żadnych flag Chrome
  connectGATTWithNotifications(device, hintProfileId, onData, onError);

  // Krok 2: Advertisement watch (opcjonalny, jeśli flaga włączona)
  if (typeof device.watchAdvertisements === "function" && device.addEventListener) {
    startAdvWatch(device, hintProfileId, onData, onError).catch(() => {});
  }

  return device;
};

// ── GATT connect + readValue + startNotifications ────────────
export const connectGATTWithNotifications = async (
  device: BTDevice,
  hintProfileId: string | null,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<void> => {
  if (!device.gatt) return;
  try {
    const server = await device.gatt.connect();

    // Próbuj kolejne serwisy
    const serviceUUIDs = [
      "0000181a-0000-1000-8000-00805f9b34fb", // ESS (ELA)
      "environmental_sensing",
      "health_thermometer",
    ];
    const charUUIDs = [
      "00002a6e-0000-1000-8000-00805f9b34fb", // Temperature (ELA)
      "temperature_measurement",
      "temperature",
    ];

    let char: BTGATTChar | null = null;

    for (const svcUUID of serviceUUIDs) {
      if (char) break;
      try {
        const svc = await server.getPrimaryService(svcUUID);
        for (const chUUID of charUUIDs) {
          try {
            char = await svc.getCharacteristic(chUUID);
            break;
          } catch { /* next */ }
        }
      } catch { /* next service */ }
    }

    if (!char) {
      onError?.(new Error("Nie znaleziono charakterystyki temperatury. Sprawdź profil czujnika."));
      return;
    }

    // Natychmiastowy odczyt
    try {
      const value = await char.readValue();
      const temp = decodeTemp(value);
      if (temp !== undefined) {
        onData({
          device,
          detectedProfileId: hintProfileId ?? "ela-blue-puck-t",
          data: { temperature: temp },
        });
      }
    } catch { /* kontynuuj do notifications */ }

    // Live updates przez notifications
    if (char.startNotifications && char.addEventListener) {
      try {
        await char.startNotifications();
        char.addEventListener("characteristicvaluechanged", (e: Event) => {
          const ev = e as Event & { target: { value: DataView } };
          if (!ev.target?.value) return;
          const temp = decodeTemp(ev.target.value);
          if (temp !== undefined) {
            onData({
              device,
              detectedProfileId: hintProfileId ?? "ela-blue-puck-t",
              data: { temperature: temp },
            });
          }
        });
      } catch { /* notifications opcjonalne */ }
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.toLowerCase().includes("gatt") && !msg.toLowerCase().includes("disconnect")) {
      onError?.(new Error(`Błąd GATT: ${msg}`));
    }
  }
};

// ── Advertisement watch ──────────────────────────────────────
export const startAdvWatch = async (
  device: BTDevice,
  hintProfileId: string | null,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<AbortController> => {
  const controller = new AbortController();
  advControllers.set(device.id, controller);

  const handler = (event: BTAdvEvent) => {
    const rssi = event.rssi ?? undefined;

    if (event.serviceData) {
      for (const [uuid, data] of event.serviceData) {
        if (uuid.toLowerCase().includes("2a6e")) {
          const temp = decodeTemp(data);
          if (temp !== undefined) {
            onData({ device, detectedProfileId: hintProfileId ?? "ela-blue-puck-t", data: { temperature: temp, rssi } });
            return;
          }
        }
      }
    }

    if (event.manufacturerData) {
      for (const [companyId, rawData] of event.manufacturerData) {
        const profileId = detectProfileByCompanyId(companyId);
        if (!profileId) continue;
        const profile = getProfile(profileId);
        if (!profile?.decodeAdvertisement) continue;
        try {
          const decoded = profile.decodeAdvertisement(rawData, rssi);
          if (decoded.temperature !== undefined) {
            onData({ device, detectedProfileId: profileId, data: { ...decoded, rssi } });
          }
        } catch { /* ignore */ }
      }
    }
  };

  device.addEventListener?.("advertisementreceived", handler);
  try {
    await device.watchAdvertisements?.({ signal: controller.signal });
  } catch (e) { throw e; }

  controller.signal.addEventListener("abort", () => {
    device.removeEventListener?.("advertisementreceived", handler);
  });
  return controller;
};

export const stopAdvWatch    = (id: string)    => { advControllers.get(id)?.abort(); advControllers.delete(id); };
export const getCachedDevice = (id: string)    => deviceCache.get(id);
export const disconnectGATT  = (d: BTDevice)   => d.gatt?.disconnect();

export const reconnectSensor = async (
  sensor: Sensor,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<boolean> => {
  const device = deviceCache.get(sensor.deviceId);
  if (!device) return false;
  stopAdvWatch(device.id);
  await connectGATTWithNotifications(device, sensor.profileId, onData, onError);
  if (typeof device.watchAdvertisements === "function" && device.addEventListener) {
    startAdvWatch(device, sensor.profileId, onData, onError).catch(() => {});
  }
  return true;
};

export const readSensorGATT = async (device: BTDevice, profileId: string): Promise<DecodedData> => {
  const profile = getProfile(profileId);
  if (!profile?.serviceUuid || !profile?.characteristicUuid || !profile.decodeGatt) {
    throw new Error("Profil GATT niekompletny.");
  }
  if (!device.gatt) throw new Error("Urządzenie bez GATT.");
  const server  = await device.gatt.connect();
  const service = await server.getPrimaryService(profile.serviceUuid);
  const char    = await service.getCharacteristic(profile.characteristicUuid);
  const value   = await char.readValue();
  return profile.decodeGatt(value);
};
