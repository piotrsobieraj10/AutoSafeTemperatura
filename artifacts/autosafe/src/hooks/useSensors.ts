// hooks/useSensors.ts v5.6.1 — hotfix stabilności: bez pętli autosafe:data-changed, bez automatycznego BLE po starcie

import { useCallback, useEffect, useRef, useState } from "react";
import type { DecodedData, Sensor } from "@/types/sensor";
import { getTempZone } from "@/types/sensor";
import { addAlert, addMeasurement, deleteSensor as storageDelete, getSensors, getSettings, upsertSensor } from "@/services/storageService";
import { cacheGrantedDevices, getCachedDevice, reconnectSensor, startAdvWatch, stopAdvWatch, stopNameScan, stopAllBleActivity } from "@/services/bluetoothService";
import type { ReconnectOptions } from "@/services/bluetoothService";
import { decodeBleError } from "@/services/bleErrorDecoder";
import { getProfile } from "@/services/sensorProfiles";

const STALE_MS = 120_000;
const STATUS_REFRESH_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bulkRefreshRunning = false;

export const isBleRefreshRunning = () => bulkRefreshRunning;

type ListenAllOptions = ReconnectOptions & { automatic?: boolean };

const applyCalibration = (sensor: Sensor, data: DecodedData): DecodedData => ({
  ...data,
  temperature: data.temperature != null ? +(data.temperature + (sensor.temperatureOffset ?? 0)).toFixed(2) : undefined,
  humidity: data.humidity != null ? Math.max(0, Math.min(100, +(data.humidity + (sensor.humidityOffset ?? 0)).toFixed(2))) : undefined,
});

