// SensorCard.tsx v2
import type { Sensor, TempZone } from "@/types/sensor";
import { getTempZone, ZONE_LABELS } from "@/types/sensor";
import { formatHumidity, formatPressure, formatTemp, getSettings } from "@/services/storageService";
import { getProfile } from "@/services/sensorProfiles";
import {
  Activity, BatteryFull, BatteryLow, BatteryMedium,
  Bell, BellOff, CircleDot, Droplets, Gauge, Leaf,
  Pin, Radio, Thermometer, ThermometerSnowflake, ThermometerSun,
  Wind, WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  sensor: Sensor;
  onClick?: () => void;
  onTogglePin?: () => void;
  onToggleMute?: () => void;
}

const ZONE_GRADIENT: Record<TempZone, string> = {
  frozen:  "bg-gradient-frozen",
  cold:    "bg-gradient-cold",
  cool:    "bg-gradient-cool",
  ok:      "bg-gradient-ok",
  warm:    "bg-gradient-warm",
  hot:     "bg-gradient-hot",
  danger:  "bg-gradient-danger",
  offline: "bg-gradient-offline",
};

const PROFILE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  radio:                   Radio,
  droplets:                Droplets,
  "circle-dot":            CircleDot,
  gauge:                   Gauge,
  thermometer:             Thermometer,
  "thermometer-snowflake": ThermometerSnowflake,
  activity:                Activity,
  leaf:                    Leaf,
  wind:                    Wind,
};

function BatteryIcon({ level }: { level?: number }) {
  if (level == null) return null;
  const cls = "h-3.5 w-3.5";
  if (level < 20) return <BatteryLow  className={cn(cls, "text-red-300")} />;
  if (level < 50) return <BatteryMedium className={cls} />;
  return <BatteryFull className={cls} />;
}

function RssiBars({ rssi }: { rssi?: number }) {
  if (rssi == null) return null;
  const strength = rssi > -60 ? 3 : rssi > -75 ? 2 : 1;
  return (
    <span className="flex items-end gap-[2px] h-3.5">
      {[1, 2, 3].map((b) => (
        <span
          key={b}
          className={cn("w-[3px] rounded-sm transition-all", b <= strength ? "opacity-100" : "opacity-25")}
          style={{ height: `${b * 4}px`, background: "currentColor" }}
        />
      ))}
    </span>
  );
}

function formatRelTime(iso?: string): string {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 30)    return "przed chwilą";
  if (s < 60)    return `${Math.floor(s)}s temu`;
  if (s < 3600)  return `${Math.floor(s / 60)} min temu`;
  if (s < 86400) return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "short" });
}

export function SensorCard({ sensor, onClick, onTogglePin, onToggleMute }: Props) {
  const settings    = getSettings();
  const zone        = getTempZone(sensor.lastTemperature, sensor.minTempAlert, sensor.maxTempAlert);
  const isOffline   = zone === "offline";
  const profile     = getProfile(sensor.profileId);
  const ProfileIcon = PROFILE_ICON[profile?.icon ?? "thermometer"] ?? Thermometer;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-3xl noise",
        "transition-all duration-300 ease-out",
        "hover:-translate-y-1.5 hover:shadow-glow cursor-pointer",
        ZONE_GRADIENT[zone],
      )}
      onClick={onClick}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 left-0 h-32 w-32 rounded-full bg-white/[0.08] blur-2xl" />

      {/* Quick actions */}
      <div className="absolute right-3 top-3 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onTogglePin && (
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white/80 backdrop-blur hover:bg-white/25 hover:text-white"
          >
            <Pin className={cn("h-3.5 w-3.5", sensor.isPinned && "fill-current")} />
          </button>
        )}
        {onToggleMute && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white/80 backdrop-blur hover:bg-white/25 hover:text-white"
          >
            {sensor.alertMuted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      <div className={cn("relative p-6 text-white", isOffline && "text-white/70")}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold uppercase tracking-widest opacity-70">
              {sensor.customName ?? profile?.name ?? "Czujnik"}
            </p>
            <h3 className="mt-1 truncate text-[1.65rem] font-bold leading-none tracking-tight">
              {sensor.roomName}
            </h3>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <ProfileIcon className="h-5 w-5" />
          </div>
        </div>

        {/* Temperatura */}
        <div className="mt-6 flex items-end gap-0.5">
          {isOffline ? (
            <div className="flex items-center gap-2 opacity-60">
              <WifiOff className="h-5 w-5" />
              <span className="text-lg font-medium">Brak sygnału</span>
            </div>
          ) : (
            <>
              <span className="font-display tabular transition-number text-[3.5rem] font-bold leading-none">
                {sensor.lastTemperature != null
                  ? formatTemp(sensor.lastTemperature, settings.tempUnit).replace(/°[CF]$/, "")
                  : "—"}
              </span>
              <span className="mb-2 ml-0.5 text-2xl font-semibold opacity-75">
                {sensor.lastTemperature != null ? `°${settings.tempUnit}` : ""}
              </span>
            </>
          )}
        </div>

        {/* Badges */}
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 font-semibold backdrop-blur-sm">
            {zone === "cold" || zone === "frozen"
              ? <ThermometerSnowflake className="h-3.5 w-3.5" />
              : zone === "hot" || zone === "danger"
              ? <ThermometerSun className="h-3.5 w-3.5" />
              : <Thermometer className="h-3.5 w-3.5" />}
            {ZONE_LABELS[zone]}
          </span>

          {sensor.lastHumidity != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 backdrop-blur-sm">
              <Droplets className="h-3.5 w-3.5" />
              {formatHumidity(sensor.lastHumidity)}
            </span>
          )}

          {sensor.lastPressure != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 backdrop-blur-sm">
              <Gauge className="h-3.5 w-3.5" />
              {formatPressure(sensor.lastPressure)}
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between text-xs opacity-60">
          <span className="flex items-center gap-2">
            {sensor.batteryLevel != null && (
              <span className={cn("flex items-center gap-1", sensor.batteryLevel < 20 && "text-red-200 font-semibold opacity-100")}>
                <BatteryIcon level={sensor.batteryLevel} />
                {sensor.batteryLevel}%
              </span>
            )}
            {sensor.lastRssi != null && (
              <span className="flex items-center gap-1">
                <RssiBars rssi={sensor.lastRssi} />
                {sensor.lastRssi} dBm
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            {!isOffline && (
              <span className="pulse-dot" />
            )}
            {formatRelTime(sensor.lastReadAt)}
          </span>
        </div>

        {sensor.isDemo && (
          <span className="absolute bottom-3 left-3 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            demo
          </span>
        )}

        {sensor.isPinned && (
          <span className="absolute top-3 left-3">
            <Pin className="h-3.5 w-3.5 fill-white/60 text-white/60" />
          </span>
        )}
      </div>
    </div>
  );
}
