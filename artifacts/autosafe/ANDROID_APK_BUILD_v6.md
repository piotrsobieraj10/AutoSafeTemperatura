# AutoSafe_Temperatura_v6 Android APK

Ten patch przygotowuje aplikację **AutoSafe Temperatura** jako normalną aplikację Android APK z natywnym skanowaniem BLE dla ELA Blue PUCK T/RHT.

## Co dodaje v6

- Capacitor config: `capacitor.config.ts`
- natywny plugin Android: `AutosafeBlePlugin.java`
- rejestrację pluginu w `MainActivity.java`
- uprawnienia Android dla Bluetooth LE
- natywne skanowanie reklam BLE bez ograniczeń PWA/Chrome
- dekodowanie ramek ELA:
  - `0x2A6E` temperatura `int16LE / 100`
  - `0x2A6F` wilgotność `uint16LE / 100`
  - `0x0757` bateria mV z ostatnich 2 bajtów Manufacturer Data
- wersję UI: `AutoSafe_Temperatura_v6`

## Jak zastosować w Replit

Z katalogu `artifacts/autosafe` uruchom:

```bash
npm install
npm run build
```

Pierwsze przygotowanie Androida:

```bash
npm run android:init
```

Jeżeli platforma Android już istnieje:

```bash
npm run android:sync
```

Budowanie debug APK:

```bash
npm run android:apk:debug
```

Gotowy plik powinien powstać tutaj:

```text
artifacts/autosafe/android/app/build/outputs/apk/debug/app-debug.apk
```

## Test na telefonie

1. Skopiuj `app-debug.apk` na telefon Android.
2. Zainstaluj APK.
3. Nadaj uprawnienia: Bluetooth / Urządzenia w pobliżu.
4. Otwórz aplikację.
5. Dodaj czujnik `P T EN...` lub `P RHT...`.
6. Kliknij **Odśwież wszystkie czujniki** albo **Odśwież odczyt**.

W APK aplikacja korzysta z natywnego Android BLE, więc nie musi polegać na eksperymentalnym `watchAdvertisements()` w Chrome.
