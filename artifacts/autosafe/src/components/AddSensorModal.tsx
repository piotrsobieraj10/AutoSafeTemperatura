import { useMemo, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bluetooth, BatteryMedium, Loader2, Radio, Thermometer, Droplets, Info, CheckCircle2, ListPlus, Search, Wifi } from "lucide-react";
import { scanForDevice, type BTDevice, type ScanMode } from "@/services/bluetoothService";
import { sensorProfiles, detectProfileByName, getProfile } from "@/services/sensorProfiles";
import { getSensors, getSensorGroups, upsertSensor } from "@/services/storageService";
import { SENSOR_ICON_OPTIONS, normalizeBleKey } from "@/services/sensorUiService";
import type { DecodedData, Sensor } from "@/types/sensor";
import { toast } from "sonner";

const ROOMS = ["Salon","Sypialnia","Kuchnia","Łazienka","Garaż","Kotłownia","Poddasze","Biuro","Piwnica","Korytarz","Serwer","Ogród","Szklarnia","Taras"];
type Step = "scan" | "configure" | "manual";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onAdded?: () => void; }
interface Candidate { id: string; device: BTDevice; profileId: string; data: DecodedData; lastSeen: number; frames: number; }

const hasReading = (data: DecodedData) => data.temperature !== undefined || data.humidity !== undefined || data.battery !== undefined || data.batteryVoltage !== undefined || data.rssi !== undefined;
const candidateKey = (device: BTDevice) => device.id || device.name || `device-${Date.now()}`;
const matchesQuery = (candidate: Candidate, query: string) => {
  const q = normalizeBleKey(query);
  if (!q) return true;
  return [candidate.device.name, candidate.device.id, candidate.id].some((v) => normalizeBleKey(v).includes(q));
};