export function useSensors() {
  const [sensors, setSensors] = useState<Sensor[]>(() => getSensors());
  const [rev, setRev] = useState(0);
  const watchedIds = useRef(new Set<string>());
  const isMounted = useRef(true);
  const statusTimer = useRef<number | null>(null);

  useEffect(() => {
    isMounted.current = true;
    cacheGrantedDevices().catch(() => {});
    return () => {
      isMounted.current = false;
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
    };
  }, []);

  const safeSetSensors = useCallback(() => {
    if (!isMounted.current) return;
    window.setTimeout(() => { if (isMounted.current) setSensors(getSensors()); }, 0);
  }, []);

  const refresh = useCallback(() => setRev((r) => r + 1), []);

  const maybeCreateAlerts = useCallback((s: Sensor) => {
    if (s.alertMuted) return;
    const now = new Date().toISOString();
    if (s.lastTemperature != null && s.minTempAlert != null && s.lastTemperature < s.minTempAlert) {
      addAlert({ id: `${s.id}-min-temp-${Date.now()}`, sensorId: s.id, roomName: s.roomName, type: "min_temp", value: s.lastTemperature, threshold: s.minTempAlert, createdAt: now, acknowledged: false });
    }
    if (s.lastTemperature != null && s.maxTempAlert != null && s.lastTemperature > s.maxTempAlert) {
      addAlert({ id: `${s.id}-max-temp-${Date.now()}`, sensorId: s.id, roomName: s.roomName, type: "max_temp", value: s.lastTemperature, threshold: s.maxTempAlert, createdAt: now, acknowledged: false });
    }
    if (s.lastHumidity != null && s.minHumidityAlert != null && s.lastHumidity < s.minHumidityAlert) {
      addAlert({ id: `${s.id}-min-hum-${Date.now()}`, sensorId: s.id, roomName: s.roomName, type: "min_humidity", value: s.lastHumidity, threshold: s.minHumidityAlert, createdAt: now, acknowledged: false });
    }
    if (s.lastHumidity != null && s.maxHumidityAlert != null && s.lastHumidity > s.maxHumidityAlert) {
      addAlert({ id: `${s.id}-max-hum-${Date.now()}`, sensorId: s.id, roomName: s.roomName, type: "max_humidity", value: s.lastHumidity, threshold: s.maxHumidityAlert, createdAt: now, acknowledged: false });
    }
    if (s.batteryLevel != null && s.batteryLevel < 15) {
      addAlert({ id: `${s.id}-battery-${Date.now()}`, sensorId: s.id, roomName: s.roomName, type: "battery_low", value: s.batteryLevel, threshold: 15, createdAt: now, acknowledged: false });
    }
    if (s.batteryVoltage != null && s.batteryVoltage < 2400) {
      addAlert({ id: `${s.id}-battery-mv-${Date.now()}`, sensorId: s.id, roomName: s.roomName, type: "battery_low", value: s.batteryVoltage, threshold: 2400, createdAt: now, acknowledged: false });
    }
  }, []);

  const applyBleData = useCallback((sensorId: string, dataIn: DecodedData, detectedProfileId?: string | null) => {
    const now = new Date().toISOString();
    const current = getSensors().find((s) => s.id === sensorId || s.deviceId === sensorId);
    if (!current) return;

    const data = applyCalibration(current, dataIn);
    const hasMeasurementFrame = data.temperature !== undefined || data.humidity !== undefined;
    const updated: Sensor = {
      ...current,
      profileId: detectedProfileId && detectedProfileId !== current.profileId ? detectedProfileId : (data.humidity !== undefined ? "ela-blue-puck-rht" : current.profileId),
      lastTemperature: data.temperature ?? current.lastTemperature,
      lastHumidity: data.humidity ?? current.lastHumidity,
      lastPressure: data.pressure ?? current.lastPressure,
      lastRssi: data.rssi ?? current.lastRssi,
      batteryLevel: data.battery ?? current.batteryLevel,
      batteryVoltage: data.batteryVoltage ?? current.batteryVoltage,
      rawAdvertisementHex: data.rawAdvertisementHex ?? current.rawAdvertisementHex,
      rawServiceData: data.rawServiceData ?? current.rawServiceData,
      rawManufacturerData: data.rawManufacturerData ?? current.rawManufacturerData,
      bleDebug: data.bleDebug ?? current.bleDebug,
      lastReadAt: now,
      lastTemperatureReadAt: data.temperature !== undefined ? now : current.lastTemperatureReadAt,
      lastHumidityReadAt: data.humidity !== undefined ? now : current.lastHumidityReadAt,
      lastBatteryReadAt: (data.battery !== undefined || data.batteryVoltage !== undefined) ? now : current.lastBatteryReadAt,
      lastMeasurementSaveStatus: hasMeasurementFrame ? "saved" : "waiting",
      lastMeasurementSavedAt: hasMeasurementFrame ? now : current.lastMeasurementSavedAt,
      status: "connected",
    };

    let savedMeasurement = false;

    if (updated.lastTemperature !== undefined || updated.lastHumidity !== undefined) {
      savedMeasurement = addMeasurement({
        id: `${current.id}-${Date.now()}`,
        sensorId: current.id,
        roomName: current.roomName,
        bluetoothName: current.bluetoothName,
        temperature: updated.lastTemperature ?? 0,
        humidity: updated.lastHumidity,
        pressure: updated.lastPressure,
        rssi: updated.lastRssi,
        batteryLevel: updated.batteryLevel,
        batteryVoltage: updated.batteryVoltage,
        createdAt: now,
      });
    }
    const finalUpdated = hasMeasurementFrame
      ? { ...updated, lastMeasurementSaveStatus: savedMeasurement ? "saved" as const : "skipped" as const, lastMeasurementSavedAt: savedMeasurement ? now : current.lastMeasurementSavedAt }
      : updated;
    upsertSensor(finalUpdated);
    maybeCreateAlerts(finalUpdated);
    safeSetSensors();
  }, [maybeCreateAlerts, safeSetSensors]);

  const refreshStatuses = useCallback(() => {
    const now = Date.now();
    const current = getSensors();
    let changed = false;
    const next = current.map((s) => {
      if (s.isDemo || !s.lastReadAt || s.status === "pending") return s;
      const last = new Date(s.lastReadAt).getTime();
      if (Number.isNaN(last)) return s;
      const stale = now - last > STALE_MS;
      if (stale && s.status === "connected") {
        const minutes = s.offlineAlertMinutes ?? 30;
        if (!s.alertMuted && now - last > minutes * 60_000) {
          addAlert({ id: `${s.id}-offline-${now}`, sensorId: s.id, roomName: s.roomName, type: "offline", value: Math.round((now - last) / 60_000), threshold: minutes, createdAt: new Date().toISOString(), acknowledged: false });
        }
        changed = true;
        return { ...s, status: "disconnected" as const };
      }
      if (!stale && (s.status === "disconnected" || s.status === "error")) {
        changed = true;
        return { ...s, status: "connected" as const };
      }
      return s;
    });

    // Najważniejszy hotfix: nie zapisuj wszystkich czujników po każdym autosafe:data-changed.
    // W v5.6 to mogło utworzyć pętlę: event -> upsertSensor -> event -> upsertSensor.
    if (changed) {
      next.forEach((s, i) => {
        if (s.status !== current[i]?.status) upsertSensor(s);
      });
    }
    if (isMounted.current) setSensors(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      statusTimer.current = window.setTimeout(refreshStatuses, 250);
    };

    refreshStatuses();
    window.addEventListener("storage", schedule);
    window.addEventListener("autosafe:data-changed", schedule as EventListener);
    const interval = window.setInterval(refreshStatuses, STATUS_REFRESH_MS);
    return () => {
      cancelled = true;
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      window.removeEventListener("storage", schedule);
      window.removeEventListener("autosafe:data-changed", schedule as EventListener);
      window.clearInterval(interval);
    };
  }, [rev, refreshStatuses]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Hotfix v5.6.1: BLE nie startuje samoczynnie. Tylko ręczne kliknięcie.
      if (!getSettings().autoStartMonitor) return;

      await cacheGrantedDevices().catch(() => []);
      if (cancelled) return;
      const advSensors = getSensors().filter((s) => !s.isDemo && getProfile(s.profileId)?.source === "advertisement" && !watchedIds.current.has(s.id));
      advSensors.forEach((sensor) => {
        const device = getCachedDevice(sensor.deviceId);
        if (!device) return;
        watchedIds.current.add(sensor.id);
        if (sensor.status === "unknown" || sensor.status === "disconnected") upsertSensor({ ...sensor, status: "pending" });
        startAdvWatch(
          device,
          sensor.profileId,
          (result) => applyBleData(sensor.id, result.data, result.detectedProfileId),
          (err) => {
            const current = getSensors().find((s) => s.id === sensor.id);
            if (current && current.status !== "connected") upsertSensor({ ...current, status: "error", bleDebug: err.message });
            safeSetSensors();
          }
        ).catch(() => {});
      });
    };
    run();
    return () => { cancelled = true; };
  }, [rev, applyBleData, safeSetSensors]);

  const upsert = useCallback((s: Sensor) => { upsertSensor(s); safeSetSensors(); }, [safeSetSensors]);

  const remove = useCallback((id: string) => {
    const current = getSensors().find((s) => s.id === id);
    stopAdvWatch(current?.deviceId ?? id);
    stopNameScan(id);
    watchedIds.current.delete(id);
    storageDelete(id);
    safeSetSensors();
  }, [safeSetSensors]);

  const listen = useCallback(async (s: Sensor) => {
    if (bulkRefreshRunning) return false;
    const before = getSensors().find((x) => x.id === s.id) ?? s;
    upsertSensor({ ...before, status: "scanning", bleDebug: `Nasłuch BLE aktywny — szukam ${before.bluetoothName || before.roomName} po nazwie` });
    safeSetSensors();

    const ok = await reconnectSensor(s, (result) => applyBleData(s.id, result.data, result.detectedProfileId), (e) => {
      const current = getSensors().find((x) => x.id === s.id);
      if (!current) return;
      const decoded = decodeBleError(e);
      const msg = decoded.technicalDetails;
      const isInfo = msg.includes("Nasłuch") || msg.includes("skan") || msg.includes("Wybrano") || msg.includes("Fallback") || msg.includes("requestLEScan");
      upsertSensor({ ...current, status: isInfo ? "scanning" : "error", bleDebug: isInfo ? msg : `${decoded.title}: ${decoded.userMessage} ${decoded.action}` });
      safeSetSensors();
    }, { forcePicker: true });

    const current = getSensors().find((x) => x.id === s.id);
    if (current && current.status !== "connected") {
      upsertSensor({ ...current, status: ok ? "scanning" : "error", bleDebug: current.bleDebug || (ok ? `Nasłuch BLE aktywny — czekam na ${current.bluetoothName}` : "Nie udało się uruchomić nasłuchu BLE.") });
      safeSetSensors();
    }
    return ok;
  }, [applyBleData, safeSetSensors]);

  const listenAll = useCallback(async (options?: ListenAllOptions) => {
    if (bulkRefreshRunning) return false;
    const targets = getSensors().filter((s) => !s.isDemo && getProfile(s.profileId)?.source === "advertisement");
    if (!targets.length) return false;
    bulkRefreshRunning = true;
    targets.forEach((s) => upsertSensor({ ...s, status: "scanning", bleDebug: `Monitoring zbiorczy BLE — szukam ${s.bluetoothName}` }));
    safeSetSensors();
    let any = false;
    try {
      for (const s of targets) {
        try {
          const ok = await reconnectSensor(s, (result) => applyBleData(s.id, result.data, result.detectedProfileId), (e) => {
            const current = getSensors().find((x) => x.id === s.id);
            if (!current || current.status === "connected") return;
            const decoded = decodeBleError(e);
            const technical = decoded.technicalDetails;
            const isInfo = technical.includes("Nasłuch") || technical.includes("skan") || technical.includes("requestLEScan") || technical.includes("Android APK");
            upsertSensor({ ...current, status: isInfo ? "scanning" : "error", bleDebug: isInfo ? technical : `${decoded.title}: ${decoded.userMessage} ${decoded.action}` });
          }, { forcePicker: false, automatic: options?.automatic, scanSeconds: options?.scanSeconds });
          any = any || ok;
          await sleep(150);
        } catch { /* next */ }
      }
    } finally {
      bulkRefreshRunning = false;
      safeSetSensors();
    }
    return any;
  }, [applyBleData, safeSetSensors]);

  const stopMonitoringAll = useCallback(() => {
    stopAllBleActivity();
    const now = Date.now();
    getSensors().forEach((s) => {
      if (s.isDemo) return;
      const fresh = s.lastReadAt && now - new Date(s.lastReadAt).getTime() < STALE_MS;
      upsertSensor({ ...s, status: fresh ? "connected" : s.lastReadAt ? "disconnected" : "pending", bleDebug: fresh ? s.bleDebug : "Monitoring zatrzymany — uruchom ponownie przyciskiem Monitoruj." });
    });
    safeSetSensors();
  }, [safeSetSensors]);

  const alertSensors = sensors.filter((s) => {
    if (s.alertMuted) return false;
    if (s.lastTemperature != null) {
      const zone = getTempZone(s.lastTemperature, s.minTempAlert, s.maxTempAlert);
      if (zone === "danger" || zone === "hot" || zone === "cold" || zone === "frozen") return true;
    }
    if (s.lastHumidity != null && ((s.minHumidityAlert != null && s.lastHumidity < s.minHumidityAlert) || (s.maxHumidityAlert != null && s.lastHumidity > s.maxHumidityAlert))) return true;
    if (s.batteryLevel != null && s.batteryLevel < 15) return true;
    if (s.batteryVoltage != null && s.batteryVoltage < 2400) return true;
    return false;
  });

  const sorted = [...sensors].sort((a, b) => {
    const pa = a.isPinned ? 0 : 1;
    const pb = b.isPinned ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const oa = a.status === "connected" ? 0 : a.status === "scanning" ? 1 : 2;
    const ob = b.status === "connected" ? 0 : b.status === "scanning" ? 1 : 2;
    if (oa !== ob) return oa - ob;
    return (b.lastReadAt ?? "").localeCompare(a.lastReadAt ?? "");
  });

  const pinnedSensors = sorted.filter((s) => s.isPinned);
  const unpinnedSensors = sorted.filter((s) => !s.isPinned);

  return { sensors: sorted, upsert, remove, refresh, listen, listenAll, stopMonitoringAll, alertSensors, pinnedSensors, unpinnedSensors };
}
