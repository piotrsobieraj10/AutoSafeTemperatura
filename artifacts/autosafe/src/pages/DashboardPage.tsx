// routes/index.tsx v2
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle, TrendingDown, TrendingUp, Thermometer } from "lucide-react";
import { SensorCard } from "@/components/SensorCard";
import { AddSensorModal } from "@/components/AddSensorModal";
import { useSensors } from "@/hooks/useSensors";
import { formatTemp, getSettings, upsertSensor } from "@/services/storageService";
import { getTempZone } from "@/types/sensor";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const { sensors, upsert, remove, alertSensors, refresh, pinnedSensors, unpinnedSensors } = useSensors();
  const [addOpen, setAddOpen] = useState(false);
  const settings = getSettings();

  const connected = sensors.filter((s) => s.lastTemperature != null);
  const avgTemp   = connected.length > 0
    ? connected.reduce((a, s) => a + (s.lastTemperature ?? 0), 0) / connected.length
    : null;
  const minSensor = connected.reduce<typeof sensors[0] | null>((a, s) => !a || (s.lastTemperature! < a.lastTemperature!) ? s : a, null);
  const maxSensor = connected.reduce<typeof sensors[0] | null>((a, s) => !a || (s.lastTemperature! > a.lastTemperature!) ? s : a, null);

  const handlePin   = (s: typeof sensors[0]) => upsert({ ...s, isPinned: !s.isPinned });
  const handleMute  = (s: typeof sensors[0]) => upsert({ ...s, alertMuted: !s.alertMuted });

  return (
    <div className="space-y-8">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-hero p-8 text-white shadow-glow noise">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-8  h-56 w-56 rounded-full bg-white/8  blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium opacity-75">
              {new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="mt-1 font-display text-4xl font-bold leading-tight sm:text-5xl">
              Twój dom
            </h1>
            {avgTemp != null && (
              <p className="mt-2 font-display text-xl font-semibold opacity-90">
                Śr. {formatTemp(avgTemp ?? undefined, settings.tempUnit)} · {connected.length} czujnik{connected.length !== 1 ? "ów" : ""}
              </p>
            )}
          </div>
          <Button size="lg" onClick={() => setAddOpen(true)}
            className="bg-white/20 hover:bg-white/30 border border-white/25 text-white backdrop-blur shadow-none">
            <Plus className="mr-2 h-4 w-4" /> Dodaj czujnik
          </Button>
        </div>

        {/* Stats mini */}
        {connected.length > 1 && (
          <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatPill icon={<TrendingDown className="h-4 w-4" />} label="Najzimniej" value={formatTemp(minSensor?.lastTemperature, settings.tempUnit)} sub={minSensor?.roomName} />
            <StatPill icon={<TrendingUp   className="h-4 w-4" />} label="Najcieplej" value={formatTemp(maxSensor?.lastTemperature, settings.tempUnit)} sub={maxSensor?.roomName} />
            <StatPill icon={<Thermometer  className="h-4 w-4" />} label="Średnia"    value={formatTemp(avgTemp ?? undefined, settings.tempUnit)} sub="wszystkie" className="hidden sm:flex" />
          </div>
        )}
      </section>

      {/* ── Alerty ── */}
      {alertSensors.filter((s) => !s.alertMuted).length > 0 && (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive text-sm">Przekroczono progi temperatury</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {alertSensors.filter((s) => !s.alertMuted).map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-xs font-medium text-destructive">
                    <span className={cn("h-2 w-2 rounded-full", getTempZone(s.lastTemperature, s.minTempAlert, s.maxTempAlert) === "danger" ? "bg-destructive" : "bg-orange-400")} />
                    {s.roomName}: {formatTemp(s.lastTemperature, settings.tempUnit)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Pinned ── */}
      {pinnedSensors.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">Przypięte</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pinnedSensors.map((s) => (
              <SensorCard key={s.id} sensor={s}
                onTogglePin={() => handlePin(s)}
                onToggleMute={() => handleMute(s)} />
            ))}
          </div>
        </section>
      )}

      {/* ── All sensors ── */}
      <section>
        {(pinnedSensors.length > 0 || unpinnedSensors.length > 0) && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">
              {pinnedSensors.length > 0 ? "Pomieszczenia" : "Wszystkie czujniki"}
            </h2>
            <span className="text-xs text-muted-foreground">{connected.length} online</span>
          </div>
        )}

        {sensors.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border p-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-muted mb-4">
              <Thermometer className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg font-bold">Brak czujników</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
              Dodaj czujnik ELA, RuuviTag, Govee lub inny obsługiwany model BLE.
            </p>
            <Button onClick={() => setAddOpen(true)} className="mt-6">
              <Plus className="mr-2 h-4 w-4" /> Dodaj pierwszy czujnik
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unpinnedSensors.map((s) => (
              <SensorCard key={s.id} sensor={s}
                onTogglePin={() => handlePin(s)}
                onToggleMute={() => handleMute(s)} />
            ))}
          </div>
        )}
      </section>

      <AddSensorModal open={addOpen} onOpenChange={setAddOpen} onAdded={refresh} />
    </div>
  );
}

function StatPill({ icon, label, value, sub, className }: { icon: React.ReactNode; label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl bg-white/15 backdrop-blur px-4 py-3", className)}>
      <div className="opacity-80">{icon}</div>
      <div>
        <div className="text-[10px] uppercase tracking-widest opacity-70">{label}</div>
        <div className="font-display text-lg font-bold leading-none">{value}</div>
        {sub && <div className="text-[11px] opacity-60 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
