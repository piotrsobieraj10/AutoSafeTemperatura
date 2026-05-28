// pages/SensorsPage.tsx v5.6 — zarządzanie czujnikami, kalibracja, alerty, diagnostyka
import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddSensorModal } from "@/components/AddSensorModal";
import { useSensors } from "@/hooks/useSensors";
import { clearMeasurements, formatBattery, formatHumidity, formatTemp, getSettings } from "@/services/storageService";
import { getBatteryLabel, downloadTextFile } from "@/services/storageService";
import { getProfile, sensorProfiles } from "@/services/sensorProfiles";
import type { Sensor } from "@/types/sensor";
import { Activity, BatteryMedium, Bluetooth, Copy, Droplets, Plus, Radio, RefreshCw, Save, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";

const ICON_OPTIONS = [
  { value: "home", label: "Dom" }, { value: "bed", label: "Sypialnia" }, { value: "kitchen", label: "Kuchnia" },
  { value: "bath", label: "Łazienka" }, { value: "garage", label: "Garaż" }, { value: "boiler", label: "Kotłownia" },
  { value: "warehouse", label: "Magazyn" }, { value: "leaf", label: "Ogród" }, { value: "sensor", label: "Czujnik" },
] as const;

export function SensorsPage() {
  const { sensors, upsert, remove, refresh, listen, listenAll } = useSensors();
  const [addOpen, setAddOpen] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const settings = getSettings();

  const startAll = async () => {
    setBusyAll(true);
    toast.info("Start monitoringu wszystkich czujników BLE.");
    const ok = await listenAll();
    setBusyAll(false);
    ok ? toast.success("Monitoring BLE uruchomiony.") : toast.warning("Nie udało się uruchomić monitoringu BLE.");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black">Czujniki</h1>
          <p className="text-sm text-muted-foreground">{sensors.length} urządzeń · konfiguracja, kalibracja i alerty.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={startAll} disabled={busyAll || sensors.length === 0}><Radio className="mr-2 h-4 w-4" />Monitoruj wszystkie</Button>
          <Button onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />Dodaj</Button>
        </div>
      </div>

      {sensors.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Brak czujników — kliknij „Dodaj”.</CardContent></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {sensors.map((s) => <SensorEditor key={s.id} sensor={s} upsert={upsert} remove={remove} listen={listen} tempUnit={settings.tempUnit} />)}
        </div>
      )}
      <AddSensorModal open={addOpen} onOpenChange={setAddOpen} onAdded={refresh} />
    </div>
  );
}

