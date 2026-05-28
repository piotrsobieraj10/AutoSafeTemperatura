// pages/DashboardPage.tsx v5.6.4 — UX final: prostszy język, podsumowanie i odświeżanie dla normalnego użytkownika
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, AlertTriangle, TrendingDown, TrendingUp, Thermometer, Radio, Droplets, BatteryMedium, Wifi, ShieldCheck, ListFilter, Square, Info } from "lucide-react";
import { SensorCard } from "@/components/SensorCard";
import { AddSensorModal } from "@/components/AddSensorModal";
import { useSensors } from "@/hooks/useSensors";
import { formatHumidity, formatTemp, getSettings, patchSettings } from "@/services/storageService";
import { getTempZone } from "@/types/sensor";
import type { Sensor } from "@/types/sensor";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Filter = "all" | "attention" | "online" | "offline";
type MonitorDuration = "quick" | "fiveMin" | "continuous";

const MONITOR_LABEL: Record<MonitorDuration, string> = {
  quick: "Szybki odczyt 30 s",
  fiveMin: "Monitoring 5 min",
  continuous: "Ciągle, gdy aplikacja jest otwarta",
};
const MONITOR_MS: Record<MonitorDuration, number | null> = { quick: 30_000, fiveMin: 300_000, continuous: null };

const FRESH_MS = 120_000;
const OFFLINE_MS = 5 * 60_000;

const readAge = (s: Sensor) => {
  if (!s.lastReadAt) return null;
  const age = Date.now() - new Date(s.lastReadAt).getTime();
  return Number.isFinite(age) ? age : null;
};
const isFresh = (s: Sensor) => {
  const age = readAge(s);
  return age != null && age < FRESH_MS;
};
const isOffline = (s: Sensor) => {
  const age = readAge(s);
  return age == null || age > OFFLINE_MS;
};
const hasStaleData = (s: Sensor) => {
  const age = readAge(s);
  return age != null && age >= FRESH_MS && age <= OFFLINE_MS;
};
const hasProblem = (s: Sensor) => {
  if (s.alertMuted) return false;
  if (isOffline(s)) return true;
  if (hasStaleData(s)) return true;
  if (s.lastTemperature != null) {
    const z = getTempZone(s.lastTemperature, s.minTempAlert, s.maxTempAlert);
    if (["frozen", "cold", "hot", "danger"].includes(z)) return true;
  }
  if (s.lastHumidity != null && ((s.minHumidityAlert != null && s.lastHumidity < s.minHumidityAlert) || (s.maxHumidityAlert != null && s.lastHumidity > s.maxHumidityAlert))) return true;
  if (s.batteryVoltage != null && s.batteryVoltage < 2400) return true;
  if (s.batteryLevel != null && s.batteryLevel < 15) return true;
  return false;
};

