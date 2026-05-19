import type { Sensor, SensorProfile } from "@/types/sensor";
import { sensorProfiles } from "./sensorProfiles";

type NavWithBT = Navigator & {
  bluetooth?: {
    requestDevice: (opts: unknown) => Promise<BluetoothDeviceLike>;
    getAvailability?: () => Promise<boolean>;
  };
};

export interface BluetoothDeviceLike {
  id: string;
  name?: string | null;
  gatt?: {
    connected: boolean;
    connect: () => Promise<BluetoothGATTServer>;
    disconnect: () => void;
  };
  addEventListener?: (type: string, listener: () => void) => void;
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

const deviceCache = new Map<string, BluetoothDeviceLike>();

export const isBluetoothAvailable = async (): Promise<boolean> => {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as NavWithBT;
  if (!nav.bluetooth) return false;
  try {
    if (nav.bluetooth.getAvailability) return await nav.bluetooth.getAvailability();
    return true;
  } catch {
    return false;
  }
};

export const scanForSensor = async (): Promise<BluetoothDeviceLike | null> => {
  const nav = navigator as NavWithBT;
  if (!nav.bluetooth) throw new Error("Web Bluetooth nie jest wspierany w tej przeglądarce.");

  const optionalServices = sensorProfiles.map((p) => p.serviceUuid);
  const device = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices,
  });
  if (device?.id) deviceCache.set(device.id, device);
  return device ?? null;
};

export const connectToSensor = async (
  device: BluetoothDeviceLike,
): Promise<BluetoothGATTServer> => {
  if (!device.gatt) throw new Error("Urządzenie nie udostępnia GATT.");
  return device.gatt.connect();
};

export const disconnectSensor = (device: BluetoothDeviceLike) => {
  device.gatt?.disconnect();
};

export const reconnectSensor = async (sensor: Sensor) => {
  const device = deviceCache.get(sensor.deviceId);
  if (!device) throw new Error("Urządzenie nie znajduje się w cache. Wykonaj ponowne skanowanie.");
  return connectToSensor(device);
};

export const parseSensorData = (
  rawData: DataView,
  profile: SensorProfile,
): { temperature?: number; humidity?: number } => profile.decode(rawData);

export const readWithProfile = async (
  device: BluetoothDeviceLike,
  profile: SensorProfile,
): Promise<{ temperature?: number; humidity?: number }> => {
  const server = await connectToSensor(device);
  const service = await server.getPrimaryService(profile.serviceUuid);
  const char = await service.getCharacteristic(profile.characteristicUuid);
  const value = await char.readValue();
  return parseSensorData(value, profile);
};

export const getCachedDevice = (deviceId: string) => deviceCache.get(deviceId);
