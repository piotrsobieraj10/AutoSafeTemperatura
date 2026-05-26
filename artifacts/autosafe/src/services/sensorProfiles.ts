// ============================================================
// sensorProfiles.ts
//
// ELA Blue Puck T — protokół Advertisement (BLE Scan)
// ============================================================
// Blue Puck T nadaje WYŁĄCZNIE przez BLE Advertisement.
// NIE nawiązuje połączenia GATT. Dane są w pakiecie:
//   Manufacturer Specific Data (typ 0xFF)
//   Company ID: 0x0531 (ELA Innovation)
//
// Format danych Blue Puck T (payload po Company ID, lil-endian):
//   Byte 0:    Typ produktu: 0x01 = Blue Puck T
//   Byte 1:    Flagi statusu (bit 0 = alarm temp, bit 1 = tamper)
//   Byte 2-3:  Temperatura: int16 little-endian, jednostka: 0.1°C
//   Byte 4:    Poziom baterii: uint8, jednostka: 1% (0–100)
//   Byte 5-6:  Licznik pakietów: uint16 little-endian
//
// Przykładowy raw payload (bez Company ID):
//   01 00 CE 00 5A 12 00
//   → Typ: Blue Puck T
//   → Temp: 0x00CE = 206 → 20.6°C
//   → Bat:  0x5A  = 90%
//   → Ctr:  0x0012 = 18
// ============================================================

import type { SensorProfile } from "@/types/sensor";

export const ELA_COMPANY_ID = 0x0531;

export const ELA_PRODUCT_TYPES: Record<number, string> = {
  0x01: "Blue Puck T",
  0x02: "Blue Puck RHT",
  0x03: "Blue Puck MAG",
  0x04: "Blue Puck MOV",
  0x05: "Blue Coin T",
  0x06: "Blue Coin RHT",
};

const elaBluePuckT: SensorProfile = {
  id: "ela-blue-puck-t",
  name: "ELA Blue Puck T",
  manufacturer: "ELA Innovation",
  manufacturerId: ELA_COMPANY_ID,
  supportsTemperature: true,
  supportsHumidity: false,
  supportsBattery: true,
  source: "advertisement",
  decodeAdvertisement: (data: DataView) => {
    let offset = 0;
    if (data.byteLength >= 2) {
      const maybeCompanyId = data.getUint16(0, true);
      if (maybeCompanyId === ELA_COMPANY_ID) offset = 2;
    }
    if (data.byteLength < offset + 5) return {};

    const rawTemp = data.getInt16(offset + 2, true);
    const temperature = rawTemp / 10;
    const batteryLevel = data.getUint8(offset + 4);

    if (temperature < -60 || temperature > 100) return { battery: batteryLevel };
    return { temperature, battery: batteryLevel };
  },
};

const elaBluePuckRHT: SensorProfile = {
  id: "ela-blue-puck-rht",
  name: "ELA Blue Puck RHT",
  manufacturer: "ELA Innovation",
  manufacturerId: ELA_COMPANY_ID,
  supportsTemperature: true,
  supportsHumidity: true,
  supportsBattery: true,
  source: "advertisement",
  decodeAdvertisement: (data: DataView) => {
    let offset = 0;
    if (data.byteLength >= 2 && data.getUint16(0, true) === ELA_COMPANY_ID) offset = 2;
    if (data.byteLength < offset + 6) return {};

    const rawTemp = data.getInt16(offset + 2, true);
    const rawHum = data.getUint16(offset + 4, true);
    const battery = data.byteLength > offset + 6 ? data.getUint8(offset + 6) : undefined;

    const temperature = rawTemp / 10;
    const humidity = rawHum / 10;

    if (temperature < -60 || temperature > 100) return { humidity, battery };
    if (humidity < 0 || humidity > 100) return { temperature, battery };
    return { temperature, humidity, battery };
  },
};

const healthThermometer: SensorProfile = {
  id: "gatt-health-thermometer",
  name: "Standard GATT Health Thermometer",
  manufacturer: "Bluetooth SIG",
  serviceUuid: "health_thermometer",
  characteristicUuid: "temperature_measurement",
  supportsTemperature: true,
  supportsHumidity: false,
  supportsBattery: false,
  source: "gatt",
  decodeGatt: (data) => {
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
  name: "Environmental Sensing (ESS)",
  manufacturer: "Bluetooth SIG",
  serviceUuid: "environmental_sensing",
  characteristicUuid: "temperature",
  supportsTemperature: true,
  supportsHumidity: true,
  supportsBattery: false,
  source: "gatt",
  decodeGatt: (data) => ({ temperature: data.getInt16(0, true) / 100 }),
};

const xiaomiLywsd03: SensorProfile = {
  id: "xiaomi-lywsd03mmc",
  name: "Xiaomi LYWSD03MMC",
  manufacturer: "Xiaomi",
  serviceUuid: "ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6",
  characteristicUuid: "ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6",
  supportsTemperature: true,
  supportsHumidity: true,
  supportsBattery: false,
  source: "gatt",
  decodeGatt: (data) => ({
    temperature: data.getInt16(0, true) / 100,
    humidity: data.getUint8(2),
  }),
};

export const sensorProfiles: SensorProfile[] = [
  elaBluePuckT,
  elaBluePuckRHT,
  healthThermometer,
  environmentalSensing,
  xiaomiLywsd03,
];

export const getProfile = (id?: string): SensorProfile | undefined =>
  sensorProfiles.find((p) => p.id === id);

export const ELA_PROFILES = sensorProfiles.filter(
  (p) => p.manufacturer === "ELA Innovation"
);
