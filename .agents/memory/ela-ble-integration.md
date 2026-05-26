---
name: ELA Blue Puck T integration
description: Architecture decisions from applying the ELA BLE advertisement patch.
---

## AppSettings location
`AppSettings` is defined in `src/types/sensor.ts` and re-exported from `src/services/storageService.ts` via `export type { AppSettings } from "@/types/sensor"`. Pages import it from `storageService` (matches the patch's import pattern).

**Why:** Patch moved AppSettings to types. Keeping the re-export in storageService prevents breaking any existing import.

**How to apply:** Always import `AppSettings` from `@/services/storageService` (not directly from types) in pages/components, for consistency with the patch.

## Storage key versioning
Keys bumped from `thermo.*.v1` → `thermo.*.v2` alongside ELA patch. Old browser data is discarded on first load (clean start).

## ThemeMode removed
Old `ThemeMode = "auto" | "light" | "dark"` removed. Theme is now `"light" | "dark"` only. `themeService.ts` accepts the simpler type directly.

## SensorProfile: decode → decodeGatt / decodeAdvertisement
Old `.decode()` method renamed. GATT profiles use `decodeGatt`, advertisement profiles use `decodeAdvertisement`. `readWithProfile()` throws for advertisement profiles.

## Demo sensors are ELA advertisement
Demo sensors use `source: "ela-advertisement"`, `profileId: "ela-blue-puck-t"`, include `macAddress` and `batteryLevel`, no `humidity` field.
