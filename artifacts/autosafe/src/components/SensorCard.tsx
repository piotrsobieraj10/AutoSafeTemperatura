// components/SensorCard.tsx v5.6 — elegancka karta premium, wilgotność, bateria, sygnał i diagnostyka jako opcja
import type { ComponentType } from "react";
import type { Sensor, TempZone } from "@/types/sensor";
import { getTempZone, ZONE_LABELS } from "@/types/sensor";
import { formatBattery, formatHumidity, getBatteryLabel, getSettings } from "@/services/storageService";
import { getProfile } from "@/services/sensorProfiles";
import { APP_VERSION } from "@/config/app";
import {
  Activity, BatteryFull, BatteryLow, BatteryMedium, Bell, BellOff, CircleDot, Droplets,
  Gauge, Home, Leaf, Pin, Radio, RefreshCw, Thermometer, ThermometerSnowflake,
  ThermometerSun, Warehouse, Wifi, WifiOff, Wind,
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
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
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
  return "słaby sygnał";
};

export function SensorCard({ sensor, onClick, onTogglePin, onToggleMute, onListen, compact = false }: Props) {
  const settings = getSettings();
  const zone = getTempZone(sensor.lastTemperature, sensor.minTempAlert, sensor.maxTempAlert);
  const isWaiting = sensor.status === "pending" || sensor.status === "scanning";
  const isOffline = zone === "offline";
  const profile = getProfile(sensor.profileId);
  const Icon = LOCATION_ICON[sensor.locationIcon ?? ""] ?? PROFILE_ICON[profile?.icon ?? "thermometer"] ?? Thermometer;
  const battery = getBatteryLabel(sensor.batteryVoltage, sensor.batteryLevel);
  const showDebug = settings.showBleDiagnostics === true;
  const displayName = sensor.customName ? `${sensor.roomName} · ${sensor.customName}` : sensor.roomName;

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-3xl noise transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-glow cursor-pointer",
      ZONE_GRADIENT[zone],
    )} onClick={onClick}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 left-0 h-32 w-32 rounded-full bg-white/8 blur-2xl" />

      <div className="absolute right-3 top-3 z-10 flex gap-1 opacity-100">
        {onListen && !sensor.isDemo && (
          <button onClick={(e) => { e.stopPropagation(); onListen(); }} title="Odśwież BLE"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/85 backdrop-blur hover:bg-white/25 hover:text-white">
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onTogglePin?.(); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/85 backdrop-blur hover:bg-white/25 hover:text-white">
          <Pin className={cn("h-4 w-4", sensor.isPinned && "fill-current")} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onToggleMute?.(); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/85 backdrop-blur hover:bg-white/25 hover:text-white">
          {sensor.alertMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        </button>
      </div>

      <div className={cn("relative p-6 text-white", isOffline && "text-white/75", compact && "p-5")}>
        <div className="flex items-start justify-between gap-3 pr-28">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] opacity-70">{sensor.bluetoothName || profile?.name || "Czujnik BLE"}</p>
            <h3 className="mt-1 truncate text-[1.75rem] font-black leading-none tracking-tight">{displayName}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-white/18 px-2.5 py-1 text-[11px] font-bold backdrop-blur">{sensor.status === "connected" ? "Online" : sensor.status === "scanning" ? "Nasłuch" : sensor.status === "pending" ? "Oczekuje" : "Offline"}</span>
              {profile?.name && <span className="rounded-full bg-white/14 px-2.5 py-1 text-[11px] backdrop-blur">{profile.name.replace("ELA Blue Puck", "ELA")}</span>}
            </div>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <Icon className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-white/14 p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest opacity-70"><Thermometer className="h-4 w-4" />Temperatura</div>
            <div className="mt-2 font-display text-3xl font-black leading-none tabular-nums">
              {sensor.lastTemperature != null ? `${toTempDisplay(sensor.lastTemperature, settings.tempUnit)}°${settings.tempUnit}` : "—"}
            </div>
            <div className="mt-2 text-[11px] opacity-70">{ZONE_LABELS[zone]}</div>
          </div>
          <div className="rounded-3xl bg-white/14 p-4 backdrop-blur">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest opacity-70"><Droplets className="h-4 w-4" />Wilgotność</div>
            <div className="mt-2 font-display text-3xl font-black leading-none tabular-nums">{sensor.lastHumidity != null ? formatHumidity(sensor.lastHumidity) : "—"}</div>
            <div className="mt-2 text-[11px] opacity-70">{sensor.lastHumidityReadAt ? `odczyt ${formatRelTime(sensor.lastHumidityReadAt)}` : "czekam na RHT"}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-white/12 px-3 py-2 backdrop-blur">
            <div className="flex items-center gap-2 font-semibold"><BatteryIcon level={sensor.batteryLevel} mv={sensor.batteryVoltage} />{formatBattery(sensor.batteryVoltage, sensor.batteryLevel)}</div>
            <div className={cn("mt-0.5 text-[11px] opacity-70", battery.tone === "bad" && "text-red-100 opacity-100")}>bateria: {battery.label}{sensor.lastBatteryReadAt ? ` · ${formatRelTime(sensor.lastBatteryReadAt)}` : ""}</div>
          </div>
          <div className="rounded-2xl bg-white/12 px-3 py-2 backdrop-blur">
            <div className="flex items-center gap-2 font-semibold"><RssiBars rssi={sensor.lastRssi} />{sensor.lastRssi != null ? `${sensor.lastRssi} dBm` : "—"}</div>
            <div className="mt-0.5 text-[11px] opacity-70">{signalLabel(sensor.lastRssi)}</div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs opacity-70">
          <span className="flex items-center gap-1.5">{sensor.status === "connected" ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />} ostatni odczyt: {formatRelTime(sensor.lastReadAt)}</span>
          <span>{APP_VERSION.split("_").pop()}</span>
        </div>

        {isWaiting && (
          <div className="mt-3 rounded-2xl bg-white/15 px-3 py-2 text-xs font-medium text-white/85">
            {sensor.status === "scanning" ? `Nasłuch BLE aktywny — szukam ${sensor.bluetoothName}.` : "Czujnik zapisany — uruchom monitoring BLE, aby odebrać pomiary."}
          </div>
        )}

        {onListen && !sensor.isDemo && (
          <button onClick={(e) => { e.stopPropagation(); onListen(); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/20 px-4 py-3 text-sm font-bold text-white shadow-sm backdrop-blur transition hover:bg-white/30">
            <RefreshCw className="h-4 w-4" />Nasłuchuj BLE / odśwież
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
