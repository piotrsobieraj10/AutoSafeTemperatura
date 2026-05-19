import { useCallback, useEffect, useState } from "react";
import type { Sensor } from "@/types/sensor";
import {
  deleteSensor as deleteSensorStorage,
  getSensors,
  upsertSensor as upsertSensorStorage,
} from "@/services/storageService";

export function useSensors() {
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    setSensors(getSensors());
    const handler = () => setSensors(getSensors());
    window.addEventListener("storage", handler);
    const interval = setInterval(() => setSensors(getSensors()), 2000);
    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, [tick]);

  const upsert = useCallback((s: Sensor) => {
    upsertSensorStorage(s);
    refresh();
  }, [refresh]);

  const remove = useCallback((id: string) => {
    deleteSensorStorage(id);
    refresh();
  }, [refresh]);

  return { sensors, upsert, remove, refresh };
}
