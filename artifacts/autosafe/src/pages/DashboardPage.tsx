import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddSensorModal } from "@/components/AddSensorModal";
import { SensorCard } from "@/components/SensorCard";
import { useSensors } from "@/hooks/useSensors";
import { browserAutoRefreshLimitationMessage, getAutoRefreshStatus, refreshIntervalLabel, subscribeAutoRefreshStatus } from "@/services/autoRefreshService";
import { getSensorGroups, getSettings, patchSettings, saveSensorGroups } from "@/services/storageService";
import { getGroupIcon, getUiStatus } from "@/services/sensorUiService";
import type { Sensor, SensorGroup } from "@/types/sensor";
import { ChevronDown, Plus, Radio, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const formatTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "—";

const groupSensors = (groups: SensorGroup[], sensors: Sensor[]) => groups
  .map((group) => ({ group, sensors: sensors.filter((s) => (s.groupId || groups[0]?.id) === group.id) }))
  .filter((x) => x.sensors.length > 0 || x.group.id === groups[0]?.id);

export function DashboardPage() {
  const { sensors, listen, listenAll, stopMonitoringAll } = useSensors();
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState(() => getSensorGroups());
  const [selected, setSelected] = useState<Sensor | null>(null);
  const busyRef = useRef(false);
  const [autoStatus, setAutoStatus] = useState(() => getAutoRefreshStatus());
  const [now, setNow] = useState(() => Date.now());
  const settings = getSettings();

  const stats = useMemo(() => {
    const fresh = sensors.filter((s) => getUiStatus(s) === "fresh").length;
    const stale = sensors.filter((s) => getUiStatus(s) === "stale").length;
    const offline = sensors.filter((s) => getUiStatus(s) === "offline").length;
    const scanning = sensors.filter((s) => getUiStatus(s) === "scanning").length;
    return { fresh, stale, offline, scanning };
  }, [sensors]);

  const grouped = useMemo(() => groupSensors(groups, sensors), [groups, sensors]);
  const nextRefreshIn = autoStatus.nextRefreshAt ? Math.max(0, Math.ceil((autoStatus.nextRefreshAt - now) / 1000)) : null;

  const refreshAll = useCallback(async (silent = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const ok = await listenAll({ automatic: false });
    setBusy(false);
    busyRef.current = false;
    if (!silent) ok ? toast.success("Odświeżanie BLE uruchomione.") : toast.warning("Nie udało się uruchomić odświeżania BLE.");
  }, [listenAll]);

  useEffect(() => {
    const unsubscribe = subscribeAutoRefreshStatus(setAutoStatus);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { unsubscribe(); window.clearInterval(tick); };
  }, []);

  useEffect(() => () => stopMonitoringAll(), [stopMonitoringAll]);

  const toggleGroup = (group: SensorGroup) => {
    const next = groups.map((g) => g.id === group.id ? { ...g, collapsed: !g.collapsed } : g);
    setGroups(next); saveSensorGroups(next);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-black">Centrum monitoringu</h1>
            <p className="text-xs text-muted-foreground">{sensors.length} czujników · {stats.fresh} świeże · {stats.stale} stare · {stats.offline} offline</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {busy ? <Button variant="outline" onClick={() => { stopMonitoringAll(); setBusy(false); }}><Square className="mr-2 h-4 w-4" />Zatrzymaj</Button> : <Button onClick={() => refreshAll(false)} disabled={sensors.length === 0}><RefreshCw className="mr-2 h-4 w-4" />Odśwież wszystkie</Button>}
            <Button variant="outline" onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />Dodaj</Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          <Stat label="Czujniki" value={sensors.length} />
          <Stat label="Online" value={stats.fresh} tone="ok" />
          <Stat label="Stare" value={stats.stale} tone="warn" />
          <Stat label="Offline" value={stats.offline} tone="bad" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Radio className="h-3.5 w-3.5" />
          <span>Auto odświeżanie: {autoStatus.enabled ? refreshIntervalLabel(autoStatus.intervalMs) : "ręcznie"}</span>
          <span>· Ostatnie odświeżenie: {formatTime(autoStatus.lastRefreshAt)}</span>
          {autoStatus.scanning && <span>· Skanowanie trwa…</span>}
          {nextRefreshIn != null && autoStatus.enabled && !autoStatus.scanning && <span>· Następne za: {nextRefreshIn} s</span>}
          <span>· tło: {settings.backgroundMonitoringMode === "eco" ? "oszczędny 5 min" : settings.backgroundMonitoringMode === "normal" ? "normalny 2 min" : settings.backgroundMonitoringMode === "test" ? "testowy 30 s" : "wyłączony"}</span>
        </div>
        {autoStatus.lastError === browserAutoRefreshLimitationMessage && <p className="mt-2 text-[11px] text-muted-foreground">{browserAutoRefreshLimitationMessage}</p>}
      </section>

      {sensors.length === 0 ? (
        <section className="rounded-3xl border-2 border-dashed border-border p-12 text-center"><h2 className="font-display text-lg font-bold">Brak czujników</h2><p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">Dodaj czujnik ELA Blue PUCK T/RHT, wybierz go z listy i nadaj pomieszczenie.</p><Button onClick={() => setAddOpen(true)} className="mt-5"><Plus className="mr-2 h-4 w-4" />Dodaj pierwszy czujnik</Button></section>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ group, sensors: groupList }) => {
            const Icon = getGroupIcon(group);
            const fresh = groupList.filter((s) => getUiStatus(s) === "fresh").length;
            return <section key={group.id} className="rounded-3xl border bg-card/80 p-3">
              <button onClick={() => toggleGroup(group)} className="flex w-full items-center justify-between gap-3 px-1 py-1 text-left">
                <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div className="min-w-0"><h2 className="truncate font-display text-lg font-black">{group.name}</h2><p className="truncate text-xs text-muted-foreground">{groupList.length} czujników · {fresh} online</p></div></div>
                <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition", !group.collapsed && "rotate-180")} />
              </button>
              {!group.collapsed && <div className="mt-3 grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 lg:grid-cols-3">{groupList.map((s) => <SensorCard key={s.id} sensor={s} onClick={() => setSelected(s)} onListen={() => listen(s)} compact />)}</div>}
            </section>;
          })}
        </div>
      )}

      {selected && <section className="rounded-3xl border bg-card p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-xl font-black">{selected.roomName}</h2><p className="font-mono text-xs text-muted-foreground">{selected.bluetoothName}</p></div><Button variant="outline" onClick={() => setSelected(null)}>Zamknij</Button></div><div className="mt-3 grid grid-cols-2 gap-2"><Button onClick={() => listen(selected)}><RefreshCw className="mr-2 h-4 w-4" />Odśwież</Button><Button variant="outline" onClick={() => { patchSettings({ showBleDiagnostics: true }); toast.info("Diagnostyka BLE jest dostępna w szczegółach zakładki Czujniki."); }}>Diagnostyka</Button></div></section>}
      <AddSensorModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "bad" }) {
  return <div className={cn("rounded-2xl bg-muted/45 px-2 py-2", tone === "ok" && "bg-emerald-500/10", tone === "warn" && "bg-amber-500/10", tone === "bad" && "bg-destructive/10")}><div className="font-display text-xl font-black">{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></div>;
}
