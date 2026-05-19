export type SensorStatus = "connected" | "disconnected" | "error" | "unknown";

export interface Sensor {
  id: string;
  bluetoothName: string;
  deviceId: string;
  macAddress?: string;
  roomName: string;
  customName?: string;
  profileId?: string;
  lastTemperature?: number;
  lastHumidity?: number;
  lastReadAt?: string;
  status: SensorStatus;
  minTempAlert?: number;
  maxTempAlert?: number;
  minHumidityAlert?: number;
  maxHumidityAlert?: number;
  isDemo?: boolean;
}

export interface Measurement {
  id: string;
  sensorId: string;
  roomName: string;
  temperature: number;
  humidity?: number;
  createdAt: string;
}

export interface SensorProfile {
  id: string;
  name: string;
  manufacturer?: string;
  serviceUuid: string;
  characteristicUuid: string;
  supportsTemperature: boolean;
  supportsHumidity: boolean;
  source: "gatt" | "advertisement";
  decode: (data: DataView) => { temperature?: number; humidity?: number };
}
