// ============================================================
// bluetoothService.ts — Web Bluetooth z obsługą ELA Advertisement
// ============================================================

import type { Sensor, SensorProfile } from "@/types/sensor";
import { sensorProfiles } from "./sensorProfiles";
import { ELA_COMPANY_ID } from "./sensorProfiles";

type NavWithBT = Navigator & {
  bluetooth?: {
    requestDevice: (opts: unknown) => Promise<BluetoothDeviceLike>;
    requestLEScan?: (opts: unknown) => Promise<BluetoothLEScan>;
    getAvailability?: () => Promise<boolean>;
  };
};

interface BluetoothLEScan {
  stop: () => void;
}

export interface BluetoothDeviceLike {
  id: string;
  name?: string | null;
  gatt?: {
    connected: boolean;
    connect: () => Promise<BluetoothGATTServer>;
    disconnect: () => void;
  };
  addEventListener?: (type: string, listener: (...args: unknown[]) => void) => void;
  removeEventListener?: (type: string, listener: (...args: unknown[]) => void) => void;
  watchAdvertisements?: (opts?: unknown) => Promise<void>;
  unwatchAdvertisements?: () => void;
}

interface BluetoothGATTServer {
  getPrimaryService: (uuid: string | number) => Promise<BluetoothGATTService>;
}

interface BluetoothGATTService {
  getCharacteristic: (uuid: string | number) => Promise<BluetoothGATTCharacteristic>;
}

interface BluetoothGATTCharacteristic {
  readValue: () => Promise<DataView>;
}

export interface ELAAdvertisementData {
  temperature?: number;
  humidity?: number;
  battery?: number;
  rssi?: number;
}

export interface ELAScanCallbacks {
  onDeviceFound: (device: BluetoothDeviceLike, data: ELAAdvertisementData) => void;
  onError: (error: Error) => void;
}

const deviceCache = new Map<string, BluetoothDeviceLike>();
const activeWatchers = new Map<string, () => void>();

const getBluetooth = () => (navigator as NavWithBT).bluetooth ?? null;

export const isBluetoothAvailable = async (): Promise<boolean> => {
  if (typeof navigator === "undefined") return false;
  const bt = getBluetooth();
  if (!bt) return false;
  try {
    if (bt.getAvailability) return await bt.getAvailability();
    return true;
  } catch {
    return false;
  }
};

export const isAdvertisementScanSupported = (): boolean => {
  const bt = getBluetooth();
  if (!bt) return false;
  return typeof bt.requestLEScan === "function";
};

// ── ELA Advertisement Scan ─────────────────────────────────

/**
 * Skanuje przez requestDevice z optionalManufacturerData,
 * a następnie nasłuchuje advertisementreceived na wybranym urządzeniu.
 */
export const scanForELADevice = async (
  callbacks: ELAScanCallbacks
): Promise<BluetoothDeviceLike | null> => {
  const bt = getBluetooth();
  if (!bt) throw new Error("Web Bluetooth nie jest wspierany w tej przeglądarce.");

  const optionalServices = sensorProfiles
    .filter((p) => p.source === "gatt" && p.serviceUuid)
    .map((p) => p.serviceUuid!);

  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices,
    optionalManufacturerData: [ELA_COMPANY_ID],
  });

  if (!device?.id) return null;
  deviceCache.set(device.id, device);

  await startAdvertisementWatch(device, callbacks);
  return device;
};

export const startAdvertisementWatch = async (
  device: BluetoothDeviceLike,
  callbacks: ELAScanCallbacks
): Promise<void> => {
  if (!device.addEventListener || !device.watchAdvertisements) return;

  const handler = (event: unknown) => {
    const ev = event as {
      rssi?: number;
      manufacturerData?: Map<number, DataView>;
    };
    const mfData = ev.manufacturerData?.get(ELA_COMPANY_ID);
    if (!mfData) return;

    const profile = sensorProfiles.find(
      (p) => p.source === "advertisement" && p.manufacturerId === ELA_COMPANY_ID
    );
    if (!profile?.decodeAdvertisement) return;

    try {
      const decoded = profile.decodeAdvertisement(mfData);
      callbacks.onDeviceFound(device, {
        ...decoded,
        rssi: ev.rssi,
      });
    } catch (e) {
      callbacks.onError(e instanceof Error ? e : new Error(String(e)));
    }
  };

  device.addEventListener("advertisementreceived", handler);
  activeWatchers.set(device.id, () => {
    device.removeEventListener?.("advertisementreceived", handler);
    device.unwatchAdvertisements?.();
  });

  try {
    await device.watchAdvertisements();
  } catch {
    // Nie wszystkie przeglądarki wspierają watchAdvertisements — to OK
  }
};

