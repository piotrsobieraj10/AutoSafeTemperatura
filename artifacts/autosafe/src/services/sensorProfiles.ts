import type { SensorProfile, DecodedData } from "@/types/sensor";

// ELA Blue PUCK uses BLE advertising Service Data frames.
// T:  Service Data UUID 0x2A6E, int16 little-endian, 0.01°C.
// RHT: Service Data UUID 0x2A6E for temperature and 0x2A6F for humidity.
export const ELA_ENVIRONMENTAL_SERVICE_UUID = "0000181a-0000-1000-8000-00805f9b34fb";
export const ELA_TEMP_UUID      = "00002a6e-0000-1000-8000-00805f9b34fb";
export const ELA_HUMIDITY_UUID  = "00002a6f-0000-1000-8000-00805f9b34fb";
export const ELA_TEMP_UUID_SHORT     = 0x2A6E;
export const ELA_HUMIDITY_UUID_SHORT = 0x2A6F;
export const ELA_COMPANY_ID = 0x0757;

export const COMPANY_IDS = {
  ELA:     ELA_COMPANY_ID,
  RUUVI:   0x0499,
  GOVEE:   0xEC88,
  INKBIRD: 0x0200,
} as const;

const clampRound = (value: number, min: number, max: number, decimals = 2): number | undefined => {
  if (!Number.isFinite(value) || value < min || value > max) return undefined;
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
};

const bytesOf = (data: DataView): number[] => Array.from({ length: data.byteLength }, (_, i) => data.getUint8(i));

export const decodeELATemperatureValue = (data: DataView, offset = 0): number | undefined => {
  if (data.byteLength < offset + 2) return undefined;
  const raw = data.getInt16(offset, true);
  return clampRound(raw / 100, -40, 100, 2) ?? clampRound(raw / 10, -40, 100, 1);
};

export const decodeELAHumidityValue = (data: DataView, offset = 0): number | undefined => {
  if (data.byteLength <= offset) return undefined;
  if (data.byteLength >= offset + 2) {
    const rawHundredths = data.getUint16(offset, true) / 100;
    const rounded = clampRound(rawHundredths, 0, 100, 2);
    if (rounded !== undefined && data.getUint8(offset + 1) !== 0) return rounded;
  }
  return clampRound(data.getUint8(offset), 0, 100, 0);
};

function decodeELAServiceData(data: DataView): DecodedData {
  const direct = decodeELATemperatureValue(data, 0);
  if (direct !== undefined) return { temperature: direct };

  const bytes = bytesOf(data);
  for (let i = 0; i <= bytes.length - 4; i += 1) {
    if (bytes[i] === 0x6e && bytes[i + 1] === 0x2a) {
      const value = decodeELATemperatureValue(new DataView(data.buffer, data.byteOffset + i + 2, data.byteLength - i - 2), 0);
      if (value !== undefined) return { temperature: value };
    }
  }
  return {};
}

function decodeELARhtHumidityServiceData(data: DataView): DecodedData {
  const direct = decodeELAHumidityValue(data, 0);
  if (direct !== undefined) return { humidity: direct };

  const bytes = bytesOf(data);
  for (let i = 0; i <= bytes.length - 3; i += 1) {
    if (bytes[i] === 0x6f && bytes[i + 1] === 0x2a) {
      const value = decodeELAHumidityValue(new DataView(data.buffer, data.byteOffset + i + 2, data.byteLength - i - 2), 0);
      if (value !== undefined) return { humidity: value };
    }
  }
  return {};
}

