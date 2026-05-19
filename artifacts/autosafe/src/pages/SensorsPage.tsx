import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bluetooth, BluetoothOff, Plus, RefreshCw, Thermometer, Trash2 } from "lucide-react";
import { useSensors } from "@/hooks/useSensors";
import { AddSensorModal } from "@/components/AddSensorModal";
import { reconnectSensor } from "@/services/bluetoothService";
import { readSensorNow } from "@/services/readingService";
import { getProfile, sensorProfiles } from "@/services/sensorProfiles";
import { toast } from "sonner";
import type { Sensor } from "@/types/sensor";
import { formatReadingTime } from "@/config/app";

export function SensorsPage() {
  const { sensors, upsert, remove, refresh } = useSensors();
  const [addOpen, setAddOpen] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);

  const handleReconnect = async (s: Sensor) => {
    if (s.isDemo) {
      toast.info("To czujnik demo — zawsze połączony.");
      return;
    }
    try {
      await reconnectSensor(s);
      upsert({ ...s, status: "connected" });
      toast.success("Połączono ponownie.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Nie udało się połączyć.";
      toast.error(msg);
      upsert({ ...s, status: "error" });
    }
  };

  const handleReadNow = async (s: Sensor) => {
    if (s.isDemo) {
      toast.info("Czujnik demo aktualizuje się automatycznie co kilka sekund.");
      return;
    }
    setReadingId(s.id);
    try {
      const updated = await readSensorNow(s);
      refresh();
      toast.success(`Odczytano ${updated.roomName}: ${updated.lastTemperature?.toFixed(1) ?? "—"}°C${updated.lastHumidity != null ? ` / ${updated.lastHumidity.toFixed(0)}%` : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Nie udało się odczytać czujnika.";
      toast.error(msg);
      refresh();
    } finally {
      setReadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Czujniki</h1>
          <p className="text-sm text-muted-foreground">Dodawanie, ręczny MAC, profile GATT i progi alertów.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Dodaj
        </Button>
      </div>

      {sensors.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Brak czujników.</CardContent></Card>
      )}

      <div className="grid gap-4">
        {sensors.map((s) => {
          const profile = getProfile(s.profileId);
          return (
            <Card key={s.id} className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b bg-muted/25 pb-4">
                <CardTitle className="flex min-w-0 items-center gap-2">
                  {s.status === "connected" ? <Bluetooth className="h-4 w-4 text-ok" /> : <BluetoothOff className="h-4 w-4 text-muted-foreground" />}
                  <span className="truncate">{s.roomName}</span>
                  {s.isDemo && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">DEMO</span>}
                </CardTitle>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" title="Połącz ponownie" onClick={() => handleReconnect(s)}><RefreshCw className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Odczytaj teraz" disabled={readingId === s.id} onClick={() => handleReadNow(s)}>
                    <Thermometer className={readingId === s.id ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
                  </Button>
                  <Button size="icon" variant="ghost" title="Usuń" onClick={() => { remove(s.id); toast.success("Usunięto czujnik."); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Bluetooth</Label>
                    <div className="text-sm">{s.bluetoothName}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Device ID</Label>
                    <div className="truncate text-xs font-mono">{s.deviceId}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Profil</Label>
                    <div className="truncate text-sm">{profile?.name ?? "Nieustawiony"}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Ostatni odczyt</Label>
                    <div className="text-sm">
                      {s.lastTemperature != null ? `${s.lastTemperature.toFixed(1)}°C` : "—"}
                      {s.lastHumidity != null ? ` · ${s.lastHumidity.toFixed(0)}%` : ""}
                      <span className="block text-xs text-muted-foreground">{formatReadingTime(s.lastReadAt)}</span>
                    </div>
                  </div>
                  {s.macAddress && (
                    <div>
                      <Label className="text-xs text-muted-foreground">MAC</Label>
                      <div className="text-xs font-mono">{s.macAddress}</div>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label className="text-xs">Pomieszczenie</Label>
                    <Input value={s.roomName} onChange={(e) => upsert({ ...s, roomName: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Opis</Label>
                    <Input value={s.customName ?? ""} onChange={(e) => upsert({ ...s, customName: e.target.value || undefined })} placeholder="np. przy piecu" />
                  </div>
                  <div>
                    <Label className="text-xs">Profil czujnika</Label>
                    <Select value={s.profileId ?? ""} onValueChange={(profileId) => upsert({ ...s, profileId })}>
                      <SelectTrigger><SelectValue placeholder="Wybierz profil" /></SelectTrigger>
                      <SelectContent>
                        {sensorProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Nazwa Bluetooth</Label>
                    <Input value={s.bluetoothName} onChange={(e) => upsert({ ...s, bluetoothName: e.target.value })} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label className="text-xs">Min °C</Label>
                    <Input type="number" value={s.minTempAlert ?? ""} onChange={(e) => upsert({ ...s, minTempAlert: e.target.value === "" ? undefined : +e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Max °C</Label>
                    <Input type="number" value={s.maxTempAlert ?? ""} onChange={(e) => upsert({ ...s, maxTempAlert: e.target.value === "" ? undefined : +e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Min % wilg.</Label>
                    <Input type="number" value={s.minHumidityAlert ?? ""} onChange={(e) => upsert({ ...s, minHumidityAlert: e.target.value === "" ? undefined : +e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Max % wilg.</Label>
                    <Input type="number" value={s.maxHumidityAlert ?? ""} onChange={(e) => upsert({ ...s, maxHumidityAlert: e.target.value === "" ? undefined : +e.target.value })} />
                  </div>
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
