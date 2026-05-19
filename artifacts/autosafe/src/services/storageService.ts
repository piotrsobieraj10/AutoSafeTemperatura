import type { Measurement, Sensor } from "@/types/sensor";
import { APP_VERSION } from "@/config/app";

const SENSORS_KEY = "thermo.sensors.v1";
const MEASUREMENTS_KEY = "thermo.measurements.v1";
const SETTINGS_KEY = "thermo.settings.v1";

export type ThemeMode = "auto" | "light" | "dark";

export interface AppSettings {
  demoMode: boolean;
  theme: ThemeMode;
  autoReadMinutes: number;
  staleMinutes: number;
}

export interface AppBackup {
  version: string;
  exportedAt: string;
  sensors: Sensor[];
  measurements: Measurement[];
  settings: AppSettings;
}

const defaultSettings: AppSettings = {
  demoMode: true,
  theme: "auto",
  autoReadMinutes: 10,
  staleMinutes: 30,
};

const isBrowser = () => typeof window !== "undefined";

const read = <T>(key: string, fallback: T): T => {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
    if (fallback && typeof fallback === "object" && parsed && typeof parsed === "object") {
      return { ...fallback, ...parsed } as T;
    }
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  if (!isBrowser()) return;
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new StorageEvent("storage", { key }));
};

export const getSensors = (): Sensor[] => read<Sensor[]>(SENSORS_KEY, []);
export const saveSensors = (sensors: Sensor[]) => write(SENSORS_KEY, sensors);
export const upsertSensor = (sensor: Sensor) => {
  const list = getSensors();
  const idx = list.findIndex((s) => s.id === sensor.id);
  if (idx >= 0) list[idx] = sensor;
  else list.push(sensor);
  saveSensors(list);
  return list;
};
export const deleteSensor = (id: string) => {
  saveSensors(getSensors().filter((s) => s.id !== id));
  const measurements = getMeasurements().filter((m) => m.sensorId !== id);
  write(MEASUREMENTS_KEY, measurements);
};

export const getMeasurements = (): Measurement[] =>
  read<Measurement[]>(MEASUREMENTS_KEY, []);

export const saveMeasurements = (measurements: Measurement[]) =>
  write(MEASUREMENTS_KEY, measurements);

export const addMeasurement = (m: Measurement) => {
  const list = getMeasurements();
  list.push(m);
  const trimmed = list.slice(-10000);
  write(MEASUREMENTS_KEY, trimmed);
};

export const getMeasurementsForSensor = (
  sensorId: string,
  sinceMs?: number,
): Measurement[] => {
  const all = getMeasurements().filter((m) => m.sensorId === sensorId);
  if (!sinceMs) return all;
  const cutoff = Date.now() - sinceMs;
  return all.filter((m) => new Date(m.createdAt).getTime() >= cutoff);
};

export const clearMeasurements = () => saveMeasurements([]);

export const buildMeasurementsCsv = () => {
  const header = ["data", "czujnik_id", "pomieszczenie", "temperatura_c", "wilgotnosc_pct"];
  const rows = getMeasurements().map((m) => [
    m.createdAt,
    m.sensorId,
    m.roomName,
    String(m.temperature),
    m.humidity == null ? "" : String(m.humidity),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\n");
};

export const getSettings = (): AppSettings => read<AppSettings>(SETTINGS_KEY, defaultSettings);
export const saveSettings = (s: AppSettings) => write(SETTINGS_KEY, s);

export const buildBackup = (): AppBackup => ({
  version: APP_VERSION,
  exportedAt: new Date().toISOString(),
  sensors: getSensors(),
  measurements: getMeasurements(),
  settings: getSettings(),
});

export const importBackup = (backup: Partial<AppBackup>) => {
  if (Array.isArray(backup.sensors)) saveSensors(backup.sensors);
  if (Array.isArray(backup.measurements)) saveMeasurements(backup.measurements);
  if (backup.settings) saveSettings({ ...defaultSettings, ...backup.settings });
};

export const resetLocalData = () => {
  saveSensors([]);
  saveMeasurements([]);
  saveSettings(defaultSettings);
};
