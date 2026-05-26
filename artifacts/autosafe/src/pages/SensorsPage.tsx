import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bluetooth, BluetoothOff, Plus, RefreshCw, Trash2,
  Radio, BatteryLow, BatteryMedium, BatteryFull, Wifi, WifiOff,
} from "lucide-react";
import { useSensors } from "@/hooks/useSensors";
import { AddSensorModal } from "@/components/AddSensorModal";
import { reconnectELASensor, reconnectSensor } from "@/services/bluetoothService";
import { formatTemp, getSettings } from "@/services/storageService";
import { sensorProfiles } from "@/services/sensorProfiles";
import { toast } from "sonner";
import type { Sensor } from "@/types/sensor";
import { formatReadingTime } from "@/config/app";

export function SensorsPage() {
  const { sensors, upsert, remove, refresh } = useSensors();
  const [addOpen, setAddOpen] = useState(false);
  const settings = getSettings();

  const handleReconnect = async (s: Sensor) => {
    if (s.isDemo) {
      toast.info("To czujnik demo — zawsze połączony.");
      return;
    }

    if (s.source === "ela-advertisement") {
      const ok = await reconnectELASensor(s, {
        onDeviceFound: (_device, data) => {
          upsert({
            ...s,
            lastTemperature: data.temperature ?? s.lastTemperature,
            batteryLevel: data.battery ?? s.batteryLevel,
            lastRssi: data.rssi,
            lastReadAt: new Date().toISOString(),
            status: "connected",
          });
          toast.success("ELA Advertisement wznowiony.");
        },
        onError: (e) => {
          toast.error(`Błąd: ${e.message}`);
          upsert({ ...s, status: "error" });
        },
      });
      if (!ok) toast.warning("Urządzenie nie w cache — dodaj czujnik ponownie.");
      return;
    }

    try {
      await reconnectSensor(s);
      upsert({ ...s, status: "connected" });
      toast.success("Połączono ponownie.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się połączyć.");
      upsert({ ...s, status: "error" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Czujniki</h1>
          <p className="text-sm text-muted-foreground">
            Wszystkie urządzenia BLE podpięte do aplikacji.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Dodaj
        </Button>
      </div>

      {sensors.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Brak czujników. Kliknij „Dodaj" aby sparować Blue Puck T.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {sensors.map((s) => {
          const isELA = s.source === "ela-advertisement";
          return (
            <Card key={s.id} className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {isELA ? (
                    <Radio className="h-4 w-4 shrink-0 text-primary" />
                  ) : s.status === "connected" ? (
                    <Bluetooth className="h-4 w-4 shrink-0 text-ok" />
                  ) : (
                    <BluetoothOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span>{s.roomName}</span>
                  {isELA && <Badge variant="secondary" className="text-xs">ELA Advertisement</Badge>}
                  {s.isDemo && <Badge className="bg-primary/15 text-xs text-primary">DEMO</Badge>}
                  <Badge
                    variant={s.status === "connected" ? "default" : "outline"}
                    className="text-xs"
                  >
                    {s.status === "connected" ? "Online"
                      : s.status === "error" ? "Błąd"
                      : s.status === "scanning" ? "Skanuje…"
                      : "Offline"}
                  </Badge>
                </CardTitle>

                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleReconnect(s)} title="Wznów połączenie">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { remove(s.id); toast.success("Usunięto czujnik."); }} title="Usuń czujnik">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nazwa BLE</Label>
                    <div className="truncate text-sm font-medium">{s.bluetoothName}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Device ID</Label>
                    <div className="truncate font-mono text-xs">{s.deviceId}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Ostatni odczyt</Label>
                    <div className="text-sm font-semibold">
                      {formatTemp(s.lastTemperature, settings.tempUnit)}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {formatReadingTime(s.lastReadAt)}
                      </span>
                    </div>
                  </div>
                </div>

                {isELA && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Bateria</Label>
                      <div className="flex items-center gap-1.5 text-sm">
                        {s.batteryLevel != null ? (
                          <>
                            {s.batteryLevel < 20
                              ? <BatteryLow className="h-4 w-4 text-destructive" />
                              : s.batteryLevel < 60
                              ? <BatteryMedium className="h-4 w-4" />
                              : <BatteryFull className="h-4 w-4 text-ok" />}
                            <span className={s.batteryLevel < 20 ? "font-semibold text-destructive" : ""}>
                              {s.batteryLevel}%
                            </span>
                          </>
                        ) : "—"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Sygnał RSSI</Label>
                      <div className="flex items-center gap-1.5 text-sm">
                        {s.lastRssi != null ? (
                          <>
                            {s.lastRssi > -70
                              ? <Wifi className="h-4 w-4 text-ok" />
                              : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                            {s.lastRssi} dBm
                          </>
                        ) : "—"}
                      </div>
                    </div>
                    {s.macAddress && (
                      <div>
                        <Label className="text-xs text-muted-foreground">MAC</Label>
                        <div className="font-mono text-xs">{s.macAddress}</div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Pomieszczenie</Label>
                    <Input value={s.roomName} onChange={(e) => upsert({ ...s, roomName: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Min °{settings.tempUnit} (alert)</Label>
                    <Input
                      type="number"
                      value={s.minTempAlert ?? ""}
                      onChange={(e) => upsert({ ...s, minTempAlert: e.target.value === "" ? undefined : +e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Max °{settings.tempUnit} (alert)</Label>
                    <Input
                      type="number"
                      value={s.maxTempAlert ?? ""}
                      onChange={(e) => upsert({ ...s, maxTempAlert: e.target.value === "" ? undefined : +e.target.value })}
                    />
                  </div>
                </div>

                {!isELA && (
                  <div className="grid gap-3 sm:grid-cols-2">
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
                      <Label className="text-xs">Opis</Label>
                      <Input value={s.customName ?? ""} onChange={(e) => upsert({ ...s, customName: e.target.value || undefined })} placeholder="np. przy piecu" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AddSensorModal open={addOpen} onOpenChange={setAddOpen} onAdded={refresh} />
    </div>
  );
}
