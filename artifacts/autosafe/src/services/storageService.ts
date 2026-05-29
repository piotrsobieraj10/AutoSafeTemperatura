// storageService.ts v5.6.3 — stabilne dane lokalne, eksport, raporty i ustawienia AutoSafe
import type { AlertEvent, AppSettings, Measurement, Sensor, SensorGroup } from "@/types/sensor";
export type { AppSettings } from "@/types/sensor";

export const K = {
  SENSORS:      "thermo.v2.sensors",
  MEASUREMENTS: "thermo.v2.measurements",
  SETTINGS:     "thermo.v2.settings",
  ALERTS:       "thermo.v2.alerts",
  GROUPS:       "thermo.v2.groups",
};

const MAX_MEASUREMENTS = 20_000;
const MAX_ALERTS       = 500;

export const DEFAULT_GROUPS: SensorGroup[] = [
  { id: "group-dom", name: "Dom", icon: "home", collapsed: false },
  { id: "group-garaz", name: "Garaż", icon: "garage", collapsed: false },
  { id: "group-inne", name: "Inne", icon: "other", collapsed: false },
];

const normalizeTextId = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "grupa";

const ensureGroups = (groups: SensorGroup[]): SensorGroup[] => {
  const list = Array.isArray(groups) && groups.length ? groups : DEFAULT_GROUPS;
  const seen = new Set<string>();
  const normalized = list.map((g, i) => {
    const id = g.id || `group-${normalizeTextId(g.name || `grupa-${i + 1}`)}`;
    const uniqueId = seen.has(id) ? `${id}-${i}` : id;
    seen.add(uniqueId);
    return { ...g, id: uniqueId, name: (g.name || "Grupa").trim(), icon: g.icon ?? "other", collapsed: g.collapsed ?? false };
  });
  for (const g of DEFAULT_GROUPS) if (!normalized.some((x) => x.id === g.id)) normalized.push(g);
  return normalized;
};

const defaultGroupId = () => getSensorGroups()[0]?.id ?? DEFAULT_GROUPS[0].id;

const normalizeSensor = (s: Sensor): Sensor => ({
  ...s,
  groupId: s.groupId || defaultGroupId(),
  locationIcon: s.locationIcon ?? "sensor",
  temperatureOffset: s.temperatureOffset ?? 0,
  humidityOffset: s.humidityOffset ?? 0,
  offlineAlertMinutes: s.offlineAlertMinutes ?? 30,
  lastMeasurementSaveStatus: s.lastMeasurementSaveStatus ?? (s.lastReadAt ? "saved" : "waiting"),
});

const read = <T>(key: string, fb: T): T => {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; }
  catch { return fb; }
};

const write = (key: string, val: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(val)); }
  catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      const ms = getMeasurements().slice(-Math.floor(MAX_MEASUREMENTS / 2));
      localStorage.setItem(K.MEASUREMENTS, JSON.stringify(ms));
      try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
    }
  }
};

export const emitDataChanged = () => {
  try { window.dispatchEvent(new CustomEvent("autosafe:data-changed")); } catch {}
};

export const notifyStorageChanged = () => emitDataChanged();

// ── Sensors ─────────────────────────────────────────────────
export const getSensorGroups = (): SensorGroup[] => ensureGroups(read<SensorGroup[]>(K.GROUPS, DEFAULT_GROUPS));
export const saveSensorGroups = (groups: SensorGroup[]) => { write(K.GROUPS, ensureGroups(groups)); emitDataChanged(); };
export const upsertSensorGroup = (group: SensorGroup): void => {
  const groups = getSensorGroups();
  const i = groups.findIndex((g) => g.id === group.id);
  i >= 0 ? (groups[i] = group) : groups.push(group);
  saveSensorGroups(groups);
};
export const createSensorGroup = (name: string, icon: SensorGroup["icon"] = "other"): SensorGroup => {
  const base = `group-${normalizeTextId(name)}`;
  const existing = new Set(getSensorGroups().map((g) => g.id));
  let id = base; let i = 2;
  while (existing.has(id)) id = `${base}-${i++}`;
  const group: SensorGroup = { id, name: name.trim() || "Nowa grupa", icon, collapsed: false, createdAt: new Date().toISOString() };
  upsertSensorGroup(group);
  return group;
};
export const deleteSensorGroup = (id: string): boolean => {
  if (getSensors().some((s) => s.groupId === id)) return false;
  saveSensorGroups(getSensorGroups().filter((g) => g.id !== id));
  return true;
};

