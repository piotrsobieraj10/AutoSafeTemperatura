package im.autosafe.temperatura;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.SparseArray;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@CapacitorPlugin(
    name = "AutosafeBle",
    permissions = {
        @Permission(alias = "nearby", strings = {
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.BLUETOOTH_CONNECT
        }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class AutosafeBlePlugin extends Plugin {
    private static final int COMPANY_ELA = 0x0757;
    private static final long FAST_CHANGED_FRAME_MS = 350L;
    private static final long NORMAL_FRAME_MS = 1800L;

    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, Long> lastEmitAtByDevice = new HashMap<>();
    private final Map<String, String> lastPayloadByDevice = new HashMap<>();
    private Runnable stopRunnable;
    private boolean scanning = false;

    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            JSObject ret = new JSObject();
            BluetoothAdapter adapter = getAdapter();
            ret.put("supported", adapter != null);
            ret.put("bluetoothEnabled", adapter != null && adapter.isEnabled());
            ret.put("scannerAvailable", adapter != null && adapter.isEnabled() && adapter.getBluetoothLeScanner() != null);
            ret.put("scanning", scanning);
            call.resolve(ret);
        } catch (Exception e) {
            rejectWithCode(call, "BLE_STATUS_FAILED", "Nie udało się sprawdzić statusu Bluetooth: " + safeMessage(e));
        }
    }

    @PluginMethod
    public void startScan(PluginCall call) {
        try {
            if (!hasBlePermissions()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    requestPermissionForAlias("nearby", call, "permissionCallback");
                } else {
                    requestPermissionForAlias("location", call, "permissionCallback");
                }
                return;
            }
            startScanInternal(call);
        } catch (SecurityException e) {
            rejectWithCode(call, "BLE_PERMISSION_DENIED", "Brak uprawnień Bluetooth. Nadaj aplikacji uprawnienie Urządzenia w pobliżu.");
        } catch (Exception e) {
            rejectWithCode(call, "BLE_SCAN_START_FAILED", "Nie udało się uruchomić skanowania BLE: " + safeMessage(e));
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        try {
            if (!hasBlePermissions()) {
                rejectWithCode(call, "BLE_PERMISSION_DENIED", "Brak uprawnień Bluetooth. Nadaj aplikacji uprawnienie Urządzenia w pobliżu.");
                return;
            }
            startScanInternal(call);
        } catch (Exception e) {
            rejectWithCode(call, "BLE_PERMISSION_DENIED", "Nie udało się potwierdzić uprawnień Bluetooth: " + safeMessage(e));
        }
    }

    @SuppressLint("MissingPermission")
    private void startScanInternal(PluginCall call) {
        BluetoothLeScanner activeScanner = getScannerOrReject(call);
        if (activeScanner == null) return;

        // Nie uruchamiaj kilku skanów jednocześnie po wielokrotnym kliknięciu.
        if (scanning && scanCallback != null) {
            JSObject ret = new JSObject();
            ret.put("active", true);
            ret.put("mode", "native-android-ble-advertising");
            ret.put("alreadyRunning", true);
            call.resolve(ret);
            return;
        }

        stopScanInternal(false);
        scanner = activeScanner;
        final int scanSeconds = Math.min(300, Math.max(10, call.getInt("scanSeconds", 75)));
        lastEmitAtByDevice.clear();
        lastPayloadByDevice.clear();

        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                safeHandleScanResult(result);
            }

            @Override
            public void onBatchScanResults(List<ScanResult> results) {
                if (results == null) return;
                for (ScanResult result : results) safeHandleScanResult(result);
            }

            @Override
            public void onScanFailed(int errorCode) {
                scanning = false;
                JSObject error = bleErrorEvent(errorCode);
                safeNotify("elaScanStopped", error);
            }
        };

        ScanSettings.Builder builder = new ScanSettings.Builder()
            // LOW_LATENCY potrafił zasypać WebView zdarzeniami i wywołać crash na słabszych telefonach.
            .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
            .setReportDelay(0);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            builder
                .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
                .setMatchMode(ScanSettings.MATCH_MODE_AGGRESSIVE)
                .setNumOfMatches(ScanSettings.MATCH_NUM_FEW_ADVERTISEMENT);
        }

        try {
            scanner.startScan(null, builder.build(), scanCallback);
            scanning = true;
        } catch (SecurityException e) {
            scanning = false;
            scanCallback = null;
            rejectWithCode(call, "BLE_PERMISSION_DENIED", "Brak uprawnień Bluetooth. Nadaj aplikacji uprawnienie Urządzenia w pobliżu.");
            return;
        } catch (IllegalStateException e) {
            scanning = false;
            scanCallback = null;
            rejectWithCode(call, "BLE_STATE_ERROR", "Bluetooth jest chwilowo niedostępny. Wyłącz i włącz Bluetooth, a potem spróbuj ponownie.");
            return;
        } catch (Exception e) {
            scanning = false;
            scanCallback = null;
            rejectWithCode(call, "BLE_SCAN_START_FAILED", "Nie udało się uruchomić skanowania BLE: " + safeMessage(e));
            return;
        }

        if (stopRunnable != null) handler.removeCallbacks(stopRunnable);
        stopRunnable = () -> stopScanInternal(true);
        handler.postDelayed(stopRunnable, scanSeconds * 1000L);

        JSObject ret = new JSObject();
        ret.put("active", true);
        ret.put("mode", "native-android-ble-advertising");
        ret.put("scanSeconds", scanSeconds);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        stopScanInternal(true);
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    @SuppressLint("MissingPermission")
    private void stopScanInternal(boolean notify) {
        try {
            if (stopRunnable != null) {
                handler.removeCallbacks(stopRunnable);
                stopRunnable = null;
            }
            if (scanner != null && scanCallback != null) {
                try { scanner.stopScan(scanCallback); } catch (Exception ignored) { }
            }
        } finally {
            scanner = null;
            scanCallback = null;
            scanning = false;
            if (notify) {
                JSObject ev = new JSObject();
                ev.put("reason", "stopped");
                safeNotify("elaScanStopped", ev);
            }
        }
    }

    private void safeHandleScanResult(ScanResult result) {
        try {
            handleScanResult(result);
        } catch (Exception e) {
            JSObject error = new JSObject();
            error.put("reason", "BLE_SCAN_RESULT_ERROR");
            error.put("code", "BLE_SCAN_RESULT_ERROR");
            error.put("message", "Nie udało się obsłużyć ramki BLE: " + safeMessage(e));
            safeNotify("elaScanStopped", error);
        }
    }

    @SuppressLint("MissingPermission")
    private void handleScanResult(ScanResult result) {
        if (result == null) return;
        ScanRecord record = result.getScanRecord();
        BluetoothDevice device = result.getDevice();
        if (record == null || device == null) return;

        String name = record.getDeviceName();
        if (name == null || name.length() == 0) name = safeDeviceName(device);
        SparseArray<byte[]> manufacturerData = record.getManufacturerSpecificData();
        Map<ParcelUuid, byte[]> serviceData = record.getServiceData();
        boolean elaPacket = isElaName(name) || hasElaServiceData(serviceData) || hasElaManufacturerData(manufacturerData);
        if (!elaPacket) return;

        String address = safeDeviceAddress(device);
        byte[] rawBytes = record.getBytes();
        String rawHex = bytesToHex(rawBytes);
        String key = address != null && address.length() > 0 ? address : (name != null ? name : rawHex);
        if (!shouldEmit(key, rawHex)) return;

        JSObject event = new JSObject();
        event.put("name", name != null ? name : "ELA Blue PUCK");
        event.put("deviceId", address != null ? address : key);
        event.put("address", address != null ? address : "");
        event.put("rssi", result.getRssi());
        event.put("timestamp", System.currentTimeMillis());
        event.put("rawAdvertisementHex", rawHex);

        JSObject serviceDataJson = new JSObject();
        if (serviceData != null) {
            for (Map.Entry<ParcelUuid, byte[]> entry : serviceData.entrySet()) {
                if (entry == null || entry.getKey() == null) continue;
                String uuid = entry.getKey().getUuid().toString().toLowerCase(Locale.ROOT);
                byte[] data = entry.getValue();
                serviceDataJson.put(uuid, bytesToHex(data));
                if (uuid.contains("2a6e")) {
                    Double temp = decodeSignedInt16LeDiv100(data);
                    if (temp != null) event.put("temperature", temp);
                }
                if (uuid.contains("2a6f")) {
                    Double humidity = decodeHumidityPercent(data);
                    if (humidity != null && humidity >= 0 && humidity <= 100) event.put("humidity", humidity);
                }
            }
        }
        event.put("serviceData", serviceDataJson);

        JSObject manufacturerJson = new JSObject();
        if (manufacturerData != null) {
            for (int i = 0; i < manufacturerData.size(); i++) {
                int companyId = manufacturerData.keyAt(i);
                byte[] data = manufacturerData.valueAt(i);
                String mKey = "0x" + String.format(Locale.ROOT, "%04X", companyId);
                manufacturerJson.put(mKey, bytesToHex(data));
                if (companyId == COMPANY_ELA && data != null && data.length >= 3) {
                    int batteryMv = uint16Le(data[data.length - 2], data[data.length - 1]);
                    if (batteryMv >= 1500 && batteryMv <= 4000) {
                        event.put("batteryVoltage", batteryMv);
                        int battery = Math.max(0, Math.min(100, Math.round(((batteryMv - 2000f) / 1200f) * 100f)));
                        event.put("battery", battery);
                        event.put("statusByte", data[0] & 0xFF);
                    }
                }
            }
        }
        event.put("manufacturerData", manufacturerJson);

        safeNotify("elaAdvertisement", event);
    }

    private BluetoothLeScanner getScannerOrReject(PluginCall call) {
        BluetoothManager manager;
        try {
            manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        } catch (Exception e) {
            rejectWithCode(call, "BLE_NOT_SUPPORTED", "Nie udało się uzyskać usługi Bluetooth na tym urządzeniu.");
            return null;
        }
        if (manager == null) {
            rejectWithCode(call, "BLE_NOT_SUPPORTED", "To urządzenie nie udostępnia Bluetooth BLE dla aplikacji.");
            return null;
        }
        BluetoothAdapter adapter = manager.getAdapter();
        if (adapter == null) {
            rejectWithCode(call, "BLE_NOT_SUPPORTED", "To urządzenie nie udostępnia Bluetooth BLE dla aplikacji.");
            return null;
        }
        if (!adapter.isEnabled()) {
            rejectWithCode(call, "BLE_OFF", "Bluetooth jest wyłączony. Włącz Bluetooth i spróbuj ponownie.");
            return null;
        }
        BluetoothLeScanner bleScanner;
        try {
            bleScanner = adapter.getBluetoothLeScanner();
        } catch (SecurityException e) {
            rejectWithCode(call, "BLE_PERMISSION_DENIED", "Brak uprawnień Bluetooth. Nadaj aplikacji uprawnienie Urządzenia w pobliżu.");
            return null;
        } catch (Exception e) {
            rejectWithCode(call, "BLE_SCANNER_NULL", "Skaner BLE jest niedostępny. Włącz Bluetooth, nadaj uprawnienia aplikacji i spróbuj ponownie.");
            return null;
        }
        if (bleScanner == null) {
            rejectWithCode(call, "BLE_SCANNER_NULL", "Skaner BLE jest niedostępny. Włącz Bluetooth, nadaj uprawnienia aplikacji i spróbuj ponownie.");
            return null;
        }
        return bleScanner;
    }

    private void safeNotify(String eventName, JSObject event) {
        handler.post(() -> {
            try { notifyListeners(eventName, event, true); } catch (Exception ignored) { }
        });
    }

    private JSObject bleErrorEvent(int errorCode) {
        JSObject error = new JSObject();
        String code = mapScanErrorCode(errorCode);
        error.put("reason", code);
        error.put("code", code);
        error.put("androidScanError", errorCode);
        error.put("message", mapScanErrorMessage(code));
        return error;
    }

    private String mapScanErrorCode(int errorCode) {
        switch (errorCode) {
            case 1: return "BLE_SCAN_ALREADY_STARTED";
            case 2: return "BLE_SCAN_REGISTRATION_FAILED";
            case 3: return "BLE_SCAN_INTERNAL_ERROR";
            case 4: return "BLE_FEATURE_UNSUPPORTED";
            case 5: return "BLE_OUT_OF_HARDWARE_RESOURCES";
            case 6: return "BLE_SCANNING_TOO_FREQUENTLY";
            default: return "BLE_SCAN_FAILED_" + errorCode;
        }
    }

    private String mapScanErrorMessage(String code) {
        if ("BLE_SCAN_ALREADY_STARTED".equals(code)) return "Skanowanie BLE już działa. Poczekaj chwilę albo zatrzymaj skanowanie.";
        if ("BLE_SCAN_REGISTRATION_FAILED".equals(code)) return "Android nie zarejestrował skanowania BLE. Zamknij aplikację i uruchom ją ponownie.";
        if ("BLE_SCAN_INTERNAL_ERROR".equals(code)) return "Wystąpił wewnętrzny błąd Bluetooth Androida. Wyłącz i włącz Bluetooth.";
        if ("BLE_FEATURE_UNSUPPORTED".equals(code)) return "Ten telefon nie obsługuje wymaganego trybu skanowania BLE.";
        if ("BLE_OUT_OF_HARDWARE_RESOURCES".equals(code)) return "Telefon ma zajęte zasoby Bluetooth. Zamknij inne aplikacje używające Bluetooth, np. nRF Connect.";
        if ("BLE_SCANNING_TOO_FREQUENTLY".equals(code)) return "Android zablokował zbyt częste skanowanie. Odczekaj 30–60 sekund i spróbuj ponownie.";
        return "Nie udało się uruchomić skanowania BLE.";
    }

    private void rejectWithCode(PluginCall call, String code, String message) {
        call.reject(code + ": " + message);
    }

    private String safeMessage(Exception e) {
        return e != null && e.getMessage() != null ? e.getMessage() : "brak szczegółów";
    }

    private boolean shouldEmit(String key, String rawHex) {
        long now = System.currentTimeMillis();
        Long lastAt = lastEmitAtByDevice.get(key);
        String lastPayload = lastPayloadByDevice.get(key);
        boolean payloadChanged = lastPayload == null || !lastPayload.equals(rawHex);
        long minGap = payloadChanged ? FAST_CHANGED_FRAME_MS : NORMAL_FRAME_MS;
        if (lastAt != null && now - lastAt < minGap) return false;
        lastEmitAtByDevice.put(key, now);
        lastPayloadByDevice.put(key, rawHex);
        return true;
    }

    private BluetoothAdapter getAdapter() {
        try {
            BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
            return manager != null ? manager.getAdapter() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private boolean hasBlePermissions() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                return getPermissionState("nearby") == PermissionState.GRANTED;
            }
            return getPermissionState("location") == PermissionState.GRANTED;
        } catch (Exception e) {
            return false;
        }
    }

    private String safeDeviceName(BluetoothDevice device) {
        try { return device.getName(); } catch (Exception e) { return null; }
    }

    private String safeDeviceAddress(BluetoothDevice device) {
        try { return device.getAddress(); } catch (Exception e) { return null; }
    }

    private boolean isElaName(String name) {
        if (name == null) return false;
        String n = name.toUpperCase(Locale.ROOT).trim();
        return n.startsWith("P T") || n.startsWith("P RHT") || n.startsWith("BPUCK") || n.startsWith("ELA");
    }

    private boolean hasElaServiceData(Map<ParcelUuid, byte[]> serviceData) {
        if (serviceData == null) return false;
        for (ParcelUuid parcelUuid : serviceData.keySet()) {
            if (parcelUuid == null) continue;
            String uuid = parcelUuid.getUuid().toString().toLowerCase(Locale.ROOT);
            if (uuid.contains("2a6e") || uuid.contains("2a6f")) return true;
        }
        return false;
    }

    private boolean hasElaManufacturerData(SparseArray<byte[]> manufacturerData) {
        return manufacturerData != null && manufacturerData.get(COMPANY_ELA) != null;
    }

    private static Double decodeSignedInt16LeDiv100(byte[] data) {
        if (data == null || data.length < 2) return null;
        short raw = ByteBuffer.wrap(data, 0, 2).order(ByteOrder.LITTLE_ENDIAN).getShort();
        double value = Math.round((raw / 100.0) * 100.0) / 100.0;
        return (value >= -80 && value <= 120) ? value : null;
    }

    private static Double decodeHumidityPercent(byte[] data) {
        if (data == null || data.length < 1) return null;

        // ELA Blue PUCK RHT z testowanych ramek nadaje wilgotność jako 1 bajt:
        // 04 16 6F 2A 33 => 0x33 = 51%.
        // Zostawiamy fallback uint16LE / 100 dla innych wersji firmware.
        double value = data.length == 1 ? (double) (data[0] & 0xFF) : uint16Le(data[0], data[1]) / 100.0;
        value = Math.round(value * 100.0) / 100.0;
        return (value >= 0 && value <= 100) ? value : null;
    }

    private static int uint16Le(byte lo, byte hi) {
        return (lo & 0xFF) | ((hi & 0xFF) << 8);
    }

    private static String bytesToHex(byte[] bytes) {
        if (bytes == null) return "";
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format(Locale.ROOT, "%02X", b));
        return sb.toString();
    }
}
