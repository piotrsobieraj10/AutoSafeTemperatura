# AutoSafe_Temperatura_v6 Android APK

Zakres patcha:

- przygotowanie aplikacji pod Android APK przez Capacitor,
- dodanie natywnego pluginu `AutosafeBlePlugin` dla Android BLE Advertising,
- natywne odczyty ELA Blue PUCK T/RHT bez ograniczeń PWA/Chrome,
- zachowanie obecnego UI, logo i logiki PWA,
- fallback: w przeglądarce nadal działa Web Bluetooth z poprzednich wersji,
- dekodery bez zmian: `0x2A6E` temperatura, `0x2A6F` wilgotność, `0x0757` bateria,
- wersja UI: `AutoSafe_Temperatura_v6_Android_APK`.

Ten patch nie zawiera gotowego pliku `.apk`, bo APK musi zostać zbudowany w środowisku z Android SDK/Gradle. Patch zawiera jednak wszystko, żeby Replit/Android Studio/GitHub Actions mogły zbudować APK.
