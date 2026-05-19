import type { Measurement, Sensor } from "@/types/sensor";
import { getCachedDevice, readWithProfile } from "@/services/bluetoothService";
import { getProfile } from "@/services/sensorProfiles";
import { addMeasurement, upsertSensor } from "@/services/storageService";

export const buildMeasurement = (
  sensor: Sensor,
  temperature: number,
  humidity?: number,
  createdAt = new Date().toISOString(),
): Measurement => ({
  id: `${sensor.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  sensorId: sensor.id,
  roomName: sensor.roomName,
  temperature,
  humidity,
  createdAt,
});

export const saveReading = (
  sensor: Sensor,
  payload: { temperature?: number; humidity?: number },
): Sensor => {
  const now = new Date().toISOString();
  const updated: Sensor = {
    ...sensor,
    lastTemperature: payload.temperature ?? sensor.lastTemperature,
    lastHumidity: payload.humidity ?? sensor.lastHumidity,
    lastReadAt: now,
    status: "connected",
  };

  upsertSensor(updated);
  if (payload.temperature != null) {
    addMeasurement(buildMeasurement(updated, payload.temperature, payload.humidity, now));
  }
  return updated;
};

export const readSensorNow = async (sensor: Sensor): Promise<Sensor> => {
  if (sensor.isDemo) return sensor;

  const profile = getProfile(sensor.profileId);
  if (!profile) {
    const errored = { ...sensor, status: "error" as const };
    upsertSensor(errored);
    throw new Error("Brak profilu odczytu dla tego czujnika. Wybierz profil w zakładce Czujniki.");
  }

  const device = getCachedDevice(sensor.deviceId);
  if (!device) {
    const errored = { ...sensor, status: "unknown" as const };
    upsertSensor(errored);
    throw new Error("Urządzenie nie jest dostępne w tej sesji. Kliknij Dodaj/Skanuj i wybierz czujnik ponownie.");
  }

  try {
    const payload = await readWithProfile(device, profile);
    if (payload.temperature == null && payload.humidity == null) {
      throw new Error("Czujnik odpowiedział, ale profil nie zwrócił temperatury ani wilgotności.");
    }
    return saveReading(sensor, payload);
  } catch (error) {
    const errored = { ...sensor, status: "error" as const };
    upsertSensor(errored);
    throw error;
  }
};
