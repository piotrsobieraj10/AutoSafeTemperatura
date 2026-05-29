import type { ComponentType } from "react";
import type { Sensor, SensorGroup } from "@/types/sensor";
import {
  Bath, BedDouble, Car, Droplets, Factory, Flame, Gauge, Home, House, Layers,
  Refrigerator, Thermometer, Warehouse, Wifi, Radio,
} from "lucide-react";
import { getBatteryLabel } from "@/services/storageService";

export const SENSOR_ICON_OPTIONS = [
  { value: "home", label: "Dom", icon: Home },
  { value: "living", label: "Salon", icon: House },
  { value: "bed", label: "Sypialnia", icon: BedDouble },
  { value: "kitchen", label: "Kuchnia", icon: Home },
  { value: "bath", label: "Łazienka", icon: Bath },
  { value: "garage", label: "Garaż", icon: Car },
  { value: "boiler", label: "Kotłownia", icon: Flame },
  { value: "fridge", label: "Lodówka", icon: Refrigerator },
  { value: "warehouse", label: "Magazyn", icon: Warehouse },
  { value: "car", label: "Auto", icon: Car },
  { value: "thermometer", label: "Termometr", icon: Thermometer },
  { value: "humidity", label: "Wilgotność", icon: Droplets },
  { value: "sensor", label: "Czujnik", icon: Radio },
] as const;

export const GROUP_ICON_OPTIONS = [
  { value: "home", label: "Dom", icon: Home },
  { value: "floor", label: "Parter / piętro", icon: Layers },
  { value: "garage", label: "Garaż", icon: Car },
  { value: "boiler", label: "Kotłownia", icon: Flame },
  { value: "fridge", label: "Lodówka", icon: Refrigerator },
  { value: "warehouse", label: "Magazyn", icon: Warehouse },
  { value: "other", label: "Inne", icon: Factory },
] as const;

export const getSensorIcon = (sensor?: Pick<Sensor, "locationIcon">): ComponentType<{ className?: string }> => {
  const found = SENSOR_ICON_OPTIONS.find((x) => x.value === sensor?.locationIcon);
  return found?.icon ?? Radio;
};

export const getGroupIcon = (group?: Pick<SensorGroup, "icon">): ComponentType<{ className?: string }> => {
  const found = GROUP_ICON_OPTIONS.find((x) => x.value === group?.icon);
  return found?.icon ?? Layers;
};

export const normalizeBleKey = (value?: string | null) => (value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "").trim();

export const sensorMatchesQuery = (sensor: Pick<Sensor, "bluetoothName" | "deviceId" | "macAddress" | "roomName">, query: string) => {
  const q = normalizeBleKey(query);
  if (!q) return false;
  return [sensor.bluetoothName, sensor.deviceId, sensor.macAddress, sensor.roomName].some((v) => normalizeBleKey(v).includes(q));
};

export const relativeTime = (iso?: string): string => {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 30) return "teraz";
  if (s < 60) return `${s}s temu`;
  if (s < 3600) return `${Math.floor(s / 60)} min temu`;
  if (s < 86400) return `${Math.floor(s / 3600)} godz. temu`;
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "short" });
};

export type UiStatus = "fresh" | "scanning" | "waiting" | "stale" | "offline";
export const getUiStatus = (sensor: Pick<Sensor, "status" | "lastReadAt">): UiStatus => {
  if (sensor.status === "scanning") return "scanning";
  if (!sensor.lastReadAt) return "waiting";
  const age = Date.now() - new Date(sensor.lastReadAt).getTime();
  if (!Number.isFinite(age)) return "waiting";
  if (age < 2 * 60_000) return "fresh";
  if (age < 5 * 60_000) return "stale";
  return "offline";
};

export const uiStatusLabel: Record<UiStatus, string> = {
  fresh: "świeże",
  scanning: "odświeżam",
  waiting: "oczekuje",
  stale: "stare dane",
  offline: "offline",
};

export const compactSensorSummary = (sensor: Sensor, tempUnit: "C" | "F") => {
  const temp = sensor.lastTemperature == null ? "—" : `${(tempUnit === "F" ? sensor.lastTemperature * 9 / 5 + 32 : sensor.lastTemperature).toFixed(1).replace(".", ",")}°${tempUnit}`;
  const hum = sensor.lastHumidity == null ? null : `${sensor.lastHumidity.toFixed(0)}%`;
  const battery = getBatteryLabel(sensor.batteryVoltage, sensor.batteryLevel).label;
  const rssi = sensor.lastRssi == null ? "brak RSSI" : `${sensor.lastRssi} dBm`;
  return [temp, hum, `bateria ${battery}`, rssi].filter(Boolean).join(" · ");
};
