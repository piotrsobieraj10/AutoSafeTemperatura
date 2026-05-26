// ============================================================
// demoService.ts — symulowane czujniki ELA Blue Puck T
// ============================================================

import type { Sensor } from "@/types/sensor";
import { addMeasurement, getSensors, saveSensors, upsertSensor } from "./storageService";

const seedRooms = [
  { room: "Salon",     base: 22.4, rssi: -62 },
  { room: "Garaż",    base: 8.7,  rssi: -78 },
  { room: "Sypialnia", base: 20.1, rssi: -55 },
  { room: "Kotłownia", base: 24.6, rssi: -71 },
];

export const ensureDemoSensors = () => {
  const existing = getSensors().filter((s) => s.isDemo);
  if (existing.length > 0) return;

  seedRooms.forEach((r, i) => {
    const sensor: Sensor = {
      id: `demo-${i}`,
      bluetoothName: `Blue Puck T ${String(i + 1).padStart(6, "0")}`,
      deviceId: `demo-device-${i}`,
      macAddress: `AA:BB:CC:DD:EE:0${i}`,
      roomName: r.room,
      profileId: "ela-blue-puck-t",
      status: "connected",
      source: "ela-advertisement",
      isDemo: true,
      batteryLevel: 90 - i * 5,
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
      const temperature = +(base + (Math.random() - 0.5) * 2).toFixed(1);
      const now = new Date().toISOString();

      upsertSensor({
        ...s,
        lastTemperature: temperature,
        lastReadAt: now,
        lastRssi: seed?.rssi ? seed.rssi + Math.round((Math.random() - 0.5) * 6) : undefined,
        batteryLevel: s.batteryLevel,
        status: "connected",
      });

      addMeasurement({
        id: `${s.id}-${Date.now()}-${Math.random()}`,
        sensorId: s.id,
        roomName: s.roomName,
        temperature,
        rssi: seed?.rssi,
        batteryLevel: s.batteryLevel,
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
