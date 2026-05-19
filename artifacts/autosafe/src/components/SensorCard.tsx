import type { Sensor } from "@/types/sensor";
import { AlertTriangle, Bluetooth, BluetoothOff, Droplets, ThermometerSnowflake, ThermometerSun, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatReadingTime, STALE_READING_MS } from "@/config/app";
import { getSettings } from "@/services/storageService";

interface SensorCardProps {
  sensor: Sensor;
  onClick?: () => void;
}

const getStatus = (s: Sensor) => {
  const staleLimit = (getSettings().staleMinutes || STALE_READING_MS / 60_000) * 60_000;
  const stale = s.lastReadAt ? Date.now() - new Date(s.lastReadAt).getTime() > staleLimit : true;
  if (s.lastTemperature == null) return { kind: "offline" as const, label: "Brak odczytu" };
  if (stale) return { kind: "offline" as const, label: "Nieaktualny" };
  if (s.minTempAlert != null && s.lastTemperature < s.minTempAlert)
    return { kind: "cold" as const, label: "Za zimno" };
  if (s.maxTempAlert != null && s.lastTemperature > s.maxTempAlert)
    return { kind: "hot" as const, label: "Za ciepło" };
  if (s.lastTemperature < 10) return { kind: "cold" as const, label: "Chłodno" };
  if (s.lastTemperature > 26) return { kind: "warm" as const, label: "Ciepło" };
  return { kind: "ok" as const, label: "Komfortowo" };
};

const gradients = {
  cold: "bg-gradient-cold",
  ok: "bg-gradient-ok",
  warm: "bg-gradient-warm",
  hot: "bg-gradient-hot",
  offline: "bg-muted",
};

export function SensorCard({ sensor, onClick }: SensorCardProps) {
  const status = getStatus(sensor);
  const isOffline = status.kind === "offline";
  const disabledStyle = !onClick ? "cursor-default" : "cursor-pointer";

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-3xl p-6 text-left shadow-card transition-all",
        "border border-border/50 hover:-translate-y-1 hover:shadow-glow",
        gradients[status.kind],
        !isOffline && "text-white",
        disabledStyle,
      )}
    >
      <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("truncate text-xs font-medium uppercase tracking-widest opacity-80")}>
            {sensor.customName ?? sensor.bluetoothName}
          </p>
          <h3 className="mt-1 truncate text-2xl font-bold">{sensor.roomName}</h3>
          {sensor.macAddress && <p className="mt-1 truncate font-mono text-[11px] opacity-70">MAC: {sensor.macAddress}</p>}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur">
          {sensor.status === "connected" ? (
            <Bluetooth className="h-5 w-5" />
          ) : sensor.status === "disconnected" ? (
            <BluetoothOff className="h-5 w-5" />
          ) : (
            <WifiOff className="h-5 w-5" />
          )}
        </div>
      </div>

      <div className="relative mt-8 flex items-end gap-2">
        {sensor.lastTemperature == null ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-lg font-medium">Brak danych</span>
          </div>
        ) : (
          <>
            <span className="text-6xl font-bold tracking-tight tabular-nums">
              {sensor.lastTemperature.toFixed(1)}
            </span>
            <span className="mb-2 text-2xl font-medium opacity-80">°C</span>
          </>
        )}
      </div>

      <div className="relative mt-6 flex flex-wrap items-center gap-3 text-sm">
        {sensor.lastHumidity != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
            <Droplets className="h-3.5 w-3.5" /> {sensor.lastHumidity.toFixed(0)}%
          </span>
        )}
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-3 py-1 backdrop-blur",
          isOffline ? "bg-muted-foreground/10 text-muted-foreground" : "bg-white/15",
        )}>
          {status.kind === "cold" || status.kind === "offline" ? (
            <ThermometerSnowflake className="h-3.5 w-3.5" />
          ) : (
            <ThermometerSun className="h-3.5 w-3.5" />
          )}
          {status.label}
        </span>
        {sensor.isDemo && (
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">DEMO</span>
        )}
      </div>

      <div className={cn("relative mt-4 text-xs", isOffline ? "text-muted-foreground" : "opacity-75")}>
        Ostatni odczyt: {formatReadingTime(sensor.lastReadAt)}
      </div>
    </button>
  );
}
