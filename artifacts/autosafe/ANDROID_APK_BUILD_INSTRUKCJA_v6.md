# Budowanie AutoSafe_Temperatura_v6 Android APK

## W Replit / repozytorium

Po zastosowaniu patcha uruchom w katalogu głównym repo:

```bash
cd ~/workspace
pnpm --filter @workspace/autosafe run typecheck
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/autosafe run build
cd artifacts/autosafe
npx cap sync android
```

## GitHub Actions

Workflow powinien mieć ustawione:

```yaml
env:
  PORT: 3000
  BASE_PATH: /
```

oraz Java 21 dla Gradle/Capacitor:

```yaml
- name: Setup Java 21
  uses: actions/setup-java@v4
  with:
    distribution: temurin
    java-version: 21
```

Po pushu do `main` workflow buduje debug APK:

```text
artifacts/autosafe/android/app/build/outputs/apk/debug/app-debug.apk
```

Pobierasz go z GitHub Actions z sekcji `Artifacts` jako:

```text
AutoSafe_Temperatura_v6_debug_apk
```

## Android Studio lokalnie

1. Otwórz katalog:

```text
artifacts/autosafe/android
```

2. Poczekaj na synchronizację Gradle.
3. Wybierz wariant `debug`.
4. Uruchom:

```text
Build → Build Bundle(s) / APK(s) → Build APK(s)
```

## Test na telefonie

1. Zainstaluj `app-debug.apk`.
2. Nadaj uprawnienia `Urządzenia w pobliżu / Bluetooth`.
3. Włącz Bluetooth w telefonie.
4. Otwórz aplikację.
5. Wejdź w Ustawienia → Diagnostyka Bluetooth:
   - tryb aplikacji powinien pokazać `Android APK`,
   - natywne BLE: dostępne,
   - Bluetooth: włączony,
   - po skanowaniu liczba ramek powinna rosnąć.
6. Kliknij `Szybki odczyt 30 s` albo `Odśwież wszystkie czujniki`.
7. Sprawdź temperaturę, wilgotność RHT, baterię i RSSI.

## Najważniejszy test stabilności

Aplikacja nie może zamykać się po kliknięciu odświeżania. Jeśli pojawi się błąd, sprawdź w Ustawieniach pole `Ostatni błąd BLE`.
