// storageService.ts v2
import type { AlertEvent, AppSettings, Measurement, Sensor } from "@/types/sensor";
export type { AppSettings } from "@/types/sensor";

const K = {
  SENSORS:      "thermo.v2.sensors",
  MEASUREMENTS: "thermo.v2.measurements",
  SETTINGS:     "thermo.v2.settings",
  ALERTS:       "thermo.v2.alerts",
};

const MAX_MEASUREMENTS = 20_000;
const MAX_ALERTS       = 500;

const read = <T>(key: string, fb: T): T => {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; }
  catch { return fb; }
};

const write = (key: string, val: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(val)); }
  catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      // Przytnij pomiary o połowę i spróbuj ponownie
      const ms = getMeasurements().slice(-Math.floor(MAX_MEASUREMENTS / 2));
      localStorage.setItem(K.MEASUREMENTS, JSON.stringify(ms));
      try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
    }
  }
};

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
  demoMode:          true,
  theme:             "dark",
  tempUnit:          "C",
  scanDuration:      10_000,
  pollingInterval:   30_000,
  alertSound:        false,
  alertVibration:    true,
  chartDefaultRange: "24h",
  maxMeasurements:   MAX_MEASUREMENTS,
};

export const getSettings  = (): AppSettings => ({ ...DEFAULT_SETTINGS, ...read<Partial<AppSettings>>(K.SETTINGS, {}) });
export const saveSettings = (s: AppSettings) => write(K.SETTINGS, s);
export const patchSettings = (patch: Partial<AppSettings>) => saveSettings({ ...getSettings(), ...patch });

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
