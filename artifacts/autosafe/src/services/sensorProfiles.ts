// ============================================================
// sensorProfiles.ts v3 — ZWERYFIKOWANE protokoły
//
// ELA Blue Puck T — ZWERYFIKOWANY na rzeczywistym pakiecie:
//   Raw: 02 01 06 05 16 6E 2A 89 09 0E 09 50 20 54 20 45 4E 20 38 31 30 31 42 31
//   AD Type 0x16 = Service Data 16-bit UUID
//   UUID: 0x2A6E (GATT Temperature Characteristic)
//   Data: int16 little-endian / 100 = °C
//   Przykład: 89 09 → 0x0989 = 2441 → 24.41°C ✅
//
//   WAŻNE: NIE używa Manufacturer Specific Data (0xFF)!
//   Używa Service Data (0x16) z UUID 0x2A6E.
//   Działa przez GATT connect (characteristic 0x2A6E) LUB
//   przez Advertisement serviceData w watchAdvertisements().
// ============================================================

import type { SensorProfile, DecodedData } from "@/types/sensor";

// ── UUID ELA Blue Puck T ────────────────────────────────────
// UUID serwisu który zawiera dane temperatury
export const ELA_SERVICE_UUID   = "0000181a-0000-1000-8000-00805f9b34fb"; // ESS
export const ELA_TEMP_UUID      = "00002a6e-0000-1000-8000-00805f9b34fb"; // Temperature
export const ELA_SERVICE_UUID_SHORT = 0x181A; // Environmental Sensing Service
export const ELA_TEMP_UUID_SHORT    = 0x2A6E; // Temperature

// Company IDs (dla innych czujników)
export const COMPANY_IDS = {
  RUUVI:   0x0499,
  GOVEE:   0xEC88,
  INKBIRD: 0x0200,
} as const;

// ── ELA Blue Puck T dekoder ─────────────────────────────────
// Service Data format: [UUID_lo(1)][UUID_hi(1)][Temp_lo(1)][Temp_hi(1)]
// Po odebraniu przez Web Bluetooth serviceData Map<string,DataView>
// klucz = "0000181a-0000-1000-8000-00805f9b34fb" lub "0000ffxx..."
// value DataView zawiera: bajty PO UUID (czyli samo 89 09 dla temp)
function decodeELAServiceData(data: DataView): DecodedData {
  // Web Bluetooth serviceData zawiera dane BEZ UUID (już wycięty jako klucz)
  // Więc data = [Temp_lo, Temp_hi] = np. [0x89, 0x09]
  if (data.byteLength < 2) return {};
  const rawTemp = data.getInt16(0, true); // little-endian int16
  const temp = rawTemp / 100;             // jednostka: 0.01°C
  if (temp < -40 || temp > 100) return {};
  return { temperature: Math.round(temp * 100) / 100 };
}

// Alternatywny dekoder gdy serviceData zawiera też UUID (raw Advertisement)
function decodeELAServiceDataWithUUID(data: DataView): DecodedData {
  // Format z UUID: [6E][2A][89][09]
  // Sprawdź czy zaczyna się od UUID 0x2A6E (LE)
  if (data.byteLength >= 4) {
    const uuid = data.getUint16(0, true);
    if (uuid === ELA_TEMP_UUID_SHORT) {
      const rawTemp = data.getInt16(2, true);
      const temp = rawTemp / 100;
      if (temp >= -40 && temp <= 100) return { temperature: Math.round(temp * 100) / 100 };
    }
  }
  // Próbuj bez UUID
  if (data.byteLength >= 2) {
    const rawTemp = data.getInt16(0, true);
    const temp = rawTemp / 100;
    if (temp >= -40 && temp <= 100) return { temperature: Math.round(temp * 100) / 100 };
  }
  return {};
}

// GATT dekoder (dla połączenia bezpośredniego)
function decodeELAGATT(data: DataView): DecodedData {
  if (data.byteLength < 2) return {};
  const rawTemp = data.getInt16(0, true);
  const temp = rawTemp / 100;
  if (temp < -40 || temp > 100) return {};
  return { temperature: Math.round(temp * 100) / 100 };
}

