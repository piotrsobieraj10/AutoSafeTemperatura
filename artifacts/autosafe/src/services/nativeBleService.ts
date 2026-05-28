// services/nativeBleService.ts — AutoSafe_Temperatura_v6
// Natywny skaner BLE dla Android APK przez Capacitor.
// PWA zostaje jako zapas: gdy aplikacja nie działa jako Android APK, używany jest Web Bluetooth fallback.

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { DecodedData, Sensor } from "@/types/sensor";
import { detectProfileByName } from "./sensorProfiles";
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

interface NativeBleStatus {
  supported: boolean;
  bluetoothEnabled: boolean;
  permissionsGranted?: boolean;
  scanning: boolean;
  frameCount?: number;
  lastDeviceName?: string;
  lastDeviceAddress?: string;
  lastRssi?: number;
  lastReadingAt?: number;
  lastError?: string;
  mode?: string;
}

interface AutosafeBlePlugin {
  startScan(options?: NativeScanOptions): Promise<{ active: boolean; mode: string; alreadyRunning?: boolean }>;
  stopScan(): Promise<{ stopped: boolean }>;
  getStatus(): Promise<NativeBleStatus>;
  addListener(eventName: "elaAdvertisement", listenerFunc: (event: NativeElaAdvertisement) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "elaScanStopped", listenerFunc: (event: { reason?: string; message?: string }) => void): Promise<PluginListenerHandle>;
}

export interface NativeBleDiagnostics {
  appMode: "android-apk" | "pwa";
  nativeAvailable: boolean;
  supported: boolean;
  bluetoothEnabled: boolean;
  permissionsGranted: boolean;
  scanning: boolean;
  receivedFrames: number;
  lastDeviceName?: string;
  lastDeviceAddress?: string;
  lastRssi?: number;
  lastReadAt?: string;
  lastError?: string;
  mode: string;
}

const AutosafeBle = registerPlugin<AutosafeBlePlugin>("AutosafeBle");
const handles = new Map<string, PluginListenerHandle>();
let sharedScanRunning = false;
let lastStartAt = 0;

const NAME_PREFIXES = ["P T", "P T EN", "P RHT", "P RHT EN", "BPUCK", "ELA", "PUCK"];
const SCAN_SECONDS = 75;

