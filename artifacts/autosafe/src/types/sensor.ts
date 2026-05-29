// ============================================================
// types/sensor.ts v5.6 — AutoSafe Temperatura, ELA Blue PUCK T/RHT
// ============================================================

export type SensorStatus = "connected" | "disconnected" | "scanning" | "pending" | "error" | "unknown";
export type SensorSource = "ela-advertisement" | "gatt" | "ruuvi" | "govee" | "inkbird" | "demo";
export type TempZone = "frozen" | "cold" | "cool" | "ok" | "warm" | "hot" | "danger" | "offline";

export interface Sensor {
  id: string;
  bluetoothName: string;
  deviceId: string;
  macAddress?: string;
  roomName: string;
  customName?: string;
  locationIcon?: "home" | "living" | "bed" | "kitchen" | "bath" | "garage" | "boiler" | "warehouse" | "fridge" | "car" | "leaf" | "thermometer" | "humidity" | "sensor";
  groupId?: string;
  lastMeasurementSavedAt?: string;
  lastMeasurementSaveStatus?: "saved" | "waiting" | "skipped" | "error";
  profileId: string;
  lastTemperature?: number;   // zawsze °C wewnętrznie
  lastHumidity?: number;
  lastPressure?: number;      // hPa — RuuviTag
  lastReadAt?: string;
  lastTemperatureReadAt?: string;
  lastHumidityReadAt?: string;
  lastBatteryReadAt?: string;
  status: SensorStatus;
  source: SensorSource;
  // Kalibracja lokalna
  temperatureOffset?: number;
  humidityOffset?: number;
  // Alerty
  minTempAlert?: number;
  maxTempAlert?: number;
  minHumidityAlert?: number;
  maxHumidityAlert?: number;
  offlineAlertMinutes?: number;
  // Meta
  lastRssi?: number;
  batteryLevel?: number;
  batteryVoltage?: number;    // mV — RuuviTag / ELA
  rawAdvertisementHex?: string;
  rawServiceData?: string;
  rawManufacturerData?: string;
  bleDebug?: string;
  // Flagi
  isDemo?: boolean;
  isPinned?: boolean;
  alertMuted?: boolean;
}

export interface Measurement {
  id: string;
  sensorId: string;
  roomName: string;
  bluetoothName?: string;
  temperature: number;        // °C po kalibracji
  humidity?: number;          // % po kalibracji
  pressure?: number;          // hPa
  rssi?: number;
  batteryLevel?: number;
  batteryVoltage?: number;
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
  rawAdvertisementHex?: string;
  rawServiceData?: string;
  rawManufacturerData?: string;
  bleDebug?: string;
}

export interface SensorGroup {
  id: string;
  name: string;
  icon?: "home" | "floor" | "garage" | "boiler" | "fridge" | "warehouse" | "other";
  collapsed?: boolean;
  createdAt?: string;
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
  dashboardDensity?: "comfortable" | "compact";
  showBleDiagnostics?: boolean;
  autoStartMonitor?: boolean;
  monitorDuration?: "quick" | "fiveMin" | "continuous";
  foregroundRefreshEnabled?: boolean;
  foregroundRefreshIntervalMs?: 15000 | 30000 | 60000 | 120000 | 0;
  backgroundMonitoringMode?: "off" | "eco" | "normal" | "test";
  showFirstRunTips?: boolean;
  hideTechnicalMessages?: boolean;
}

export interface AlertEvent {
  id: string;
  sensorId: string;
  roomName: string;
  type: "min_temp" | "max_temp" | "min_humidity" | "max_humidity" | "offline" | "battery_low";
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
