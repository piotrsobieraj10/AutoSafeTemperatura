// components/SensorCard.tsx v5.6.4 — UX final: prostsze karty, ludzkie komunikaty i ukryta wilgotność dla ELA T
import type { ComponentType } from "react";
import type { Sensor, TempZone } from "@/types/sensor";
import { getTempZone, ZONE_LABELS } from "@/types/sensor";
import { formatBattery, formatHumidity, getBatteryLabel, getSettings } from "@/services/storageService";
import { getProfile } from "@/services/sensorProfiles";
import { APP_VERSION } from "@/config/app";
import {
  Activity, BatteryFull, BatteryLow, BatteryMedium, Bell, BellOff, CircleDot, Droplets,
  Gauge, Home, Leaf, Pin, Radio, RefreshCw, Thermometer, ThermometerSun,
  Warehouse, Wifi, WifiOff, Wind,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  sensor: Sensor;
  onClick?: () => void;
  onTogglePin?: () => void;
  onToggleMute?: () => void;
  onListen?: () => void;
  compact?: boolean;
}

type ReadState = "online" | "scanning" | "waiting" | "stale" | "offline";

const FRESH_MS = 120_000;
const STALE_MS = 5 * 60_000;

const ZONE_GRADIENT: Record<TempZone, string> = {
  frozen: "bg-gradient-frozen", cold: "bg-gradient-cold", cool: "bg-gradient-cool", ok: "bg-gradient-ok",
  warm: "bg-gradient-warm", hot: "bg-gradient-hot", danger: "bg-gradient-danger", offline: "bg-gradient-offline",
};

const PROFILE_ICON: Record<string, ComponentType<{ className?: string }>> = {
  radio: Radio, droplets: Droplets, "circle-dot": CircleDot, gauge: Gauge,
  thermometer: Thermometer, activity: Activity, leaf: Leaf, wind: Wind,
};

const LOCATION_ICON: Record<string, ComponentType<{ className?: string }>> = {
  home: Home, bed: Home, kitchen: Home, bath: Droplets, garage: Warehouse, boiler: ThermometerSun,
  warehouse: Warehouse, leaf: Leaf, sensor: Radio,
};

function BatteryIcon({ level, mv }: { level?: number; mv?: number }) {
  const cls = "h-3.5 w-3.5";
  const value = level ?? (mv != null ? Math.round(((mv - 2000) / 1200) * 100) : undefined);
  if (value == null) return <BatteryMedium className={cn(cls, "opacity-60")} />;
  if (value < 20) return <BatteryLow className={cn(cls, "text-red-200")} />;
  if (value < 50) return <BatteryMedium className={cls} />;
  return <BatteryFull className={cls} />;
}

function RssiBars({ rssi }: { rssi?: number }) {
  if (rssi == null) return <WifiOff className="h-3.5 w-3.5" />;
  const strength = rssi > -60 ? 3 : rssi > -75 ? 2 : 1;
  return (
    <span className="flex h-3.5 items-end gap-[2px]">
      {[1, 2, 3].map((b) => (
        <span key={b} className={cn("w-[3px] rounded-sm transition-all", b <= strength ? "bg-current opacity-100" : "bg-current opacity-25")} style={{ height: `${b * 4}px` }} />
      ))}
    </span>
  );
}

function formatRelTime(iso?: string): string {
  if (!iso) return "—";
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const s = (Date.now() - timestamp) / 1000;
  if (s < 30) return "przed chwilą";
  if (s < 60) return `${Math.floor(s)}s temu`;
  if (s < 3600) return `${Math.floor(s / 60)} min temu`;
  if (s < 86400) return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "short" });
}