// ── RuuviTag RAW v2 ─────────────────────────────────────────
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

// ── Govee H5074/H5075 ───────────────────────────────────────
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

// ── Inkbird IBS-TH2 ─────────────────────────────────────────
function decodeInkbird(data: DataView): DecodedData {
  if (data.byteLength < 6) return {};
  return {
    temperature: data.getInt16(0, true) / 100,
    humidity:    data.getInt16(2, true) / 100,
    battery:     data.getUint8(5),
  };
}

// ── SensorPush HT1 ──────────────────────────────────────────
function decodeSensorPush(data: DataView): DecodedData {
  if (data.byteLength < 4) return {};
  return {
    temperature: Math.round(data.getInt16(0, true) * 0.005 * 100) / 100,
    humidity:    Math.round(data.getUint16(2, true) * 0.005 * 100) / 100,
  };
}

// ── Xiaomi LYWSD03MMC ───────────────────────────────────────
function decodeXiaomi(data: DataView): DecodedData {
  if (data.byteLength < 3) return {};
  return {
    temperature: data.getInt16(0, true) / 100,
    humidity:    data.getUint8(2),
  };
}

// ── GATT Health Thermometer ─────────────────────────────────
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

// ══════════════════════════════════════════════════════════════
// PROFILE REGISTRY
// ══════════════════════════════════════════════════════════════
export const sensorProfiles: SensorProfile[] = [

  // ── ELA Blue Puck T — ZWERYFIKOWANY ──────────────────────
  // Protokół: Service Data UUID 0x2A6E, int16 LE / 100 = °C
  // Nazwa BLE: "P T EN xxxxxxx" lub "BPUCK_T_xxxxxx"
  // Advertisement interval: ~1000ms
  {
    id: "ela-blue-puck-t",
    name: "ELA Blue Puck T",
    manufacturer: "ELA Innovation",
    model: "Blue Puck T",
    icon: "radio",
    // UUID serwisu do filtrowania przy skanowaniu
    serviceUuid: ELA_SERVICE_UUID,
    characteristicUuid: ELA_TEMP_UUID,
    supportsTemperature: true,
    supportsHumidity:    false,
    supportsPressure:    false,
    supportsBattery:     false,
    supportsRssi:        true,
    source: "advertisement",
    tempRange: [-40, 85],
    description: "Zweryfikowany protokół: Service Data UUID 0x2A6E, int16 LE ÷ 100 = °C. Nazwa: 'P T EN xxxxxxx'.",
    // Dekoder dla Advertisement (serviceData)
    decodeAdvertisement: decodeELAServiceData,
    // Dekoder dla GATT (połączenie bezpośrednie — fallback)
    decodeGatt: decodeELAGATT,
  },

  // ── ELA Blue Puck T — GATT fallback ──────────────────────
  // Gdy Advertisement nie działa — połącz przez GATT i odczytaj
  // characteristic 0x2A6E bezpośrednio
  {
    id: "ela-blue-puck-t-gatt",
    name: "ELA Blue Puck T (GATT)",
    manufacturer: "ELA Innovation",
    model: "Blue Puck T (GATT connect)",
    icon: "bluetooth",
    serviceUuid: ELA_SERVICE_UUID,
    characteristicUuid: ELA_TEMP_UUID,
    supportsTemperature: true,
    supportsHumidity:    false,
    supportsPressure:    false,
    supportsBattery:     false,
    supportsRssi:        false,
    source: "gatt",
    tempRange: [-40, 85],
    description: "ELA Blue Puck T przez GATT connect. Używaj gdy Advertisement Scanning nie jest dostępny.",
    decodeGatt: decodeELAGATT,
  },

  // ── ELA Blue Puck RHT ─────────────────────────────────────
  {
    id: "ela-blue-puck-rht",
    name: "ELA Blue Puck RHT",
    manufacturer: "ELA Innovation",
    model: "Blue Puck RHT",
    icon: "droplets",
    serviceUuid: ELA_SERVICE_UUID,
    characteristicUuid: ELA_TEMP_UUID,
    supportsTemperature: true,
    supportsHumidity:    true,
    supportsPressure:    false,
    supportsBattery:     false,
    supportsRssi:        true,
    source: "advertisement",
    tempRange: [-40, 85],
    description: "ELA Blue Puck z temperaturą i wilgotnością.",
    decodeAdvertisement: decodeELAServiceData,
    decodeGatt: decodeELAGATT,
  },

  // ── RuuviTag ─────────────────────────────────────────────
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
    description: "Multisensor: temp + wilgotność + ciśnienie. Format RAW v2 (Data Format 5).",
    decodeAdvertisement: decodeRuuvi,
  },

  // ── Govee H5074/H5075 ────────────────────────────────────
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

  // ── Inkbird IBS-TH2 ──────────────────────────────────────
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

  // ── SensorPush HT1 ───────────────────────────────────────
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
    description: "Profesjonalny czujnik GATT ±0.2°C. Popularny w gastronomii i lab.",
    decodeGatt: decodeSensorPush,
  },

  // ── Xiaomi LYWSD03MMC ────────────────────────────────────
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
    description: "Tani Xiaomi z LCD. Wymaga custom firmware ATC.",
    decodeGatt: decodeXiaomi,
  },

  // ── GATT Health Thermometer ──────────────────────────────
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

  // ── GATT ESS ─────────────────────────────────────────────
  {
    id: "gatt-ess",
    name: "GATT Environmental Sensing",
    manufacturer: "Bluetooth SIG",
    model: "ESS 0x181A",
    icon: "wind",
    serviceUuid: ELA_SERVICE_UUID,
    characteristicUuid: ELA_TEMP_UUID,
    supportsTemperature: true,
    supportsHumidity:    false,
    supportsPressure:    false,
    supportsBattery:     false,
    supportsRssi:        false,
    source: "gatt",
    tempRange: [-273, 327],
    description: "Environmental Sensing Service (0x181A) z characteristic Temperature (0x2A6E).",
    decodeGatt: (d) => ({ temperature: d.byteLength >= 2 ? Math.round(d.getInt16(0, true) / 100 * 100) / 100 : undefined }),
  },
];

