// ============================================================
// types/sensor.ts v2 — rozszerzone typy dla wszystkich czujników
// ============================================================

export type SensorStatus = "connected" | "disconnected" | "scanning" | "error" | "unknown";
export type SensorSource = "ela-advertisement" | "gatt" | "ruuvi" | "govee" | "inkbird" | "demo";
export type TempZone = "frozen" | "cold" | "cool" | "ok" | "warm" | "hot" | "danger" | "offline";

export interface Sensor {
  id: string;
  bluetoothName: string;
  deviceId: string;
  macAddress?: string;
  roomName: string;
  customName?: string;
  profileId: string;
  lastTemperature?: number;   // zawsze °C wewnętrznie
  lastHumidity?: number;
  lastPressure?: number;      // hPa — RuuviTag
  lastReadAt?: string;
  status: SensorStatus;
  source: SensorSource;
  // Alerty
  minTempAlert?: number;
  maxTempAlert?: number;
  minHumidityAlert?: number;
  maxHumidityAlert?: number;
  // Meta
  lastRssi?: number;
  batteryLevel?: number;
  batteryVoltage?: number;    // mV — RuuviTag
  // Flagi
  isDemo?: boolean;
  isPinned?: boolean;
  alertMuted?: boolean;
}

export interface Measurement {
  id: string;
  sensorId: string;
  roomName: string;
  temperature: number;        // °C
  humidity?: number;
  pressure?: number;          // hPa
  rssi?: number;
  batteryLevel?: number;
  createdAt: string;
}

export interface SensorProfile {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  icon?: string;              // emoji lub nazwa ikony lucide
  serviceUuid?: string;
  characteristicUuid?: string;
  manufacturerId?: number;
  supportsTemperature: boolean;
  supportsHumidity: boolean;
  supportsPressure: boolean;
  supportsBattery: boolean;
  supportsRssi: boolean;
  source: "gatt" | "advertisement";
  tempRange?: [number, number]; // [min, max] °C
  description?: string;
  setupUrl?: string;
  decodeGatt?: (data: DataView) => DecodedData;
  decodeAdvertisement?: (data: DataView, rssi?: number) => DecodedData;
}

export interface DecodedData {
  temperature?: number;
  humidity?: number;
  pressure?: number;
  battery?: number;
  batteryVoltage?: number;
  rssi?: number;
}

export interface AppSettings {
  demoMode: boolean;
  theme: "light" | "dark" | "system";
  tempUnit: "C" | "F";
  scanDuration: number;
  pollingInterval: number;
  alertSound: boolean;
  alertVibration: boolean;
  chartDefaultRange: "1h" | "24h" | "7d";
  maxMeasurements: number;
}

export interface AlertEvent {
  id: string;
  sensorId: string;
  roomName: string;
  type: "min_temp" | "max_temp" | "min_humidity" | "max_humidity" | "offline";
  value: number;
  threshold: number;
  createdAt: string;
  acknowledged: boolean;
}

// Pomocnicze
export const getTempZone = (temp?: number, min?: number, max?: number): TempZone => {
  if (temp == null) return "offline";
  if (min != null && temp < min) return temp < min - 5 ? "frozen" : "cold";
  if (max != null && temp > max) return temp > max + 5 ? "danger" : "hot";
  if (temp < 5)  return "frozen";
  if (temp < 12) return "cold";
  if (temp < 18) return "cool";
  if (temp < 26) return "ok";
  if (temp < 30) return "warm";
  if (temp < 35) return "hot";
  return "danger";
};

export const ZONE_LABELS: Record<TempZone, string> = {
  frozen:  "Mróz",
  cold:    "Zimno",
  cool:    "Chłodno",
  ok:      "Komfortowo",
  warm:    "Ciepło",
  hot:     "Gorąco",
  danger:  "Niebezpiecznie!",
  offline: "Brak sygnału",
};
