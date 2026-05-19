import type { Sensor } from "@/types/sensor";
import { addMeasurement, getSensors, saveSensors, upsertSensor } from "./storageService";

const seedRooms = [
  { room: "Salon", base: 22.4, humid: 45 },
  { room: "Garaż", base: 8.7, humid: 60 },
  { room: "Sypialnia", base: 20.8, humid: 50 },
  { room: "Kotłownia", base: 24.1, humid: 35 },
];

export const ensureDemoSensors = () => {
  const existing = getSensors().filter((s) => s.isDemo);
  if (existing.length > 0) return;
  seedRooms.forEach((r, i) => {
    const sensor: Sensor = {
      id: `demo-${i}`,
      bluetoothName: `DemoSensor-${i + 1}`,
      deviceId: `demo-device-${i}`,
      roomName: r.room,
      status: "connected",
      isDemo: true,
      minTempAlert: 10,
      maxTempAlert: 28,
    };
    upsertSensor(sensor);
  });
};

export const removeDemoSensors = () => {
  saveSensors(getSensors().filter((s) => !s.isDemo));
};

let demoInterval: ReturnType<typeof setInterval> | null = null;

export const startDemoLoop = (onUpdate: () => void) => {
  if (demoInterval) return;
  const tick = () => {
    const sensors = getSensors().filter((s) => s.isDemo);
    sensors.forEach((s) => {
      const seed = seedRooms.find((r) => r.room === s.roomName);
      const base = seed?.base ?? 21;
      const humid = seed?.humid ?? 45;
      const temperature = +(base + (Math.random() - 0.5) * 1.5).toFixed(1);
      const humidity = +(humid + (Math.random() - 0.5) * 4).toFixed(0);
      const now = new Date().toISOString();
      upsertSensor({
        ...s,
        lastTemperature: temperature,
        lastHumidity: humidity,
        lastReadAt: now,
        status: "connected",
      });
      addMeasurement({
        id: `${s.id}-${Date.now()}-${Math.random()}`,
        sensorId: s.id,
        roomName: s.roomName,
        temperature,
        humidity,
        createdAt: now,
      });
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
