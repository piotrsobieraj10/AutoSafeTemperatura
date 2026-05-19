import type { SensorProfile } from "@/types/sensor";

const healthThermometer: SensorProfile = {
  id: "gatt-health-thermometer",
  name: "Standard GATT Health Thermometer",
  manufacturer: "Bluetooth SIG",
  serviceUuid: "health_thermometer",
  characteristicUuid: "temperature_measurement",
  supportsTemperature: true,
  supportsHumidity: false,
  source: "gatt",
  decode: (data) => {
    const flags = data.getUint8(0);
    const mantissa =
      data.getUint8(1) | (data.getUint8(2) << 8) | (data.getUint8(3) << 16);
    const signedMantissa = mantissa & 0x800000 ? mantissa - 0x1000000 : mantissa;
    const exponent = data.getInt8(4);
    const temperature = signedMantissa * Math.pow(10, exponent);
    const isFahrenheit = (flags & 0x01) !== 0;
    return {
      temperature: isFahrenheit ? ((temperature - 32) * 5) / 9 : temperature,
    };
  },
};

const environmentalSensing: SensorProfile = {
  id: "gatt-ess-temperature",
  name: "Environmental Sensing (ESS) — Temperatura",
  manufacturer: "Bluetooth SIG",
  serviceUuid: "environmental_sensing",
  characteristicUuid: "temperature",
  supportsTemperature: true,
  supportsHumidity: false,
  source: "gatt",
  decode: (data) => ({ temperature: data.getInt16(0, true) / 100 }),
};

const environmentalHumidity: SensorProfile = {
  id: "gatt-ess-humidity",
  name: "Environmental Sensing (ESS) — Wilgotność",
  manufacturer: "Bluetooth SIG",
  serviceUuid: "environmental_sensing",
  characteristicUuid: "humidity",
  supportsTemperature: false,
  supportsHumidity: true,
  source: "gatt",
  decode: (data) => ({ humidity: data.getUint16(0, true) / 100 }),
};

const xiaomiLywsd03: SensorProfile = {
  id: "xiaomi-lywsd03mmc",
  name: "Xiaomi LYWSD03MMC",
  manufacturer: "Xiaomi",
  serviceUuid: "ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6",
  characteristicUuid: "ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6",
  supportsTemperature: true,
  supportsHumidity: true,
  source: "gatt",
  decode: (data) => ({
    temperature: data.getInt16(0, true) / 100,
    humidity: data.getUint8(2),
  }),
};

export const sensorProfiles: SensorProfile[] = [
  healthThermometer,
  environmentalSensing,
  environmentalHumidity,
  xiaomiLywsd03,
];

export const getProfile = (id?: string): SensorProfile | undefined =>
  sensorProfiles.find((p) => p.id === id);
