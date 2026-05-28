// hooks/useSensors.ts v4 — naprawiony insertBefore error
// Problem: setState wywoływany podczas render powodował React insertBefore error
// Naprawka: useCallback + setTimeout(0) dla async updates + stable refs

import { useCallback, useEffect, useRef, useState } from "react";
import type { Sensor } from "@/types/sensor";
import { getTempZone } from "@/types/sensor";
import {
  addMeasurement,
  deleteSensor as storageDelete,
  getSensors,
  upsertSensor,
} from "@/services/storageService";
import {
  connectGATTWithNotifications,
  getCachedDevice,
  startAdvWatch,
  stopAdvWatch,
} from "@/services/bluetoothService";
import { getProfile } from "@/services/sensorProfiles";

export function useSensors() {
  const [sensors, setSensors] = useState<Sensor[]>(() => getSensors());
  const [rev, setRev] = useState(0);
  const watchedIds = useRef(new Set<string>());
  const isMounted  = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Bezpieczna aktualizacja state — tylko gdy komponent zamontowany
  const safeSetSensors = useCallback(() => {
    if (isMounted.current) {
      // setTimeout(0) zapobiega update podczas render (insertBefore error)
      setTimeout(() => {
        if (isMounted.current) setSensors(getSensors());
      }, 0);
    }
  }, []);

  const refresh = useCallback(() => setRev((r) => r + 1), []);

  // Sync z localStorage
  useEffect(() => {
    setSensors(getSensors());
    const handler = () => safeSetSensors();
    window.addEventListener("storage", handler);
    const interval = setInterval(() => safeSetSensors(), 3000);
    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, [rev, safeSetSensors]);

  // Advertisement + GATT notifications dla czujników z cache
  useEffect(() => {
    const advSensors = getSensors().filter(
      (s) =>
        !s.isDemo &&
        getProfile(s.profileId)?.source === "advertisement" &&
        !watchedIds.current.has(s.id)
    );

    advSensors.forEach((sensor) => {
      const device = getCachedDevice(sensor.deviceId);
      if (!device) return;
      watchedIds.current.add(sensor.id);

      const handleData = ({ data }: { data: { temperature?: number; humidity?: number; pressure?: number; rssi?: number; battery?: number } }) => {
        const now = new Date().toISOString();
        const current = getSensors().find((s) => s.id === sensor.id);
        if (!current) return;

        const updated: Sensor = {
          ...current,
          lastTemperature: data.temperature ?? current.lastTemperature,
          lastHumidity:    data.humidity    ?? current.lastHumidity,
          lastPressure:    data.pressure    ?? current.lastPressure,
          lastRssi:        data.rssi        ?? current.lastRssi,
          batteryLevel:    data.battery     ?? current.batteryLevel,
          lastReadAt:      now,
          status:          "connected",
        };
        upsertSensor(updated);

        if (data.temperature !== undefined) {
          addMeasurement({
            id:           `${sensor.id}-${Date.now()}`,
            sensorId:     sensor.id,
            roomName:     sensor.roomName,
            temperature:  data.temperature,
            humidity:     data.humidity,
            pressure:     data.pressure,
            rssi:         data.rssi,
            batteryLevel: data.battery,
            createdAt:    now,
          });
        }
        safeSetSensors();
      };

      // GATT notifications
      connectGATTWithNotifications(
        device,
        sensor.profileId,
        (result) => handleData({ data: result.data as { temperature?: number; humidity?: number; pressure?: number; rssi?: number; battery?: number } }),
        (err) => {
          console.warn(`GATT error (${sensor.roomName}):`, err.message);
          const current = getSensors().find((s) => s.id === sensor.id);
          if (current) { upsertSensor({ ...current, status: "error" }); safeSetSensors(); }
        }
      ).catch(console.error);

      // Advertisement watch
      if (typeof device.watchAdvertisements === "function" && device.addEventListener) {
        startAdvWatch(
          device,
          sensor.profileId,
          (result) => handleData({ data: result.data as { temperature?: number; humidity?: number; pressure?: number; rssi?: number; battery?: number } }),
          console.error
        ).catch(() => {});
      }
    });
  }, [rev, safeSetSensors]);

  const upsert = useCallback((s: Sensor) => {
    upsertSensor(s);
    safeSetSensors();
  }, [safeSetSensors]);

  const remove = useCallback((id: string) => {
    stopAdvWatch(id);
    watchedIds.current.delete(id);
    storageDelete(id);
    safeSetSensors();
  }, [safeSetSensors]);

  const alertSensors = sensors.filter((s) => {
    if (s.alertMuted || s.lastTemperature == null) return false;
    const zone = getTempZone(s.lastTemperature, s.minTempAlert, s.maxTempAlert);
    return zone === "danger" || zone === "hot" || zone === "cold" || zone === "frozen";
  });

  const pinnedSensors   = sensors.filter((s) => s.isPinned);
  const unpinnedSensors = sensors.filter((s) => !s.isPinned);

  return { sensors, upsert, remove, refresh, alertSensors, pinnedSensors, unpinnedSensors };
}
