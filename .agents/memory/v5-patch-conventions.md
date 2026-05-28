---
name: v5 patch conventions
description: What changed in v5 and what to watch for in future patches.
---

## Key v5 changes
- `themeService.ts` — new service, exports `applyTheme`, `subscribeSystemTheme`, `THEME_STORAGE_EVENT`, `resolveTheme`, `notifyThemeChanged`.
- `AppErrorBoundary.tsx` — new component wrapping the router in App.tsx.
- `storageService.ts` — now imports `notifyThemeChanged` from themeService; exports `migrateLegacyStorage`, `K`, `DEFAULT_SETTINGS`, `exportLocalData`, `importLocalData`, `clearAllLocalData`, `measurementsToCsv`.
- `main.tsx` — calls `migrateLegacyStorage()` + `applyTheme()` before mounting React.
- `sensorProfiles.ts` — exports `ELA_ENVIRONMENTAL_SERVICE_UUID`, `ELA_TEMP_UUID`, `ELA_HUMIDITY_UUID`, `COMPANY_IDS`, `ALL_COMPANY_IDS`, `decodeELAManufacturerFrame`, `decodeELAServiceFrame`, `detectProfileByCompanyId`, `detectProfileByName`.
- `bluetoothService.ts` — exports `ScanMode` type; `scanForDevice` accepts a `ScanMode` param; `connectGATTWithNotifications` added.
- Demo mode defaults to `false`; theme defaults to `"system"`.
- Storage keys all under `thermo.v2.*`.

## Recurring TS pitfalls (fixed in v5 patch itself — no manual intervention needed)
- `export type { AppSettings }` is already in storageService.ts v5.
- `BluetoothDevice` global type handled inside bluetoothService via `(window as unknown as ...)` pattern.
- `formatTemp` accepts `number | undefined` — callers can pass `?? undefined`.

## v5.6.2–v5.6.4 specific fixes
- `K` must stay `export const K` — `demoService.ts` imports it directly. Patch v5.6.2 removed the `export`, but that breaks the build.
- Polish curly quotes `„..."` inside JSX string literals (straight-quote delimited) confuse esbuild's parser. Use template literals (backticks) when embedding `„`, `"` (U+201E/U+201D) inside JSX expressions.
- `supportsHumidity` flag on `SensorProfile` controls whether humidity tile renders in SensorCard v5.6.4. ELA T = false (tile hidden), ELA RHT = true.
- `compact` prop now hides Pin/Mute buttons (only RefreshCw shown) — DashboardPage passes `compact` to all cards in main grid and pinned section.

**Why:** Each zip patch tends to re-introduce the same TypeScript issues unless the patch itself already contains the fixes (v5 does).
**How to apply:** After applying a future patch, always run `PORT=3000 BASE_PATH=/autosafe pnpm run build` from `artifacts/autosafe`. If errors appear, check the four categories above first.
