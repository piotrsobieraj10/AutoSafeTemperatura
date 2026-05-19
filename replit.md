# AutoSafe Temperatura

Aplikacja do monitorowania temperatury i wilgotności przez Bluetooth BLE. Lokalne przechowywanie danych, historia pomiarów, alerty progowe i obsługa wielu czujników Bluetooth Low Energy.

## Run & Operate

- `pnpm --filter @workspace/autosafe run dev` — uruchom aplikację frontendową (port 20512)
- `pnpm --filter @workspace/api-server run dev` — uruchom serwer API (port 8080, opcjonalny)
- `pnpm run typecheck` — pełny typecheck wszystkich pakietów

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + TanStack Router (client-side)
- Styling: Tailwind CSS v4 (oklch color system, czarno-złoty motyw AutoSafe)
- Charts: Recharts
- Powiadomienia: Sonner
- Dane: localStorage (brak backendu — 100% client-side)

## Where things live

- `artifacts/autosafe/` — główna aplikacja webowa
- `artifacts/autosafe/src/services/` — serwisy: localStorage, Bluetooth, demo, profile czujników
- `artifacts/autosafe/src/components/` — komponenty UI (AppShell, SensorCard, TemperatureChart, AddSensorModal, BrandMark)
- `artifacts/autosafe/src/pages/` — strony: Dashboard, Czujniki, Historia, Ustawienia
- `artifacts/autosafe/src/hooks/useSensors.ts` — hook do stanu czujników
- `artifacts/autosafe/src/types/sensor.ts` — typy TypeScript

## Architecture decisions

- **Brak backendu** — cała logika w przeglądarce, dane w localStorage. Nie wymaga serwera.
- **TanStack Router (client-side)** — zamiast TanStack Start (SSR). Prostsze dla aplikacji offline-first.
- **Demo mode** — domyślnie włączony, generuje 4 wirtualne czujniki (Salon, Garaż, Sypialnia, Kotłownia) z losowymi odczytami co 5 sekund.
- **Tailwind v4 + oklch** — czarno-złoty motyw AutoSafe z gradientami per-status (cold/ok/warm/hot).
- **Web Bluetooth API** — obsługa prawdziwych czujników BLE (Xiaomi LYWSD03MMC, GATT ESS, Health Thermometer) przez przeglądarkę Chrome/Edge.

## Product

- Dashboard z podglądem wszystkich pomieszczeń i statystykami
- Karty czujników z gradientem wg statusu temperatury
- Strona Czujniki: dodawanie (skan BT lub ręcznie po MAC), edycja profili i progów alertów
- Historia pomiarów z wykresami (Recharts) i eksportem CSV
- Ustawienia: motyw, tryb demo, interwały odczytu, backup/restore JSON

## User preferences

_Aplikacja po polsku, interfejs i komunikaty w języku polskim._

## Gotchas

- Web Bluetooth wymaga Chrome/Edge na Android/Desktop. iOS nie jest wspierany przez przeglądarki.
- Przeglądarka ukrywa prawdziwy MAC — aplikacja zapisuje `device.id`; MAC można dopisać ręcznie.
- Do monitoringu 24/7 potrzebny gateway BLE (Raspberry Pi / ESP32).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