function decodeELAManufacturerData(data: DataView): DecodedData {
  const bytes = bytesOf(data);
  const decoded: DecodedData = {};

  for (let i = 0; i < bytes.length; i += 1) {
    // ELA T / RHT manufacturer frame: TEMP_DATA_ID 0x12 + temp LSB/MSB.
    if (bytes[i] === 0x12 && i + 2 < bytes.length) {
      const value = decodeELATemperatureValue(new DataView(data.buffer, data.byteOffset + i + 1, data.byteLength - i - 1), 0);
      if (value !== undefined) decoded.temperature = value;
    }

    // ELA RHT manufacturer frame: RHT_DATA_ID 0x21 + RH byte + TEMP_DATA_ID 0x12 + temp.
    if (bytes[i] === 0x21 && i + 1 < bytes.length) {
      const humidity = clampRound(bytes[i + 1], 0, 100, 0);
      if (humidity !== undefined) decoded.humidity = humidity;
    }
  }

  // Some gateways expose raw service-data bytes inside manufacturerData.
  for (let i = 0; i <= bytes.length - 4; i += 1) {
    if (bytes[i] === 0x6e && bytes[i + 1] === 0x2a) {
      const temp = decodeELATemperatureValue(new DataView(data.buffer, data.byteOffset + i + 2, data.byteLength - i - 2), 0);
      if (temp !== undefined) decoded.temperature = temp;
    }
    if (bytes[i] === 0x6f && bytes[i + 1] === 0x2a) {
      const humidity = decodeELAHumidityValue(new DataView(data.buffer, data.byteOffset + i + 2, data.byteLength - i - 2), 0);
      if (humidity !== undefined) decoded.humidity = humidity;
    }
  }

  return decoded;
}

function decodeELAGATT(data: DataView): DecodedData {
  const temperature = decodeELATemperatureValue(data, 0);
  return temperature === undefined ? {} : { temperature };
}

function decodeRuuvi(data: DataView): DecodedData {
  if (data.byteLength < 24) return {};
  if (data.getUint8(0) !== 5) return {};
  const rawTemp = data.getInt16(1, false);
  const rawHum  = data.getUint16(3, false);
  const rawPres = data.getUint16(5, false);
  const powerInfo = data.getUint16(13, false);
  const voltage = (powerInfo >> 5) + 1600;
  const battery = Math.round(Math.min(100, Math.max(0, ((voltage - 1800) / 1500) * 100)));
  if (rawTemp === 0x8000) return {};
  return {
    temperature: Math.round(rawTemp * 0.005 * 100) / 100,
    humidity:    Math.round(rawHum  * 0.0025 * 100) / 100,
    pressure:    Math.round((rawPres + 50000) / 10) / 10,
    battery,
    batteryVoltage: voltage,
  };
}

function decodeGovee(data: DataView): DecodedData {
  if (data.byteLength < 4) return {};
  const raw = (data.getUint8(1) << 16) | (data.getUint8(2) << 8) | data.getUint8(3);
  const neg  = (raw & 0x800000) !== 0;
  const temp = ((neg ? -(raw & 0x7FFFFF) : (raw & 0x7FFFFF)) >> 12) * 0.01;
  const hum  = (raw & 0xFFF) * 0.01;
  const battery = data.byteLength > 4 ? data.getUint8(4) : undefined;
  return {
    temperature: temp < -40 || temp > 80 ? undefined : temp,
    humidity:    hum  < 0   || hum  > 100 ? undefined : hum,
    battery,
  };
}

function decodeInkbird(data: DataView): DecodedData {
  if (data.byteLength < 6) return {};
  return {
    temperature: data.getInt16(0, true) / 100,
    humidity:    data.getInt16(2, true) / 100,
    battery:     data.getUint8(5),
  };
}

function decodeSensorPush(data: DataView): DecodedData {
  if (data.byteLength < 4) return {};
  return {
    temperature: Math.round(data.getInt16(0, true) * 0.005 * 100) / 100,
    humidity:    Math.round(data.getUint16(2, true) * 0.005 * 100) / 100,
  };
}

function decodeXiaomi(data: DataView): DecodedData {
  if (data.byteLength < 3) return {};
  return {
    temperature: data.getInt16(0, true) / 100,
    humidity:    data.getUint8(2),
  };
}

function decodeHealthThermometer(data: DataView): DecodedData {
  if (data.byteLength < 5) return {};
  const flags    = data.getUint8(0);
  const mantissa = data.getUint8(1) | (data.getUint8(2) << 8) | (data.getUint8(3) << 16);
  const signed   = mantissa & 0x800000 ? mantissa - 0x1000000 : mantissa;
  const exponent = data.getInt8(4);
  let temp       = signed * Math.pow(10, exponent);
  if (flags & 0x01) temp = (temp - 32) * 5 / 9;
  return { temperature: Math.round(temp * 100) / 100 };
}

