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

**Why:** Each zip patch tends to re-introduce the same TypeScript issues unless the patch itself already contains the fixes (v5 does).
**How to apply:** After applying a future patch, always run `pnpm exec tsc --noEmit` from `artifacts/autosafe`. If errors appear, check the three categories above first.
