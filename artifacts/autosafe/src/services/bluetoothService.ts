// bluetoothService.ts v2
import type { DecodedData, Sensor } from "@/types/sensor";
import {
  ALL_COMPANY_IDS,
  detectProfileByCompanyId,
  detectProfileByName,
  getProfile,
  sensorProfiles,
} from "./sensorProfiles";

interface NavWithBT extends Navigator {
  bluetooth?: BTAPI;
}
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
}
export interface BTAdvEvent extends Event {
  device: BTDevice;
  name?: string;
  rssi?: number;
  manufacturerData?: Map<number, DataView>;
  serviceData?: Map<string, DataView>;
}

const deviceCache      = new Map<string, BTDevice>();
const advControllers   = new Map<string, AbortController>();

const getBT = (): BTAPI | undefined => (navigator as NavWithBT).bluetooth;

export const isBluetoothAvailable = async (): Promise<boolean> => {
  const bt = getBT();
  if (!bt) return false;
  try { return bt.getAvailability ? await bt.getAvailability() : true; }
  catch { return false; }
};

export const isAdvertisementScanSupported = (): boolean => {
  if (typeof window === "undefined") return false;
  const WinBT = (window as unknown as Record<string, unknown>)["BluetoothDevice"] as
    | { prototype?: Record<string, unknown> }
    | undefined;
  return !!(WinBT?.prototype?.watchAdvertisements);
};

export interface ScanResult {
  device: BTDevice;
  detectedProfileId: string | null;
  data: DecodedData;
}
export type ScanCallback = (result: ScanResult) => void;

export const scanForDevice = async (
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<BTDevice | null> => {
  const bt = getBT();
  if (!bt) throw new Error("Web Bluetooth niedostępne. Użyj Chrome lub Edge.");

  const optionalServices = sensorProfiles
    .filter((p) => p.serviceUuid && !p.serviceUuid.startsWith("0x"))
    .map((p) => p.serviceUuid!);

  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices,
    optionalManufacturerData: ALL_COMPANY_IDS,
  });

  if (!device?.id) return null;
  deviceCache.set(device.id, device);

  const nameProfile = detectProfileByName(device.name);
  if (typeof device.watchAdvertisements === "function" && device.addEventListener) {
    await startAdvWatch(device, nameProfile, onData, onError);
  }

  return device;
};

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
    if (!event.manufacturerData) return;

    for (const [companyId, rawData] of event.manufacturerData) {
      const profileId =
        detectProfileByCompanyId(companyId, rawData) ??
        hintProfileId;

      if (!profileId) continue;
      const profile = getProfile(profileId);
      if (!profile?.decodeAdvertisement) continue;

      try {
        const decoded = profile.decodeAdvertisement(rawData, rssi);
        if (decoded.temperature !== undefined || decoded.humidity !== undefined) {
          onData({ device, detectedProfileId: profileId, data: { ...decoded, rssi } });
        }
      } catch (e) {
        onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    }
  };

  if (device.addEventListener && typeof device.watchAdvertisements === "function") {
    device.addEventListener("advertisementreceived", handler);
    try {
      await device.watchAdvertisements({ signal: controller.signal });
    } catch (e) {
      console.warn("watchAdvertisements failed:", e);
    }
  }

  controller.signal.addEventListener("abort", () => {
    device.removeEventListener?.("advertisementreceived", handler);
  });

  return controller;
};

export const stopAdvWatch = (deviceId: string) => {
  advControllers.get(deviceId)?.abort();
  advControllers.delete(deviceId);
};

export const readGATT = async (
  device: BTDevice,
  serviceUuid: string,
  charUuid: string
): Promise<DataView> => {
  if (!device.gatt) throw new Error("Urządzenie nie udostępnia GATT.");
  const server  = await device.gatt.connect();
  const service = await server.getPrimaryService(serviceUuid);
  const char    = await service.getCharacteristic(charUuid);
  return char.readValue();
};

export const readSensorGATT = async (
  device: BTDevice,
  profileId: string
): Promise<DecodedData> => {
  const profile = getProfile(profileId);
  if (!profile?.serviceUuid || !profile?.characteristicUuid || !profile.decodeGatt) {
    throw new Error("Profil GATT niekompletny.");
  }
  const data = await readGATT(device, profile.serviceUuid, profile.characteristicUuid);
  return profile.decodeGatt(data);
};

export const disconnectGATT = (device: BTDevice) => device.gatt?.disconnect();

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
      await startAdvWatch(device, sensor.profileId, onData, onError);
      return true;
    }
    return false;
  }

  if (profile.source === "gatt") {
    try {
      const data = await readSensorGATT(device, sensor.profileId);
      onData({ device, detectedProfileId: sensor.profileId, data });
      return true;
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
      return false;
    }
  }

  return false;
};

export const getCachedDevice = (id: string) => deviceCache.get(id);