function toTempDisplay(c: number, unit: "C" | "F") {
  const v = unit === "F" ? (c * 9 / 5 + 32) : c;
  return (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
}

const signalLabel = (rssi?: number) => {
  if (rssi == null) return "czekam na RSSI";
  if (rssi > -60) return "doskonały sygnał";
  if (rssi > -75) return "dobry sygnał";
  if (rssi > -90) return "słaby sygnał";
  return "bardzo słaby sygnał";
};

function cleanLabel(value?: string): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function profileShortName(profileName?: string, profileId?: string): string {
  const src = `${profileName ?? ""} ${profileId ?? ""}`.toLowerCase();
  if (src.includes("rht")) return "ELA RHT · temp. + wilg.";
  if (src.includes("puck") || src.includes("ela")) return "ELA T · temperatura";
  if (src.includes("gatt")) return "GATT";
  return (profileName ?? "").replace(/ELA\s+Blue\s+Puck/gi, "ELA").replace(/standardowy\s+termometr\s+zdrowia\s+GATT/gi, "GATT").trim();
}

function getReadState(sensor: Sensor): ReadState {
  if (sensor.status === "scanning") return "scanning";
  if (!sensor.lastReadAt) return sensor.status === "pending" ? "waiting" : "waiting";
  const age = Date.now() - new Date(sensor.lastReadAt).getTime();
  if (!Number.isFinite(age)) return "waiting";
  if (age <= FRESH_MS) return "online";
  if (age <= STALE_MS) return "stale";
  return "offline";
}

const STATE_LABEL: Record<ReadState, string> = {
  online: "Online",
  scanning: "Nasłuch",
  waiting: "Oczekuje",
  stale: "Stare dane",
  offline: "Offline",
};

const STATE_HINT: Record<ReadState, string> = {
  online: "świeży odczyt",
  scanning: "nasłuch BLE aktywny",
  waiting: "czekam na pierwszą ramkę",
  stale: "ostatni odczyt nie jest świeży",
  offline: "brak odczytu ponad 5 min",
};

function statePillClass(state: ReadState) {
  if (state === "online") return "bg-emerald-300/24 text-white";
  if (state === "scanning") return "bg-primary/30 text-white";
  if (state === "stale") return "bg-amber-300/25 text-white";
  if (state === "offline") return "bg-white/12 text-white/80";
  return "bg-white/16 text-white/85";
}

export function SensorCard({ sensor, onClick, onTogglePin, onToggleMute, onListen, compact = false }: Props) {
  const settings = getSettings();
  const readState = getReadState(sensor);
  const zone = getTempZone(sensor.lastTemperature, sensor.minTempAlert, sensor.maxTempAlert);
  const displayZone: TempZone = sensor.lastTemperature == null ? "offline" : zone;
  const mutedTone = readState === "offline" || readState === "waiting";
  const profile = getProfile(sensor.profileId);
  const Icon = LOCATION_ICON[sensor.locationIcon ?? ""] ?? PROFILE_ICON[profile?.icon ?? "thermometer"] ?? Thermometer;
  const battery = getBatteryLabel(sensor.batteryVoltage, sensor.batteryLevel);
  const showDebug = settings.showBleDiagnostics === true;
  const roomLabel = cleanLabel(sensor.roomName) || "Czujnik";
  const customLabel = cleanLabel(sensor.customName);
  const bluetoothLabel = cleanLabel(sensor.bluetoothName) || cleanLabel(profile?.name) || "Czujnik BLE";
  const profileLabel = profileShortName(profile?.name, sensor.profileId);
  const supportsHumidity = Boolean(profile?.supportsHumidity || sensor.profileId?.toLowerCase().includes("rht") || sensor.lastHumidity != null);
  const tempCardClass = supportsHumidity ? "" : "col-span-2";
  const lastReadText = formatRelTime(sensor.lastReadAt);

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-[1.65rem] noise transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-glow cursor-pointer",
      ZONE_GRADIENT[displayZone],
    )} onClick={onClick}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 left-0 h-28 w-28 rounded-full bg-white/8 blur-2xl" />

      <div className="absolute right-3 top-3 z-10 flex gap-1 opacity-100">
        {onListen && !sensor.isDemo && (
          <button onClick={(e) => { e.stopPropagation(); onListen(); }} title="Odśwież odczyt"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/85 backdrop-blur hover:bg-white/25 hover:text-white">
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        {!compact && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onTogglePin?.(); }} title={sensor.isPinned ? "Odepnij" : "Przypnij"} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/85 backdrop-blur hover:bg-white/25 hover:text-white">
              <Pin className={cn("h-4 w-4", sensor.isPinned && "fill-current")} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onToggleMute?.(); }} title={sensor.alertMuted ? "Włącz alerty" : "Wycisz alerty"} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/85 backdrop-blur hover:bg-white/25 hover:text-white">
              {sensor.alertMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            </button>
          </>
        )}
      </div>

      <div className={cn("relative p-4 text-white sm:p-5", mutedTone && "text-white/82", compact && "p-4")}> 
        <div className={cn("flex items-start gap-3", compact ? "pr-10" : "pr-24 sm:pr-28")}>
          <div className="min-w-0 flex-1">
            <p className="max-w-[16rem] whitespace-normal break-words text-[10px] font-semibold uppercase leading-snug tracking-[0.11em] opacity-72 sm:max-w-full sm:text-[11px]" title={bluetoothLabel}>
              {bluetoothLabel}
            </p>
            <h3 className="mt-1 max-w-[18rem] whitespace-normal break-words font-display text-[1.55rem] font-black leading-[1.05] tracking-tight sm:max-w-full sm:text-[1.9rem]" title={customLabel ? `${roomLabel} — ${customLabel}` : roomLabel}>
              {roomLabel}
            </h3>
            {customLabel && <p className="mt-1 max-w-[18rem] whitespace-normal break-words text-xs font-medium text-white/78 sm:max-w-full" title={customLabel}>{customLabel}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur", statePillClass(readState))}>{STATE_LABEL[readState]}</span>
              {profileLabel && <span className="rounded-full bg-white/14 px-2.5 py-1 text-[11px] backdrop-blur">{profileLabel}</span>}
            </div>
          </div>
          <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur min-[430px]:flex">
            <Icon className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3">
          <div className={cn("rounded-2xl bg-white/14 p-3.5 backdrop-blur sm:p-4", tempCardClass)}>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-72"><Thermometer className="h-4 w-4" />Temperatura</div>
            <div className="mt-2 font-display text-[2rem] font-black leading-none tabular-nums sm:text-3xl">
              {sensor.lastTemperature != null ? `${toTempDisplay(sensor.lastTemperature, settings.tempUnit)}°${settings.tempUnit}` : "—"}
            </div>
            <div className="mt-2 text-[11px] opacity-72">{sensor.lastTemperature != null ? ZONE_LABELS[zone] : "czekam na pierwszy odczyt"}</div>
          </div>
          {supportsHumidity && (
            <div className="rounded-2xl bg-white/14 p-3.5 backdrop-blur sm:p-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-72"><Droplets className="h-4 w-4" />Wilgotność</div>
              <div className="mt-2 font-display text-[2rem] font-black leading-none tabular-nums sm:text-3xl">{sensor.lastHumidity != null ? formatHumidity(sensor.lastHumidity) : "—"}</div>
              <div className="mt-2 text-[11px] opacity-72">{sensor.lastHumidityReadAt ? `odczyt ${formatRelTime(sensor.lastHumidityReadAt)}` : "czekam na ramkę wilgotności"}</div>
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 text-sm sm:gap-3">
          <div className="rounded-2xl bg-white/12 px-3 py-2.5 backdrop-blur">
            <div className="flex flex-wrap items-center gap-1.5 font-semibold leading-tight"><BatteryIcon level={sensor.batteryLevel} mv={sensor.batteryVoltage} />{formatBattery(sensor.batteryVoltage, sensor.batteryLevel)}</div>
            <div className={cn("mt-1 text-[11px] leading-snug opacity-72", battery.tone === "bad" && "text-red-100 opacity-100")}>bateria: {battery.label}{sensor.lastBatteryReadAt ? ` · ${formatRelTime(sensor.lastBatteryReadAt)}` : " · oczekuje"}</div>
          </div>
          <div className="rounded-2xl bg-white/12 px-3 py-2.5 backdrop-blur">
            <div className="flex items-center gap-2 font-semibold"><RssiBars rssi={sensor.lastRssi} />{sensor.lastRssi != null ? `${sensor.lastRssi} dBm` : "—"}</div>
            <div className="mt-1 text-[11px] leading-snug opacity-72">{signalLabel(sensor.lastRssi)}</div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs opacity-72">
          <span className="flex min-w-0 items-center gap-1.5">
            {readState === "online" || readState === "stale" ? <Wifi className="h-3.5 w-3.5 shrink-0" /> : <WifiOff className="h-3.5 w-3.5 shrink-0" />}
            <span className="min-w-0 leading-snug">ostatni odczyt: {lastReadText} · {STATE_HINT[readState]}</span>
          </span>
          <span className="shrink-0">{APP_VERSION.split("_").pop()}</span>
        </div>

        {(readState === "scanning" || readState === "waiting") && (
          <div className="mt-3 rounded-2xl bg-white/15 px-3 py-2 text-xs font-medium text-white/86">
            {readState === "scanning" ? `Sprawdzam odczyt — szukam ${bluetoothLabel}.` : `Czujnik dodany \u2014 kliknij \u201eOd\u015bwie\u017c odczyt\u201d, gdy jeste\u015b blisko czujnika.`}
          </div>
        )}

        {readState === "stale" && (
          <div className="mt-3 rounded-2xl bg-amber-300/16 px-3 py-2 text-xs font-medium text-white/88">
            To są ostatnie zapisane dane. Kliknij „Odśwież odczyt", żeby sprawdzić bieżący sygnał.
          </div>
        )}

        {onListen && !sensor.isDemo && (
          <button onClick={(e) => { e.stopPropagation(); onListen(); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/20 px-4 py-2.5 text-sm font-bold text-white shadow-sm backdrop-blur transition hover:bg-white/30">
            <RefreshCw className="h-4 w-4" />Odśwież odczyt
          </button>
        )}

        {showDebug && (
          <div className="mt-4 rounded-2xl bg-black/18 p-3 font-mono text-[10px] leading-relaxed text-white/75 backdrop-blur">
            <div>serviceData: {sensor.rawServiceData || "—"}</div>
            <div>manufacturerData: {sensor.rawManufacturerData || "—"}</div>
            <div>debug: {sensor.bleDebug || "—"}</div>
          </div>
        )}

        {sensor.isDemo && <span className="absolute bottom-3 left-3 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">demo</span>}
      </div>
    </div>
  );
}