const localDiagnostics: NativeBleDiagnostics = {
  appMode: "pwa",
  nativeAvailable: false,
  supported: false,
  bluetoothEnabled: false,
  permissionsGranted: false,
  scanning: false,
  receivedFrames: 0,
  mode: "web-fallback",
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

const updateLocalDiagnosticsFromEvent = (event: NativeElaAdvertisement) => {
  localDiagnostics.appMode = isNativeBleAvailable() ? "android-apk" : "pwa";
  localDiagnostics.nativeAvailable = isNativeBleAvailable();
  localDiagnostics.supported = true;
  localDiagnostics.bluetoothEnabled = true;
  localDiagnostics.permissionsGranted = true;
  localDiagnostics.scanning = sharedScanRunning;
  localDiagnostics.receivedFrames += 1;
  localDiagnostics.lastDeviceName = event.name ?? event.deviceId ?? event.address ?? "ELA Blue PUCK";
  localDiagnostics.lastDeviceAddress = event.address ?? event.deviceId;
  localDiagnostics.lastRssi = event.rssi;
  localDiagnostics.lastReadAt = new Date(event.timestamp ?? Date.now()).toISOString();
  localDiagnostics.lastError = undefined;
  localDiagnostics.mode = "native-android-scanrecord";
};

const nativeEventToResult = (event: NativeElaAdvertisement, hintProfileId?: string | null) => {
  updateLocalDiagnosticsFromEvent(event);

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

const ensureNativeScan = async (onError?: (e: Error) => void, scanSeconds = SCAN_SECONDS): Promise<boolean> => {
  if (!isNativeBleAvailable()) return false;
  try {
    const now = Date.now();
    if (sharedScanRunning && now - lastStartAt < scanSeconds * 1000) return true;
    const result = await AutosafeBle.startScan({ scanSeconds, namePrefixes: NAME_PREFIXES });
    sharedScanRunning = result.active;
    lastStartAt = now;
    localDiagnostics.scanning = result.active;
    localDiagnostics.mode = result.mode || "native-android-scanrecord";
    return result.active;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    localDiagnostics.lastError = msg;
    localDiagnostics.scanning = false;
    onError?.(new Error(`Android BLE: nie udało się uruchomić natywnego skanowania: ${msg}`));
    return false;
  }
};

export const getNativeBleDiagnostics = async (): Promise<NativeBleDiagnostics> => {
  const appMode = isNativeBleAvailable() ? "android-apk" : "pwa";
  if (!isNativeBleAvailable()) {
    return { ...localDiagnostics, appMode, nativeAvailable: false, mode: "pwa-web-bluetooth-fallback" };
  }
  try {
    const status = await AutosafeBle.getStatus();
    return {
      appMode,
      nativeAvailable: true,
      supported: Boolean(status.supported),
      bluetoothEnabled: Boolean(status.bluetoothEnabled),
      permissionsGranted: Boolean(status.permissionsGranted),
      scanning: Boolean(status.scanning),
      receivedFrames: Number(status.frameCount ?? localDiagnostics.receivedFrames ?? 0),
      lastDeviceName: status.lastDeviceName || localDiagnostics.lastDeviceName,
      lastDeviceAddress: status.lastDeviceAddress || localDiagnostics.lastDeviceAddress,
      lastRssi: status.lastRssi ?? localDiagnostics.lastRssi,
      lastReadAt: status.lastReadingAt ? new Date(status.lastReadingAt).toISOString() : localDiagnostics.lastReadAt,
      lastError: status.lastError || localDiagnostics.lastError,
      mode: status.mode || "native-android-scanrecord",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...localDiagnostics, appMode, nativeAvailable: true, supported: false, lastError: msg, mode: "native-plugin-error" };
  }
};

export const stopAllNativeBleActivity = async (): Promise<void> => {
  for (const [, handle] of handles) {
    try { await handle.remove(); } catch { /* ignore */ }
  }
  handles.clear();
  sharedScanRunning = false;
  localDiagnostics.scanning = false;
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

  const handle = await AutosafeBle.addListener("elaAdvertisement", (event) => {
    if (!matchesSensorName(sensor, event.name) && !matchesSensorName(sensor, event.deviceId) && !matchesSensorName(sensor, event.address)) return;
    const result = nativeEventToResult(event, sensor.profileId);
    onData(result);
  });
  handles.set(sensor.id, handle);

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
    const timeout = window.setTimeout(async () => {
      if (resolved) return;
      resolved = true;
      try { await handle?.remove(); } catch { /* ignore */ }
      onError?.(new Error("Android BLE: nie znaleziono czujnika w czasie skanowania. Zbliż telefon do ELA Blue PUCK i spróbuj ponownie."));
      resolve(null);
    }, 35_000);

    try {
      handle = await AutosafeBle.addListener("elaAdvertisement", (event) => {
        const name = event.name ?? "";
        const isEla = /^(P\s*T|P\s*RHT|BPUCK|ELA|PUCK)/i.test(name) || Boolean(event.serviceData?.["00002a6e-0000-1000-8000-00805f9b34fb"]);
        if (mode === "ela" && !isEla) return;
        const result = nativeEventToResult(event);
        onData(result);
        if (!resolved) {
          resolved = true;
          window.clearTimeout(timeout);
          resolve(result.device);
        }
      });
      const ok = await ensureNativeScan(onError, 45);
      if (!ok && !resolved) {
        resolved = true;
        window.clearTimeout(timeout);
        try { await handle.remove(); } catch { /* ignore */ }
        resolve(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      localDiagnostics.lastError = msg;
      if (!resolved) {
        resolved = true;
        window.clearTimeout(timeout);
        onError?.(new Error(`Android BLE: błąd skanowania: ${msg}`));
        resolve(null);
      }
    }
  });
};