export const getSensors = (): Sensor[] => read<Sensor[]>(K.SENSORS, []).map(normalizeSensor);

export const saveSensors = (s: Sensor[]) => { write(K.SENSORS, s.map(normalizeSensor)); emitDataChanged(); };

export const upsertSensor = (s: Sensor): void => {
  const list = getSensors();
  const i = list.findIndex((x) => x.id === s.id);
  i >= 0 ? (list[i] = s) : list.push(s);
  saveSensors(list);
};

export const deleteSensor = (id: string): void => {
  saveSensors(getSensors().filter((s) => s.id !== id));
  write(K.MEASUREMENTS, getMeasurements().filter((m) => m.sensorId !== id));
  emitDataChanged();
};

export const patchSensor = (id: string, patch: Partial<Sensor>): void => {
  const s = getSensors().find((x) => x.id === id);
  if (s) upsertSensor({ ...s, ...patch });
};

// ── Measurements ────────────────────────────────────────────
export const getMeasurements = (): Measurement[] => read<Measurement[]>(K.MEASUREMENTS, []);

export const addMeasurement = (m: Measurement): void => {
  const list = getMeasurements();
  // nie zapisuj identycznego pomiaru częściej niż co 15 sekund dla tego samego czujnika
  const last = [...list].reverse().find((x) => x.sensorId === m.sensorId);
  if (last) {
    const dt = new Date(m.createdAt).getTime() - new Date(last.createdAt).getTime();
    const sameTemp = Math.abs((last.temperature ?? 0) - (m.temperature ?? 0)) < 0.005;
    const sameHum = (last.humidity ?? -1) === (m.humidity ?? -1);
    const sameBat = (last.batteryVoltage ?? -1) === (m.batteryVoltage ?? -1);
    if (dt >= 0 && dt < 15_000 && sameTemp && sameHum && sameBat) return;
  }
  list.push(m);
  write(K.MEASUREMENTS, list.slice(-MAX_MEASUREMENTS));
  emitDataChanged();
};

export const getMeasurementsForSensor = (sensorId: string, sinceMs?: number): Measurement[] => {
  const all = getMeasurements().filter((m) => m.sensorId === sensorId);
  if (!sinceMs) return all;
  const cutoff = Date.now() - sinceMs;
  return all.filter((m) => new Date(m.createdAt).getTime() >= cutoff);
};

export const clearMeasurements = (sensorId: string): void => {
  write(K.MEASUREMENTS, getMeasurements().filter((m) => m.sensorId !== sensorId));
  emitDataChanged();
};

export const clearAllMeasurements = (): void => { write(K.MEASUREMENTS, []); emitDataChanged(); };
export const clearLocalAppData = (): void => {
  Object.values(K).forEach((key) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("thermo.") || key.startsWith("autosafe-temperatura")) localStorage.removeItem(key);
    });
  } catch { /* ignore */ }
  emitDataChanged();
};

export const sanitizeLocalStorage = (): void => {
  try {
    const sensors = getSensors().slice(0, 100);
    const measurements = getMeasurements().slice(-MAX_MEASUREMENTS);
    const alerts = getAlerts().slice(-MAX_ALERTS);
    write(K.SENSORS, sensors);
    write(K.MEASUREMENTS, measurements);
    write(K.ALERTS, alerts);
    write(K.GROUPS, getSensorGroups());
    write(K.SENSORS, sensors.map(normalizeSensor));
    write(K.SETTINGS, { ...DEFAULT_SETTINGS, ...getSettings(), autoStartMonitor: false });
  } catch {
    // Jeśli dane są uszkodzone, nie pozwól wywrócić aplikacji przy starcie.
    try { write(K.SETTINGS, DEFAULT_SETTINGS); } catch { /* ignore */ }
  }
};

// ── Alerts history ───────────────────────────────────────────
export const getAlerts = (): AlertEvent[] => read<AlertEvent[]>(K.ALERTS, []);
export const addAlert = (a: AlertEvent): void => {
  const list = getAlerts();
  const duplicate = list.slice(-20).some((x) => x.sensorId === a.sensorId && x.type === a.type && Date.now() - new Date(x.createdAt).getTime() < 15 * 60_000);
  if (duplicate) return;
  list.push(a);
  write(K.ALERTS, list.slice(-MAX_ALERTS));
  emitDataChanged();
};
export const acknowledgeAlert = (id: string): void => {
  const list = getAlerts().map((a) => a.id === id ? { ...a, acknowledged: true } : a);
  write(K.ALERTS, list);
  emitDataChanged();
};
export const clearAlerts = (): void => { write(K.ALERTS, []); emitDataChanged(); };

