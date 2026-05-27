// ============================================================
// bluetoothService.ts v3 — ZWERYFIKOWANY dla ELA Blue Puck T
//
// ELA Blue Puck T używa:
//   AD Type 0x16 = Service Data 16-bit UUID
//   UUID = 0x2A6E (Temperature)
//   Data = int16 little-endian / 100 = °C
//
// Web Bluetooth API eksponuje to jako:
//   event.serviceData: Map<string, DataView>
//   klucz = pełny UUID: "00002a6e-0000-1000-8000-00805f9b34fb"
//   value = DataView z bajtami temperatury (BEZ UUID)
//
// Strategia łączenia:
//   1. Tryb Advertisement (watchAdvertisements) — preferowany
//      Wymaga: chrome://flags/#enable-web-bluetooth-scanning
//   2. Tryb GATT — fallback gdy Advertisement niedostępny
//      Łączy bezpośrednio i odczytuje characteristic 0x2A6E
// ============================================================

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

// ── Typy BT API ──────────────────────────────────────────────
interface NavWithBT extends Navigator { bluetooth?: BTAPI; }
interface BTAPI {
  requestDevice: (o: RequestDeviceOptions) => Promise<BTDevice>;
  getAvailability?: () => Promise<boolean>;
}
interface RequestDeviceOptions {
  acceptAllDevices?: boolean;
  filters?: object[];
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
  addEventListener?: (t: string, l: (e: Event & { target: { value: DataView } }) => void) => void;
}
export interface BTAdvEvent extends Event {
  device: BTDevice;
  name?: string;
  rssi?: number;
  manufacturerData?: Map<number, DataView>;
  serviceData?: Map<string, DataView>;     // ← ELA używa tego!
}

// ── Cache ────────────────────────────────────────────────────
const deviceCache   = new Map<string, BTDevice>();
const advControllers = new Map<string, AbortController>();

// ── Helpers ──────────────────────────────────────────────────
const getBT = (): BTAPI | undefined => (navigator as NavWithBT).bluetooth;

export const isBluetoothAvailable = async (): Promise<boolean> => {
  const bt = getBT();
  if (!bt) return false;
  try { return bt.getAvailability ? await bt.getAvailability() : true; }
  catch { return false; }
};

export const isAdvertisementScanSupported = (): boolean => {
  try {
    const proto = (window as unknown as { BluetoothDevice?: { prototype: unknown } }).BluetoothDevice?.prototype as unknown as Record<string, unknown>;
    return typeof proto?.watchAdvertisements === "function";
  } catch { return false; }
};

// ── Scan result ──────────────────────────────────────────────
export interface ScanResult {
  device: BTDevice;
  detectedProfileId: string | null;
  data: DecodedData;
}
export type ScanCallback = (r: ScanResult) => void;

// ── Universal scan ───────────────────────────────────────────
export const scanForDevice = async (
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<BTDevice | null> => {
  const bt = getBT();
  if (!bt) throw new Error("Web Bluetooth niedostępne. Użyj Chrome lub Edge na desktopie/Androidzie.");

  // Zbierz wszystkie UUID serwisów ze znanych profili
  const optionalServices = [
    ELA_SERVICE_UUID,                                        // ELA Blue Puck T (0x181A ESS)
    "0000181a-0000-1000-8000-00805f9b34fb",                 // ESS pełny UUID
    "00002a6e-0000-1000-8000-00805f9b34fb",                 // Temperature characteristic
    "health_thermometer",
    "environmental_sensing",
    ...sensorProfiles
      .filter((p) => p.serviceUuid && !p.serviceUuid.startsWith("health") && !p.serviceUuid.startsWith("env"))
      .map((p) => p.serviceUuid!),
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices,
    optionalManufacturerData: ALL_COMPANY_IDS,
  });

  if (!device?.id) return null;
  deviceCache.set(device.id, device);

  const hintProfileId = detectProfileByName(device.name);

  // Próbuj advertisement watch (preferowany dla ELA)
  if (typeof device.watchAdvertisements === "function" && device.addEventListener) {
    try {
      await startAdvWatch(device, hintProfileId, onData, onError);
    } catch (e) {
      console.warn("watchAdvertisements failed, falling back to GATT:", e);
      // Fallback do GATT jeśli advertisement nie działa
      await tryGATTRead(device, hintProfileId, onData, onError);
    }
  } else {
    // Advertisement niedostępny — od razu GATT
    await tryGATTRead(device, hintProfileId, onData, onError);
  }

  return device;
};

