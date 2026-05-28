import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bluetooth, Info, Moon, Radio, Sun, Thermometer, Trash2, Bell, Vibrate, Monitor, Download, Upload } from "lucide-react";
import {
  clearAlerts,
  clearAllLocalData,
  exportLocalData,
  getMeasurements,
  getSettings,
  importLocalData,
  measurementsToCsv,
  saveSettings,
  type AppSettings,
} from "@/services/storageService";
import { ensureDemoSensors, removeDemoSensors, startDemoLoop, stopDemoLoop } from "@/services/demoService";
import { isBluetoothAvailable, isAdvertisementScanSupported } from "@/services/bluetoothService";
import { sensorProfiles } from "@/services/sensorProfiles";
import { applyTheme } from "@/services/themeService";
import { APP_VERSION } from "@/config/app";
import { toast } from "sonner";

const downloadText = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export function SettingsPage() {
  const [s, setS] = useState<AppSettings>(getSettings);
  const [btOk, setBtOk]   = useState<boolean | null>(null);
  const [advOk, setAdvOk] = useState(false);
  const [msCount, setMsCount] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    isBluetoothAvailable().then(setBtOk);
    setAdvOk(isAdvertisementScanSupported());
    setMsCount(getMeasurements().length);
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);

    if (patch.theme != null) applyTheme(next.theme);

    if (patch.demoMode === true) {
      ensureDemoSensors();
      startDemoLoop(() => setMsCount(getMeasurements().length));
      toast.success("Tryb demo włączony.");
    }
    if (patch.demoMode === false) {
      stopDemoLoop();
      removeDemoSensors();
      setMsCount(getMeasurements().length);
      toast.success("Tryb demo wyłączony. Usunięto tylko czujniki DEMO.");
    }
  };

  const handleExportBackup = () => {
    downloadText(`autosafe-temperatura-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(exportLocalData(), null, 2), "application/json");
  };

  const handleExportCsv = () => {
    downloadText(`autosafe-temperatura-pomiary-${new Date().toISOString().slice(0,10)}.csv`, measurementsToCsv(), "text/csv;charset=utf-8");
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      importLocalData(JSON.parse(text));
      setS(getSettings());
      setMsCount(getMeasurements().length);
      applyTheme(getSettings().theme);
      toast.success("Backup zaimportowany.");
    } catch {
      toast.error("Nie udało się zaimportować backupu JSON.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Ustawienia</h1>
        <p className="text-sm text-muted-foreground">Konfiguruj aplikację, czujniki i alerty. Wersja: {APP_VERSION}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tryb demo</CardTitle>
          <CardDescription>Wirtualne czujniki tylko do testów. Domyślnie tryb demo jest wyłączony, żeby nie mylił się z prawdziwymi odczytami BLE.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <Label htmlFor="demo">Włącz tryb demo</Label>
          <Switch id="demo" checked={s.demoMode} onCheckedChange={(v) => update({ demoMode: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Motyw</CardTitle>
          <CardDescription>AutoSafe jasny/ciemny z automatycznym dopasowaniem do telefonu.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {([
              { val: "light", label: "Jasny",   icon: <Sun   className="h-4 w-4" /> },
              { val: "dark",  label: "Ciemny",  icon: <Moon  className="h-4 w-4" /> },
              { val: "system",label: "Auto",    icon: <Monitor className="h-4 w-4" />},
            ] as const).map(({ val, label, icon }) => (
              <button key={val} onClick={() => update({ theme: val })}
                className={`flex flex-col items-center gap-2 rounded-2xl border-2 py-4 text-sm font-medium transition-all ${s.theme === val ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}>
                {icon} {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Thermometer className="h-5 w-5" />Jednostki</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Jednostka temperatury</Label>
            <div className="flex overflow-hidden rounded-full border">
              {(["C","F"] as const).map((u) => (
                <button key={u} onClick={() => update({ tempUnit: u })}
                  className={`px-4 py-1.5 text-sm font-semibold transition-colors ${s.tempUnit === u ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  °{u}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="chart-range">Domyślny zakres wykresu</Label>
            <Select value={s.chartDefaultRange} onValueChange={(v) => update({ chartDefaultRange: v as AppSettings["chartDefaultRange"] })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">1 godzina</SelectItem>
                <SelectItem value="24h">24 godziny</SelectItem>
                <SelectItem value="7d">7 dni</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Alerty</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="sound" className="flex items-center gap-2"><Bell className="h-4 w-4" />Dźwięk alertów</Label>
            <Switch id="sound" checked={s.alertSound} onCheckedChange={(v) => update({ alertSound: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="vib" className="flex items-center gap-2"><Vibrate className="h-4 w-4" />Wibracje (mobile)</Label>
            <Switch id="vib" checked={s.alertVibration} onCheckedChange={(v) => update({ alertVibration: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bluetooth className="h-5 w-5" />Status Bluetooth</CardTitle>
          <CardDescription>Do PWA najlepiej używać Android + Chrome. iPhone wymaga wersji natywnej.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusRow label="Web Bluetooth API" ok={btOk ?? false} pending={btOk === null} />
          <StatusRow label="Advertisement Scanning / watchAdvertisements" ok={advOk} hint={!advOk ? "Jeżeli ELA nie pokazuje danych, trzeba włączyć obsługę BLE advertising w Chrome albo zrobić APK." : undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5" />Obsługiwane czujniki</CardTitle>
          <CardDescription>{sensorProfiles.length} profilów w bazie. ELA RHT ma najwyższy priorytet.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sensorProfiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5 text-sm">
                <div>
                  <span className="font-semibold">{p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{p.manufacturer}</span>
                </div>
                <div className="flex gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{p.source === "advertisement" ? "Adv" : "GATT"}</Badge>
                  {p.supportsHumidity && <Badge variant="secondary" className="text-[10px]">Hum</Badge>}
                  {p.supportsPressure && <Badge variant="secondary" className="text-[10px]">Press</Badge>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dane lokalne</CardTitle>
          <CardDescription>{msCount.toLocaleString("pl-PL")} pomiarów zapisanych lokalnie w przeglądarce.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="mr-2 h-4 w-4" /> Eksport CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportBackup}>
            <Download className="mr-2 h-4 w-4" /> Backup JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Import JSON
          </Button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => handleImport(e.target.files?.[0])} />
          <Button variant="outline" size="sm" onClick={() => { clearAlerts(); toast.success("Alerty wyczyszczone."); }}>
            <Bell className="mr-2 h-4 w-4" /> Wyczyść alerty
          </Button>
          <Button variant="destructive" size="sm" onClick={() => {
            if (confirm("Czy na pewno usunąć wszystkie dane aplikacji?")) {
              stopDemoLoop();
              clearAllLocalData();
              setS(getSettings());
              setMsCount(0);
              toast.success("Dane wyczyszczone.");
            }
          }}>
            <Trash2 className="mr-2 h-4 w-4" /> Usuń wszystkie dane
          </Button>
        </CardContent>
      </Card>

      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle className="text-primary">Protokół ELA Blue PUCK RHT/T</AlertTitle>
        <AlertDescription className="mt-1 space-y-1 text-xs">
          <p><strong>RHT:</strong> temperatura w Service Data <code className="rounded border bg-background px-1 font-mono">0x2A6E</code>, wilgotność w Service Data <code className="rounded border bg-background px-1 font-mono">0x2A6F</code>.</p>
          <p><strong>T:</strong> temperatura w Service Data <code className="rounded border bg-background px-1 font-mono">0x2A6E</code>, format int16 little-endian ÷ 100.</p>
          <p className="text-muted-foreground">Nie opieramy już skanowania wyłącznie na GATT 0x181A, bo ELA często nadaje dane bez parowania w advertising.</p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function StatusRow({ label, ok, pending, hint }: { label: string; ok: boolean; pending?: boolean; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span>{label}</span>
        <Badge variant={pending ? "secondary" : ok ? "default" : "outline"}
          className={ok ? "border-green-500/30 bg-green-500/15 text-green-600 dark:text-green-400" : ""}>
          {pending ? "sprawdzanie…" : ok ? "Dostępne" : "Niedostępne"}
        </Badge>
      </div>
      {hint && !ok && (
        <p className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