export const sensorProfiles: SensorProfile[] = [
  {
    id: "ela-blue-puck-rht",
    name: "ELA Blue PUCK RHT",
    manufacturer: "ELA Innovation",
    model: "Blue PUCK RHT",
    icon: "droplets",
    serviceUuid: ELA_ENVIRONMENTAL_SERVICE_UUID,
    characteristicUuid: ELA_TEMP_UUID,
    manufacturerId: COMPANY_IDS.ELA,
    supportsTemperature: true,
    supportsHumidity:    true,
    supportsPressure:    false,
    supportsBattery:     false,
    supportsRssi:        true,
    source: "advertisement",
    tempRange: [-30, 85],
    description: "Priorytetowy profil AutoSafe: temperatura z Service Data 0x2A6E i wilgotność z Service Data 0x2A6F / ramki RHT.",
    decodeAdvertisement: decodeELAManufacturerData,
    decodeGatt: decodeELAGATT,
  },
  {
    id: "ela-blue-puck-t",
    name: "ELA Blue PUCK T",
    manufacturer: "ELA Innovation",
    model: "Blue PUCK T / T EN12830",
    icon: "radio",
    serviceUuid: ELA_ENVIRONMENTAL_SERVICE_UUID,
    characteristicUuid: ELA_TEMP_UUID,
    manufacturerId: COMPANY_IDS.ELA,
    supportsTemperature: true,
    supportsHumidity:    false,
    supportsPressure:    false,
    supportsBattery:     false,
    supportsRssi:        true,
    source: "advertisement",
    tempRange: [-40, 85],
    description: "Temperatura z BLE Service Data UUID 0x2A6E, int16 little-endian ÷ 100.",
    decodeAdvertisement: decodeELAManufacturerData,
    decodeGatt: decodeELAGATT,
  },
  {
    id: "gatt-ess",
    name: "GATT Environmental Sensing",
    manufacturer: "Bluetooth SIG",
    model: "ESS 0x181A",
    icon: "wind",
    serviceUuid: ELA_ENVIRONMENTAL_SERVICE_UUID,
    characteristicUuid: ELA_TEMP_UUID,
    supportsTemperature: true,
    supportsHumidity:    false,
    supportsPressure:    false,
    supportsBattery:     false,
    supportsRssi:        false,
    source: "gatt",
    tempRange: [-273, 327],
    description: "Fallback GATT dla czujników udostępniających Environmental Sensing Service.",
    decodeGatt: decodeELAGATT,
  },
  {
    id: "ruuvi-tag-raw2",
    name: "RuuviTag",
    manufacturer: "Ruuvi Innovations",
    model: "RuuviTag RAW v2",
    icon: "gauge",
    manufacturerId: COMPANY_IDS.RUUVI,
    supportsTemperature: true,
    supportsHumidity:    true,
    supportsPressure:    true,
    supportsBattery:     true,
    supportsRssi:        true,
    source: "advertisement",
    tempRange: [-40, 85],
    description: "Multisensor: temp + wilgotność + ciśnienie. Format RAW v2.",
    decodeAdvertisement: decodeRuuvi,
  },
  {
    id: "govee-h5074",
    name: "Govee H5074/H5075",
    manufacturer: "Govee",
    model: "H5074 / H5075",
    icon: "thermometer",
    manufacturerId: COMPANY_IDS.GOVEE,
    supportsTemperature: true,
    supportsHumidity:    true,
    supportsPressure:    false,
    supportsBattery:     true,
    supportsRssi:        true,
    source: "advertisement",
    tempRange: [-20, 60],
    description: "Popularny czujnik temp+wilgotność przez Advertisement.",
    decodeAdvertisement: decodeGovee,
  },
  {
    id: "inkbird-ibs-th2",
    name: "Inkbird IBS-TH2",
    manufacturer: "Inkbird",
    model: "IBS-TH2",
    icon: "thermometer-snowflake",
    serviceUuid: "0000fff0-0000-1000-8000-00805f9b34fb",
    characteristicUuid: "0000fff1-0000-1000-8000-00805f9b34fb",
    manufacturerId: COMPANY_IDS.INKBIRD,
    supportsTemperature: true,
    supportsHumidity:    true,
    supportsPressure:    false,
    supportsBattery:     true,
    supportsRssi:        false,
    source: "gatt",
    tempRange: [-40, 60],
    description: "Czujnik GATT temp+wilgotność.",
    decodeGatt: decodeInkbird,
  },
  {
    id: "sensorpush-ht1",
    name: "SensorPush HT1",
    manufacturer: "SensorPush",
    model: "HT1",
    icon: "activity",
    serviceUuid: "ef090000-11d6-42ba-93b8-9dd7ec090ab0",
    characteristicUuid: "ef090080-11d6-42ba-93b8-9dd7ec090ab0",
    supportsTemperature: true,
    supportsHumidity:    true,
    supportsPressure:    false,
    supportsBattery:     false,
    supportsRssi:        false,
    source: "gatt",
    tempRange: [-40, 60],
    description: "Profesjonalny czujnik GATT ±0.2°C.",
    decodeGatt: decodeSensorPush,
  },
  {
    id: "xiaomi-lywsd03mmc",
    name: "Xiaomi LYWSD03MMC",
    manufacturer: "Xiaomi",
    model: "LYWSD03MMC",
    icon: "leaf",
    serviceUuid: "ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6",
    characteristicUuid: "ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6",
    supportsTemperature: true,
    supportsHumidity:    true,
    supportsPressure:    false,
    supportsBattery:     false,
    supportsRssi:        false,
    source: "gatt",
    tempRange: [-9.9, 60],
    description: "Xiaomi z LCD. Najlepiej działa z custom firmware ATC.",
    decodeGatt: decodeXiaomi,
  },
  {
    id: "gatt-health-thermometer",
    name: "GATT Health Thermometer",
    manufacturer: "Bluetooth SIG",
    model: "Standard 0x1809",
    icon: "stethoscope",
    serviceUuid: "health_thermometer",
    characteristicUuid: "temperature_measurement",
    supportsTemperature: true,
    supportsHumidity:    false,
    supportsPressure:    false,
    supportsBattery:     false,
    supportsRssi:        false,
    source: "gatt",
    tempRange: [-273, 327],
    description: "Standardowy profil Bluetooth SIG.",
    decodeGatt: decodeHealthThermometer,
  },
];

