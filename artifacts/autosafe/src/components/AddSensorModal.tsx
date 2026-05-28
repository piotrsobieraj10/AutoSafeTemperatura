// components/AddSensorModal.tsx v5.1
// ELA Blue PUCK T/RHT: wybór urządzenia po nazwie + nasłuch reklam BLE, bez wymuszania CONNECT/GATT.

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bluetooth, BatteryMedium, Gauge, Loader2, Radio, Thermometer, Droplets, Info, CheckCircle2, ListPlus } from "lucide-react";
import { scanForDevice, type BTDevice, type ScanMode } from "@/services/bluetoothService";
import { sensorProfiles, detectProfileByName, getProfile } from "@/services/sensorProfiles";
import { getSensors, upsertSensor } from "@/services/storageService";
import type { DecodedData, Sensor } from "@/types/sensor";
import { toast } from "sonner";

const ROOMS = ["Salon","Sypialnia","Kuchnia","Łazienka","Garaż","Kotłownia","Poddasze","Biuro","Piwnica","Korytarz","Serwer","Ogród","Szklarnia","Taras"];
type Step = "scan" | "configure" | "manual";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onAdded?: () => void; }

const hasReading = (data: DecodedData) => data.temperature !== undefined || data.humidity !== undefined || data.battery !== undefined || data.batteryVoltage !== undefined || data.rssi !== undefined;