// ── Settings ─────────────────────────────────────────────────
export const DEFAULT_SETTINGS: AppSettings = {
  demoMode:          false,
  theme:             "system",
  tempUnit:          "C",
  scanDuration:      10_000,
  pollingInterval:   30_000,
  alertSound:        false,
  alertVibration:    true,
  chartDefaultRange: "24h",
  maxMeasurements:   MAX_MEASUREMENTS,
  dashboardDensity:  "compact",
  showBleDiagnostics:false,
  autoStartMonitor:  false,
  monitorDuration:   "quick",
  showFirstRunTips:  true,
  hideTechnicalMessages: true,
  foregroundRefreshEnabled: true,
  foregroundRefreshIntervalMs: 30000,
  backgroundMonitoringMode: "eco",
};

export const getSettings = (): AppSettings => ({ ...DEFAULT_SETTINGS, ...read<Partial<AppSettings>>(K.SETTINGS, {}) });
export const saveSettings = (s: AppSettings) => { write(K.SETTINGS, s); emitDataChanged(); };
export const patchSettings = (patch: Partial<AppSettings>) => saveSettings({ ...getSettings(), ...patch });

// ── Helpers ──────────────────────────────────────────────────
export const toDisplayTemp = (c: number, unit: "C" | "F") => unit === "F" ? +(c * 9 / 5 + 32).toFixed(1) : c;
export const formatTemp = (c: number | undefined, unit: "C" | "F"): string => c == null ? "—" : `${toDisplayTemp(c, unit).toFixed(1)}°${unit}`;
export const formatHumidity = (h: number | undefined): string => h == null ? "—" : `${h.toFixed(0)}%`;
export const formatPressure = (p: number | undefined): string => p == null ? "—" : `${p.toFixed(1)} hPa`;
export const formatBattery = (mv?: number, pct?: number): string => {
  if (pct != null && mv != null) return `${pct}% · ${mv} mV`;
  if (pct != null) return `${pct}%`;
  if (mv != null) return `${mv} mV`;
  return "czekam na ramkę baterii";
};

export const getBatteryLabel = (mv?: number, pct?: number): { label: string; tone: "ok" | "warn" | "bad" | "unknown" } => {
  if (pct != null) {
    if (pct < 15) return { label: "niska", tone: "bad" };
    if (pct < 35) return { label: "średnia", tone: "warn" };
    return { label: "dobra", tone: "ok" };
  }
  if (mv == null) return { label: "oczekuje", tone: "unknown" };
  if (mv < 2400) return { label: "niska", tone: "bad" };
  if (mv < 2850) return { label: "średnia", tone: "warn" };
  return { label: "dobra", tone: "ok" };
};

export const exportCsv = (): string => {
  const sensors = getSensors();
  const sensorById = new Map(sensors.map((s) => [s.id, s]));
  const rows = [["data", "pomieszczenie", "nazwa_ble", "temperatura_c", "wilgotnosc_pct", "bateria_mv", "rssi"]];
  getMeasurements().forEach((m) => {
    const s = sensorById.get(m.sensorId);
    rows.push([
      m.createdAt,
      m.roomName,
      m.bluetoothName ?? s?.bluetoothName ?? "",
      String(m.temperature ?? ""),
      String(m.humidity ?? ""),
      String(m.batteryVoltage ?? ""),
      String(m.rssi ?? ""),
    ]);
  });
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
};

export const createBackupJson = (): string => JSON.stringify({
  version: "AutoSafe_Temperatura_v6.0.4_RHT_humidity_fix",
  exportedAt: new Date().toISOString(),
  sensors: getSensors(),
  measurements: getMeasurements(),
  alerts: getAlerts(),
  groups: getSensorGroups(),
  settings: getSettings(),
}, null, 2);

export const importBackupJson = (json: string): void => {
  const data = JSON.parse(json) as Partial<{ sensors: Sensor[]; measurements: Measurement[]; alerts: AlertEvent[]; groups: SensorGroup[]; settings: AppSettings }>;
  if (Array.isArray(data.groups)) write(K.GROUPS, ensureGroups(data.groups));
  if (Array.isArray(data.sensors)) write(K.SENSORS, data.sensors.map(normalizeSensor));
  if (Array.isArray(data.measurements)) write(K.MEASUREMENTS, data.measurements.slice(-MAX_MEASUREMENTS));
  if (Array.isArray(data.alerts)) write(K.ALERTS, data.alerts.slice(-MAX_ALERTS));
  if (data.settings) write(K.SETTINGS, { ...DEFAULT_SETTINGS, ...data.settings });
  emitDataChanged();
};


