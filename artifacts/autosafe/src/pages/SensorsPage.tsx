import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AddSensorModal } from "@/components/AddSensorModal";
import { SensorCard } from "@/components/SensorCard";
import { useSensors } from "@/hooks/useSensors";
import { clearMeasurements, getMeasurementsForSensor, getSensorGroups, getSettings, upsertSensor } from "@/services/storageService";
import { sensorProfiles } from "@/services/sensorProfiles";
import { SENSOR_ICON_OPTIONS, getGroupIcon, getSensorIcon, getUiStatus, relativeTime, uiStatusLabel } from "@/services/sensorUiService";
import type { Sensor } from "@/types/sensor";
import { Activity, Bell, Bluetooth, History, Plus, RefreshCw, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function SensorsPage() {
  const { sensors, remove, refresh, listen, listenAll } = useSensors();
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Sensor | null>(null);
  const [edit, setEdit] = useState<Sensor | null>(null);
  const [diagnostics, setDiagnostics] = useState(false);
  const groups = getSensorGroups();

  const grouped = useMemo(() => groups.map((group) => ({ group, sensors: sensors.filter((s) => (s.groupId || groups[0]?.id) === group.id) })).filter((x) => x.sensors.length > 0), [groups, sensors]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-3xl font-black">Czujniki</h1><p className="text-sm text-muted-foreground">Kompaktowa lista urządzeń. Kliknij czujnik, aby edytować alarmy, kalibrację i diagnostykę.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => listenAll()} disabled={sensors.length === 0}><RefreshCw className="mr-2 h-4 w-4" />Odśwież wszystkie</Button><Button onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />Dodaj</Button></div>
      </div>

      {sensors.length === 0 ? <Card><CardContent className="py-14 text-center text-muted-foreground">Brak czujników — kliknij „Dodaj”.</CardContent></Card> : <div className="space-y-3">{grouped.map(({ group, sensors: list }) => { const GroupIcon = getGroupIcon(group); return <Card key={group.id}><CardContent className="p-3"><div className="mb-2 flex items-center gap-2 px-1"><GroupIcon className="h-4 w-4 text-primary" /><h2 className="font-display font-black">{group.name}</h2><Badge variant="outline" className="ml-auto">{list.length}</Badge></div><div className="space-y-2">{list.map((s) => <SensorListItem key={s.id} sensor={s} onOpen={() => { setSelected(s); setDiagnostics(false); }} onRefresh={() => listen(s)} />)}</div></CardContent></Card>; })}</div>}

      <AddSensorModal open={addOpen} onOpenChange={setAddOpen} onAdded={refresh} />
      {selected && <SensorDetailsDialog sensor={selected} open={Boolean(selected)} onOpenChange={(o) => { if (!o) setSelected(null); }} onEdit={() => setEdit(selected)} onRefresh={() => listen(selected)} onDelete={() => { if (confirm("Usunąć czujnik i jego historię?")) { remove(selected.id); setSelected(null); } }} diagnostics={diagnostics} setDiagnostics={setDiagnostics} />}
      {edit && <SensorEditDialog sensor={edit} open={Boolean(edit)} onOpenChange={(o) => { if (!o) setEdit(null); }} />}
    </div>
  );
}

function SensorListItem({ sensor, onOpen, onRefresh }: { sensor: Sensor; onOpen: () => void; onRefresh: () => void }) {
  const settings = getSettings();
  const Icon = getSensorIcon(sensor);
  const status = getUiStatus(sensor);
  const summary = [
    sensor.lastTemperature != null ? `${sensor.lastTemperature.toFixed(1).replace(".", ",")}°${settings.tempUnit}` : "—",
    sensor.lastHumidity != null ? `${sensor.lastHumidity.toFixed(0)}%` : null,
    sensor.batteryLevel != null ? `bat. ${sensor.batteryLevel}%` : sensor.batteryVoltage != null ? `${sensor.batteryVoltage} mV` : "bat. —",
    sensor.lastRssi != null ? `${sensor.lastRssi} dBm` : "RSSI —",
  ].filter(Boolean).join(" · ");
  return <div className="flex items-center gap-2 rounded-2xl border bg-card p-2.5"><button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate font-display text-base font-black">{sensor.roomName}</h3><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{uiStatusLabel[status]}</span></div><p className="truncate font-mono text-[11px] text-muted-foreground">{sensor.bluetoothName}</p><p className="truncate text-xs text-muted-foreground">{summary}</p></div></button><Button size="icon" variant="outline" onClick={onRefresh} title="Odśwież"><RefreshCw className="h-4 w-4" /></Button></div>;
}

function SensorDetailsDialog({ sensor, open, onOpenChange, onEdit, onRefresh, onDelete, diagnostics, setDiagnostics }: { sensor: Sensor; open: boolean; onOpenChange: (open: boolean) => void; onEdit: () => void; onRefresh: () => void; onDelete: () => void; diagnostics: boolean; setDiagnostics: (v: boolean) => void }) {
  const measurements = getMeasurementsForSensor(sensor.id).slice(-10).reverse();
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{sensor.roomName}</DialogTitle><DialogDescription>{sensor.bluetoothName} · ostatni odczyt {relativeTime(sensor.lastReadAt)}</DialogDescription></DialogHeader><div className="space-y-4"><SensorCard sensor={sensor} onListen={onRefresh} compact /><div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Action icon={<Settings2 className="h-4 w-4" />} label="Edytuj" onClick={onEdit} /><Action icon={<Bell className="h-4 w-4" />} label="Alarmy" onClick={onEdit} /><Action icon={<SlidersHorizontal className="h-4 w-4" />} label="Kalibracja" onClick={onEdit} /><Action icon={<History className="h-4 w-4" />} label="Historia" onClick={() => toast.info(`Ostatnich pomiarów: ${measurements.length}`)} /><Action icon={<Bluetooth className="h-4 w-4" />} label="Diagnostyka BLE" onClick={() => setDiagnostics(!diagnostics)} /><Button variant="destructive" onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Usuń</Button></div>{measurements.length > 0 && <div className="rounded-2xl border bg-muted/25 p-3"><h3 className="mb-2 text-sm font-bold">Ostatnie pomiary</h3><div className="space-y-1 text-xs text-muted-foreground">{measurements.map((m) => <div key={m.id} className="flex justify-between gap-2"><span>{new Date(m.createdAt).toLocaleString("pl-PL")}</span><span>{m.temperature.toFixed(1)}°C{m.humidity != null ? ` · ${m.humidity.toFixed(0)}%` : ""}</span></div>)}</div></div>}{diagnostics && <pre className="max-h-56 overflow-auto rounded-2xl border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">{`deviceId: ${sensor.deviceId}\nserviceData: ${sensor.rawServiceData ?? "—"}\nmanufacturerData: ${sensor.rawManufacturerData ?? "—"}\nraw: ${sensor.rawAdvertisementHex ?? "—"}\ndebug: ${sensor.bleDebug ?? "—"}`}</pre>}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Zamknij</Button></DialogFooter></DialogContent></Dialog>;
}

function SensorEditDialog({ sensor, open, onOpenChange }: { sensor: Sensor; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [draft, setDraft] = useState<Sensor>(sensor);
  const groups = getSensorGroups();
  const save = () => { upsertSensor(draft); toast.success("Zapisano ustawienia czujnika."); onOpenChange(false); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Edytuj czujnik</DialogTitle><DialogDescription>{sensor.bluetoothName}</DialogDescription></DialogHeader><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Pomieszczenie"><Input value={draft.roomName} onChange={(e) => setDraft({ ...draft, roomName: e.target.value })} /></Field><Field label="Opis"><Input value={draft.customName ?? ""} onChange={(e) => setDraft({ ...draft, customName: e.target.value || undefined })} /></Field></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Grupa"><Select value={draft.groupId ?? groups[0]?.id} onValueChange={(v) => setDraft({ ...draft, groupId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Ikona"><Select value={draft.locationIcon ?? "sensor"} onValueChange={(v) => setDraft({ ...draft, locationIcon: v as Sensor["locationIcon"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SENSOR_ICON_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></Field></div><Field label="Profil"><Select value={draft.profileId} onValueChange={(v) => setDraft({ ...draft, profileId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sensorProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></Field><Section title="Alarmy"><div className="grid gap-3 sm:grid-cols-2"><Field label="Min °C"><Input type="number" value={draft.minTempAlert ?? ""} onChange={(e) => setDraft({ ...draft, minTempAlert: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field><Field label="Max °C"><Input type="number" value={draft.maxTempAlert ?? ""} onChange={(e) => setDraft({ ...draft, maxTempAlert: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field><Field label="Min wilg. %"><Input type="number" value={draft.minHumidityAlert ?? ""} onChange={(e) => setDraft({ ...draft, minHumidityAlert: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field><Field label="Max wilg. %"><Input type="number" value={draft.maxHumidityAlert ?? ""} onChange={(e) => setDraft({ ...draft, maxHumidityAlert: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field></div></Section><Section title="Kalibracja"><div className="grid gap-3 sm:grid-cols-2"><Field label="Korekta temperatury °C"><Input type="number" step="0.1" value={draft.temperatureOffset ?? 0} onChange={(e) => setDraft({ ...draft, temperatureOffset: Number(e.target.value || 0) })} /></Field><Field label="Korekta wilgotności %"><Input type="number" step="1" value={draft.humidityOffset ?? 0} onChange={(e) => setDraft({ ...draft, humidityOffset: Number(e.target.value || 0) })} /></Field></div></Section></div><DialogFooter className="gap-2"><Button variant="outline" onClick={() => { clearMeasurements(sensor.id); toast.success("Historia wyczyszczona."); }}>Wyczyść historię</Button><Button onClick={save}>Zapisz</Button></DialogFooter></DialogContent></Dialog>;
}

function Action({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) { return <Button variant="outline" onClick={onClick}>{icon}<span className="ml-2">{label}</span></Button>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-2xl border bg-muted/25 p-3"><h3 className="mb-2 text-sm font-bold">{title}</h3>{children}</div>; }
