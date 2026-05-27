// sensorProfiles.ts v2
import type { SensorProfile, DecodedData } from "@/types/sensor";

export const COMPANY_IDS = {
  ELA:     0x0531,
  RUUVI:   0x0499,
  GOVEE:   0xEC88,
  INKBIRD: 0x0200,
} as const;

function decodeELA(data: DataView, productType: number): DecodedData {
  let off = 0;
  if (data.byteLength >= 2 && data.getUint16(0, true) === COMPANY_IDS.ELA) off = 2;
  if (data.byteLength < off + 5) return {};
  const type = data.getUint8(off);
  if (type !== productType && productType !== 0xFF) return {};
  const rawTemp = data.getInt16(off + 2, true);
  const temp = rawTemp / 10;
  const battery = data.getUint8(off + 4);
  if (temp < -60 || temp > 120) return { battery };
  return { temperature: temp, battery };
}

function decodeELARHT(data: DataView): DecodedData {
  let off = 0;
  if (data.byteLength >= 2 && data.getUint16(0, true) === COMPANY_IDS.ELA) off = 2;
  if (data.byteLength < off + 7) return {};
  const rawTemp = data.getInt16(off + 2, true);
  const rawHum  = data.getUint16(off + 4, true);
  const battery = data.getUint8(off + 6);
  const temp = rawTemp / 10;
  const hum  = rawHum  / 10;
  return {
    temperature: temp < -60 || temp > 120 ? undefined : temp,
    humidity:    hum  < 0   || hum  > 100 ? undefined : hum,
    battery,
  };
}

function decodeRuuvi(data: DataView): DecodedData {
  if (data.byteLength < 24) return {};
  const fmt = data.getUint8(0);
  if (fmt !== 5) return {};
  const rawTemp = data.getInt16(1, false);
  if (rawTemp === 0x8000) return {};
  const rawHum  = data.getUint16(3, false);
  const rawPres = data.getUint16(5, false);
  const powerInfo = data.getUint16(13, false);
  const voltage = (powerInfo >> 5) + 1600;
  const battery = Math.round(Math.min(100, Math.max(0, ((voltage - 1800) / (3300 - 1800)) * 100)));
  return {
    temperature: Math.round(rawTemp * 0.005 * 100) / 100,
    humidity:    Math.round(rawHum  * 0.0025 * 100) / 100,
    pressure:    Math.round((rawPres + 50000) / 100 * 10) / 10,
    battery,
    batteryVoltage: voltage,
  };
}

function decodeGovee(data: DataView): DecodedData {
  if (data.byteLength < 6) return {};
  const b1 = data.getUint8(1);
  const b2 = data.getUint8(2);
  const b3 = data.getUint8(3);
  const raw = (b1 << 16) | (b2 << 8) | b3;
  const negative = (raw & 0x800000) !== 0;
  const tempRaw  = (raw & 0x7FFFFF) >> 12;
  const humRaw   = raw & 0xFFF;
  const temp = (negative ? -tempRaw : tempRaw) * 0.01;
  const hum  = humRaw * 0.01;
  const battery = data.byteLength > 4 ? data.getUint8(4) : undefined;
  return {
    temperature: temp < -40 || temp > 80  ? undefined : temp,
    humidity:    hum  < 0   || hum  > 100 ? undefined : hum,
    battery,
  };
}

