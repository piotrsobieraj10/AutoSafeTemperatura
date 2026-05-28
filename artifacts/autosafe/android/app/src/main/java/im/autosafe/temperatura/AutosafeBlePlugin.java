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
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.SparseArray;

import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
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
    private static final String UUID_TEMP = "00002a6e-0000-1000-8000-00805f9b34fb";
    private static final String UUID_HUMIDITY = "00002a6f-0000-1000-8000-00805f9b34fb";

    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean scanning = false;

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        BluetoothAdapter adapter = getAdapter();
        ret.put("supported", adapter != null);
        ret.put("bluetoothEnabled", adapter != null && adapter.isEnabled());
        ret.put("scanning", scanning);
        call.resolve(ret);
    }

    @PluginMethod
    public void startScan(PluginCall call) {
        if (!hasBlePermissions()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                requestPermissionForAlias("nearby", call, "permissionCallback");
            } else {
                requestPermissionForAlias("location", call, "permissionCallback");
            }
            return;
        }
        startScanInternal(call);
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (!hasBlePermissions()) {
            call.reject("Brak uprawnień Bluetooth. Nadaj zgodę na Urządzenia w pobliżu / Bluetooth.");
            return;
        }
        startScanInternal(call);
    }

    @SuppressLint("MissingPermission")
    private void startScanInternal(PluginCall call) {
        BluetoothAdapter adapter = getAdapter();
        if (adapter == null) {
            call.reject("Ten telefon nie obsługuje Bluetooth LE.");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Bluetooth jest wyłączony. Włącz Bluetooth i spróbuj ponownie.");
            return;
        }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            call.reject("Nie udało się uruchomić skanera BLE.");
            return;
        }

        stopScanInternal(false);
        int scanSeconds = call.getInt("scanSeconds", 75);

        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                handleScanResult(result);
            }

            @Override
            public void onBatchScanResults(List<ScanResult> results) {
                for (ScanResult result : results) handleScanResult(result);
            }

            @Override
            public void onScanFailed(int errorCode) {
                JSObject error = new JSObject();
                error.put("reason", "scan_failed_" + errorCode);
                notifyListeners("elaScanStopped", error, true);
                scanning = false;
            }
        };

        ScanSettings settings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setReportDelay(0)
            .build();

        scanner.startScan(null, settings, scanCallback);
        scanning = true;
        handler.postDelayed(() -> stopScanInternal(true), Math.max(10, scanSeconds) * 1000L);

        JSObject ret = new JSObject();
        ret.put("active", true);
        ret.put("mode", "native-android-ble-advertising");
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
        if (scanner != null && scanCallback != null) {
            try { scanner.stopScan(scanCallback); } catch (Exception ignored) {}
        }
        scanner = null;
        scanCallback = null;
        scanning = false;
        if (notify) {
            JSObject ev = new JSObject();
            ev.put("reason", "stopped");
            notifyListeners("elaScanStopped", ev, true);
        }
    }

    @SuppressLint("MissingPermission")
    private void handleScanResult(ScanResult result) {
        ScanRecord record = result.getScanRecord();
        BluetoothDevice device = result.getDevice();
        if (record == null || device == null) return;

        String name = record.getDeviceName();
        if (name == null || name.length() == 0) name = device.getName();
        if (!isElaName(name)) return;

        JSObject event = new JSObject();
        event.put("name", name);
        event.put("deviceId", device.getAddress());
        event.put("address", device.getAddress());
        event.put("rssi", result.getRssi());
        event.put("timestamp", System.currentTimeMillis());
        event.put("rawAdvertisementHex", bytesToHex(record.getBytes()));

        JSObject serviceDataJson = new JSObject();
        Map<ParcelUuid, byte[]> serviceData = record.getServiceData();
        if (serviceData != null) {
            for (Map.Entry<ParcelUuid, byte[]> entry : serviceData.entrySet()) {
                String uuid = entry.getKey().getUuid().toString().toLowerCase(Locale.ROOT);
                byte[] data = entry.getValue();
                serviceDataJson.put(uuid, bytesToHex(data));
                if (uuid.contains("2a6e")) {
                    Double temp = decodeSignedInt16LeDiv100(data);
                    if (temp != null) event.put("temperature", temp);
                }
                if (uuid.contains("2a6f")) {
                    Double humidity = decodeUnsignedInt16LeDiv100(data);
                    if (humidity != null && humidity >= 0 && humidity <= 100) event.put("humidity", humidity);
                }
            }
        }
        event.put("serviceData", serviceDataJson);

        JSObject manufacturerJson = new JSObject();
        SparseArray<byte[]> manufacturerData = record.getManufacturerSpecificData();
        if (manufacturerData != null) {
            for (int i = 0; i < manufacturerData.size(); i++) {
                int companyId = manufacturerData.keyAt(i);
                byte[] data = manufacturerData.valueAt(i);
                String key = "0x" + String.format(Locale.ROOT, "%04X", companyId);
                manufacturerJson.put(key, bytesToHex(data));
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

        notifyListeners("elaAdvertisement", event, true);
    }

    private BluetoothAdapter getAdapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager != null ? manager.getAdapter() : null;
    }

    private boolean hasBlePermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return getPermissionState("nearby") == PermissionState.GRANTED;
        }
        return getPermissionState("location") == PermissionState.GRANTED;
    }

    private boolean isElaName(String name) {
        if (name == null) return false;
        String n = name.toUpperCase(Locale.ROOT).trim();
        return n.startsWith("P T") || n.startsWith("P RHT") || n.startsWith("BPUCK") || n.startsWith("ELA");
    }

    private static Double decodeSignedInt16LeDiv100(byte[] data) {
        if (data == null || data.length < 2) return null;
        short raw = ByteBuffer.wrap(data, 0, 2).order(ByteOrder.LITTLE_ENDIAN).getShort();
        double value = Math.round((raw / 100.0) * 100.0) / 100.0;
        return (value >= -80 && value <= 120) ? value : null;
    }

    private static Double decodeUnsignedInt16LeDiv100(byte[] data) {
        if (data == null || data.length < 2) return null;
        int raw = uint16Le(data[0], data[1]);
        return Math.round((raw / 100.0) * 100.0) / 100.0;
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
