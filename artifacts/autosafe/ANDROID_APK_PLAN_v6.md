# AutoSafe_Temperatura_v6 — plan Android APK

Cel: przenieść stabilny interfejs PWA do aplikacji Android, ale odczyt BLE zrobić natywnie, żeby nie zależeć od ograniczeń Chrome/PWA.

## Technologia

- React + obecny UI jako baza,
- Capacitor jako opakowanie Android,
- natywna obsługa Bluetooth Low Energy po stronie Androida,
- skanowanie reklam BLE bez wymuszania wyboru urządzenia w Chrome.

## Uprawnienia Android

Do sprawdzenia i dodania w `AndroidManifest.xml`:

- `BLUETOOTH_SCAN`,
- `BLUETOOTH_CONNECT`,
- `ACCESS_FINE_LOCATION` zależnie od wersji Androida i użytej biblioteki,
- obsługa zgód runtime w aplikacji.

## Dekodery ELA Blue PUCK

Zachować aktualnie potwierdzony format ramek:

- Service Data `0x2A6E`: temperatura `int16LE / 100`,
- Service Data `0x2A6F`: wilgotność `uint16LE / 100`,
- Manufacturer Data companyId `0x0757`: bateria w mV z ostatnich dwóch bajtów / zgodnie z aktualnym dekoderem.

## Funkcje APK

1. Skanuj wszystkie czujniki ELA w zasięgu.
2. Dopasuj czujniki po nazwie `P T EN...`, `P RHT...`.
3. Aktualizuj temperaturę, wilgotność, baterię, RSSI i `lastSeenAt` bez ręcznego ponownego wyboru.
4. Zachowuj ostatnie dane między ramkami.
5. Umożliwiaj monitoring ciągły, gdy aplikacja jest otwarta.
6. W kolejnym kroku rozważyć monitoring w tle jako usługę Android foreground service.

## Testy v6

- test na minimum 2 czujnikach `P T EN`,
- test na minimum 1 czujniku RHT,
- test baterii, temperatury i RSSI,
- test odświeżenia aplikacji,
- test utraty i powrotu zasięgu,
- test eksportu/backupów po migracji.
