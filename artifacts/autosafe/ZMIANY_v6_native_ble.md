# AutoSafe_Temperatura_v6 — natywne BLE Android APK

Zakres patcha:

- Ustawia wersję UI na `AutoSafe_Temperatura_v6`.
- Zachowuje wersję PWA/web jako zapas, ale w APK używa natywnego skanowania BLE telefonu przez Capacitor.
- Nie korzysta z okna Chrome CONNECT do odczytu ELA Blue PUCK w APK.
- Utrzymuje natywny plugin `AutosafeBlePlugin`, bo daje bezpośredni dostęp do `ScanRecord`, `Service Data` i `Manufacturer Data`, czyli do danych potrzebnych dla ELA Blue PUCK.
- Dodaje stabilizację skanowania Android BLE:
  - `SCAN_MODE_BALANCED` zamiast agresywnego `LOW_LATENCY`,
  - throttling ramek na urządzenie,
  - eventy wysyłane do JS przez główny wątek Androida,
  - zabezpieczenia przed nullami, brakiem uprawnień i błędami skanera.
- Wykrywa czujniki ELA po nazwach:
  - `P T EN...`,
  - `P RHT...`,
  - `ELA`,
  - `PUCK`,
  - `BPUCK`.
- Zachowuje dekodery:
  - `0x2A6E` = temperatura `int16LE / 100`,
  - `0x2A6F` = wilgotność `uint16LE / 100`,
  - `0x0757` = bateria w mV z ostatnich dwóch bajtów manufacturer data.
- Aplikacja nadal nie kasuje wcześniejszej temperatury, wilgotności ani baterii, gdy kolejna ramka BLE zawiera tylko część danych.
- Dodaje diagnostykę natywnego BLE w ustawieniach:
  - tryb aplikacji APK/PWA,
  - natywne BLE dostępne/niedostępne,
  - Bluetooth włączony/wyłączony,
  - uprawnienia,
  - skanowanie aktywne/zatrzymane,
  - liczba odebranych ramek,
  - ostatni czujnik,
  - RSSI,
  - ostatni odczyt,
  - ostatni błąd.
- Manifest Androida zawiera uprawnienia BLE oraz `neverForLocation` dla `BLUETOOTH_SCAN`.

Nie zmieniano:

- wyglądu premium AutoSafe,
- złotego logo,
- dashboardu,
- historii,
- eksportu CSV,
- backup/import JSON,
- raportu PDF/druk,
- PWA jako zapasowej wersji web.

Uwaga techniczna:

Nie dokładano zależności `@capacitor-community/bluetooth-le`, ponieważ aktualny projekt ma już natywny plugin Capacitor. Ten plugin czyta surowe ramki Android `ScanRecord`, co jest najpewniejsze dla ELA Blue PUCK T/RHT i nie wymaga zmiany `pnpm-lock.yaml`. Jeżeli później zechcesz wymienić plugin na community package, trzeba będzie zaktualizować zależności i lockfile oraz ponownie przejść testy APK.
