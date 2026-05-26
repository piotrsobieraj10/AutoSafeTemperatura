// ============================================================
// storageService.ts — localStorage z obsługą limitów i migracji
// ============================================================

import type { AppSettings, Measurement, Sensor } from "@/types/sensor";
export type { AppSettings } from "@/types/sensor";
import { APP_VERSION } from "@/config/app";

const SENSORS_KEY = "thermo.sensors.v2";
const MEASUREMENTS_KEY = "thermo.measurements.v2";
const SETTINGS_KEY = "thermo.settings.v2";
const MAX_MEASUREMENTS = 10_000;

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
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new StorageEvent("storage", { key }));
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      const ms = getMeasurements().slice(-Math.floor(MAX_MEASUREMENTS / 2));
      localStorage.setItem(MEASUREMENTS_KEY, JSON.stringify(ms));
      localStorage.setItem(key, JSON.stringify(value));
    }
  }
};

// ── Sensors ─────────────────────────────────────────────────

export const getSensors = (): Sensor[] => read<Sensor[]>(SENSORS_KEY, []);
export const saveSensors = (sensors: Sensor[]) => write(SENSORS_KEY, sensors);

export const upsertSensor = (sensor: Sensor): Sensor[] => {
  const list = getSensors();
  const idx = list.findIndex((s) => s.id === sensor.id);
  if (idx >= 0) list[idx] = sensor;
  else list.push(sensor);
  saveSensors(list);
  return list;
};

export const deleteSensor = (id: string) => {
  saveSensors(getSensors().filter((s) => s.id !== id));
  write(
    MEASUREMENTS_KEY,
    getMeasurements().filter((m) => m.sensorId !== id)
  );
};

// ── Measurements ────────────────────────────────────────────

export const getMeasurements = (): Measurement[] =>
  read<Measurement[]>(MEASUREMENTS_KEY, []);

export const saveMeasurements = (measurements: Measurement[]) =>
  write(MEASUREMENTS_KEY, measurements);

export const addMeasurement = (m: Measurement) => {
  const list = getMeasurements();
  list.push(m);
  write(MEASUREMENTS_KEY, list.slice(-MAX_MEASUREMENTS));
};

export const getMeasurementsForSensor = (
  sensorId: string,
  sinceMs?: number
): Measurement[] => {
  const all = getMeasurements().filter((m) => m.sensorId === sensorId);
  if (!sinceMs) return all;
  const cutoff = Date.now() - sinceMs;
  return all.filter((m) => new Date(m.createdAt).getTime() >= cutoff);
};

export const clearMeasurements = () => saveMeasurements([]);

export const clearMeasurementsForSensor = (sensorId: string) => {
  write(
    MEASUREMENTS_KEY,
    getMeasurements().filter((m) => m.sensorId !== sensorId)
  );
};

export const buildMeasurementsCsv = () => {
  const header = ["data", "czujnik_id", "pomieszczenie", "temperatura_c", "wilgotnosc_pct", "rssi_dbm", "bateria_pct"];
  const rows = getMeasurements().map((m) => [
    m.createdAt,
    m.sensorId,
    m.roomName,
    String(m.temperature),
    m.humidity == null ? "" : String(m.humidity),
    m.rssi == null ? "" : String(m.rssi),
    m.batteryLevel == null ? "" : String(m.batteryLevel),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\n");
};

// ── Settings ────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  demoMode: true,
  theme: "dark",
  tempUnit: "C",
  scanDuration: 10_000,
  pollingInterval: 30_000,
  alertSound: false,
};

export const getSettings = (): AppSettings => ({
  ...DEFAULT_SETTINGS,
  ...read<Partial<AppSettings>>(SETTINGS_KEY, {}),
});

export const saveSettings = (s: AppSettings) => write(SETTINGS_KEY, s);

// ── Backup / Restore ─────────────────────────────────────────

export interface AppBackup {
  version: string;
  exportedAt: string;
  sensors: Sensor[];
  measurements: Measurement[];
  settings: AppSettings;
}

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
  if (backup.settings) saveSettings({ ...DEFAULT_SETTINGS, ...backup.settings });
};

export const resetLocalData = () => {
  saveSensors([]);
  saveMeasurements([]);
  saveSettings(DEFAULT_SETTINGS);
};

// ── Helpers ──────────────────────────────────────────────────

export const toDisplayTemp = (celsius: number, unit: "C" | "F"): number =>
  unit === "F" ? +(celsius * 9 / 5 + 32).toFixed(1) : celsius;

export const formatTemp = (celsius: number | undefined, unit: "C" | "F"): string => {
  if (celsius == null) return "—";
  const v = toDisplayTemp(celsius, unit);
  return `${v.toFixed(1)}°${unit}`;
};
