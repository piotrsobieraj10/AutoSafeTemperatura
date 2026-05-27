// hooks/useSensors.ts v2
import { useCallback, useEffect, useRef, useState } from "react";
import type { Sensor } from "@/types/sensor";
import { getTempZone } from "@/types/sensor";
import {
  addMeasurement,
  deleteSensor as storageDelete,
  getSettings,
  getSensors,
  upsertSensor,
} from "@/services/storageService";
import { getCachedDevice, startAdvWatch, stopAdvWatch } from "@/services/bluetoothService";
import { getProfile } from "@/services/sensorProfiles";

export function useSensors() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [rev, setRev] = useState(0);
  const watchedIds = useRef(new Set<string>());

  const refresh = useCallback(() => setRev((r) => r + 1), []);

  useEffect(() => {
    setSensors(getSensors());
    const handler = () => setSensors(getSensors());
    window.addEventListener("storage", handler);
    const id = setInterval(() => setSensors(getSensors()), 2500);
    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(id);
    };
  }, [rev]);

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
      startAdvWatch(
        device,
        sensor.profileId,
        ({ data }) => {
          const now = new Date().toISOString();
          const settings = getSettings();
          void settings;
          const updated: Sensor = {
            ...sensor,
            lastTemperature: data.temperature ?? sensor.lastTemperature,
            lastHumidity:    data.humidity    ?? sensor.lastHumidity,
            lastPressure:    data.pressure    ?? sensor.lastPressure,
            lastRssi:        data.rssi        ?? sensor.lastRssi,
            batteryLevel:    data.battery     ?? sensor.batteryLevel,
            batteryVoltage:  data.batteryVoltage ?? sensor.batteryVoltage,
            lastReadAt:      now,
            status:          "connected",
          };
          upsertSensor(updated);
          if (data.temperature !== undefined) {
            addMeasurement({
              id: `${sensor.id}-${Date.now()}`,
              sensorId: sensor.id,
              roomName: sensor.roomName,
              temperature: data.temperature,
              humidity: data.humidity,
              pressure: data.pressure,
              rssi: data.rssi,
              batteryLevel: data.battery,
              createdAt: now,
            });
          }
          setSensors(getSensors());
        },
        console.error
      ).catch(console.error);
    });
  }, [rev]);

  const upsert = useCallback(
    (s: Sensor) => {
      upsertSensor(s);
      refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    (id: string) => {
      stopAdvWatch(id);
      watchedIds.current.delete(id);
      storageDelete(id);
      refresh();
    },
    [refresh]
  );

  const alertSensors = sensors.filter((s) => {
    if (s.alertMuted || s.lastTemperature == null) return false;
    const zone = getTempZone(s.lastTemperature, s.minTempAlert, s.maxTempAlert);
    return zone === "danger" || zone === "hot" || zone === "cold" || zone === "frozen";
  });

  const pinnedSensors   = sensors.filter((s) => s.isPinned);
  const unpinnedSensors = sensors.filter((s) => !s.isPinned);

  return { sensors, upsert, remove, refresh, alertSensors, pinnedSensors, unpinnedSensors };
}