export const getProfile = (id?: string) => sensorProfiles.find((p) => p.id === id);
export const getProfilesBySource = (s: "gatt" | "advertisement") => sensorProfiles.filter((p) => p.source === s);

export const ALL_COMPANY_IDS = [COMPANY_IDS.ELA, COMPANY_IDS.RUUVI, COMPANY_IDS.GOVEE, COMPANY_IDS.INKBIRD];

export const detectProfileByName = (name?: string | null): string | null => {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (n.startsWith("p rht") || n.startsWith("bpuck_rht") || n.includes("rht") || n.includes("blue puck rht")) return "ela-blue-puck-rht";
  if (n.startsWith("p t") || n.startsWith("puck t") || n.startsWith("bpuck_t") || n.includes("blue puck t")) return "ela-blue-puck-t";
  if (n.startsWith("ruuvi")   || n.includes("ruuvitag"))  return "ruuvi-tag-raw2";
  if (n.startsWith("govee")   || n.startsWith("gvh"))     return "govee-h5074";
  if (n.includes("ibs-th")    || n.startsWith("inkbird")) return "inkbird-ibs-th2";
  if (n.includes("lywsd03")   || n.includes("mi temp"))   return "xiaomi-lywsd03mmc";
  if (n.includes("sensorpush"))                            return "sensorpush-ht1";
  return null;
};

export const detectProfileByCompanyId = (id: number): string | null => {
  if (id === COMPANY_IDS.ELA)     return "ela-blue-puck-rht";
  if (id === COMPANY_IDS.RUUVI)   return "ruuvi-tag-raw2";
  if (id === COMPANY_IDS.GOVEE)   return "govee-h5074";
  if (id === COMPANY_IDS.INKBIRD) return "inkbird-ibs-th2";
  return null;
};

export const decodeELAServiceFrame = (uuid: string, data: DataView): DecodedData => {
  const u = uuid.toLowerCase();
  if (u.includes("2a6e")) return decodeELAServiceData(data);
  if (u.includes("2a6f")) return decodeELARhtHumidityServiceData(data);
  return {};
};

export const decodeELAManufacturerFrame = decodeELAManufacturerData;
