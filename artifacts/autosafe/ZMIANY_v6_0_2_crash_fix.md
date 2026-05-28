# AutoSafe_Temperatura_v6.0.2_crash_fix

Hotfix dla wersji Android APK po analizie aktualnej paczki z GitHuba.

## Przyczyna problemu
APK uruchamiała się poprawnie, ale mogła crashować po kliknięciu „Odśwież wszystkie czujniki”, ponieważ natywny plugin BLE:

- uruchamiał skan w trybie `SCAN_MODE_LOW_LATENCY`, który potrafi wygenerować bardzo dużo ramek BLE,
- wysyłał zdarzenia `notifyListeners` bezpośrednio z callbacków skanera BLE,
- nie ograniczał częstotliwości eventów per czujnik,
- nie zabezpieczał wszystkich miejsc `ScanCallback`, `ScanRecord`, `getAddress`, `getName`, `startScan` i `notifyListeners` przed wyjątkami,
- miał osobną kopię template pluginu w `native/android`, która mogła przy kolejnym patchowaniu Androida nadpisać poprawioną wersję.

## Co poprawiono

- `AutosafeBlePlugin.java` w katalogu Android oraz w template `native/android`.
- `notifyListeners` idzie przez główny wątek Androida (`Handler` / `Looper.getMainLooper()`).
- Dodano `safeHandleScanResult`, `safeNotify`, bezpieczny odczyt nazwy/adresu urządzenia.
- Zmieniono skan z `SCAN_MODE_LOW_LATENCY` na stabilniejszy `SCAN_MODE_BALANCED`.
- Dodano throttle ramek BLE per czujnik, żeby nie zalać WebView eventami.
- Blokada wielokrotnego startu skanowania, gdy skan już działa.
- Czyszczenie zaplanowanego stop-timera przy zatrzymaniu / ponownym starcie skanowania.
- Dalej zachowane dekodowanie:
  - `0x2A6E` temperatura `int16LE / 100`,
  - `0x2A6F` wilgotność `uint16LE / 100`,
  - `0x0757` bateria mV.
- Wersja UI ustawiona na `AutoSafe_Temperatura_v6.0.2_crash_fix`.

## Test

Po wgraniu patcha:

```bash
pnpm --filter @workspace/autosafe run build
cd artifacts/autosafe
npx cap sync android
```

Następnie commit/push i GitHub Actions powinno zbudować nowe APK.
