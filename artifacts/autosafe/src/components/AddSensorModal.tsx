import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bluetooth, Info, Loader2, PencilLine } from "lucide-react";
import { isBluetoothAvailable, scanForSensor, type BluetoothDeviceLike } from "@/services/bluetoothService";
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

const defaultProfileId = sensorProfiles[0]?.id ?? "";
const normalizeMac = (value: string) => value.trim().toUpperCase().replaceAll("-", ":");
const makeManualId = () => `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function AddSensorModal({ open, onOpenChange, onAdded }: AddSensorModalProps) {
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [step, setStep] = useState<"scan" | "configure">("scan");
  const [scanning, setScanning] = useState(false);
  const [device, setDevice] = useState<BluetoothDeviceLike | null>(null);
  const [roomName, setRoomName] = useState("Salon");
  const [customName, setCustomName] = useState("");
  const [manualName, setManualName] = useState("Czujnik temperatury");
  const [manualMac, setManualMac] = useState("");
  const [profileId, setProfileId] = useState<string>(defaultProfileId);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMode("scan");
    setStep("scan");
    setDevice(null);
    setRoomName("Salon");
    setCustomName("");
    setManualName("Czujnik temperatury");
    setManualMac("");
    setProfileId(defaultProfileId);
    setError(null);
    setScanning(false);
  };

  const finish = (sensor: Sensor) => {
    upsertSensor(sensor);
    toast.success(`Dodano czujnik: ${sensor.roomName}.`);
    onAdded?.();
    onOpenChange(false);
    reset();
  };

  const handleScan = async () => {
    setError(null);
    setScanning(true);
    try {
      const available = await isBluetoothAvailable();
      if (!available) {
        setError("Web Bluetooth nie jest dostępne w tej przeglądarce. Użyj Chrome/Edge na Androidzie lub komputerze. Na iPhone najlepiej sprawdzi się tryb demo albo przyszła wersja natywna.");
        return;
      }
      const dev = await scanForSensor();
      if (dev) {
        setDevice(dev);
        setManualName(dev.name || "Czujnik temperatury");
        setStep("configure");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Nie udało się zeskanować urządzeń.";
      setError(msg);
    } finally {
      setScanning(false);
    }
  };

  const handleSaveScanned = () => {
    if (!device) return;
    const sensor: Sensor = {
      id: device.id,
      bluetoothName: device.name || manualName || "Nieznane urządzenie",
      deviceId: device.id,
      roomName: roomName.trim() || "Pomieszczenie",
      customName: customName.trim() || undefined,
      profileId,
      status: "disconnected",
    };
    finish(sensor);
  };

  const handleSaveManual = () => {
    const mac = normalizeMac(manualMac);
    const id = mac || makeManualId();
    const sensor: Sensor = {
      id,
      bluetoothName: manualName.trim() || "Czujnik temperatury",
      deviceId: id,
      macAddress: mac || undefined,
      roomName: roomName.trim() || "Pomieszczenie",
      customName: customName.trim() || undefined,
      profileId,
      status: "unknown",
    };
    finish(sensor);
  };

  const configurationForm = (
    <div className="space-y-4">
      {device && (
        <div className="rounded-xl border bg-muted/40 p-3 text-sm">
          <div className="font-medium">{device.name || "Bez nazwy"}</div>
          <div className="truncate text-xs text-muted-foreground">ID przeglądarki: {device.id}</div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Pomieszczenie</Label>
          <Select value={roomName} onValueChange={setRoomName}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMMON_ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Własna nazwa pomieszczenia</Label>
          <Input
            placeholder="np. spiżarnia"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Opis / lokalizacja czujnika</Label>
        <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="np. przy bramie garażowej, obok pieca" />
      </div>

      {mode === "manual" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Nazwa Bluetooth</Label>
            <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="np. LYWSD03MMC" />
          </div>
          <div className="space-y-2">
            <Label>MAC / identyfikator</Label>
            <Input value={manualMac} onChange={(e) => setManualMac(e.target.value)} placeholder="np. A4:C1:38:12:34:56" />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Profil odczytu</Label>
        <Select value={profileId} onValueChange={setProfileId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {sensorProfiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Profil mówi aplikacji, jak odczytać dane z GATT. Dla Xiaomi LYWSD03MMC wybierz profil Xiaomi.
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Dodaj czujnik temperatury</DialogTitle>
          <DialogDescription>
            Skanuj urządzenie Bluetooth albo dodaj je ręcznie po nazwie/MAC, żeby przygotować listę pomieszczeń.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
          <Button type="button" variant={mode === "scan" ? "secondary" : "ghost"} onClick={() => { setMode("scan"); setStep("scan"); }}>
            <Bluetooth className="mr-2 h-4 w-4" /> Skanuj
          </Button>
          <Button type="button" variant={mode === "manual" ? "secondary" : "ghost"} onClick={() => { setMode("manual"); setStep("configure"); setError(null); }}>
            <PencilLine className="mr-2 h-4 w-4" /> Ręcznie
          </Button>
        </div>

        {mode === "scan" && step === "scan" && (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Ważne o Bluetooth</AlertTitle>
              <AlertDescription className="text-xs leading-relaxed">
                Przeglądarka zwykle nie pokazuje prawdziwego adresu MAC. Po skanowaniu aplikacja zapisze bezpieczny identyfikator device.id.
                Gdy znasz MAC z obudowy/aplikacji producenta, możesz użyć zakładki „Ręcznie".
              </AlertDescription>
            </Alert>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button onClick={handleScan} disabled={scanning} className="w-full" size="lg">
              {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bluetooth className="mr-2 h-4 w-4" />}
              {scanning ? "Skanowanie..." : "Skanuj urządzenia Bluetooth"}
            </Button>
          </div>
        )}

        {step === "configure" && configurationForm}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
          {step === "configure" && mode === "scan" && <Button onClick={handleSaveScanned}>Zapisz czujnik</Button>}
          {step === "configure" && mode === "manual" && <Button onClick={handleSaveManual}>Zapisz ręcznie</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
