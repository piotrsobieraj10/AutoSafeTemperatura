import type { AlertEvent, AppSettings, Measurement, Sensor } from "@/types/sensor";
import { notifyThemeChanged } from "./themeService";

export type { AppSettings } from "@/types/sensor";

export const STORAGE_EVENT = "autosafe-temp-storage-change";

export const K = {
  SENSORS:      "thermo.v2.sensors",
  MEASUREMENTS: "thermo.v2.measurements",
  SETTINGS:     "thermo.v2.settings",
  ALERTS:       "thermo.v2.alerts",
};

const LEGACY_KEYS = {
  SENSORS_V1:      "thermo.sensors.v1",
  MEASUREMENTS_V1: "thermo.measurements.v1",
  SETTINGS_V1:     "thermo.settings.v1",
};

const MAX_MEASUREMENTS = 20_000;
const MAX_ALERTS       = 500;

const isBrowser = () => typeof window !== "undefined" && typeof localStorage !== "undefined";

export const notifyStorageChanged = () => {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(STORAGE_EVENT));
};

const read = <T>(key: string, fb: T): T => {
  if (!isBrowser()) return fb;
  try {
    const r = localStorage.getItem(key);
    return r ? JSON.parse(r) : fb;
  } catch {
    return fb;
  }
};

const write = (key: string, val: unknown) => {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
    notifyStorageChanged();
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      const ms = getMeasurements().slice(-Math.floor(MAX_MEASUREMENTS / 2));
      localStorage.setItem(K.MEASUREMENTS, JSON.stringify(ms));
      try {
        localStorage.setItem(key, JSON.stringify(val));
        notifyStorageChanged();
      } catch {}
    }
  }
};

export const migrateLegacyStorage = () => {
  if (!isBrowser()) return;

  const hasV2Settings = localStorage.getItem(K.SETTINGS) != null;
  const legacySettings = localStorage.getItem(LEGACY_KEYS.SETTINGS_V1);
  if (!hasV2Settings && legacySettings) {
    try {
      const parsed = JSON.parse(legacySettings) as Partial<AppSettings> & { theme?: string };
      const rawTheme = String(parsed.theme ?? "");
      const theme = rawTheme === "auto" ? "system" : parsed.theme;
      localStorage.setItem(K.SETTINGS, JSON.stringify({ ...parsed, theme }));
    } catch {}
  }

  const hasV2Sensors = localStorage.getItem(K.SENSORS) != null;
  const legacySensors = localStorage.getItem(LEGACY_KEYS.SENSORS_V1);
  if (!hasV2Sensors && legacySensors) localStorage.setItem(K.SENSORS, legacySensors);

  const hasV2Measurements = localStorage.getItem(K.MEASUREMENTS) != null;
  const legacyMeasurements = localStorage.getItem(LEGACY_KEYS.MEASUREMENTS_V1);
  if (!hasV2Measurements && legacyMeasurements) localStorage.setItem(K.MEASUREMENTS, legacyMeasurements);
};

migrateLegacyStorage();

// ── Sensors ─────────────────────────────────────────────────
export const getSensors     = (): Sensor[] => read<Sensor[]>(K.SENSORS, []);
export const saveSensors    = (s: Sensor[]) => write(K.SENSORS, s);

export const upsertSensor   = (s: Sensor): void => {
  const list = getSensors();
  const i = list.findIndex((x) => x.id === s.id);
  i >= 0 ? (list[i] = s) : list.push(s);
  saveSensors(list);
};

export const deleteSensor   = (id: string): void => {
  saveSensors(getSensors().filter((s) => s.id !== id));
  write(K.MEASUREMENTS, getMeasurements().filter((m) => m.sensorId !== id));
};

export const patchSensor    = (id: string, patch: Partial<Sensor>): void => {
  const s = getSensors().find((x) => x.id === id);
  if (s) upsertSensor({ ...s, ...patch });
};

// ── Measurements ────────────────────────────────────────────
export const getMeasurements = (): Measurement[] => read<Measurement[]>(K.MEASUREMENTS, []);