export function AddSensorModal({ open, onOpenChange, onAdded }: Props) {
  const [step, setStep] = useState<Step>("scan");
  const [scanning, setScanning] = useState(false);
  const [device, setDevice] = useState<BTDevice | null>(null);
  const [liveData, setLiveData] = useState<DecodedData>({});
  const [detectedProfile, setDetectedProfile] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("Salon");
  const [customRoom, setCustomRoom] = useState("");
  const [customName, setCustomName] = useState("");
  const [manualName, setManualName] = useState("P T EN ");
  const [manualId, setManualId] = useState("");
  const [profileId, setProfileId] = useState("ela-blue-puck-t");
  const [minTemp, setMinTemp] = useState("");
  const [maxTemp, setMaxTemp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gotAnyFrame, setGotAnyFrame] = useState(false);

  const reset = () => {
    setStep("scan"); setDevice(null); setLiveData({}); setDetectedProfile(null);
    setRoomName("Salon"); setCustomRoom(""); setCustomName(""); setManualName("P T EN "); setManualId("");
    setProfileId("ela-blue-puck-t"); setMinTemp(""); setMaxTemp("");
    setError(null); setScanning(false); setGotAnyFrame(false);
  };

  const handleScan = async (mode: ScanMode) => {
    setError(null);
    setScanning(true);
    try {
      const selected = await scanForDevice(
        ({ device: d, detectedProfileId: pid, data }) => {
          setDevice(d);
          const nextProfile = pid ?? detectProfileByName(d.name) ?? "ela-blue-puck-t";
          setDetectedProfile(pid ?? null);
          setProfileId(nextProfile);
          setLiveData((prev) => ({ ...prev, ...data }));
          if (hasReading(data)) setGotAnyFrame(true);
          setStep("configure");
        },
        (e) => setError(e.message),
        mode
      );

      if (selected) {
        setDevice(selected);
        const nextProfile = detectProfileByName(selected.name) ?? "ela-blue-puck-t";
        setProfileId(nextProfile);
        setDetectedProfile(nextProfile);
        setStep("configure");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Błąd skanowania.";
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("user")) setError(msg);
    } finally {
      setScanning(false);
    }
  };

  const finalRoom = customRoom.trim() || roomName;

  const buildSensor = (source: "device" | "manual"): Sensor | null => {
    const name = source === "device" ? (device?.name ?? "ELA Blue PUCK") : manualName.trim();
    const id = source === "device" ? device?.id : (manualId.trim() || `manual-${name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`);
    if (!name || !id) return null;
    const p = getProfile(profileId);
    const existing = getSensors().find((s) => s.deviceId === id || (s.bluetoothName === name && name.startsWith("P ")));
    if (existing) {
      toast.warning(`Ten czujnik jest już dodany: ${existing.roomName} · ${existing.bluetoothName}`);
      return null;
    }
    const now = hasReading(liveData) ? new Date().toISOString() : undefined;
    return {
      id,
      bluetoothName: name,
      deviceId: id,
      roomName: finalRoom,
      customName: customName || undefined,
      profileId,
      status: now ? "connected" : "pending",
      source: p?.source === "advertisement" ? "ela-advertisement" : "gatt",
      lastTemperature: liveData.temperature,
      lastHumidity: liveData.humidity,
      lastPressure: liveData.pressure,
      batteryLevel: liveData.battery,
      batteryVoltage: liveData.batteryVoltage,
      lastRssi: liveData.rssi,
      rawAdvertisementHex: liveData.rawAdvertisementHex,
      rawServiceData: liveData.rawServiceData,
      rawManufacturerData: liveData.rawManufacturerData,
      bleDebug: liveData.bleDebug,
      lastReadAt: now,
      minTempAlert: minTemp !== "" ? +minTemp : undefined,
      maxTempAlert: maxTemp !== "" ? +maxTemp : undefined,
    };
  };

  const handleSave = (source: "device" | "manual" = "device") => {
    const sensor = buildSensor(source);
    if (!sensor) return;
    upsertSensor(sensor);
    toast.success(`Dodano czujnik „${sensor.bluetoothName}" w „${finalRoom}".`);
    onAdded?.();
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Bluetooth className="h-5 w-5 text-primary" />
            {step === "scan" ? "Dodaj czujnik BLE" : step === "manual" ? "Dodaj ręcznie" : "Konfiguruj czujnik"}
          </DialogTitle>
          <DialogDescription>
            {step === "scan" ? "ELA Blue PUCK T/RHT nadaje dane w reklamach BLE — nie trzeba klikać CONNECT." : `${device?.name ?? manualName}`}
          </DialogDescription>
        </DialogHeader>

        {step === "scan" && (
          <div className="space-y-4">
            <Alert className="border-primary/30 bg-primary/5">
              <Info className="h-4 w-4 text-primary" />
              <AlertTitle className="text-sm text-primary">Poprawiony tryb ELA Blue PUCK</AlertTitle>
              <AlertDescription className="text-xs mt-1 space-y-1">
                <p>Wybierz czujnik o nazwie <strong>P T EN…</strong> albo <strong>P RHT…</strong>.</p>
                <p>Aplikacja uruchomi nasłuch reklam BLE: temperatura z <code>0x2A6E</code>, wilgotność z <code>0x2A6F</code>, bateria z <code>0x0757</code>.</p>
              </AlertDescription>
            </Alert>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Button onClick={() => handleScan("ela")} disabled={scanning} className="w-full" size="lg">
              {scanning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Skanowanie…</> : <><Radio className="mr-2 h-4 w-4" />Skanuj ELA Blue PUCK T/RHT</>}
            </Button>
            <Button onClick={() => handleScan("all")} disabled={scanning} className="w-full" variant="outline">
              <Bluetooth className="mr-2 h-4 w-4" />Skanuj wszystkie urządzenia BLE
            </Button>
            <Button onClick={() => setStep("manual")} disabled={scanning} className="w-full" variant="ghost">
              <ListPlus className="mr-2 h-4 w-4" />Dodaj ręcznie po nazwie/ID
            </Button>
          </div>
        )}

        {step === "manual" && (
          <div className="space-y-4">
            <Alert><AlertDescription className="text-xs">Ręczne dodanie zapisuje czujnik w aplikacji. Pełny odczyt BLE nadal wymaga później uruchomienia „Nasłuchuj BLE” z wybranego urządzenia w Chrome.</AlertDescription></Alert>
            <div className="space-y-1.5"><Label>Nazwa Bluetooth</Label><Input value={manualName} onChange={(e) => { setManualName(e.target.value); const pid = detectProfileByName(e.target.value); if (pid) setProfileId(pid); }} placeholder="np. P T EN 81171A" /></div>
            <div className="space-y-1.5"><Label>Identyfikator / MAC opcjonalnie</Label><Input value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="np. CE:1C:DA:F9:15:84" /></div>
            <CommonConfig roomName={roomName} setRoomName={setRoomName} customRoom={customRoom} setCustomRoom={setCustomRoom} customName={customName} setCustomName={setCustomName} profileId={profileId} setProfileId={setProfileId} minTemp={minTemp} setMinTemp={setMinTemp} maxTemp={maxTemp} setMaxTemp={setMaxTemp} />
          </div>
        )}

        {step === "configure" && device && (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm">{device.name ?? "ELA Blue PUCK"}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate max-w-[240px]">{device.id}</div>
                </div>
                {gotAnyFrame ? (
                  <div className="flex items-center gap-1.5 rounded-xl bg-green-500/10 px-3 py-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-bold">{liveData.temperature != null ? `${liveData.temperature.toFixed(2)}°C` : "ramka BLE"}</span>
                  </div>
                ) : (
                  <div className="rounded-xl bg-muted px-3 py-2 text-muted-foreground text-xs">Oczekuje na pierwszą ramkę BLE</div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {liveData.humidity != null && <span className="flex items-center gap-1"><Droplets className="h-3.5 w-3.5" />{liveData.humidity.toFixed(1)}%</span>}
                {liveData.batteryVoltage != null && <span className="flex items-center gap-1"><BatteryMedium className="h-3.5 w-3.5" />{liveData.batteryVoltage} mV</span>}
                {liveData.pressure != null && <span className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" />{liveData.pressure.toFixed(1)} hPa</span>}
                {detectedProfile && <Badge variant="secondary" className="text-[10px]">Auto: {detectedProfile}</Badge>}
              </div>
              {(liveData.rawServiceData || liveData.rawManufacturerData) && (
                <pre className="max-h-24 overflow-auto rounded-xl bg-background p-2 text-[10px] text-muted-foreground">{liveData.rawServiceData}\n{liveData.rawManufacturerData}</pre>
              )}
            </div>
            <CommonConfig roomName={roomName} setRoomName={setRoomName} customRoom={customRoom} setCustomRoom={setCustomRoom} customName={customName} setCustomName={setCustomName} profileId={profileId} setProfileId={setProfileId} minTemp={minTemp} setMinTemp={setMinTemp} maxTemp={maxTemp} setMaxTemp={setMaxTemp} />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => { onOpenChange(false); reset(); }}>Anuluj</Button>
          {step !== "scan" && <Button variant="outline" onClick={() => setStep("scan")}>Wstecz</Button>}
          {step === "configure" && <Button onClick={() => handleSave("device")}>Zapisz czujnik</Button>}
          {step === "manual" && <Button onClick={() => handleSave("manual")}>Zapisz ręcznie</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CommonProps {
  roomName: string; setRoomName: (v: string) => void;
  customRoom: string; setCustomRoom: (v: string) => void;
  customName: string; setCustomName: (v: string) => void;
  profileId: string; setProfileId: (v: string) => void;
  minTemp: string; setMinTemp: (v: string) => void;
  maxTemp: string; setMaxTemp: (v: string) => void;
}

function CommonConfig(props: CommonProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Pomieszczenie</Label><Select value={props.roomName} onValueChange={props.setRoomName}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Własna nazwa</Label><Input placeholder={props.roomName} value={props.customRoom} onChange={(e) => props.setCustomRoom(e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label>Opis</Label><Input placeholder="np. przy piecu" value={props.customName} onChange={(e) => props.setCustomName(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Profil czujnika</Label><Select value={props.profileId} onValueChange={props.setProfileId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sensorProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Min °C (alert)</Label><Input type="number" placeholder="np. 10" value={props.minTemp} onChange={(e) => props.setMinTemp(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Max °C (alert)</Label><Input type="number" placeholder="np. 28" value={props.maxTemp} onChange={(e) => props.setMaxTemp(e.target.value)} /></div>
      </div>
    </>
  );
}
