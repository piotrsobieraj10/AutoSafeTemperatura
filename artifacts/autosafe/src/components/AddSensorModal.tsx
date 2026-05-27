// AddSensorModal.tsx v2
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Bluetooth, BatteryMedium, Gauge, Loader2,
  Radio, Thermometer, Droplets, Info, Wifi, WifiOff,
} from "lucide-react";
import { scanForDevice, type BTDevice } from "@/services/bluetoothService";
import { sensorProfiles, detectProfileByName, getProfile } from "@/services/sensorProfiles";
import { upsertSensor } from "@/services/storageService";
import type { DecodedData, Sensor } from "@/types/sensor";
import { toast } from "sonner";

const ROOMS = [
  "Salon", "Sypialnia", "Kuchnia", "Łazienka", "Garaż",
  "Kotłownia", "Poddasze", "Biuro", "Piwnica", "Korytarz",
  "Serwer", "Ogród", "Szklarnia", "Taras",
];

type Step = "scan" | "configure";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdded?: () => void;
}

export function AddSensorModal({ open, onOpenChange, onAdded }: Props) {
  const [step, setStep]                         = useState<Step>("scan");
  const [scanning, setScanning]                 = useState(false);
  const [device, setDevice]                     = useState<BTDevice | null>(null);
  const [liveData, setLiveData]                 = useState<DecodedData>({});
  const [detectedProfileId, setDetectedProfileId] = useState<string | null>(null);
  const [roomName, setRoomName]                 = useState("Salon");
  const [customRoom, setCustomRoom]             = useState("");
  const [customName, setCustomName]             = useState("");
  const [profileId, setProfileId]               = useState("ela-blue-puck-t");
  const [minTemp, setMinTemp]                   = useState("");
  const [maxTemp, setMaxTemp]                   = useState("");
  const [error, setError]                       = useState<string | null>(null);

  const reset = () => {
    setStep("scan"); setDevice(null); setLiveData({}); setDetectedProfileId(null);
    setRoomName("Salon"); setCustomRoom(""); setCustomName("");
    setProfileId("ela-blue-puck-t");
    setMinTemp(""); setMaxTemp(""); setError(null); setScanning(false);
  };

  const handleScan = async () => {
    setError(null);
    setScanning(true);
    try {
      let firstData = false;
      const dev = await scanForDevice(
        ({ device: d, detectedProfileId: pid, data }) => {
          if (!firstData) {
            firstData = true;
            setDevice(d);
            setLiveData(data);
            setDetectedProfileId(pid);
            setProfileId(pid ?? detectProfileByName(d.name) ?? "ela-blue-puck-t");
            setStep("configure");
          } else {
            setLiveData((prev) => ({ ...prev, ...data }));
          }
        },
        (e) => setError(e.message)
      );
      if (dev && !firstData) {
        setDevice(dev);
        const pid = detectProfileByName(dev.name);
        setProfileId(pid ?? "ela-blue-puck-t");
        setDetectedProfileId(pid);
        setStep("configure");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Błąd skanowania.";
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("user")) {
        setError(msg);
      }
    } finally {
      setScanning(false);
    }
  };

  const finalRoom = customRoom.trim() || roomName;

  const handleSave = () => {
    if (!device) return;
    const p = getProfile(profileId);
    const sensor: Sensor = {
      id:              device.id,
      bluetoothName:   device.name ?? "BLE Sensor",
      deviceId:        device.id,
      roomName:        finalRoom,
      customName:      customName || undefined,
      profileId,
      status:          "connected",
      source:          p?.source === "advertisement" ? "ela-advertisement" : "gatt",
      lastTemperature: liveData.temperature,
      lastHumidity:    liveData.humidity,
      lastPressure:    liveData.pressure,
      batteryLevel:    liveData.battery,
      batteryVoltage:  liveData.batteryVoltage,
      lastRssi:        liveData.rssi,
      lastReadAt:      liveData.temperature ? new Date().toISOString() : undefined,
      minTempAlert:    minTemp !== "" ? +minTemp : undefined,
      maxTempAlert:    maxTemp !== "" ? +maxTemp : undefined,
    };
    upsertSensor(sensor);
    toast.success(`Dodano czujnik w „${finalRoom}".`);
    onAdded?.();
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bluetooth className="h-5 w-5 text-primary" />
            {step === "scan" ? "Skanuj czujnik BLE" : "Konfiguruj czujnik"}
          </DialogTitle>
          <DialogDescription>
            {step === "scan"
              ? "Obsługiwane: ELA, RuuviTag, Govee, Inkbird, SensorPush, Xiaomi i inne GATT."
              : `Urządzenie: ${device?.name ?? device?.id}`}
          </DialogDescription>
        </DialogHeader>

        {step === "scan" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { name: "ELA Blue Puck T",  icon: <Radio className="h-4 w-4" />,       badge: "Advertisement" },
                { name: "RuuviTag",          icon: <Gauge className="h-4 w-4" />,        badge: "Temp+Hum+Press" },
                { name: "Govee H5074",       icon: <Thermometer className="h-4 w-4" />, badge: "Advertisement" },
                { name: "Inkbird IBS-TH2",   icon: <Thermometer className="h-4 w-4" />, badge: "GATT" },
                { name: "SensorPush HT1",    icon: <Droplets className="h-4 w-4" />,    badge: "GATT" },
                { name: "Xiaomi LYWSD03",    icon: <Thermometer className="h-4 w-4" />, badge: "GATT" },
              ].map((d) => (
                <div key={d.name} className="flex flex-col gap-1 rounded-xl border bg-muted/40 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">{d.icon} {d.name}</div>
                  <Badge variant="secondary" className="text-[10px] w-fit">{d.badge}</Badge>
                </div>
              ))}
            </div>

            <Alert className="border-primary/30 bg-primary/5">
              <Info className="h-4 w-4 text-primary" />
              <AlertTitle className="text-sm text-primary">ELA / RuuviTag / Govee</AlertTitle>
              <AlertDescription className="text-xs mt-1">
                Dla czujników Advertisement włącz w Chrome:{" "}
                <code className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px]">
                  chrome://flags/#enable-web-bluetooth-scanning → Enabled
                </code>
              </AlertDescription>
            </Alert>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleScan} disabled={scanning} className="w-full" size="lg">
              {scanning
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Skanowanie…</>
                : <><Bluetooth className="mr-2 h-4 w-4" />Skanuj urządzenia BLE</>}
            </Button>
          </div>
        )}

        {step === "configure" && device && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{device.name ?? "BLE Sensor"}</div>
                  <div className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">{device.id}</div>
                </div>
                {liveData.temperature != null && (
                  <div className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-primary">
                    <Thermometer className="h-4 w-4" />
                    <span className="font-bold">{liveData.temperature.toFixed(2)}°C</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {liveData.humidity != null && (
                  <span className="flex items-center gap-1">
                    <Droplets className="h-3.5 w-3.5" />{liveData.humidity.toFixed(1)}%
                  </span>
                )}
                {liveData.pressure != null && (
                  <span className="flex items-center gap-1">
                    <Gauge className="h-3.5 w-3.5" />{liveData.pressure.toFixed(1)} hPa
                  </span>
                )}
                {liveData.battery != null && (
                  <span className="flex items-center gap-1">
                    <BatteryMedium className="h-3.5 w-3.5" />{liveData.battery}%
                  </span>
                )}
                {liveData.rssi != null && (
                  <span className="flex items-center gap-1">
                    {liveData.rssi > -70
                      ? <Wifi className="h-3.5 w-3.5" />
                      : <WifiOff className="h-3.5 w-3.5" />}
                    {liveData.rssi} dBm
                  </span>
                )}
                {detectedProfileId && (
                  <Badge variant="secondary" className="text-[10px]">
                    Auto: {detectedProfileId}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pomieszczenie</Label>
                <Select value={roomName} onValueChange={setRoomName}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Własna nazwa</Label>
                <Input
                  placeholder={roomName}
                  value={customRoom}
                  onChange={(e) => setCustomRoom(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Opis czujnika</Label>
              <Input
                placeholder="np. przy oknie, pod sufitem…"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Profil dekodowania</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sensorProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground">({p.manufacturer})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min °C (alert)</Label>
                <Input type="number" placeholder="np. 10" value={minTemp} onChange={(e) => setMinTemp(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Max °C (alert)</Label>
                <Input type="number" placeholder="np. 28" value={maxTemp} onChange={(e) => setMaxTemp(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => { onOpenChange(false); reset(); }}>Anuluj</Button>
          {step === "configure" && (
            <>
              <Button variant="outline" onClick={() => setStep("scan")}>Wstecz</Button>
              <Button onClick={handleSave}>Zapisz czujnik</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
