#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const androidDir = path.join(root, "android");
if (!fs.existsSync(androidDir)) {
  console.error("Brak katalogu android/. Najpierw uruchom: npx cap add android");
  process.exit(1);
}

const javaDir = path.join(androidDir, "app/src/main/java/im/autosafe/temperatura");
fs.mkdirSync(javaDir, { recursive: true });
fs.copyFileSync(path.join(root, "native/android/AutosafeBlePlugin.java"), path.join(javaDir, "AutosafeBlePlugin.java"));
fs.copyFileSync(path.join(root, "native/android/MainActivity.java"), path.join(javaDir, "MainActivity.java"));

const manifestPath = path.join(androidDir, "app/src/main/AndroidManifest.xml");
let manifest = fs.readFileSync(manifestPath, "utf8");
const permissions = `
    <uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
`;
if (!manifest.includes("android.permission.BLUETOOTH_SCAN")) {
  manifest = manifest.replace(/<application\b/, `${permissions}\n    <application`);
}
manifest = manifest.replace(/android:label="[^"]*"/, 'android:label="AutoSafe Temperatura"');
fs.writeFileSync(manifestPath, manifest);

const stringsPath = path.join(androidDir, "app/src/main/res/values/strings.xml");
if (fs.existsSync(stringsPath)) {
  let strings = fs.readFileSync(stringsPath, "utf8");
  strings = strings.replace(/<string name="app_name">.*?<\/string>/, '<string name="app_name">AutoSafe Temperatura</string>');
  fs.writeFileSync(stringsPath, strings);
}

console.log("AutoSafe_Temperatura_v6: Android native BLE plugin applied.");
console.log("Next: npx cap sync android && cd android && ./gradlew assembleDebug");
