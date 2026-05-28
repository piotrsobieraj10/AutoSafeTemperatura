// services/nativeBleService.ts — AutoSafe_Temperatura_v6 Android APK
// Natywny skaner BLE dla Androida przez Capacitor. W PWA niczego nie zmienia.

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { DecodedData, Sensor } from "@/types/sensor";
import { detectProfileByName } from "./sensorProfiles";
import { decodeBleError } from "./bleErrorDecoder";
import type { BTDevice, ScanCallback, ScanMode } from "./bluetoothService";

interface NativeElaAdvertisement {
  deviceId?: string;
  address?: string;
  name?: string;
  rssi?: number;
  timestamp?: number;
  rawAdvertisementHex?: string;
  serviceData?: Record<string, string>;
  manufacturerData?: Record<string, string>;
  temperature?: number;
  humidity?: number;
  battery?: number;
  batteryVoltage?: number;
  statusByte?: number;
}

interface NativeScanOptions {
  scanSeconds?: number;
  namePrefixes?: string[];
}

interface NativeScanStoppedEvent {
  reason?: string;
  code?: string;
  message?: string;
  androidScanError?: number;
  [key: string]: unknown;
}

interface AutosafeBlePlugin {
  startScan(options?: NativeScanOptions): Promise<{ active: boolean; mode: string; alreadyRunning?: boolean }>;
  stopScan(): Promise<{ stopped: boolean }>;
  getStatus(): Promise<{ supported: boolean; bluetoothEnabled: boolean; scannerAvailable?: boolean; scanning: boolean }>;
  addListener(eventName: "elaAdvertisement", listenerFunc: (event: NativeElaAdvertisement) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "elaScanStopped", listenerFunc: (event: NativeScanStoppedEvent) => void): Promise<PluginListenerHandle>;
}

const AutosafeBle = registerPlugin<AutosafeBlePlugin>("AutosafeBle");
const handles = new Map<string, PluginListenerHandle>();
let sharedScanRunning = false;
let lastStartAt = 0;

const NAME_PREFIXES = ["P T", "P T EN", "P RHT", "P RHT EN", "BPUCK", "ELA"];
const SCAN_SECONDS = 75;

const bleErrorToError = (error: unknown, prefix?: string): Error => {
  const decoded = decodeBleError(error);
  const action = decoded.action ? ` ${decoded.action}` : "";
  const details = decoded.technicalDetails ? ` Szczegóły techniczne: ${decoded.technicalDetails}` : "";
  return new Error(`${prefix ? `${prefix}: ` : ""}${decoded.title}: ${decoded.userMessage}${action} Kod: ${decoded.code}.${details}`);
};

const reportBleError = (onError: ((e: Error) => void) | undefined, error: unknown, prefix?: string) => {
  onError?.(bleErrorToError(error, prefix));
};

export const isNativeBleAvailable = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
};

const normalizeName = (value?: string | null) => (value ?? "")
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "")
  .trim();

const matchesSensorName = (sensor: Sensor, name?: string | null): boolean => {
  const target = normalizeName(sensor.bluetoothName);
  const candidate = normalizeName(name);
  if (!target || !candidate) return false;
  return candidate === target || candidate.includes(target) || target.includes(candidate);
};

const rawMapToText = (input?: Record<string, string>): string | undefined => {
  if (!input) return undefined;
  const rows = Object.entries(input).filter(([, v]) => Boolean(v));
  return rows.length ? rows.map(([k, v]) => `${k}=${v}`).join(" | ") : undefined;
};

const nativeEventToResult = (event: NativeElaAdvertisement, hintProfileId?: string | null) => {
  const name = event.name || event.deviceId || "ELA Blue PUCK";
  const device: BTDevice = {
    id: event.deviceId || event.address || name,
    name,
  };
  const data: DecodedData = {
    temperature: event.temperature,
    humidity: event.humidity,
    battery: event.battery,
    batteryVoltage: event.batteryVoltage,
    rssi: event.rssi,
    rawAdvertisementHex: event.rawAdvertisementHex,
    rawServiceData: rawMapToText(event.serviceData),
    rawManufacturerData: rawMapToText(event.manufacturerData),
  };
  data.bleDebug = [
    `native=android`,
    `name=${name}`,
    event.address ? `address=${event.address}` : undefined,
    event.rssi != null ? `rssi=${event.rssi}` : undefined,
    event.temperature != null ? `temperature=${event.temperature}` : undefined,
    event.humidity != null ? `humidity=${event.humidity}` : undefined,
    event.batteryVoltage != null ? `batteryMv=${event.batteryVoltage}` : undefined,
    data.rawServiceData ? `serviceData=${data.rawServiceData}` : undefined,
    data.rawManufacturerData ? `manufacturerData=${data.rawManufacturerData}` : undefined,
    event.rawAdvertisementHex ? `raw=${event.rawAdvertisementHex}` : undefined,
    `ts=${new Date(event.timestamp ?? Date.now()).toISOString()}`,
  ].filter(Boolean).join("; ");

  let profileId = hintProfileId ?? detectProfileByName(name) ?? null;
  if (event.humidity !== undefined) profileId = "ela-blue-puck-rht";
  if (!profileId && event.temperature !== undefined) profileId = "ela-blue-puck-t";
  return { device, detectedProfileId: profileId, data };
};

