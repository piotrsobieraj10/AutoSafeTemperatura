// routes/sensors.tsx v5.2 — diagnostyka BLE, requestLEScan i ponowny wybór czujnika ELA
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, BatteryFull, BatteryLow, BatteryMedium, Bluetooth, BluetoothOff, Copy, Droplets, Gauge, Plus, Radio, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { useSensors } from "@/hooks/useSensors";
import { AddSensorModal } from "@/components/AddSensorModal";
import { formatTemp, formatHumidity, formatPressure, getSettings, clearMeasurements } from "@/services/storageService";
import { getProfile } from "@/services/sensorProfiles";
import { toast } from "sonner";
import type { Sensor } from "@/types/sensor";
import { cn } from "@/lib/utils";

export function SensorsPage() {
  const { sensors, upsert, remove, refresh, listen } = useSensors();
  const [addOpen, setAddOpen] = useState(false);
  const settings = getSettings();

  const handleListen = async (s: Sensor) => {
    if (s.isDemo) { toast.info("Czujnik demo jest zawsze połączony."); return; }
    upsert({ ...s, status: "scanning", bleDebug: `Nasłuch BLE aktywny — szukam ${s.bluetoothName}` });
    const ok = await listen(s);
    if (ok) {
      toast.success("Nasłuch BLE aktywny. Jeśli nie było cache Chrome, aplikacja skanuje reklamy po nazwie albo poprosi o ponowny wybór czujnika.");
    } else {
      toast.warning("Nie udało się uruchomić nasłuchu. Kliknij ponownie i wybierz czujnik w oknie Bluetooth, jeśli Chrome o to poprosi.");
    }
  };

  const copyDiag = async (s: Sensor) => {
    const txt = [
      `room=${s.roomName}`,
      `name=${s.bluetoothName}`,
      `id=${s.deviceId}`,
      `profile=${s.profileId}`,
      `status=${s.status}`,
      `temp=${s.lastTemperature ?? ""}`,
      `humidity=${s.lastHumidity ?? ""}`,
      `batteryMv=${s.batteryVoltage ?? ""}`,
      `rssi=${s.lastRssi ?? ""}`,
      `lastReadAt=${s.lastReadAt ?? ""}`,
      `serviceData=${s.rawServiceData ?? ""}`,
      `manufacturerData=${s.rawManufacturerData ?? ""}`,
      `debug=${s.bleDebug ?? ""}`,
    ].join("\n");
    await navigator.clipboard?.writeText(txt).catch(() => undefined);
    toast.success("Dane diagnostyczne skopiowane.");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Czujniki</h1>
          <p className="text-sm text-muted-foreground">{sensors.length} urządzeń · {sensors.filter((s) => s.status === "connected").length} online</p>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />Dodaj</Button>
      </div>

      {sensors.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Brak czujników. Kliknij „Dodaj" i wybierz „Skanuj ELA Blue PUCK T/RHT".</CardContent></Card>
      )}

      <div className="grid gap-4">
        {sensors.map((s) => {
          const profile = getProfile(s.profileId);
          const isAdv = profile?.source === "advertisement";
          const label = statusLabel(s.status);
          return (
            <Card key={s.id} className={cn("overflow-hidden transition-all", s.status === "error" && "border-destructive/40", s.status === "pending" && "border-primary/30")}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {isAdv ? <Radio className="h-4 w-4 text-primary shrink-0" /> : s.status === "connected" ? <Bluetooth className="h-4 w-4 text-green-500 shrink-0" /> : <BluetoothOff className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className="font-bold">{s.roomName}</span>
                  <span className="text-muted-foreground font-mono text-xs">{s.bluetoothName}</span>
                  {s.customName && <span className="text-muted-foreground font-normal text-sm">· {s.customName}</span>}
                  <Badge variant={s.status === "connected" ? "default" : s.status === "error" ? "destructive" : "secondary"} className="text-xs">{label}</Badge>
                  {profile && <Badge variant="outline" className="text-xs">{profile.name}</Badge>}
                  {s.isDemo && <Badge className="text-xs bg-primary/15 text-primary border-primary/30">DEMO</Badge>}
                </CardTitle>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" title="Odśwież BLE / nasłuchuj reklam" onClick={() => handleListen(s)}><RefreshCw className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Kopiuj diagnostykę BLE" onClick={() => copyDiag(s)}><Copy className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Wyczyść historię" onClick={() => { clearMeasurements(s.id); toast.success("Historia wyczyszczona."); }}><Activity className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Usuń" onClick={() => { remove(s.id); toast.success("Usunięto czujnik."); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {(s.status === "pending" || s.status === "scanning") && !s.lastTemperature && (
                  <div className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">
                    {s.status === "scanning" ? `Nasłuch BLE aktywny — szukam ${s.bluetoothName}.` : "Czujnik zapisany — uruchom Nasłuchuj BLE, aby odebrać dane z advertising."}
                  </div>
                )}

                {!s.isDemo && (
                  <Button className="w-full" onClick={() => handleListen(s)}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Nasłuchuj BLE / odśwież reklamę
                  </Button>
                )}
                {s.status === "error" && s.bleDebug && (
                  <div className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{s.bleDebug}</div>
                )}

                <div className="grid gap-2 sm:grid-cols-4">
                  <ReadingCell label="Temperatura" value={formatTemp(s.lastTemperature, settings.tempUnit)} icon={<Activity className="h-3.5 w-3.5" />} />
                  {profile?.supportsHumidity && <ReadingCell label="Wilgotność" value={formatHumidity(s.lastHumidity)} icon={<Droplets className="h-3.5 w-3.5" />} />}
                  {profile?.supportsPressure && <ReadingCell label="Ciśnienie" value={formatPressure(s.lastPressure)} icon={<Gauge className="h-3.5 w-3.5" />} />}
                  {(profile?.supportsBattery || s.batteryVoltage != null || s.batteryLevel != null) && (
                    <ReadingCell label="Bateria" icon={batteryIcon(s)} value={s.batteryVoltage != null ? `${s.batteryVoltage} mV` : s.batteryLevel != null ? `${s.batteryLevel}%` : "—"} warn={(s.batteryLevel ?? 100) < 20} />
                  )}
                </div>

                {s.lastRssi != null && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {s.lastRssi > -70 ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                    RSSI: {s.lastRssi} dBm · {s.lastRssi > -60 ? "Doskonały" : s.lastRssi > -75 ? "Dobry" : "Słaby"} sygnał
                  </div>
                )}

                <div className="rounded-xl border bg-muted/30 p-3 text-xs">
                  <div className="mb-2 font-semibold">Diagnostyka BLE</div>
                  <div className="grid gap-1 font-mono text-[11px] text-muted-foreground">
                    <span>deviceId: {s.deviceId}</span>
                    <span>serviceData: {s.rawServiceData || "—"}</span>
                    <span>manufacturerData: {s.rawManufacturerData || "—"}</span>
                    <span>debug: {s.bleDebug || "—"}</span>
                    <span>ostatnia ramka: {s.lastReadAt ? new Date(s.lastReadAt).toLocaleString("pl-PL") : "—"}</span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5"><Label className="text-xs">Nazwa pomieszczenia</Label><Input value={s.roomName} onChange={(e) => upsert({ ...s, roomName: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Min °{settings.tempUnit} (alert)</Label><Input type="number" value={s.minTempAlert ?? ""} onChange={(e) => upsert({ ...s, minTempAlert: e.target.value === "" ? undefined : +e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Max °{settings.tempUnit} (alert)</Label><Input type="number" value={s.maxTempAlert ?? ""} onChange={(e) => upsert({ ...s, maxTempAlert: e.target.value === "" ? undefined : +e.target.value })} /></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <AddSensorModal open={addOpen} onOpenChange={setAddOpen} onAdded={refresh} />
    </div>
  );
}

function statusLabel(status: Sensor["status"]) {
  if (status === "connected") return "Online";
  if (status === "pending") return "Oczekuje";
  if (status === "scanning") return "Nasłuch";
  if (status === "error") return "Błąd";
  return "Offline";
}

function batteryIcon(s: Sensor) {
  if ((s.batteryLevel ?? 100) < 20) return <BatteryLow className="h-3.5 w-3.5 text-destructive" />;
  if ((s.batteryLevel ?? 100) < 60) return <BatteryMedium className="h-3.5 w-3.5" />;
  return <BatteryFull className="h-3.5 w-3.5" />;
}

function ReadingCell({ label, value, icon, warn }: { label: string; value: string; icon: React.ReactNode; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{icon} {label}</div>
      <div className={cn("font-display font-bold text-base", warn && "text-destructive")}>{value}</div>
    </div>
  );
}