function SensorEditor({ sensor, upsert, remove, listen, tempUnit }: { sensor: Sensor; upsert: (s: Sensor) => void; remove: (id: string) => void; listen: (s: Sensor) => Promise<boolean>; tempUnit: "C" | "F" }) {
  const [draft, setDraft] = useState<Sensor>(sensor);
  const profile = getProfile(draft.profileId);
  const battery = getBatteryLabel(draft.batteryVoltage, draft.batteryLevel);
  const settings = getSettings();

  const save = () => { upsert(draft); toast.success("Zapisano ustawienia czujnika."); };
  const copyDiag = async () => {
    const txt = [
      `room=${sensor.roomName}`,
      `name=${sensor.bluetoothName}`,
      `id=${sensor.deviceId}`,
      `profile=${sensor.profileId}`,
      `status=${sensor.status}`,
      `temperature=${sensor.lastTemperature ?? ""}`,
      `humidity=${sensor.lastHumidity ?? ""}`,
      `batteryMv=${sensor.batteryVoltage ?? ""}`,
      `rssi=${sensor.lastRssi ?? ""}`,
      `lastReadAt=${sensor.lastReadAt ?? ""}`,
      `serviceData=${sensor.rawServiceData ?? ""}`,
      `manufacturerData=${sensor.rawManufacturerData ?? ""}`,
      `debug=${sensor.bleDebug ?? ""}`,
    ].join("\n");
    await navigator.clipboard?.writeText(txt).catch(() => undefined);
    downloadTextFile(`autosafe-ble-${sensor.bluetoothName || sensor.roomName}.txt`, txt);
    toast.success("Diagnostyka skopiowana i pobrana jako plik TXT.");
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-black">{sensor.roomName}</h2>
              <Badge variant={sensor.status === "connected" ? "default" : sensor.status === "scanning" ? "secondary" : "outline"}>{sensor.status === "connected" ? "Online" : sensor.status === "scanning" ? "Nasłuch" : "Offline"}</Badge>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{sensor.bluetoothName}</p>
            <p className="text-xs text-muted-foreground">{profile?.name ?? sensor.profileId}</p>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="icon" onClick={() => listen(sensor)} title="Nasłuchuj BLE"><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={copyDiag} title="Kopiuj diagnostykę"><Copy className="h-4 w-4" /></Button>
            <Button variant="destructive" size="icon" onClick={() => { if (confirm("Usunąć czujnik i jego historię?")) remove(sensor.id); }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric icon={<Activity className="h-4 w-4" />} label="Temperatura" value={formatTemp(sensor.lastTemperature, tempUnit)} />
          <Metric icon={<Droplets className="h-4 w-4" />} label="Wilgotność" value={formatHumidity(sensor.lastHumidity)} />
          <Metric icon={<BatteryMedium className="h-4 w-4" />} label="Bateria" value={formatBattery(sensor.batteryVoltage, sensor.batteryLevel)} sub={battery.label} />
          <Metric icon={<Wifi className="h-4 w-4" />} label="RSSI" value={sensor.lastRssi != null ? `${sensor.lastRssi} dBm` : "—"} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nazwa pomieszczenia"><Input value={draft.roomName} onChange={(e) => setDraft({ ...draft, roomName: e.target.value })} /></Field>
          <Field label="Opis / miejsce"><Input value={draft.customName ?? ""} onChange={(e) => setDraft({ ...draft, customName: e.target.value || undefined })} placeholder="np. przy oknie, przy piecu" /></Field>
          <Field label="Ikona"><Select value={draft.locationIcon ?? "sensor"} onValueChange={(v) => setDraft({ ...draft, locationIcon: v as Sensor["locationIcon"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ICON_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Profil"><Select value={draft.profileId} onValueChange={(v) => setDraft({ ...draft, profileId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sensorProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></Field>
        </div>

        <div className="rounded-2xl bg-muted/40 p-4">
          <div className="mb-3 text-sm font-bold">Kalibracja</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Korekta temperatury °C"><Input type="number" step="0.1" value={draft.temperatureOffset ?? 0} onChange={(e) => setDraft({ ...draft, temperatureOffset: Number(e.target.value || 0) })} /></Field>
            <Field label="Korekta wilgotności %"><Input type="number" step="1" value={draft.humidityOffset ?? 0} onChange={(e) => setDraft({ ...draft, humidityOffset: Number(e.target.value || 0) })} /></Field>
          </div>
        </div>

        <div className="rounded-2xl bg-muted/40 p-4">
          <div className="mb-3 text-sm font-bold">Alerty</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Min °C"><Input type="number" value={draft.minTempAlert ?? ""} onChange={(e) => setDraft({ ...draft, minTempAlert: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
            <Field label="Max °C"><Input type="number" value={draft.maxTempAlert ?? ""} onChange={(e) => setDraft({ ...draft, maxTempAlert: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
            <Field label="Min wilg. %"><Input type="number" value={draft.minHumidityAlert ?? ""} onChange={(e) => setDraft({ ...draft, minHumidityAlert: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
            <Field label="Max wilg. %"><Input type="number" value={draft.maxHumidityAlert ?? ""} onChange={(e) => setDraft({ ...draft, maxHumidityAlert: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
          </div>
        </div>

        {settings.showBleDiagnostics && (
          <pre className="max-h-44 overflow-auto rounded-2xl border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
{`deviceId: ${sensor.deviceId}
serviceData: ${sensor.rawServiceData ?? "—"}
manufacturerData: ${sensor.rawManufacturerData ?? "—"}
debug: ${sensor.bleDebug ?? "—"}
ostatni odczyt: ${sensor.lastReadAt ?? "—"}`}
          </pre>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" onClick={() => { clearMeasurements(sensor.id); toast.success("Historia czujnika wyczyszczona."); }}>Wyczyść historię</Button>
          <Button onClick={save}><Save className="mr-2 h-4 w-4" />Zapisz ustawienia</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return <div className="rounded-2xl bg-muted/50 p-3"><div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">{icon}{label}</div><div className="mt-1 font-display text-lg font-black">{value}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
