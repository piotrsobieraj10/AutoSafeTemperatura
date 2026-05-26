export type SensorStatus = "connected" | "disconnected" | "scanning" | "error" | "unknown";
export type SensorSource = "ela-advertisement" | "gatt" | "demo";

export interface Sensor {
  id: string;
  bluetoothName: string;
  deviceId: string;
  macAddress?: string;
  roomName: string;
  customName?: string;
  profileId: string;
  lastTemperature?: number;
  lastHumidity?: number;
  lastReadAt?: string;
  status: SensorStatus;
  source: SensorSource;
  minTempAlert?: number;
  maxTempAlert?: number;
  minHumidityAlert?: number;
  maxHumidityAlert?: number;
  lastRssi?: number;
  batteryLevel?: number;
  isDemo?: boolean;
}

export interface Measurement {
  id: string;
  sensorId: string;
  roomName: string;
  temperature: number;
  humidity?: number;
  rssi?: number;
  batteryLevel?: number;
  createdAt: string;
}

export interface SensorProfile {
  id: string;
  name: string;
  manufacturer?: string;
  serviceUuid?: string;
  characteristicUuid?: string;
  manufacturerId?: number;
  supportsTemperature: boolean;
  supportsHumidity: boolean;
  supportsBattery: boolean;
  source: "gatt" | "advertisement";
  decodeGatt?: (data: DataView) => { temperature?: number; humidity?: number; battery?: number };
  decodeAdvertisement?: (data: DataView) => { temperature?: number; humidity?: number; battery?: number; rssi?: number };
}

export interface AppSettings {
  demoMode: boolean;
  theme: "light" | "dark";
  tempUnit: "C" | "F";
  scanDuration: number;
  pollingInterval: number;
  alertSound: boolean;
}
