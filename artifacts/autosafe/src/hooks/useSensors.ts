// hooks/useSensors.ts v5.4 — Nasłuch BLE używa skanu po nazwie, zapamiętuje baterię/wilgotność i odświeża status online

import { useCallback, useEffect, useRef, useState } from "react";
import type { DecodedData, Sensor } from "@/types/sensor";
import { getTempZone } from "@/types/sensor";
import { addMeasurement, deleteSensor as storageDelete, getSensors, upsertSensor } from "@/services/storageService";
import { cacheGrantedDevices, getCachedDevice, reconnectSensor, startAdvWatch, stopAdvWatch, stopNameScan } from "@/services/bluetoothService";
import { getProfile } from "@/services/sensorProfiles";

const STALE_MS = 120_000;

export function useSensors() {
  const [sensors, setSensors] = useState<Sensor[]>(() => getSensors());
  const [rev, setRev] = useState(0);
  const watchedIds = useRef(new Set<string>());
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    cacheGrantedDevices().catch(() => {});
    return () => { isMounted.current = false; };
  }, []);

  const safeSetSensors = useCallback(() => {
    if (!isMounted.current) return;
    setTimeout(() => {
      if (isMounted.current) setSensors(getSensors());
    }, 0);
  }, []);

  const refresh = useCallback(() => setRev((r) => r + 1), []);

  const applyBleData = useCallback((sensorId: string, data: DecodedData, detectedProfileId?: string | null) => {
    const now = new Date().toISOString();
    const current = getSensors().find((s) => s.id === sensorId || s.deviceId === sensorId);
    if (!current) return;

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
      status: "connected",
    };
    upsertSensor(updated);

    if (data.temperature !== undefined) {
      addMeasurement({
        id: `${current.id}-${Date.now()}`,
        sensorId: current.id,
        roomName: current.roomName,
        temperature: data.temperature,
        humidity: data.humidity ?? current.lastHumidity,
        pressure: data.pressure ?? current.lastPressure,
        rssi: data.rssi ?? current.lastRssi,
        batteryLevel: data.battery ?? current.batteryLevel,
        createdAt: now,
      });
    }
    safeSetSensors();
  }, [safeSetSensors]);

  // Sync z localStorage i timeout offline
  useEffect(() => {
    const update = () => {
      const list = getSensors().map((s) => {
        if (s.isDemo || !s.lastReadAt || s.status === "pending") return s;
        const stale = Date.now() - new Date(s.lastReadAt).getTime() > STALE_MS;
        if (stale && s.status === "connected") return { ...s, status: "disconnected" as const };
        if (!stale && (s.status === "disconnected" || s.status === "scanning" || s.status === "error")) return { ...s, status: "connected" as const };
        return s;
      });
      list.forEach((s) => upsertSensor(s));
      if (isMounted.current) setSensors(list);
    };
    update();
    const handler = () => update();
    window.addEventListener("storage", handler);
    const interval = setInterval(update, 3000);
    return () => { window.removeEventListener("storage", handler); clearInterval(interval); };
  }, [rev]);

  // Startuj nasłuch dla urządzeń, które są nadal w cache albo zostały odzyskane przez getDevices().
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
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
            console.warn(`BLE adv error (${sensor.roomName}):`, err.message);
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
    const before = getSensors().find((x) => x.id === s.id) ?? s;
    upsertSensor({
      ...before,
      status: "scanning",
      bleDebug: `Nasłuch BLE aktywny — szukam ${before.bluetoothName || before.roomName} po nazwie, bez ponownego wybierania`
    });
    safeSetSensors();

    const ok = await reconnectSensor(s, (result) => applyBleData(s.id, result.data, result.detectedProfileId), (e) => {
      const current = getSensors().find((x) => x.id === s.id);
      if (!current) return;
      const msg = e.message;
      const isInfo =
        msg.includes("Brak cache Chrome") ||
        msg.includes("Nasłuch BLE aktywny") ||
        msg.includes("uruchamiam skan") ||
        msg.includes("wybierz czujnik ponownie") ||
        msg.includes("Otwórz okno Bluetooth") ||
        msg.includes("Wybrano") ||
        msg.includes("Fallback") ||
        msg.includes("skanuję reklamy") ||
        msg.includes("automatyczny scan") ||
        msg.includes("Automatyczny scan") ||
        msg.includes("skan reklam BLE");
      upsertSensor({ ...current, status: isInfo ? "scanning" : "error", bleDebug: msg });
      safeSetSensors();
    }, { forcePicker: true });

    const current = getSensors().find((x) => x.id === s.id);
    if (current && current.status !== "connected") {
      upsertSensor({
        ...current,
        status: ok ? "scanning" : "error",
        bleDebug: ok
          ? (current.bleDebug || `Nasłuch BLE aktywny — czekam na kolejną reklamę ${current.bluetoothName}`)
          : (current.bleDebug || "Nie udało się uruchomić nasłuchu BLE.")
      });
      safeSetSensors();
    }
    return ok;
  }, [applyBleData, safeSetSensors]);

  const alertSensors = sensors.filter((s) => {
    if (s.alertMuted || s.lastTemperature == null) return false;
    const zone = getTempZone(s.lastTemperature, s.minTempAlert, s.maxTempAlert);
    return zone === "danger" || zone === "hot" || zone === "cold" || zone === "frozen";
  });

  const pinnedSensors = sensors.filter((s) => s.isPinned);
  const unpinnedSensors = sensors.filter((s) => !s.isPinned);

  return { sensors, upsert, remove, refresh, listen, alertSensors, pinnedSensors, unpinnedSensors };
}