// ── Advertisement Watch ──────────────────────────────────────
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

    // ── ELA Blue Puck T: serviceData z UUID 0x2A6E ───────────
    if (event.serviceData) {
      for (const [uuid, data] of event.serviceData) {
        // Szukamy UUID temperatury ELA
        if (uuid.includes("2a6e") || uuid === ELA_TEMP_UUID) {
          const profile = getProfile(hintProfileId ?? "ela-blue-puck-t");
          if (profile?.decodeAdvertisement) {
            try {
              const decoded = profile.decodeAdvertisement(data);
              if (decoded.temperature !== undefined) {
                onData({ device, detectedProfileId: hintProfileId ?? "ela-blue-puck-t", data: { ...decoded, rssi } });
                return;
              }
            } catch (e) { console.warn("ELA decode error:", e); }
          }
          // Próbuj ręcznie
          if (data.byteLength >= 2) {
            const rawTemp = data.getInt16(0, true);
            const temp = rawTemp / 100;
            if (temp >= -40 && temp <= 100) {
              onData({ device, detectedProfileId: hintProfileId ?? "ela-blue-puck-t", data: { temperature: temp, rssi } });
              return;
            }
          }
        }
      }
    }

    // ── Inne czujniki: manufacturerData ──────────────────────
    if (event.manufacturerData) {
      for (const [companyId, data] of event.manufacturerData) {
        const profileId = detectProfileByCompanyId(companyId);
        if (!profileId) continue;
        const profile = getProfile(profileId);
        if (!profile?.decodeAdvertisement) continue;
        try {
          const decoded = profile.decodeAdvertisement(data, rssi);
          if (decoded.temperature !== undefined) {
            onData({ device, detectedProfileId: profileId, data: { ...decoded, rssi } });
            return;
          }
        } catch (e) { onError?.(e instanceof Error ? e : new Error(String(e))); }
      }
    }
  };

  if (device.addEventListener) {
    device.addEventListener("advertisementreceived", handler);
  }

  try {
    if (typeof device.watchAdvertisements === "function") {
      await device.watchAdvertisements({ signal: controller.signal });
    }
  } catch (e) {
    console.warn("watchAdvertisements error:", e);
    throw e;
  }

  controller.signal.addEventListener("abort", () => {
    device.removeEventListener?.("advertisementreceived", handler);
  });

  return controller;
};

// ── GATT fallback dla ELA Blue Puck T ───────────────────────
// Łączy bezpośrednio przez GATT i odczytuje characteristic 0x2A6E
// Działa bez flagi chrome://flags
export const tryGATTRead = async (
  device: BTDevice,
  hintProfileId: string | null,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<void> => {
  if (!device.gatt) return;
  try {
    const server  = await device.gatt.connect();

    // Próbuj ELA ESS service → characteristic Temperature
    let temp: number | undefined;
    try {
      const service = await server.getPrimaryService(ELA_SERVICE_UUID);
      const char    = await service.getCharacteristic(ELA_TEMP_UUID);
      const value   = await char.readValue();
      if (value.byteLength >= 2) {
        const raw = value.getInt16(0, true);
        temp = raw / 100;
        if (temp < -40 || temp > 100) temp = undefined;
      }

      // Jeśli characteristic wspiera notyfikacje — subskrybuj
      if (char.startNotifications && char.addEventListener) {
        await char.startNotifications();
        char.addEventListener("characteristicvaluechanged", (e: Event) => {
          const ev = e as Event & { target: { value: DataView } };
          const dv = ev.target.value;
          if (dv.byteLength >= 2) {
            const r = dv.getInt16(0, true) / 100;
            if (r >= -40 && r <= 100) {
              onData({ device, detectedProfileId: hintProfileId ?? "ela-blue-puck-t-gatt", data: { temperature: r } });
            }
          }
        });
      }
    } catch {
      // ESS nie działa — próbuj Health Thermometer
      try {
        const service = await server.getPrimaryService("health_thermometer");
        const char    = await service.getCharacteristic("temperature_measurement");
        const value   = await char.readValue();
        const profile = getProfile("gatt-health-thermometer");
        if (profile?.decodeGatt) {
          const decoded = profile.decodeGatt(value);
          temp = decoded.temperature;
        }
      } catch { /* żaden serwis nie zadziałał */ }
    }

    if (temp !== undefined) {
      onData({
        device,
        detectedProfileId: hintProfileId ?? "ela-blue-puck-t-gatt",
        data: { temperature: temp },
      });
    }
  } catch (e) {
    onError?.(e instanceof Error ? e : new Error(String(e)));
  }
};

// ── GATT direct read ─────────────────────────────────────────
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

export const stopAdvWatch      = (id: string)    => { advControllers.get(id)?.abort(); advControllers.delete(id); };
export const getCachedDevice   = (id: string)    => deviceCache.get(id);
export const disconnectGATT    = (d: BTDevice)   => d.gatt?.disconnect();

// ── Reconnect ────────────────────────────────────────────────
export const reconnectSensor = async (
  sensor: Sensor,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<boolean> => {
  const device = deviceCache.get(sensor.deviceId);
  if (!device) return false;
  const profile = getProfile(sensor.profileId);
  if (!profile) return false;

  if (profile.source === "advertisement") {
    stopAdvWatch(device.id);
    if (typeof device.watchAdvertisements === "function" && device.addEventListener) {
      try { await startAdvWatch(device, sensor.profileId, onData, onError); return true; }
      catch { /* fallthrough to GATT */ }
    }
    await tryGATTRead(device, sensor.profileId, onData, onError);
    return true;
  }

  try {
    const data = await readSensorGATT(device, sensor.profileId);
    onData({ device, detectedProfileId: sensor.profileId, data });
    return true;
  } catch (e) {
    onError?.(e instanceof Error ? e : new Error(String(e)));
    return false;
  }
};
