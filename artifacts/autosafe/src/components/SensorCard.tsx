import type { ReactNode } from "react";
import type { Sensor } from "@/types/sensor";
import { formatBattery, formatHumidity, formatTemp, getSettings } from "@/services/storageService";
import { getProfile } from "@/services/sensorProfiles";
import { compactSensorSummary, getSensorIcon, getUiStatus, relativeTime, uiStatusLabel } from "@/services/sensorUiService";
import { BatteryMedium, Droplets, RefreshCw, Thermometer, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  sensor: Sensor;
  onClick?: () => void;
  onTogglePin?: () => void;
  onToggleMute?: () => void;
  onListen?: () => void;
  compact?: boolean;
}

function statusClass(status: ReturnType<typeof getUiStatus>) {
  if (status === "fresh") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "scanning") return "bg-primary/15 text-primary";
  if (status === "stale") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (status === "offline") return "bg-destructive/12 text-destructive";
  return "bg-muted text-muted-foreground";
}

export function SensorCard({ sensor, onClick, onListen }: Props) {
  const settings = getSettings();
  const status = getUiStatus(sensor);
  const profile = getProfile(sensor.profileId);
  const supportsHumidity = Boolean(profile?.supportsHumidity || sensor.profileId?.toLowerCase().includes("rht") || sensor.lastHumidity != null);
  const Icon = getSensorIcon(sensor);
  const saved = sensor.lastMeasurementSaveStatus === "saved" ? "zapisano lokalnie" : sensor.lastReadAt ? "czeka na nowy odczyt" : "brak odczytu";

  return (
    <button onClick={onClick} className="group w-full rounded-2xl border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-black leading-tight">{sensor.roomName || "Czujnik"}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">{sensor.bluetoothName || sensor.deviceId}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", statusClass(status))}>{uiStatusLabel[status]}</span>
          {onListen && !sensor.isDemo && <span onClick={(e) => { e.stopPropagation(); onListen(); }} className="flex h-8 w-8 items-center justify-center rounded-full border bg-background text-muted-foreground hover:text-primary" role="button" title="Odśwież"><RefreshCw className="h-4 w-4" /></span>}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniMetric icon={<Thermometer className="h-3.5 w-3.5" />} label="Temp." value={formatTemp(sensor.lastTemperature, settings.tempUnit)} />
        {supportsHumidity ? <MiniMetric icon={<Droplets className="h-3.5 w-3.5" />} label="Wilg." value={formatHumidity(sensor.lastHumidity)} /> : <MiniMetric icon={<Wifi className="h-3.5 w-3.5" />} label="RSSI" value={sensor.lastRssi != null ? `${sensor.lastRssi} dBm` : "—"} />}
        <MiniMetric icon={<BatteryMedium className="h-3.5 w-3.5" />} label="Bateria" value={formatBattery(sensor.batteryVoltage, sensor.batteryLevel)} />
        <MiniMetric icon={<Wifi className="h-3.5 w-3.5" />} label="Zasięg" value={sensor.lastRssi != null ? `${sensor.lastRssi} dBm` : "—"} />
      </div>
      <div className="mt-2 truncate text-[11px] text-muted-foreground">{compactSensorSummary(sensor, settings.tempUnit)}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{saved}</span><span>{relativeTime(sensor.lastReadAt)}</span></div>
    </button>
  );
}

function MiniMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-xl bg-muted/45 px-2.5 py-2"><div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{icon}{label}</div><div className="mt-0.5 truncate font-display text-sm font-black">{value}</div></div>;
}