function decodeInkbird(data: DataView): DecodedData {
  if (data.byteLength < 6) return {};
  const temp = data.getInt16(0, true) / 100;
  const hum  = data.getInt16(2, true) / 100;
  const battery = data.getUint8(5);
  return {
    temperature: temp < -40 || temp > 80  ? undefined : temp,
    humidity:    hum  < 0   || hum  > 100 ? undefined : hum,
    battery,
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
    id: "ela-blue-puck-t",
    name: "Blue Puck T",
    manufacturer: "ELA Innovation",
    model: "Blue Puck T",
    icon: "radio",
    manufacturerId: COMPANY_IDS.ELA,
    supportsTemperature: true,
    supportsHumidity:    false,
    supportsPressure:    false,
    supportsBattery:     true,
    supportsRssi:        true,
    source: "advertisement",
    tempRange: [-40, 85],
    description: "Czujnik temperatury BLE Advertisement. Nie wymaga parowania. Zasięg do 30m.",
    decodeAdvertisement: (d) => decodeELA(d, 0x01),
  },
  {
    id: "ela-blue-puck-rht",
    name: "Blue Puck RHT",
    manufacturer: "ELA Innovation",
    model: "Blue Puck RHT",
    icon: "droplets",
    manufacturerId: COMPANY_IDS.ELA,
    supportsTemperature: true,
    supportsHumidity:    true,
    supportsPressure:    false,
    supportsBattery:     true,
    supportsRssi:        true,
    source: "advertisement",
    tempRange: [-40, 85],
    description: "Czujnik temperatury i wilgotności BLE Advertisement.",
    decodeAdvertisement: decodeELARHT,
  },
  {
    id: "ela-blue-coin-t",
    name: "Blue Coin T",
    manufacturer: "ELA Innovation",
    model: "Blue Coin T",
    icon: "circle-dot",
    manufacturerId: COMPANY_IDS.ELA,
    supportsTemperature: true,
    supportsHumidity:    false,
    supportsPressure:    false,
    supportsBattery:     true,
    supportsRssi:        true,
    source: "advertisement",
    tempRange: [-40, 85],
    description: "Kompaktowy czujnik temperatury w formie monety.",
    decodeAdvertisement: (d) => decodeELA(d, 0x05),
  },
  {
    id: "ruuvi-tag-raw2",
    name: "RuuviTag",
    manufacturer: "Ruuvi Innovations",
    model: "RuuviTag (RAW v2)",
    icon: "gauge",
    manufacturerId: COMPANY_IDS.RUUVI,
    supportsTemperature: true,
    supportsHumidity:    true,
    supportsPressure:    true,
    supportsBattery:     true,
    supportsRssi:        true,
    source: "advertisement",
    tempRange: [-40, 85],
    description: "Multisensor: temperatura, wilgotność, ciśnienie. Format RAW v2.",
    setupUrl: "https://docs.ruuvi.com",
    decodeAdvertisement: (d) => decodeRuuvi(d),
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
    description: "Popularny czujnik temp+wilgotność. Nadaje przez Advertisement.",
    decodeAdvertisement: (d) => decodeGovee(d),
  },
  {
    id: "inkbird-ibs-th2",
    name: "Inkbird IBS-TH2",
    manufacturer: "Inkbird",
    model: "IBS-TH2",
    icon: "thermometer-snowflake",
    serviceUuid: "0000fff0-0000-1000-8000-00805f9b34fb",
    characteristicUuid: "0000fff1-0000-1000-8000-00805f9b34fb",
    supportsTemperature: true,
    supportsHumidity:    true,
    supportsPressure:    false,
    supportsBattery:     true,
    supportsRssi:        false,
    source: "gatt",
    tempRange: [-40, 60],
    description: "Czujnik GATT temp+wilgotność. Popularny do lodówek i szklarni.",
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
    description: "Profesjonalny czujnik GATT. Wysoka dokładność ±0.2°C.",
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
    description: "Tani czujnik Xiaomi z LCD. Wymaga custom firmware (ATC).",
    decodeGatt: decodeXiaomi,
  },
  {
    id: "gatt-health-thermometer",
    name: "GATT Health Thermometer",
    manufacturer: "Bluetooth SIG",
    model: "Standard (0x1809)",
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
  {
    id: "gatt-ess",
    name: "GATT Environmental Sensing",
    manufacturer: "Bluetooth SIG",
    model: "ESS (0x181A)",
    icon: "wind",
    serviceUuid: "environmental_sensing",
    characteristicUuid: "temperature",
    supportsTemperature: true,
    supportsHumidity:    false,
    supportsPressure:    false,
    supportsBattery:     false,
    supportsRssi:        false,
    source: "gatt",
    tempRange: [-273, 327],
    description: "Environmental Sensing Service. Szeroka kompatybilność.",
    decodeGatt: (d) => ({ temperature: d.byteLength >= 2 ? d.getInt16(0, true) / 100 : undefined }),
  },
];

export const getProfile = (id?: string) =>
  sensorProfiles.find((p) => p.id === id);

export const getProfilesBySource = (source: "gatt" | "advertisement") =>
  sensorProfiles.filter((p) => p.source === source);

export const ELA_PROFILES = sensorProfiles.filter(
  (p) => p.manufacturer === "ELA Innovation"
);

export const ALL_COMPANY_IDS = [
  COMPANY_IDS.ELA,
  COMPANY_IDS.RUUVI,
  COMPANY_IDS.GOVEE,
  COMPANY_IDS.INKBIRD,
];

export const detectProfileByName = (name?: string | null): string | null => {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("puck t")   || n.startsWith("bpuck_t"))   return "ela-blue-puck-t";
  if (n.includes("puck rht") || n.startsWith("bpuck_rht")) return "ela-blue-puck-rht";
  if (n.includes("coin t")   || n.startsWith("bcoin_t"))   return "ela-blue-coin-t";
  if (n.includes("coin rht") || n.startsWith("bcoin_rht")) return "ela-blue-puck-rht";
  if (n.startsWith("ruuvi")  || n.includes("ruuvitag"))    return "ruuvi-tag-raw2";
  if (n.startsWith("govee")  || n.startsWith("gvh"))       return "govee-h5074";
  if (n.includes("ibs-th")   || n.startsWith("inkbird"))   return "inkbird-ibs-th2";
  if (n.includes("lywsd03")  || n.includes("mi temp"))     return "xiaomi-lywsd03mmc";
  if (n.includes("sensorpush"))                            return "sensorpush-ht1";
  return null;
};

export const detectProfileByCompanyId = (companyId: number, data: DataView): string | null => {
  switch (companyId) {
    case COMPANY_IDS.ELA: {
      const off = 2;
      if (data.byteLength <= off) return "ela-blue-puck-t";
      const type = data.getUint8(off);
      if (type === 0x02) return "ela-blue-puck-rht";
      if (type === 0x05 || type === 0x06) return "ela-blue-coin-t";
      return "ela-blue-puck-t";
    }
    case COMPANY_IDS.RUUVI: return "ruuvi-tag-raw2";
    case COMPANY_IDS.GOVEE: return "govee-h5074";
    default: return null;
  }
};