export const addMeasurement  = (m: Measurement): void => {
  const list = getMeasurements();
  list.push(m);
  write(K.MEASUREMENTS, list.slice(-MAX_MEASUREMENTS));
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

export const clearMeasurements = (sensorId: string): void => {
  write(K.MEASUREMENTS, getMeasurements().filter((m) => m.sensorId !== sensorId));
};

// ── Alerts history ───────────────────────────────────────────
export const getAlerts       = (): AlertEvent[] => read<AlertEvent[]>(K.ALERTS, []);
export const addAlert        = (a: AlertEvent): void => {
  const list = getAlerts();
  list.push(a);
  write(K.ALERTS, list.slice(-MAX_ALERTS));
};
export const acknowledgeAlert = (id: string): void => {
  const list = getAlerts().map((a) => a.id === id ? { ...a, acknowledged: true } : a);
  write(K.ALERTS, list);
};
export const clearAlerts     = (): void => write(K.ALERTS, []);

// ── Settings ─────────────────────────────────────────────────
export const DEFAULT_SETTINGS: AppSettings = {
  demoMode:          false,
  theme:             "system",
  tempUnit:          "C",
  scanDuration:      15_000,
  pollingInterval:   30_000,
  alertSound:        false,
  alertVibration:    true,
  chartDefaultRange: "24h",
  maxMeasurements:   MAX_MEASUREMENTS,
};

export const getSettings  = (): AppSettings => ({ ...DEFAULT_SETTINGS, ...read<Partial<AppSettings>>(K.SETTINGS, {}) });
export const saveSettings = (s: AppSettings) => {
  write(K.SETTINGS, s);
  notifyThemeChanged();
};
export const patchSettings = (patch: Partial<AppSettings>) => saveSettings({ ...getSettings(), ...patch });

// ── Backup / import / export ─────────────────────────────────
export const exportLocalData = () => ({
  version: 2,
  exportedAt: new Date().toISOString(),
  settings: getSettings(),
  sensors: getSensors(),
  measurements: getMeasurements(),
  alerts: getAlerts(),
});

export const importLocalData = (payload: unknown) => {
  const data = payload as Partial<ReturnType<typeof exportLocalData>>;
  if (data.settings) saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
  if (Array.isArray(data.sensors)) saveSensors(data.sensors);
  if (Array.isArray(data.measurements)) write(K.MEASUREMENTS, data.measurements.slice(-MAX_MEASUREMENTS));
  if (Array.isArray(data.alerts)) write(K.ALERTS, data.alerts.slice(-MAX_ALERTS));
  notifyStorageChanged();
};

export const clearAllLocalData = () => {
  if (!isBrowser()) return;
  Object.values(K).forEach((key) => localStorage.removeItem(key));
  Object.values(LEGACY_KEYS).forEach((key) => localStorage.removeItem(key));
  notifyStorageChanged();
  notifyThemeChanged();
};

export const measurementsToCsv = (rows = getMeasurements()): string => {
  const header = ["createdAt", "sensorId", "roomName", "temperatureC", "humidity", "pressure", "rssi", "batteryLevel"];
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return [header.join(","), ...rows.map((m) => [m.createdAt, m.sensorId, m.roomName, m.temperature, m.humidity, m.pressure, m.rssi, m.batteryLevel].map(esc).join(","))].join("\n");
};

// ── Helpers ──────────────────────────────────────────────────
export const toDisplayTemp = (c: number, unit: "C" | "F") =>
  unit === "F" ? +(c * 9 / 5 + 32).toFixed(1) : c;

export const formatTemp = (c: number | undefined, unit: "C" | "F"): string => {
  if (c == null) return "—";
  return `${toDisplayTemp(c, unit).toFixed(1)}°${unit}`;
};

export const formatHumidity = (h: number | undefined): string =>
  h == null ? "—" : `${h.toFixed(0)}%`;

export const formatPressure = (p: number | undefined): string =>
  p == null ? "—" : `${p.toFixed(1)} hPa`;