export function AddSensorModal({ open, onOpenChange, onAdded }: Props) {
  const groups = getSensorGroups();
  const [step, setStep] = useState<Step>("scan");
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [query, setQuery] = useState("");
  const [device, setDevice] = useState<BTDevice | null>(null);
  const [liveData, setLiveData] = useState<DecodedData>({});
  const [detectedProfile, setDetectedProfile] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("Salon");
  const [customRoom, setCustomRoom] = useState("");
  const [customName, setCustomName] = useState("");
  const [manualName, setManualName] = useState("P RHT ");
  const [manualId, setManualId] = useState("");
  const [profileId, setProfileId] = useState("ela-blue-puck-rht");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "group-dom");
  const [locationIcon, setLocationIcon] = useState<Sensor["locationIcon"]>("sensor");
  const [minTemp, setMinTemp] = useState("");
  const [maxTemp, setMaxTemp] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => candidates.filter((c) => matchesQuery(c, query)), [candidates, query]);

  const reset = () => {
    setStep("scan"); setCandidates([]); setQuery(""); setDevice(null); setLiveData({}); setDetectedProfile(null);
    setRoomName("Salon"); setCustomRoom(""); setCustomName(""); setManualName("P RHT "); setManualId("");
    setProfileId("ela-blue-puck-rht"); setGroupId(getSensorGroups()[0]?.id ?? "group-dom"); setLocationIcon("sensor"); setMinTemp(""); setMaxTemp("");
    setError(null); setScanning(false);
  };

  const handleScan = async (mode: ScanMode) => {
    setError(null);
    setScanning(true);
    setCandidates([]);
    try {
      const selected = await scanForDevice(
        ({ device: d, detectedProfileId: pid, data }) => {
          const key = candidateKey(d);
          const nextProfile = pid ?? detectProfileByName(d.name) ?? (data.humidity !== undefined ? "ela-blue-puck-rht" : "ela-blue-puck-t");
          setCandidates((prev) => {
            const existing = prev.find((x) => x.id === key);
            const merged: Candidate = {
              id: key,
              device: d,
              profileId: nextProfile,
              data: { ...(existing?.data ?? {}), ...data },
              lastSeen: Date.now(),
              frames: (existing?.frames ?? 0) + 1,
            };
            if (existing) return prev.map((x) => x.id === key ? merged : x).sort((a, b) => (b.data.rssi ?? -999) - (a.data.rssi ?? -999));
            return [...prev, merged].sort((a, b) => (b.data.rssi ?? -999) - (a.data.rssi ?? -999));
          });
        },
        (e) => setError(e.message),
        mode
      );

      // Web Bluetooth wybiera jedno urządzenie systemowym oknem — wtedy przechodzimy do konfiguracji.
      if (selected && candidates.length === 0) {
        const nextProfile = detectProfileByName(selected.name) ?? "ela-blue-puck-t";
        chooseCandidate({ id: candidateKey(selected), device: selected, profileId: nextProfile, data: {}, lastSeen: Date.now(), frames: 1 });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Błąd skanowania.";
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("user")) setError(msg);
    } finally {
      setScanning(false);
    }
  };

  const chooseCandidate = (candidate: Candidate) => {
    setDevice(candidate.device);
    setLiveData(candidate.data);
    setDetectedProfile(candidate.profileId);
    setProfileId(candidate.profileId);
    const name = candidate.device.name ?? "";
    if (name.toLowerCase().includes("rht")) setLocationIcon("humidity"); else setLocationIcon("thermometer");
    setStep("configure");
  };

  const finalRoom = customRoom.trim() || roomName;

  const buildSensor = (source: "device" | "manual"): Sensor | null => {
    const name = source === "device" ? (device?.name ?? "ELA Blue PUCK") : manualName.trim();
    const id = source === "device" ? device?.id : (manualId.trim() || `manual-${normalizeBleKey(name).toLowerCase()}-${Date.now()}`);
    if (!name || !id) return null;
    const p = getProfile(profileId);
    const normalizedName = normalizeBleKey(name);
    const existing = getSensors().find((s) => s.deviceId === id || normalizeBleKey(s.bluetoothName) === normalizedName || normalizeBleKey(s.bluetoothName).includes(normalizedName) || normalizedName.includes(normalizeBleKey(s.bluetoothName)));
    if (existing) {
      toast.warning(`Ten czujnik jest już dodany jako: ${existing.roomName} · ${existing.bluetoothName}.`);
      return null;
    }
    const now = hasReading(liveData) ? new Date().toISOString() : undefined;
    return {
      id,
      bluetoothName: name,
      deviceId: id,
      roomName: finalRoom,
      customName: customName || undefined,
      locationIcon,
      groupId,
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
      lastTemperatureReadAt: liveData.temperature !== undefined ? now : undefined,
      lastHumidityReadAt: liveData.humidity !== undefined ? now : undefined,
      lastBatteryReadAt: liveData.batteryVoltage !== undefined ? now : undefined,
      lastMeasurementSaveStatus: now ? "saved" : "waiting",
      lastMeasurementSavedAt: now,
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

  const manualMatches = useMemo(() => candidates.filter((c) => matchesQuery(c, manualName || manualId)), [candidates, manualName, manualId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display"><Bluetooth className="h-5 w-5 text-primary" />{step === "scan" ? "Dodaj czujnik BLE" : step === "manual" ? "Dodaj ręcznie" : "Konfiguruj czujnik"}</DialogTitle>
          <DialogDescription>{step === "scan" ? "Najpierw wybierz czujnik z listy. Aplikacja nie dodaje już automatycznie pierwszego znalezionego urządzenia." : `${device?.name ?? manualName}`}</DialogDescription>
        </DialogHeader>

        {step === "scan" && (
          <div className="space-y-4">
            <Alert className="border-primary/30 bg-primary/5"><Info className="h-4 w-4 text-primary" /><AlertTitle className="text-sm text-primary">Wybierz konkretny czujnik</AlertTitle><AlertDescription className="text-xs mt-1">Szukaj urządzeń <strong>P T EN…</strong> albo <strong>P RHT…</strong>. Na Android APK lista zbiera reklamy BLE z temperaturą, wilgotnością, baterią i RSSI.</AlertDescription></Alert>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={() => handleScan("ela")} disabled={scanning} size="lg">{scanning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Skanuję…</> : <><Radio className="mr-2 h-4 w-4" />Skanuj ELA</>}</Button>
              <Button onClick={() => handleScan("all")} disabled={scanning} variant="outline"><Bluetooth className="mr-2 h-4 w-4" />Skanuj wszystkie BLE</Button>
            </div>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtruj po nazwie lub końcówce, np. 9019F4" /></div>
            <div className="space-y-2">
              {filtered.length === 0 ? <div className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">{scanning ? "Szukam czujników w pobliżu…" : "Brak wyników. Uruchom skan lub wpisz końcówkę nazwy."}</div> : filtered.map((c) => <CandidateRow key={c.id} candidate={c} onChoose={() => chooseCandidate(c)} />)}
            </div>
            <Button onClick={() => setStep("manual")} disabled={scanning} className="w-full" variant="ghost"><ListPlus className="mr-2 h-4 w-4" />Dodaj ręcznie po nazwie/ID</Button>
          </div>
        )}

        {step === "manual" && (
          <div className="space-y-4">
            <Alert><AlertDescription className="text-xs">Możesz wpisać pełną nazwę albo samą końcówkę, np. <strong>9019F4</strong>. Jeżeli czujnik jest na liście skanowania, aplikacja go dopasuje.</AlertDescription></Alert>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Nazwa / końcówka Bluetooth"><Input value={manualName} onChange={(e) => { setManualName(e.target.value); const pid = detectProfileByName(e.target.value); if (pid) setProfileId(pid); }} placeholder="np. P RHT 9019F4 albo 9019F4" /></Field><Field label="ID / MAC opcjonalnie"><Input value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="np. DB:12:FD:2A:D7:FB" /></Field></div>
            {manualMatches.length > 0 && <div className="rounded-2xl border bg-muted/30 p-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">Dopasowane z ostatniego skanu</p>{manualMatches.map((c) => <CandidateRow key={c.id} candidate={c} onChoose={() => chooseCandidate(c)} compact />)}</div>}
            <CommonConfig roomName={roomName} setRoomName={setRoomName} customRoom={customRoom} setCustomRoom={setCustomRoom} customName={customName} setCustomName={setCustomName} profileId={profileId} setProfileId={setProfileId} groupId={groupId} setGroupId={setGroupId} locationIcon={locationIcon} setLocationIcon={setLocationIcon} minTemp={minTemp} setMinTemp={setMinTemp} maxTemp={maxTemp} setMaxTemp={setMaxTemp} />
          </div>
        )}

        {step === "configure" && device && (
          <div className="space-y-4">
            <CandidatePreview device={device} data={liveData} profileId={detectedProfile ?? profileId} />
            <CommonConfig roomName={roomName} setRoomName={setRoomName} customRoom={customRoom} setCustomRoom={setCustomRoom} customName={customName} setCustomName={setCustomName} profileId={profileId} setProfileId={setProfileId} groupId={groupId} setGroupId={setGroupId} locationIcon={locationIcon} setLocationIcon={setLocationIcon} minTemp={minTemp} setMinTemp={setMinTemp} maxTemp={maxTemp} setMaxTemp={setMaxTemp} />
          </div>
        )}

        <DialogFooter className="gap-2 sm:sticky sm:bottom-0 sm:bg-background sm:py-2">
          <Button variant="ghost" onClick={() => { onOpenChange(false); reset(); }}>Anuluj</Button>
          {step !== "scan" && <Button variant="outline" onClick={() => setStep("scan")}>Wstecz</Button>}
          {step === "configure" && <Button onClick={() => handleSave("device")}>Zapisz czujnik</Button>}
          {step === "manual" && <Button onClick={() => handleSave("manual")}>Zapisz ręcznie</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRow({ candidate, onChoose, compact = false }: { candidate: Candidate; onChoose: () => void; compact?: boolean }) {
  const data = candidate.data;
  return <button onClick={onChoose} className="w-full rounded-2xl border bg-card p-3 text-left transition hover:border-primary/60 hover:bg-primary/5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><div className="truncate font-semibold">{candidate.device.name ?? "Czujnik BLE"}</div><div className="truncate font-mono text-xs text-muted-foreground">{candidate.device.id}</div></div>
      <Badge variant="secondary" className="shrink-0">Wybierz</Badge>
    </div>
    {!compact && <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
      {data.temperature != null && <span className="inline-flex items-center gap-1"><Thermometer className="h-3.5 w-3.5" />{data.temperature.toFixed(1)}°C</span>}
      {data.humidity != null && <span className="inline-flex items-center gap-1"><Droplets className="h-3.5 w-3.5" />{data.humidity.toFixed(0)}%</span>}
      {data.batteryVoltage != null && <span className="inline-flex items-center gap-1"><BatteryMedium className="h-3.5 w-3.5" />{data.batteryVoltage} mV</span>}
      {data.rssi != null && <span className="inline-flex items-center gap-1"><Wifi className="h-3.5 w-3.5" />{data.rssi} dBm</span>}
      <span>{candidate.frames} ramek</span>
    </div>}
  </button>;
}

function CandidatePreview({ device, data, profileId }: { device: BTDevice; data: DecodedData; profileId: string }) {
  return <div className="rounded-2xl border bg-muted/30 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{device.name ?? "ELA Blue PUCK"}</div><div className="max-w-[240px] truncate font-mono text-xs text-muted-foreground">{device.id}</div></div><Badge variant="secondary">Auto: {profileId}</Badge></div><div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">{data.temperature != null && <span className="flex items-center gap-1"><Thermometer className="h-3.5 w-3.5" />{data.temperature.toFixed(2)}°C</span>}{data.humidity != null && <span className="flex items-center gap-1"><Droplets className="h-3.5 w-3.5" />{data.humidity.toFixed(0)}%</span>}{data.batteryVoltage != null && <span className="flex items-center gap-1"><BatteryMedium className="h-3.5 w-3.5" />{data.batteryVoltage} mV</span>}</div>{(data.rawServiceData || data.rawManufacturerData) && <pre className="mt-3 max-h-24 overflow-auto rounded-xl bg-background p-2 text-[10px] text-muted-foreground">{data.rawServiceData}\n{data.rawManufacturerData}</pre>}</div>;
}

interface CommonProps { roomName: string; setRoomName: (v: string) => void; customRoom: string; setCustomRoom: (v: string) => void; customName: string; setCustomName: (v: string) => void; profileId: string; setProfileId: (v: string) => void; groupId: string; setGroupId: (v: string) => void; locationIcon: Sensor["locationIcon"]; setLocationIcon: (v: Sensor["locationIcon"]) => void; minTemp: string; setMinTemp: (v: string) => void; maxTemp: string; setMaxTemp: (v: string) => void; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function CommonConfig(props: CommonProps) {
  const groups = getSensorGroups();
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Grupa"><Select value={props.groupId} onValueChange={props.setGroupId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Pomieszczenie"><Select value={props.roomName} onValueChange={props.setRoomName}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></Field></div>
    <Field label="Własna nazwa pomieszczenia"><Input placeholder={props.roomName} value={props.customRoom} onChange={(e) => props.setCustomRoom(e.target.value)} /></Field>
    <Field label="Opis"><Input placeholder="np. przy piecu" value={props.customName} onChange={(e) => props.setCustomName(e.target.value)} /></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Profil czujnika"><Select value={props.profileId} onValueChange={props.setProfileId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sensorProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Ikona"><Select value={props.locationIcon ?? "sensor"} onValueChange={(v) => props.setLocationIcon(v as Sensor["locationIcon"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SENSOR_ICON_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></Field></div>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Min °C (alert)"><Input type="number" placeholder="np. 10" value={props.minTemp} onChange={(e) => props.setMinTemp(e.target.value)} /></Field><Field label="Max °C (alert)"><Input type="number" placeholder="np. 28" value={props.maxTemp} onChange={(e) => props.setMaxTemp(e.target.value)} /></Field></div>
  </div>;
}
