#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[AutoSafe v6] Instaluję zależności i buduję PWA..."
npm install
npm run build

if [ ! -d android ]; then
  echo "[AutoSafe v6] Dodaję platformę Android przez Capacitor..."
  npx cap add android
fi

echo "[AutoSafe v6] Wgrywam natywny plugin BLE i synchronizuję Android..."
node scripts/patch-android-v6.mjs
npx cap sync android
node scripts/patch-android-v6.mjs

echo "[AutoSafe v6] Buduję debug APK..."
cd android
./gradlew assembleDebug

echo "Gotowe. APK powinien być tutaj:"
echo "android/app/build/outputs/apk/debug/app-debug.apk"
