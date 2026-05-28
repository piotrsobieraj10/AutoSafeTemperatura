import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bluetooth, BatteryMedium, Gauge, Loader2, Radio, Thermometer, Droplets, Info, CheckCircle2, Search } from "lucide-react";
import { scanForDevice, type BTDevice, type ScanMode } from "@/services/bluetoothService";
import { sensorProfiles, detectProfileByName, getProfile } from "@/services/sensorProfiles";
import { upsertSensor } from "@/services/storageService";
import type { DecodedData, Sensor } from "@/types/sensor";
import { toast } from "sonner";

const ROOMS = ["Salon","Sypialnia","Kuchnia","Łazienka","Garaż","Kotłownia","Poddasze","Biuro","Piwnica","Korytarz","Serwer","Ogród","Szklarnia","Taras"];

type Step = "scan" | "configure" | "manual";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onAdded?: () => void; }

const hasReading = (d: DecodedData) => d.temperature !== undefined || d.humidity !== undefined || d.pressure !== undefined;

export function AddSensorModal({ open, onOpenChange, onAdded }: Props) {
  const [step, setStep]             = useState<Step>("scan");
  const [scanning, setScanning]     = useState(false);
  const [scanMode, setScanMode]     = useState<ScanMode>("ela");
  const [device, setDevice]         = useState<BTDevice | null>(null);
  const [liveData, setLiveData]     = useState<DecodedData>({});
  const [detectedProfile, setDetectedProfile] = useState<string | null>(null);
  const [roomName, setRoomName]     = useState("Salon");
  const [customRoom, setCustomRoom] = useState("");
  const [customName, setCustomName] = useState("");
  const [manualBluetoothName, setManualBluetoothName] = useState("P RHT ");
  const [manualDeviceId, setManualDeviceId] = useState("");
  const [profileId, setProfileId]   = useState("ela-blue-puck-rht");
  const [minTemp, setMinTemp]       = useState("");
  const [maxTemp, setMaxTemp]       = useState("");
  const [error, setError]           = useState<string | null>(null);
  const [gotTemp, setGotTemp]       = useState(false);

  const reset = () => {
    setStep("scan"); setDevice(null); setLiveData({}); setDetectedProfile(null);
    setRoomName("Salon"); setCustomRoom(""); setCustomName(""); setManualBluetoothName("P RHT "); setManualDeviceId("");
    setProfileId("ela-blue-puck-rht"); setMinTemp(""); setMaxTemp("");
    setError(null); setScanning(false); setGotTemp(false); setScanMode("ela");
  };

  const handleScan = async (mode: ScanMode) => {
    setError(null);
    setScanning(true);
    setScanMode(mode);
    setLiveData({});
    setGotTemp(false);
    try {
      await scanForDevice(
        ({ device: d, detectedProfileId: pid, data }) => {
          setDevice(d);
          const detected = pid ?? detectProfileByName(d.name) ?? profileId;
          setDetectedProfile(detected);
          setProfileId(detected);
          setStep("configure");

          if (Object.keys(data).length > 0) {
            setLiveData((prev) => ({ ...prev, ...data }));
            if (hasReading(data)) setGotTemp(true);
          }
        },
        (e) => setError(e.message),
        { mode }
      );
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

  const saveSensor = (sourceDevice: BTDevice | null, sourceData: DecodedData, manual = false) => {
    const p = getProfile(profileId);
    const fallbackName = profileId === "ela-blue-puck-rht" ? "P RHT" : "P T EN";
    const bluetoothName = manual ? (manualBluetoothName.trim() || fallbackName) : (sourceDevice?.name ?? fallbackName);
    const idBase = manual ? (manualDeviceId.trim() || bluetoothName) : (sourceDevice?.id ?? bluetoothName);
    const safeId = idBase.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `sensor-${Date.now()}`;

    const sensor: Sensor = {
      id:              safeId,
      bluetoothName,
      deviceId:        sourceDevice?.id ?? safeId,
      roomName:        finalRoom,
      customName:      customName || undefined,
      profileId,
      status:          sourceData.temperature !== undefined || sourceData.humidity !== undefined ? "connected" : "unknown",
      source:          p?.source === "advertisement" ? "ela-advertisement" : "gatt",
      lastTemperature: sourceData.temperature,
      lastHumidity:    sourceData.humidity,
      lastPressure:    sourceData.pressure,
      batteryLevel:    sourceData.battery,
      lastRssi:        sourceData.rssi,
      lastReadAt:      hasReading(sourceData) ? new Date().toISOString() : undefined,
      minTempAlert:    minTemp !== "" ? +minTemp : undefined,
      maxTempAlert:    maxTemp !== "" ? +maxTemp : undefined,
    };
    upsertSensor(sensor);
    toast.success(`Dodano czujnik w „${finalRoom}".`);
    onAdded?.();
    onOpenChange(false);
    reset();
  };

  const handleSave = () => saveSensor(device, liveData, false);
  const handleManualSave = () => saveSensor(null, {}, true);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Bluetooth className="h-5 w-5 text-primary" />
            {step === "scan" ? "Dodaj czujnik BLE" : step === "manual" ? "Dodaj ręcznie" : "Konfiguruj czujnik"}
          </DialogTitle>
          <DialogDescription>
            {step === "scan"
              ? "Priorytet: ELA Blue PUCK RHT / T. Dane RHT lecą głównie w ramkach BLE advertising."
              : step === "manual" ? "Dodaj wpis, gdy telefon widzi czujnik niestabilnie albo chcesz przygotować nazwę wcześniej."
              : `${device?.name ?? device?.id}`}
          </DialogDescription>
        </DialogHeader>

        {step === "scan" && (
          <div className="space-y-4">
            <Alert className="border-primary/30 bg-primary/5">
              <Info className="h-4 w-4 text-primary" />
              <AlertTitle className="text-sm text-primary">ELA Blue PUCK RHT / T</AlertTitle>
              <AlertDescription className="mt-1 space-y-1 text-xs">
                <p>Najpierw użyj skanowania ELA i wybierz urządzenie z nazwą <strong>P RHT…</strong> albo <strong>P T…</strong>.</p>
                <p className="text-muted-foreground">Jeżeli telefon nie pokazuje czujnika, użyj „Skanuj wszystkie BLE”. Po wyborze aplikacja od razu przejdzie do konfiguracji i zacznie nasłuch ramek.</p>
              </AlertDescription>
            </Alert>

            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            <div className="grid gap-2">
              <Button onClick={() => handleScan("ela")} disabled={scanning} className="w-full" size="lg">
                {scanning && scanMode === "ela"
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Skanowanie ELA…</>
                  : <><Bluetooth className="mr-2 h-4 w-4" />Skanuj ELA Blue PUCK RHT/T</>}
              </Button>
              <Button onClick={() => handleScan("all")} disabled={scanning} variant="outline" className="w-full">
                {scanning && scanMode === "all"
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Skanowanie wszystkich BLE…</>
                  : <><Search className="mr-2 h-4 w-4" />Skanuj wszystkie urządzenia BLE</>}
              </Button>
              <Button onClick={() => setStep("manual")} disabled={scanning} variant="ghost" className="w-full">
                Dodaj ręcznie po nazwie / identyfikatorze
              </Button>
            </div>
          </div>
        )}

        {step === "manual" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nazwa Bluetooth / etykieta</Label>
              <Input value={manualBluetoothName} onChange={(e) => {
                setManualBluetoothName(e.target.value);
                const detected = detectProfileByName(e.target.value);
                if (detected) setProfileId(detected);
              }} placeholder="np. P RHT 9019E7" />
            </div>
            <div className="space-y-1.5">
              <Label>Identyfikator własny</Label>
              <Input value={manualDeviceId} onChange={(e) => setManualDeviceId(e.target.value)} placeholder="np. P-RHT-9019E7" />
            </div>
            <CommonConfig
              roomName={roomName} setRoomName={setRoomName}
              customRoom={customRoom} setCustomRoom={setCustomRoom}
              customName={customName} setCustomName={setCustomName}
              profileId={profileId} setProfileId={setProfileId}
              minTemp={minTemp} setMinTemp={setMinTemp}
              maxTemp={maxTemp} setMaxTemp={setMaxTemp}
            />
          </div>
        )}

        {step === "configure" && device && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{device.name ?? "ELA Blue PUCK"}</div>
                  <div className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">{device.id}</div>
                </div>
                {gotTemp ? (
                  <div className="flex items-center gap-1.5 rounded-xl bg-green-500/10 px-3 py-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-bold">{liveData.temperature !== undefined ? `${liveData.temperature.toFixed(2)}°C` : "Dane"}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Nasłuch ramek…
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {liveData.temperature != null && <span className="flex items-center gap-1"><Thermometer className="h-3.5 w-3.5" />{liveData.temperature.toFixed(2)}°C</span>}
                {liveData.humidity  != null && <span className="flex items-center gap-1"><Droplets className="h-3.5 w-3.5" />{liveData.humidity.toFixed(1)}%</span>}
                {liveData.pressure  != null && <span className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" />{liveData.pressure.toFixed(1)} hPa</span>}
                {liveData.battery   != null && <span className="flex items-center gap-1"><BatteryMedium className="h-3.5 w-3.5" />{liveData.battery}%</span>}
                {liveData.rssi      != null && <span className="flex items-center gap-1"><Radio className="h-3.5 w-3.5" />RSSI {liveData.rssi} dBm</span>}
                {detectedProfile && <Badge variant="secondary" className="text-[10px]">Auto: {detectedProfile}</Badge>}
              </div>

              {!gotTemp && (
                <p className="text-xs text-muted-foreground">
                  Czujnik został wybrany. Jeśli temperatura nie pojawi się od razu, zapisz go i użyj „Wznów” w zakładce Czujniki albo spróbuj skanowania wszystkich BLE. PWA na Androidzie zależy od obsługi advertising przez Chrome.
                </p>
              )}
            </div>

            <CommonConfig
              roomName={roomName} setRoomName={setRoomName}
              customRoom={customRoom} setCustomRoom={setCustomRoom}
              customName={customName} setCustomName={setCustomName}
              profileId={profileId} setProfileId={setProfileId}
              minTemp={minTemp} setMinTemp={setMinTemp}
              maxTemp={maxTemp} setMaxTemp={setMaxTemp}
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => { onOpenChange(false); reset(); }}>Anuluj</Button>
          {step !== "scan" && <Button variant="outline" onClick={() => setStep("scan")}>Wstecz</Button>}
          {step === "configure" && <Button onClick={handleSave}>Zapisz czujnik</Button>}
          {step === "manual" && <Button onClick={handleManualSave}>Zapisz ręcznie</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommonConfig(props: {
  roomName: string; setRoomName: (v: string) => void;
  customRoom: string; setCustomRoom: (v: string) => void;
  customName: string; setCustomName: (v: string) => void;
  profileId: string; setProfileId: (v: string) => void;
  minTemp: string; setMinTemp: (v: string) => void;
  maxTemp: string; setMaxTemp: (v: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Pomieszczenie</Label>
          <Select value={props.roomName} onValueChange={props.setRoomName}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Własna nazwa</Label>
          <Input placeholder={props.roomName} value={props.customRoom} onChange={(e) => props.setCustomRoom(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Opis</Label>
        <Input placeholder="np. przy oknie, pod sufitem…" value={props.customName} onChange={(e) => props.setCustomName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Profil dekodowania</Label>
        <Select value={props.profileId} onValueChange={props.setProfileId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {sensorProfiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name} {p.manufacturer ? `(${p.manufacturer})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Min °C (alert)</Label>
          <Input type="number" placeholder="np. 10" value={props.minTemp} onChange={(e) => props.setMinTemp(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Max °C (alert)</Label>
          <Input type="number" placeholder="np. 28" value={props.maxTemp} onChange={(e) => props.setMaxTemp(e.target.value)} />
        </div>
      </div>
    </>
  );
}