export const exportHtmlReport = (rangeLabel = "raport") => {
  const sensors = getSensors();
  const measurements = getMeasurements();
  const alerts = getAlerts();
  const generatedAt = new Date().toLocaleString("pl-PL");
  const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" };
    return map[c] ?? c;
  });
  const sensorRows = sensors.map((s) => {
    const ms = measurements.filter((m) => m.sensorId === s.id);
    const temps = ms.map((m) => m.temperature).filter((v) => Number.isFinite(v));
    const hums = ms.map((m) => m.humidity).filter((v): v is number => v != null && Number.isFinite(v));
    const min = temps.length ? Math.min(...temps).toFixed(1) : "—";
    const max = temps.length ? Math.max(...temps).toFixed(1) : "—";
    const avg = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : "—";
    const hum = hums.length ? (hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(0) : "—";
    return `<tr><td><strong>${esc(s.roomName)}</strong><br><small>${esc(s.bluetoothName)}</small></td><td>${esc(formatTemp(s.lastTemperature, "C"))}</td><td>${esc(s.lastHumidity != null ? formatHumidity(s.lastHumidity) : "—")}</td><td>${esc(formatBattery(s.batteryVoltage, s.batteryLevel))}</td><td>${esc(s.lastRssi != null ? `${s.lastRssi} dBm` : "—")}</td><td>${min} / ${avg} / ${max} °C<br><small>Śr. wilg.: ${hum}%</small></td><td>${esc(s.lastReadAt ? new Date(s.lastReadAt).toLocaleString("pl-PL") : "—")}</td></tr>`;
  }).join("");
  const alertRows = alerts.slice(-40).reverse().map((a) => `<tr><td>${esc(new Date(a.createdAt).toLocaleString("pl-PL"))}</td><td>${esc(a.roomName)}</td><td>${esc(a.type)}</td><td>${esc(a.value)}</td><td>${esc(a.threshold)}</td></tr>`).join("");
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>AutoSafe Temperatura — ${esc(rangeLabel)}</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#151515}h1{margin:0 0 4px}small{color:#666}.brand{display:flex;align-items:center;gap:12px;margin-bottom:24px}.logo{width:46px;height:46px;border-radius:12px;background:#111;color:#c7a348;display:grid;place-items:center;font-weight:800}table{width:100%;border-collapse:collapse;margin:16px 0 28px}th,td{border:1px solid #ddd;padding:9px;text-align:left;font-size:13px}th{background:#f5f1e7}.muted{color:#666}.footer{margin-top:30px;font-size:11px;color:#777}@media print{body{margin:18mm}.no-print{display:none}}</style></head><body><div class="brand"><div class="logo">AS</div><div><h1>AutoSafe Temperatura</h1><div class="muted">Raport wygenerowany: ${esc(generatedAt)}</div></div></div><h2>Czujniki i statystyki</h2><table><thead><tr><th>Czujnik</th><th>Aktualna temp.</th><th>Wilgotność</th><th>Bateria</th><th>RSSI</th><th>Min/Avg/Max</th><th>Ostatni odczyt</th></tr></thead><tbody>${sensorRows || `<tr><td colspan="7">Brak czujników</td></tr>`}</tbody></table><h2>Ostatnie alerty</h2><table><thead><tr><th>Data</th><th>Pomieszczenie</th><th>Typ</th><th>Wartość</th><th>Próg</th></tr></thead><tbody>${alertRows || `<tr><td colspan="5">Brak alertów</td></tr>`}</tbody></table><p class="footer">Dane przechowywane lokalnie w aplikacji AutoSafe_Temperatura_v6.0.4_RHT_humidity_fix. W przeglądarce użyj Drukuj → Zapisz jako PDF.</p><button class="no-print" onclick="window.print()">Drukuj / zapisz PDF</button></body></html>`;
};

export const openHtmlReport = () => {
  const html = exportHtmlReport("raport");
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) downloadTextFile(`autosafe-raport-${new Date().toISOString().slice(0,10)}.html`, html, "text/html;charset=utf-8");
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

export const downloadTextFile = (filename: string, content: string, mime = "text/plain;charset=utf-8") => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};
