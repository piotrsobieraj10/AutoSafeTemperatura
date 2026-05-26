import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Bluetooth, Info, Loader2, Thermometer,
  Wifi, WifiOff, BatteryMedium, Radio,
} from "lucide-react";
import {
  isBluetoothAvailable,
  isAdvertisementScanSupported,
  scanForELADevice,
  scanForSensor,
  detectELAProfile,
  type BluetoothDeviceLike,
} from "@/services/bluetoothService";
import { sensorProfiles } from "@/services/sensorProfiles";
import { upsertSensor } from "@/services/storageService";
import type { Sensor } from "@/types/sensor";
import { toast } from "sonner";
import { COMMON_ROOMS } from "@/config/app";

interface AddSensorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}

type Step = "select-mode" | "scan" | "ela-scan" | "configure";
type ScanMode = "ela" | "gatt";

interface LiveData {
  temperature?: number;
  battery?: number;
  rssi?: number;
}

export function AddSensorModal({ open, onOpenChange, onAdded }: AddSensorModalProps) {
  const [step, setStep] = useState<Step>("select-mode");
  const [scanMode, setScanMode] = useState<ScanMode>("ela");
  const [scanning, setScanning] = useState(false);
  const [device, setDevice] = useState<BluetoothDeviceLike | null>(null);
  const [liveData, setLiveData] = useState<LiveData>({});
  const [roomName, setRoomName] = useState("Salon");
  const [customName, setCustomName] = useState("");
  const [profileId, setProfileId] = useState("ela-blue-puck-t");
  const [error, setError] = useState<string | null>(null);
  const [elaSupported, setElaSupported] = useState<boolean | null>(null);

  const reset = () => {
    setStep("select-mode");
    setDevice(null);
    setLiveData({});
    setRoomName("Salon");
    setCustomName("");
    setProfileId("ela-blue-puck-t");
    setError(null);
    setScanning(false);
  };

  const handleModeSelect = async (mode: ScanMode) => {
    setScanMode(mode);
    const btOk = await isBluetoothAvailable();
    if (!btOk) {
      setError("Web Bluetooth niedostępne. Użyj Chrome/Edge na desktopie lub Androidzie.");
      return;
    }
    if (mode === "ela") {
      setElaSupported(isAdvertisementScanSupported());
      setStep("ela-scan");
    } else {
      setStep("scan");
    }
  };

  const handleELAScan = async () => {
    setError(null);
    setScanning(true);
    try {
      let gotData = false;
      const dev = await scanForELADevice({
        onDeviceFound: (foundDevice, data) => {
          if (!gotData) {
            gotData = true;
            setDevice(foundDevice);
            setLiveData({ temperature: data.temperature, battery: data.battery, rssi: data.rssi });
            const detected = detectELAProfile(foundDevice.name);
            if (detected) setProfileId(detected);
            setStep("configure");
          }
        },
        onError: (e) => setError(e.message),
      });

      if (dev && !gotData) {
        setDevice(dev);
        const detected = detectELAProfile(dev.name);
        if (detected) setProfileId(detected);
        setStep("configure");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Błąd skanowania.";
      if (!msg.toLowerCase().includes("cancel")) setError(msg);
    } finally {
      setScanning(false);
    }
  };

  const handleGATTScan = async () => {
    setError(null);
    setScanning(true);
    try {
      const dev = await scanForSensor();
      if (dev) {
        setDevice(dev);
        const detected = detectELAProfile(dev.name);
        setProfileId(detected ?? sensorProfiles.find((p) => p.source === "gatt")?.id ?? "gatt-ess-temperature");
        setStep("configure");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Błąd skanowania.";
      if (!msg.toLowerCase().includes("cancel")) setError(msg);
    } finally {
      setScanning(false);
    }
  };

  const handleSave = () => {
    if (!device) return;
    const selectedProfile = sensorProfiles.find((p) => p.id === profileId);
    const isELA = selectedProfile?.source === "advertisement";

    const sensor: Sensor = {
      id: device.id,
      bluetoothName: device.name || "Blue Puck T",
      deviceId: device.id,
      roomName,
      customName: customName || undefined,
      profileId,
      status: "connected",
      source: isELA ? "ela-advertisement" : "gatt",
      lastTemperature: liveData.temperature,
      lastReadAt: liveData.temperature ? new Date().toISOString() : undefined,
      batteryLevel: liveData.battery,
      lastRssi: liveData.rssi,
      minTempAlert: 5,
      maxTempAlert: 30,
    };

    upsertSensor(sensor);
    toast.success(`Dodano czujnik w pomieszczeniu „${roomName}".`);
    onAdded?.();
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bluetooth className="h-5 w-5 text-primary" />
            Dodaj czujnik BLE
          </DialogTitle>
          <DialogDescription>
            {step === "select-mode" && "Wybierz typ czujnika do dodania."}
            {step === "ela-scan" && "Kliknij Skanuj — wybierz Blue Puck T z listy urządzeń."}
            {step === "scan" && "Kliknij Skanuj — wybierz czujnik GATT z listy."}
            {step === "configure" && "Skonfiguruj i przypisz czujnik do pomieszczenia."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Wybór trybu ── */}
        {step === "select-mode" && (
          <div className="space-y-3">
            <button
              onClick={() => handleModeSelect("ela")}
              className="w-full rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-left transition-all hover:border-primary hover:bg-primary/10"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                  <Radio className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold">ELA Blue Puck T</div>
                  <div className="text-xs text-muted-foreground">
                    Advertisement BLE — bez parowania, tylko temperatura
                  </div>
                </div>
                <Badge className="ml-auto" variant="secondary">Zalecane</Badge>
              </div>
            </button>

            <button
              onClick={() => handleModeSelect("gatt")}
              className="w-full rounded-xl border border-border p-4 text-left transition-all hover:border-border/80 hover:bg-accent/50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Bluetooth className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-semibold">Inny czujnik GATT</div>
                  <div className="text-xs text-muted-foreground">
                    Xiaomi, ESP32, standardowe GATT Health Thermometer
                  </div>
                </div>
              </div>
            </button>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ── ELA scan ── */}
        {step === "ela-scan" && (
          <div className="space-y-4">
            {elaSupported === false && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Włącz eksperymentalny tryb BLE</AlertTitle>
                <AlertDescription className="space-y-1 text-xs">
                  <p>Blue Puck T wymaga Advertisement Scanning. Włącz w Chrome:</p>
                  <code className="block rounded bg-muted px-2 py-1 font-mono text-xs">
                    chrome://flags/#enable-web-bluetooth-scanning
                  </code>
                  <p>Następnie uruchom ponownie Chrome i wróć tutaj.</p>
                </AlertDescription>
              </Alert>
            )}

            <Alert className="border-primary/30 bg-primary/5">
              <Radio className="h-4 w-4 text-primary" />
              <AlertTitle className="text-sm">Jak to działa</AlertTitle>
              <AlertDescription className="text-xs">
                Blue Puck T nadaje dane przez BLE Advertisement co ~1 sekundę.
                Aplikacja odbiera te pakiety <strong>bez trwałego połączenia</strong> — bateria
                czujnika zostaje nienaruszona. Upewnij się, że czujnik jest w pobliżu (do 30m).
              </AlertDescription>
            </Alert>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleELAScan} disabled={scanning} className="w-full" size="lg">
              {scanning ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Skanowanie…</>
              ) : (
                <><Radio className="mr-2 h-4 w-4" /> Skanuj Blue Puck T</>
              )}
            </Button>
          </div>
        )}

        {/* ── GATT scan ── */}
        {step === "scan" && (
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button onClick={handleGATTScan} disabled={scanning} className="w-full" size="lg">
              {scanning ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Skanowanie…</>
              ) : (
                <><Bluetooth className="mr-2 h-4 w-4" /> Skanuj urządzenia GATT</>
              )}
            </Button>
          </div>
        )}

        {/* ── Konfiguracja ── */}
        {step === "configure" && device && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/40 p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold">{device.name || "Blue Puck T"}</div>
                  <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{device.id}</div>
                </div>
                {liveData.temperature !== undefined ? (
                  <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-primary">
                    <Thermometer className="h-4 w-4" />
                    <span className="text-sm font-bold">{liveData.temperature.toFixed(1)}°C</span>
                  </div>
                ) : (
                  <Badge variant="outline">Oczekiwanie na dane</Badge>
                )}
              </div>

              {(liveData.battery !== undefined || liveData.rssi !== undefined) && (
                <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                  {liveData.battery !== undefined && (
                    <span className="flex items-center gap-1">
                      <BatteryMedium className="h-3.5 w-3.5" />
                      {liveData.battery}%
                    </span>
                  )}
                  {liveData.rssi !== undefined && (
                    <span className="flex items-center gap-1">
                      {liveData.rssi > -70
                        ? <Wifi className="h-3.5 w-3.5 text-ok" />
                        : <WifiOff className="h-3.5 w-3.5 text-destructive" />}
                      RSSI: {liveData.rssi} dBm
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Pomieszczenie</Label>
              <Select value={roomName} onValueChange={setRoomName}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMMON_ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                placeholder="Lub wpisz własną nazwę pomieszczenia"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Opis (opcjonalnie)</Label>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="np. przy oknie, nad drzwiami"
              />
            </div>

            <div className="space-y-2">
              <Label>Profil dekodowania</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sensorProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <span>{p.name}</span>
                        {p.id === profileId && <Badge variant="secondary" className="text-xs">Auto</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
          {step !== "select-mode" && step !== "configure" && (
            <Button variant="outline" onClick={() => setStep("select-mode")}>Wstecz</Button>
          )}
          {step === "configure" && (
            <Button onClick={handleSave}>Zapisz czujnik</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