const ensureNativeScan = async (onError?: (e: Error) => void): Promise<boolean> => {
  if (!isNativeBleAvailable()) return false;
  try {
    const now = Date.now();
    if (sharedScanRunning && now - lastStartAt < SCAN_SECONDS * 1000) return true;
    const result = await AutosafeBle.startScan({ scanSeconds: SCAN_SECONDS, namePrefixes: NAME_PREFIXES });
    sharedScanRunning = result.active;
    lastStartAt = now;
    return result.active;
  } catch (e) {
    reportBleError(onError, e, "Android BLE");
    return false;
  }
};

export const stopAllNativeBleActivity = async (): Promise<void> => {
  for (const [, handle] of handles) {
    try { await handle.remove(); } catch { /* ignore */ }
  }
  handles.clear();
  sharedScanRunning = false;
  try { await AutosafeBle.stopScan(); } catch { /* ignore */ }
};

export const reconnectSensorNative = async (
  sensor: Sensor,
  onData: ScanCallback,
  onError?: (e: Error) => void
): Promise<boolean> => {
  if (!isNativeBleAvailable()) return false;
  const existing = handles.get(sensor.id);
  if (existing) {
    try { await existing.remove(); } catch { /* ignore */ }
    handles.delete(sensor.id);
  }
  const stoppedKey = `${sensor.id}:stopped`;
  const existingStopped = handles.get(stoppedKey);
  if (existingStopped) {
    try { await existingStopped.remove(); } catch { /* ignore */ }
    handles.delete(stoppedKey);
  }

  const handle = await AutosafeBle.addListener("elaAdvertisement", (event) => {
    if (!matchesSensorName(sensor, event.name) && !matchesSensorName(sensor, event.deviceId) && !matchesSensorName(sensor, event.address)) return;
    const result = nativeEventToResult(event, sensor.profileId);
    onData(result);
  });
  handles.set(sensor.id, handle);

  const stoppedHandle = await AutosafeBle.addListener("elaScanStopped", (event) => {
    if (!event || event.reason === "stopped") return;
    reportBleError(onError, event, "Android BLE");
  });
  handles.set(stoppedKey, stoppedHandle);

  const ok = await ensureNativeScan(onError);
  if (ok) {
    onError?.(new Error(`Android APK: odświeżam odczyt natywnym BLE — szukam ${sensor.bluetoothName}.`));
  }
  return ok;
};

export const scanForDeviceNative = async (
  onData: ScanCallback,
  onError?: (e: Error) => void,
  mode: ScanMode = "ela"
): Promise<BTDevice | null> => {
  if (!isNativeBleAvailable()) return null;

  return new Promise<BTDevice | null>(async (resolve) => {
    let resolved = false;
    let handle: PluginListenerHandle | undefined;
    let stoppedHandle: PluginListenerHandle | undefined;
    const cleanup = async () => {
      try { await handle?.remove(); } catch { /* ignore */ }
      try { await stoppedHandle?.remove(); } catch { /* ignore */ }
    };
    const timeout = window.setTimeout(async () => {
      if (resolved) return;
      resolved = true;
      await cleanup();
      onError?.(new Error("Android BLE: nie znaleziono czujnika w czasie skanowania. Zbliż telefon do ELA Blue PUCK i spróbuj ponownie."));
      resolve(null);
    }, 35_000);

    try {
      stoppedHandle = await AutosafeBle.addListener("elaScanStopped", (event) => {
        if (!event || event.reason === "stopped") return;
        reportBleError(onError, event, "Android BLE");
      });

      handle = await AutosafeBle.addListener("elaAdvertisement", (event) => {
        const name = event.name ?? "";
        const isEla = /^(P\s*T|P\s*RHT|BPUCK|ELA)/i.test(name);
        if (mode === "ela" && !isEla) return;
        const result = nativeEventToResult(event);
        onData(result);
        if (!resolved) {
          resolved = true;
          window.clearTimeout(timeout);
          cleanup().catch(() => {});
          resolve(result.device);
        }
      });
      const ok = await ensureNativeScan(onError);
      if (!ok && !resolved) {
        resolved = true;
        window.clearTimeout(timeout);
        await cleanup();
        resolve(null);
      }
    } catch (e) {
      if (!resolved) {
        resolved = true;
        window.clearTimeout(timeout);
        await cleanup();
        reportBleError(onError, e, "Android BLE");
        resolve(null);
      }
    }
  });
};