export const stopAdvertisementWatch = (deviceId: string) => {
  const stop = activeWatchers.get(deviceId);
  if (stop) {
    stop();
    activeWatchers.delete(deviceId);
  }
};

/**
 * Wznawia nasłuchiwanie advertisement dla zapisanego urządzenia.
 */
export const reconnectELASensor = async (
  sensor: Sensor,
  callbacks: ELAScanCallbacks
): Promise<boolean> => {
  const device = deviceCache.get(sensor.deviceId);
  if (!device) return false;

  stopAdvertisementWatch(device.id);

  if (typeof device.watchAdvertisements === "function" && device.addEventListener) {
    await startAdvertisementWatch(device, callbacks);
    return true;
  }
  return false;
};

// ── Ogólne skanowanie (GATT + advertisement) ───────────────

export const scanForSensor = async (): Promise<BluetoothDeviceLike | null> => {
  const bt = getBluetooth();
  if (!bt) throw new Error("Web Bluetooth nie jest wspierany w tej przeglądarce.");

  const optionalServices = sensorProfiles
    .filter((p) => p.source === "gatt" && p.serviceUuid)
    .map((p) => p.serviceUuid!);

  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices,
    optionalManufacturerData: [ELA_COMPANY_ID],
  });

  if (device?.id) deviceCache.set(device.id, device);
  return device ?? null;
};

// ── GATT (dla czujników nie-ELA) ───────────────────────────

export const connectToSensor = async (
  device: BluetoothDeviceLike
): Promise<BluetoothGATTServer> => {
  if (!device.gatt) throw new Error("Urządzenie nie udostępnia GATT.");
  return device.gatt.connect();
};

export const disconnectSensor = (device: BluetoothDeviceLike) => {
  device.gatt?.disconnect();
};

export const reconnectSensor = async (sensor: Sensor) => {
  const device = deviceCache.get(sensor.deviceId);
  if (!device) throw new Error("Urządzenie nie w cache — wykonaj ponowne skanowanie.");
  return connectToSensor(device);
};

export const readWithProfile = async (
  device: BluetoothDeviceLike,
  profile: SensorProfile
): Promise<{ temperature?: number; humidity?: number; battery?: number }> => {
  if (profile.source === "advertisement") {
    throw new Error("Ten profil używa Advertisement — nie GATT. Użyj watchAdvertisements.");
  }
  if (!profile.serviceUuid || !profile.characteristicUuid || !profile.decodeGatt) {
    throw new Error("Profil GATT niekompletny.");
  }
  const server = await connectToSensor(device);
  const service = await server.getPrimaryService(profile.serviceUuid);
  const char = await service.getCharacteristic(profile.characteristicUuid);
  const value = await char.readValue();
  return profile.decodeGatt(value);
};

export const getCachedDevice = (deviceId: string) => deviceCache.get(deviceId);

// ── Autodetect profilu ELA po nazwie urządzenia ─────────────

export const detectELAProfile = (deviceName?: string | null): string | null => {
  if (!deviceName) return null;
  const name = deviceName.toLowerCase();
  if (name.includes("puck t") || name.includes("bpuck_t")) return "ela-blue-puck-t";
  if (name.includes("puck rht") || name.includes("bpuck_rht")) return "ela-blue-puck-rht";
  if (name.includes("coin t") || name.includes("bcoin_t")) return "ela-blue-puck-t";
  if (name.includes("coin rht") || name.includes("bcoin_rht")) return "ela-blue-puck-rht";
  return null;
};
