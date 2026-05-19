import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Activity, Bell, Clock3, Plus, ShieldCheck, Sparkles, Thermometer } from "lucide-react";
import { SensorCard } from "@/components/SensorCard";
import { AddSensorModal } from "@/components/AddSensorModal";
import { useSensors } from "@/hooks/useSensors";
import { APP_NAME, APP_TAGLINE, formatReadingTime } from "@/config/app";

export function DashboardPage() {
  const { sensors, refresh } = useSensors();
  const [addOpen, setAddOpen] = useState(false);

  const liveSensors = sensors.filter((s) => s.lastTemperature != null);
  const connected = sensors.filter((s) => s.status === "connected").length;
  const avgTemp = liveSensors.length
    ? liveSensors.reduce((sum, s) => sum + (s.lastTemperature ?? 0), 0) / liveSensors.length
    : null;
  const lastRead = useMemo(() => {
    const times = sensors
      .map((s) => s.lastReadAt ? new Date(s.lastReadAt).getTime() : 0)
      .filter(Boolean);
    return times.length ? new Date(Math.max(...times)).toISOString() : undefined;
  }, [sensors]);

  const alerts = sensors.filter((s) => {
    if (s.lastTemperature == null) return false;
    if (s.minTempAlert != null && s.lastTemperature < s.minTempAlert) return true;
    if (s.maxTempAlert != null && s.lastTemperature > s.maxTempAlert) return true;
    if (s.maxHumidityAlert != null && s.lastHumidity != null && s.lastHumidity > s.maxHumidityAlert) return true;
    if (s.minHumidityAlert != null && s.lastHumidity != null && s.lastHumidity < s.minHumidityAlert) return true;
    return false;
  });

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-hero p-8 text-primary-foreground shadow-glow">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> {sensors.length} czujników · {connected} połączonych
            </div>
            <h1 className="mt-3 max-w-xl text-4xl font-bold leading-tight sm:text-5xl">
              Temperatura domu <br />pod kontrolą AutoSafe.
            </h1>
            <p className="mt-3 max-w-lg text-sm opacity-90">
              {APP_TAGLINE}. Zapis lokalny, historia pomiarów, alerty progowe i obsługa czujników Bluetooth Low Energy.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button size="lg" variant="secondary" onClick={() => setAddOpen(true)} className="shadow-card">
                <Plus className="mr-2 h-4 w-4" /> Dodaj czujnik
              </Button>
              <Button size="lg" variant="outline" asChild className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <Link to="/history">Zobacz historię</Link>
              </Button>
            </div>
          </div>
          <div className="grid min-w-[240px] gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-black/20 p-4 backdrop-blur">
              <Thermometer className="mb-3 h-5 w-5 opacity-80" />
              <div className="text-3xl font-bold">{avgTemp == null ? "—" : `${avgTemp.toFixed(1)}°C`}</div>
              <div className="text-xs opacity-75">Średnia temperatura</div>
            </div>
            <div className="rounded-2xl bg-black/20 p-4 backdrop-blur">
              <Bell className="mb-3 h-5 w-5 opacity-80" />
              <div className="text-3xl font-bold">{alerts.length}</div>
              <div className="text-xs opacity-75">Aktywne alerty</div>
            </div>
          </div>
        </div>
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-10 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Activity className="h-4 w-4" /> Status</div>
          <div className="mt-2 text-2xl font-bold">{connected}/{sensors.length || 0}</div>
          <p className="text-xs text-muted-foreground">czujników połączonych</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" /> Ostatni odczyt</div>
          <div className="mt-2 text-2xl font-bold">{formatReadingTime(lastRead)}</div>
          <p className="text-xs text-muted-foreground">najświeższy pomiar w aplikacji</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Dane</div>
          <div className="mt-2 text-2xl font-bold">Lokalnie</div>
          <p className="text-xs text-muted-foreground">czujniki i historia w pamięci urządzenia</p>
        </div>
      </section>

      {alerts.length > 0 && (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <strong className="text-destructive">Alerty:</strong>{" "}
          {alerts.map((a) => `${a.roomName} ${a.lastTemperature?.toFixed(1)}°C${a.lastHumidity != null ? ` / ${a.lastHumidity.toFixed(0)}%` : ""}`).join(" · ")}
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">Pomieszczenia</h2>
            <p className="text-sm text-muted-foreground">Karty pokazują aktualny stan i świeżość odczytu.</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/sensors">Zarządzaj</Link>
          </Button>
        </div>

        {sensors.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-12 text-center">
            <h3 className="font-display text-lg font-semibold">Brak czujników</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Dodaj pierwszy czujnik Bluetooth, dodaj go ręcznie po MAC albo włącz tryb demo w Ustawieniach.
            </p>
            <Button onClick={() => setAddOpen(true)} className="mt-4">
              <Plus className="mr-2 h-4 w-4" /> Dodaj czujnik
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sensors.map((s) => <SensorCard key={s.id} sensor={s} />)}
          </div>
        )}
      </section>

      <AddSensorModal open={addOpen} onOpenChange={setAddOpen} onAdded={refresh} />
    </div>
  );
}
