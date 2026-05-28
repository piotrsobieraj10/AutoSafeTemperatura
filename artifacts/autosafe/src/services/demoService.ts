import type { Sensor } from "@/types/sensor";
import { addMeasurement, getMeasurements, getSensors, saveSensors, upsertSensor, K, notifyStorageChanged } from "./storageService";

const DEMO_SENSORS: Omit<Sensor, "id" | "deviceId" | "status" | "isDemo">[] = [
  { bluetoothName: "P T EN 000001",   roomName: "Salon",     profileId: "ela-blue-puck-t",   source: "ela-advertisement", batteryLevel: 87, minTempAlert: 15, maxTempAlert: 28 },
  { bluetoothName: "P T EN 000002",   roomName: "Sypialnia", profileId: "ela-blue-puck-t",   source: "ela-advertisement", batteryLevel: 94, minTempAlert: 16, maxTempAlert: 24 },
  { bluetoothName: "P T EN 000003",   roomName: "Garaż",     profileId: "ela-blue-puck-t",   source: "ela-advertisement", batteryLevel: 62, minTempAlert: 2,  maxTempAlert: 35 },
  { bluetoothName: "P RHT 000004",    roomName: "Łazienka",  profileId: "ela-blue-puck-rht", source: "ela-advertisement", batteryLevel: 78, minHumidityAlert: 40, maxHumidityAlert: 70 },
  { bluetoothName: "RuuviTag_A1B2",   roomName: "Piwnica",   profileId: "ruuvi-tag-raw2",    source: "ruuvi", batteryLevel: 91 },
  { bluetoothName: "GVH5074_FF11",    roomName: "Ogród",     profileId: "govee-h5074",       source: "govee", batteryLevel: 45 },
];

const BASE_TEMPS: Record<string, number> = {
  "Salon": 22.4, "Sypialnia": 19.8, "Garaż": 7.3,
  "Łazienka": 23.5, "Piwnica": 13.1, "Ogród": 11.4,
};

export const ensureDemoSensors = () => {
  const existing = getSensors().filter((s) => s.isDemo);
  if (existing.length > 0) return;
  DEMO_SENSORS.forEach((tmpl, i) => {
    upsertSensor({
      ...tmpl,
      id: `demo-${i}`,
      deviceId: `demo-device-${i}`,
      status: "connected",
      isDemo: true,
    } as Sensor);
  });
};

export const removeDemoSensors = () => {
  const demoIds = new Set(getSensors().filter((s) => s.isDemo).map((s) => s.id));
  saveSensors(getSensors().filter((s) => !s.isDemo));
  localStorage.setItem(K.MEASUREMENTS, JSON.stringify(getMeasurements().filter((m) => !demoIds.has(m.sensorId))));
  notifyStorageChanged();
};

let demoInterval: ReturnType<typeof setInterval> | null = null;

export const startDemoLoop = (onUpdate: () => void) => {
  if (demoInterval) return;

  const tick = () => {
    const sensors = getSensors().filter((s) => s.isDemo);
    sensors.forEach((s) => {
      const base = BASE_TEMPS[s.roomName] ?? 20;
      const temp = +(base + (Math.random() - 0.5) * 3).toFixed(2);
      const profile = s.profileId;
      const hum = (profile === "ela-blue-puck-rht" || profile === "govee-h5074" || profile === "ruuvi-tag-raw2")
        ? +(55 + (Math.random() - 0.5) * 20).toFixed(1) : undefined;
      const pres = profile === "ruuvi-tag-raw2"
        ? +(1013 + (Math.random() - 0.5) * 8).toFixed(1) : undefined;
      const rssi = -60 + Math.round((Math.random() - 0.5) * 20);
      const now = new Date().toISOString();
      upsertSensor({ ...s, lastTemperature: temp, lastHumidity: hum, lastPressure: pres, lastRssi: rssi, lastReadAt: now, status: "connected" });
      addMeasurement({ id: `${s.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`, sensorId: s.id, roomName: s.roomName, temperature: temp, humidity: hum, pressure: pres, rssi, batteryLevel: s.batteryLevel, createdAt: now });
    });
    onUpdate();
  };

  tick();
  demoInterval = setInterval(tick, 5000);
};

export const stopDemoLoop = () => {
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
  }
};