export function DashboardPage() {
  const { sensors, upsert, alertSensors, refresh, listen, listenAll, stopMonitoringAll, pinnedSensors, unpinnedSensors } = useSensors();
  const [addOpen, setAddOpen] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [monitorMode, setMonitorMode] = useState<MonitorDuration>((getSettings().monitorDuration ?? "quick") as MonitorDuration);
  const [showTips, setShowTips] = useState(getSettings().showFirstRunTips ?? true);
  const monitorTimeoutRef = useRef<number | null>(null);
  const settings = getSettings();

  useEffect(() => {
    return () => {
      if (monitorTimeoutRef.current) window.clearTimeout(monitorTimeoutRef.current);
      stopMonitoringAll();
    };
  }, [stopMonitoringAll]);

  const connected = sensors.filter(isFresh);
  const staleSensors = sensors.filter(hasStaleData);
  const offlineSensors = sensors.filter(isOffline);
  const withTemp = sensors.filter((s) => s.lastTemperature != null);
  const withHumidity = sensors.filter((s) => s.lastHumidity != null);
  const problems = sensors.filter(hasProblem);
  const avgTemp = withTemp.length > 0 ? withTemp.reduce((a, s) => a + (s.lastTemperature ?? 0), 0) / withTemp.length : null;
  const avgHumidity = withHumidity.length > 0 ? withHumidity.reduce((a, s) => a + (s.lastHumidity ?? 0), 0) / withHumidity.length : null;
  const minSensor = withTemp.reduce<Sensor | null>((a, s) => !a || (s.lastTemperature! < a.lastTemperature!) ? s : a, null);
  const maxSensor = withTemp.reduce<Sensor | null>((a, s) => !a || (s.lastTemperature! > a.lastTemperature!) ? s : a, null);
  const lowBattery = sensors.filter((s) => (s.batteryLevel != null && s.batteryLevel < 15) || (s.batteryVoltage != null && s.batteryVoltage < 2400));

  const cards = useMemo(() => {
    const base = [...unpinnedSensors];
    if (filter === "attention") return base.filter(hasProblem);
    if (filter === "online") return base.filter(isFresh);
    if (filter === "offline") return base.filter(isOffline);
    return base;
  }, [unpinnedSensors, filter]);

  const handlePin = (s: Sensor) => upsert({ ...s, isPinned: !s.isPinned });
  const handleMute = (s: Sensor) => upsert({ ...s, alertMuted: !s.alertMuted });

  const handleMonitorAll = async () => {
    setMonitoring(true);
    patchSettings({ monitorDuration: monitorMode });
    toast.info(`${MONITOR_LABEL[monitorMode]} — trzymaj aplikację otwartą i telefon blisko czujników.`);
    const ok = await listenAll();
    if (!ok) {
      setMonitoring(false);
      toast.warning("Nie udało się odświeżyć czujników. Sprawdź Bluetooth, uprawnienia i spróbuj ponownie.");
      return;
    }
    const ms = MONITOR_MS[monitorMode];
    if (monitorTimeoutRef.current) window.clearTimeout(monitorTimeoutRef.current);
    if (ms) {
      monitorTimeoutRef.current = window.setTimeout(() => {
        stopMonitoringAll();
        setMonitoring(false);
        monitorTimeoutRef.current = null;
        toast.success("Odświeżanie zakończone. Odczyty zapisano lokalnie.");
      }, ms);
    }
  };

  const handleStopMonitoring = () => {
    if (monitorTimeoutRef.current) {
      window.clearTimeout(monitorTimeoutRef.current);
      monitorTimeoutRef.current = null;
    }
    stopMonitoringAll();
    setMonitoring(false);
    toast.info("Odświeżanie zatrzymane.");
  };

  const closeTips = () => {
    setShowTips(false);
    patchSettings({ showFirstRunTips: false });
  };

  return (
    <div className="space-y-8">
      {showTips && sensors.length === 0 && (
        <section className="rounded-3xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="flex-1">
              <h2 className="font-display text-sm font-bold text-primary">Pierwsze uruchomienie</h2>
              <p className="mt-1 text-sm text-muted-foreground">Dodaj czujnik ELA, nadaj mu nazwę pomieszczenia i kliknij „Odśwież wszystkie czujniki". Dane zostają lokalnie w telefonie, a techniczna diagnostyka jest ukryta w ustawieniach.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />Dodaj czujnik</Button>
                <Button size="sm" variant="ghost" onClick={closeTips}>Ukryj poradę</Button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="relative overflow-hidden rounded-3xl bg-gradient-hero p-7 text-white shadow-glow noise sm:p-8">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-8 h-56 w-56 rounded-full bg-white/8 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-medium opacity-75">{new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</p>
            <h1 className="mt-1 font-display text-4xl font-black leading-tight sm:text-5xl">Centrum monitoringu</h1>
            <p className="mt-2 max-w-xl text-sm opacity-80">Szybko sprawdzisz temperaturę, baterię, zasięg i pomieszczenia wymagające uwagi.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Select value={monitorMode} onValueChange={(v) => setMonitorMode(v as MonitorDuration)}>
              <SelectTrigger className="h-11 border-white/25 bg-white/15 text-white backdrop-blur sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(MONITOR_LABEL).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent>
            </Select>
            {monitoring ? (
              <Button size="lg" onClick={handleStopMonitoring} className="bg-white/20 hover:bg-white/30 border border-white/25 text-white backdrop-blur shadow-none"><Square className="mr-2 h-4 w-4" />Zatrzymaj</Button>
            ) : (
              <Button size="lg" onClick={handleMonitorAll} disabled={sensors.length === 0} className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow"><Radio className="mr-2 h-4 w-4" />Odśwież wszystkie</Button>
            )}
            <Button size="lg" onClick={() => setAddOpen(true)} className="bg-white/20 hover:bg-white/30 border border-white/25 text-white backdrop-blur shadow-none"><Plus className="mr-2 h-4 w-4" />Dodaj</Button>
          </div>
        </div>
        <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatPill icon={<Thermometer className="h-4 w-4" />} label="Średnia" value={avgTemp != null ? formatTemp(avgTemp, settings.tempUnit) : "—"} sub={`${connected.length}/${sensors.length} świeże`} />
          <StatPill icon={<Droplets className="h-4 w-4" />} label="Wilgotność" value={avgHumidity != null ? formatHumidity(avgHumidity) : "—"} sub="RHT" />
          <StatPill icon={<Wifi className="h-4 w-4" />} label="Świeże odczyty" value={`${connected.length}`} sub="do 2 min" />
          <StatPill icon={<BatteryMedium className="h-4 w-4" />} label="Bateria" value={lowBattery.length ? `${lowBattery.length}` : "OK"} sub={lowBattery.length ? "do sprawdzenia" : "brak alertów"} />
          <StatPill icon={<ShieldCheck className="h-4 w-4" />} label="Wymaga uwagi" value={`${problems.length}`} sub={problems.length ? `${staleSensors.length} stare · ${offlineSensors.length} offline` : "wszystko OK"} />
        </div>
      </section>

      {problems.length > 0 && (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive text-sm">Wymaga uwagi</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {problems.slice(0, 8).map((s) => (
                  <button key={s.id} onClick={() => setFilter("attention")} className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-xs font-medium text-destructive">
                    <span className="h-2 w-2 rounded-full bg-destructive" />{s.roomName}: {s.lastTemperature != null ? formatTemp(s.lastTemperature, settings.tempUnit) : "brak świeżego odczytu"}{s.lastHumidity != null ? ` · ${formatHumidity(s.lastHumidity)}` : ""}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {withTemp.length > 1 && (
        <section className="grid gap-3 sm:grid-cols-2">
          <MiniExtreme icon={<TrendingDown className="h-4 w-4" />} title="Najchłodniej" sensor={minSensor} value={formatTemp(minSensor?.lastTemperature, settings.tempUnit)} />
          <MiniExtreme icon={<TrendingUp className="h-4 w-4" />} title="Najcieplej" sensor={maxSensor} value={formatTemp(maxSensor?.lastTemperature, settings.tempUnit)} />
        </section>
      )}

      {pinnedSensors.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">Przypięte</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pinnedSensors.map((s) => <SensorCard key={s.id} sensor={s} compact onTogglePin={() => handlePin(s)} onToggleMute={() => handleMute(s)} onListen={() => { listen(s); }} />)}
          </div>
        </section>
      )}

      <section>
        {(sensors.length > 0) && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">{pinnedSensors.length > 0 ? "Pozostałe pomieszczenia" : "Czujniki"}</h2>
              <p className="text-xs text-muted-foreground">{connected.length} online · {staleSensors.length} stare · {offlineSensors.length} offline</p>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto rounded-full border bg-card p-1">
              <ListFilter className="ml-2 h-4 w-4 text-muted-foreground" />
              {(["all", "attention", "online", "offline"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={cn("whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition", filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{f === "all" ? "Wszystkie" : f === "attention" ? "Uwaga" : f === "online" ? "Online" : "Offline"}</button>)}
            </div>
          </div>
        )}
        {sensors.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border p-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-muted"><Thermometer className="h-8 w-8 text-muted-foreground" /></div>
            <h3 className="font-display text-lg font-bold">Brak czujników</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">1) Włącz Bluetooth. 2) Dodaj ELA Blue PUCK T/RHT. 3) Nadaj nazwę pomieszczenia. 4) Kliknij „Odśwież wszystkie czujniki".</p>
            <Button onClick={() => setAddOpen(true)} className="mt-6"><Plus className="mr-2 h-4 w-4" /> Dodaj pierwszy czujnik</Button>
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-muted-foreground">Brak czujników w wybranym filtrze.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((s) => <SensorCard key={s.id} sensor={s} compact onTogglePin={() => handlePin(s)} onToggleMute={() => handleMute(s)} onListen={() => { listen(s); }} />)}
          </div>
        )}
      </section>
      <AddSensorModal open={addOpen} onOpenChange={setAddOpen} onAdded={refresh} />
    </div>
  );
}

function StatPill({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return <div className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur"><div className="flex items-center gap-2 text-[10px] uppercase tracking-widest opacity-70">{icon}{label}</div><div className="mt-1 font-display text-2xl font-black leading-none">{value}</div>{sub && <div className="mt-1 text-[11px] opacity-65">{sub}</div>}</div>;
}

function MiniExtreme({ icon, title, sensor, value }: { icon: ReactNode; title: string; sensor: Sensor | null; value: string }) {
  return <div className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{title}</div><div className="mt-1 flex items-end justify-between gap-3"><div className="font-display text-2xl font-black">{value}</div><div className="text-sm font-semibold">{sensor?.roomName ?? "—"}</div></div></div>;
}
