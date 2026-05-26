import type { Sensor } from "@/types/sensor";
import { formatTemp, getSettings } from "@/services/storageService";
import {
  Bluetooth, BluetoothOff, Droplets, ThermometerSnowflake,
  ThermometerSun, AlertTriangle, BatteryMedium, BatteryLow,
  BatteryFull, Wifi, WifiOff, Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SensorCardProps {
  sensor: Sensor;
  onClick?: () => void;
}

const getStatus = (s: Sensor) => {
  if (s.lastTemperature == null) return { kind: "offline" as const, label: "Brak odczytu" };
  if (s.minTempAlert != null && s.lastTemperature < s.minTempAlert)
    return { kind: "cold" as const, label: "Za zimno!" };
  if (s.maxTempAlert != null && s.lastTemperature > s.maxTempAlert)
    return { kind: "hot" as const, label: "Za ciepło!" };
  if (s.lastTemperature < 10) return { kind: "cold" as const, label: "Chłodno" };
  if (s.lastTemperature > 26) return { kind: "warm" as const, label: "Ciepło" };
  return { kind: "ok" as const, label: "Komfortowo" };
};

const gradients = {
  cold: "bg-gradient-cold",
  ok: "bg-gradient-ok",
  warm: "bg-gradient-warm",
  hot: "bg-gradient-hot",
  offline: "bg-muted/60",
};

const formatTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 30_000) return "przed chwilą";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s temu`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min temu`;
  return d.toLocaleString("pl-PL", {
    hour: "2-digit", minute: "2-digit",
    day: "2-digit", month: "2-digit",
  });
};

const BatteryIcon = ({ level }: { level?: number }) => {
  if (level == null) return null;
  if (level < 20) return <BatteryLow className="h-3.5 w-3.5 text-destructive" />;
  if (level < 60) return <BatteryMedium className="h-3.5 w-3.5" />;
  return <BatteryFull className="h-3.5 w-3.5" />;
};

const RssiIcon = ({ rssi }: { rssi?: number }) => {
  if (rssi == null) return null;
  return rssi > -70
    ? <Wifi className="h-3.5 w-3.5" />
    : <WifiOff className="h-3.5 w-3.5 opacity-70" />;
};

export function SensorCard({ sensor, onClick }: SensorCardProps) {
  const status = getStatus(sensor);
  const isOffline = status.kind === "offline";
  const settings = getSettings();
  const isELA = sensor.source === "ela-advertisement";

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-3xl p-6 text-left shadow-card transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-glow border border-border/40",
        gradients[status.kind],
        !isOffline && "text-white",
        !onClick && "cursor-default",
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-8 -left-4 h-24 w-24 rounded-full bg-white/[0.08] blur-2xl" />

      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-widest opacity-75">
            {sensor.customName || (isELA ? "ELA Blue Puck T" : sensor.bluetoothName)}
          </p>
          <h3 className="mt-1 truncate text-2xl font-bold tracking-tight">{sensor.roomName}</h3>
        </div>

        <div className={cn(
          "ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full backdrop-blur",
          isOffline ? "bg-muted-foreground/15" : "bg-white/15"
        )}>
          {isELA ? (
            <Radio className="h-5 w-5" />
          ) : sensor.status === "connected" ? (
            <Bluetooth className="h-5 w-5" />
          ) : (
            <BluetoothOff className="h-5 w-5" />
          )}
        </div>
      </div>

      <div className="relative mt-8 flex items-end gap-1">
        {isOffline ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-lg font-medium">Brak danych</span>
          </div>
        ) : (
          <>
            <span className="text-6xl font-bold leading-none tracking-tighter tabular-nums">
              {sensor.lastTemperature != null
                ? formatTemp(sensor.lastTemperature, settings.tempUnit).replace(/°[CF]$/, "")
                : "—"}
            </span>
            <span className="mb-1.5 text-2xl font-semibold opacity-80">
              °{settings.tempUnit}
            </span>
          </>
        )}
      </div>

      <div className="relative mt-5 flex flex-wrap items-center gap-2 text-sm">
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium backdrop-blur",
          isOffline ? "bg-muted-foreground/10 text-muted-foreground" : "bg-white/20"
        )}>
          {status.kind === "cold" || status.kind === "offline"
            ? <ThermometerSnowflake className="h-3.5 w-3.5" />
            : <ThermometerSun className="h-3.5 w-3.5" />}
          {status.label}
        </span>

        {sensor.lastHumidity != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur">
            <Droplets className="h-3.5 w-3.5" />
            {sensor.lastHumidity.toFixed(0)}%
          </span>
        )}

        {sensor.batteryLevel != null && (
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs backdrop-blur",
            sensor.batteryLevel < 20 ? "bg-destructive/30 font-semibold" : "bg-white/15"
          )}>
            <BatteryIcon level={sensor.batteryLevel} />
            {sensor.batteryLevel}%
          </span>
        )}

        {sensor.lastRssi != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs backdrop-blur">
            <RssiIcon rssi={sensor.lastRssi} />
            {sensor.lastRssi} dBm
          </span>
        )}
      </div>

      <div className={cn(
        "relative mt-4 text-xs",
        isOffline ? "text-muted-foreground" : "opacity-60"
      )}>
        Odczyt: {formatTime(sensor.lastReadAt)}
        {sensor.isDemo && (
          <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">DEMO</span>
        )}
      </div>
    </button>
  );
}