// ── Helpers ──────────────────────────────────────────────────
export const getProfile = (id?: string) => sensorProfiles.find((p) => p.id === id);
export const getProfilesBySource = (s: "gatt" | "advertisement") => sensorProfiles.filter((p) => p.source === s);

export const ALL_COMPANY_IDS = [COMPANY_IDS.RUUVI, COMPANY_IDS.GOVEE, COMPANY_IDS.INKBIRD];

/** Auto-detect profilu po nazwie BLE */
export const detectProfileByName = (name?: string | null): string | null => {
  if (!name) return null;
  const n = name.toLowerCase();
  // ELA Blue Puck T — nazwa "P T EN xxxxxxx" lub "BPUCK_T_..."
  if (n.startsWith("p t en") || n.startsWith("bpuck_t") || n.includes("blue puck t"))  return "ela-blue-puck-t";
  if (n.startsWith("bpuck_rht") || n.includes("blue puck rht"))                         return "ela-blue-puck-rht";
  if (n.startsWith("ruuvi")   || n.includes("ruuvitag"))                                return "ruuvi-tag-raw2";
  if (n.startsWith("govee")   || n.startsWith("gvh"))                                   return "govee-h5074";
  if (n.includes("ibs-th")    || n.startsWith("inkbird"))                               return "inkbird-ibs-th2";
  if (n.includes("lywsd03")   || n.includes("mi temp"))                                 return "xiaomi-lywsd03mmc";
  if (n.includes("sensorpush"))                                                          return "sensorpush-ht1";
  return null;
};

/** Auto-detect po Company ID */
export const detectProfileByCompanyId = (id: number): string | null => {
  if (id === COMPANY_IDS.RUUVI)   return "ruuvi-tag-raw2";
  if (id === COMPANY_IDS.GOVEE)   return "govee-h5074";
  return null;
};

export { decodeELAServiceDataWithUUID };
