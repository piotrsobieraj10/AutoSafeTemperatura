// pages/SettingsPage.tsx v6 — ustawienia, eksporty, diagnostyka i natywne BLE Android
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bluetooth, Info, Moon, Radio, Sun, Thermometer, Trash2, Bell, Vibrate, Monitor, Download, Upload, Database, Eye, EyeOff, FileText } from "lucide-react";
import { clearAlerts, clearAllMeasurements, clearLocalAppData, createBackupJson, downloadTextFile, exportCsv, getMeasurements, getSettings, importBackupJson, openHtmlReport, saveSettings, type AppSettings } from "@/services/storageService";
import { ensureDemoSensors, removeDemoSensors, startDemoLoop, stopDemoLoop } from "@/services/demoService";
import { isAdvertisementScanSupported, isBluetoothAvailable, isLEScanSupported } from "@/services/bluetoothService";
import { sensorProfiles } from "@/services/sensorProfiles";
import { getNativeBleDiagnostics, type NativeBleDiagnostics } from "@/services/nativeBleService";
import { APP_VERSION } from "@/config/app";
import { toast } from "sonner";
import { BrandMark } from "@/components/BrandMark";

export function SettingsPage() {
  const [s, setS] = useState<AppSettings>(getSettings);
  const [btOk, setBtOk] = useState<boolean | null>(null);
  const [advOk, setAdvOk] = useState(false);
  const [leOk, setLeOk] = useState(false);
  const [nativeDiag, setNativeDiag] = useState<NativeBleDiagnostics | null>(null);
  const [msCount, setMsCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refreshDiagnostics = () => {
      isBluetoothAvailable().then((v) => active && setBtOk(v)).catch(() => active && setBtOk(false));
      setAdvOk(isAdvertisementScanSupported());
      setLeOk(isLEScanSupported());
      setMsCount(getMeasurements().length);
      getNativeBleDiagnostics().then((diag) => { if (active) setNativeDiag(diag); }).catch(() => { if (active) setNativeDiag(null); });
    };
    refreshDiagnostics();
    const id = window.setInterval(refreshDiagnostics, 2500);
    return () => { active = false; window.clearInterval(id); };
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
    if (patch.theme != null) {
      const dark = patch.theme === "dark" || (patch.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    }
    if (patch.demoMode === true) { ensureDemoSensors(); startDemoLoop(() => {}); }
    if (patch.demoMode === false) { stopDemoLoop(); removeDemoSensors(); }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      importBackupJson(await file.text());
      toast.success("Backup zaimportowany. Odśwież aplikację, jeśli nie widzisz zmian.");
    } catch (e) {
      toast.error(`Nie udało się zaimportować backupu: ${e instanceof Error ? e.message : "błąd"}`);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <BrandMark />
        <div>
          <h1 className="font-display text-3xl font-black">Ustawienia</h1>
          <p className="text-sm text-muted-foreground">{APP_VERSION} · logo AutoSafe · dane lokalne w telefonie.</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Tryb demo</CardTitle><CardDescription>Wirtualne czujniki do testów. W normalnej pracy zostaw wyłączone.</CardDescription></CardHeader>
        <CardContent className="flex items-center justify-between"><Label htmlFor="demo">Włącz tryb demo</Label><Switch id="demo" checked={s.demoMode} onCheckedChange={(v) => update({ demoMode: v })} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Wygląd</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {([
              { val: "light", label: "Jasny", icon: <Sun className="h-4 w-4" /> },
              { val: "dark", label: "Ciemny", icon: <Moon className="h-4 w-4" /> },
              { val: "system", label: "Auto", icon: <Monitor className="h-4 w-4" /> },
            ] as const).map(({ val, label, icon }) => (
              <button key={val} onClick={() => update({ theme: val })} className={`flex flex-col items-center gap-2 rounded-2xl border-2 py-4 text-sm font-medium transition-all ${s.theme === val ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}>{icon}{label}</button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3"><Label>Gęstość pulpitu</Label><Select value={s.dashboardDensity ?? "comfortable"} onValueChange={(v) => update({ dashboardDensity: v as AppSettings["dashboardDensity"] })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="comfortable">Wygodna</SelectItem><SelectItem value="compact">Kompaktowa</SelectItem></SelectContent></Select></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Thermometer className="h-5 w-5" />Jednostki i historia</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between"><Label>Jednostka temperatury</Label><div className="flex overflow-hidden rounded-full border">{(["C", "F"] as const).map((u) => <button key={u} onClick={() => update({ tempUnit: u })} className={`px-4 py-1.5 text-sm font-semibold transition-colors ${s.tempUnit === u ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>°{u}</button>)}</div></div>
          <div className="flex items-center justify-between"><Label>Domyślny zakres wykresu</Label><Select value={s.chartDefaultRange} onValueChange={(v) => update({ chartDefaultRange: v as AppSettings["chartDefaultRange"] })}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1h">1 godzina</SelectItem><SelectItem value="24h">24 godziny</SelectItem><SelectItem value="7d">7 dni</SelectItem></SelectContent></Select></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Alerty i diagnostyka</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between"><Label htmlFor="sound" className="flex items-center gap-2"><Bell className="h-4 w-4" />Dźwięk alertów</Label><Switch id="sound" checked={s.alertSound} onCheckedChange={(v) => update({ alertSound: v })} /></div>
          <div className="flex items-center justify-between"><Label htmlFor="vib" className="flex items-center gap-2"><Vibrate className="h-4 w-4" />Wibracje</Label><Switch id="vib" checked={s.alertVibration} onCheckedChange={(v) => update({ alertVibration: v })} /></div>
          <div className="flex items-center justify-between"><Label htmlFor="diag" className="flex items-center gap-2">{s.showBleDiagnostics ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}Pokaż diagnostykę BLE</Label><Switch id="diag" checked={s.showBleDiagnostics ?? false} onCheckedChange={(v) => update({ showBleDiagnostics: v })} /></div>
          <div className="flex items-center justify-between"><Label htmlFor="auto" className="flex items-center gap-2"><Radio className="h-4 w-4" />Auto-monitor po starcie</Label><Switch id="auto" checked={s.autoStartMonitor ?? false} onCheckedChange={(v) => update({ autoStartMonitor: v })} /></div>
          <div className="flex items-center justify-between gap-3"><Label>Domyślny tryb monitoringu</Label><Select value={s.monitorDuration ?? "quick"} onValueChange={(v) => update({ monitorDuration: v as AppSettings["monitorDuration"] })}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="quick">Szybki odczyt 30 s</SelectItem><SelectItem value="fiveMin">Monitoring 5 min</SelectItem><SelectItem value="continuous">Ciągły przy otwartej aplikacji</SelectItem></SelectContent></Select></div>
          <div className="flex items-center justify-between"><Label htmlFor="tips" className="flex items-center gap-2"><Info className="h-4 w-4" />Porady po pierwszym uruchomieniu</Label><Switch id="tips" checked={s.showFirstRunTips ?? true} onCheckedChange={(v) => update({ showFirstRunTips: v })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bluetooth className="h-5 w-5" />Diagnostyka Bluetooth</CardTitle>
          <CardDescription>W APK odczyt działa natywnie przez Bluetooth telefonu. Web Bluetooth zostaje tylko jako zapas dla PWA.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border bg-muted/30 p-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <DiagnosticLine label="Tryb aplikacji" value={nativeDiag?.appMode === "android-apk" ? "Android APK" : "PWA / przeglądarka"} />
              <DiagnosticLine label="Natywne BLE" value={nativeDiag?.nativeAvailable ? "dostępne" : "niedostępne"} ok={nativeDiag?.nativeAvailable} />
              <DiagnosticLine label="Bluetooth" value={nativeDiag?.bluetoothEnabled ? "włączony" : "wyłączony / brak dostępu"} ok={nativeDiag?.bluetoothEnabled} />
              <DiagnosticLine label="Uprawnienia" value={nativeDiag?.permissionsGranted ? "nadane" : "brak / jeszcze nie sprawdzone"} ok={nativeDiag?.permissionsGranted} />
              <DiagnosticLine label="Skanowanie" value={nativeDiag?.scanning ? "aktywne" : "zatrzymane"} ok={nativeDiag?.scanning} />
              <DiagnosticLine label="Odebrane ramki" value={`${nativeDiag?.receivedFrames ?? 0}`} />
              <DiagnosticLine label="Ostatni czujnik" value={nativeDiag?.lastDeviceName || "—"} />
              <DiagnosticLine label="RSSI" value={nativeDiag?.lastRssi != null ? `${nativeDiag.lastRssi} dBm` : "—"} />
              <DiagnosticLine label="Ostatni odczyt" value={nativeDiag?.lastReadAt ? new Date(nativeDiag.lastReadAt).toLocaleTimeString("pl-PL") : "—"} />
              <DiagnosticLine label="Tryb BLE" value={nativeDiag?.mode || "—"} />
            </div>
            {nativeDiag?.lastError && <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">Ostatni błąd BLE: {nativeDiag.lastError}</div>}
          </div>
          <StatusRow label="Web Bluetooth API — zapas dla PWA" ok={btOk ?? false} pending={btOk === null} />
          <StatusRow label="requestLEScan — zapasowy skan PWA" ok={leOk} hint={!leOk ? "W APK nie jest wymagane. W PWA zależy od Chrome." : undefined} />
          <StatusRow label="watchAdvertisements — zapas PWA" ok={advOk} hint={!advOk ? "W APK nie jest wymagane, bo działa natywne BLE Android." : undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Dane lokalne</CardTitle><CardDescription>{msCount.toLocaleString("pl-PL")} pomiarów zapisanych lokalnie w przeglądarce.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadTextFile(`autosafe-temperatura-${new Date().toISOString().slice(0,10)}.csv`, exportCsv(), "text/csv;charset=utf-8")}><Download className="mr-2 h-4 w-4" />Eksport CSV</Button>
          <Button variant="outline" size="sm" onClick={() => downloadTextFile(`autosafe-temperatura-backup-${new Date().toISOString().slice(0,10)}.json`, createBackupJson(), "application/json;charset=utf-8")}><Download className="mr-2 h-4 w-4" />Backup JSON</Button>
          <Button variant="outline" size="sm" onClick={openHtmlReport}><FileText className="mr-2 h-4 w-4" />Raport PDF/druk</Button>
          <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"><Upload className="mr-2 h-4 w-4" />Import JSON<input type="file" accept="application/json" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} /></label>
          <Button variant="outline" size="sm" onClick={() => { clearAlerts(); toast.success("Alerty wyczyszczone."); }}><Bell className="mr-2 h-4 w-4" />Wyczyść alerty</Button>
          <Button variant="destructive" size="sm" onClick={() => { if (confirm("Usunąć całą historię pomiarów?")) { clearAllMeasurements(); toast.success("Historia wyczyszczona."); setMsCount(0); } }}><Trash2 className="mr-2 h-4 w-4" />Usuń historię</Button>
          <Button variant="destructive" size="sm" onClick={() => { if (confirm("Wyczyścić wszystkie lokalne dane aplikacji? Usunie czujniki, historię, alerty i ustawienia zapisane w tej przeglądarce.")) { clearLocalAppData(); toast.success("Dane lokalne wyczyszczone. Aplikacja odświeży się za chwilę."); setTimeout(() => window.location.reload(), 500); } }}><Trash2 className="mr-2 h-4 w-4" />Wyczyść dane aplikacji</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5" />Obsługiwane czujniki</CardTitle><CardDescription>{sensorProfiles.length} profilów w bazie</CardDescription></CardHeader>
        <CardContent><div className="space-y-2">{sensorProfiles.map((p) => <div key={p.id} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5 text-sm"><div><span className="font-semibold">{p.name}</span><span className="ml-2 text-xs text-muted-foreground">{p.manufacturer}</span></div><div className="flex gap-1.5"><Badge variant="outline" className="text-[10px]">{p.source === "advertisement" ? "Adv" : "GATT"}</Badge>{p.supportsHumidity && <Badge variant="secondary" className="text-[10px]">Hum</Badge>}</div></div>)}</div></CardContent>
      </Card>

      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle className="text-primary">ELA Blue PUCK — ustalony format</AlertTitle>
        <AlertDescription className="mt-1 space-y-1 text-xs"><p>Service Data <code className="rounded bg-background px-1 border font-mono">0x2A6E</code> = temperatura int16LE÷100°C, <code className="rounded bg-background px-1 border font-mono">0x2A6F</code> = wilgotność ÷100%.</p><p>Manufacturer Data <code className="rounded bg-background px-1 border font-mono">0x0757</code> = bateria w mV z ostatnich 2 bajtów. Czujnik nadaje dane w BLE advertising.</p></AlertDescription>
      </Alert>
    </div>
  );
}

function DiagnosticLine({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-background/70 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-right text-xs font-semibold ${ok === true ? "text-green-600 dark:text-green-400" : ok === false ? "text-muted-foreground" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function StatusRow({ label, ok, pending, hint }: { label: string; ok: boolean; pending?: boolean; hint?: string }) {
  return <div className="space-y-1"><div className="flex items-center justify-between text-sm"><span>{label}</span><Badge variant={pending ? "secondary" : ok ? "default" : "outline"} className={ok ? "bg-green-500/15 text-green-600 border-green-500/30 dark:text-green-400" : ""}>{pending ? "sprawdzanie…" : ok ? "Dostępne" : "Ograniczone"}</Badge></div>{hint && !ok && <code className="block rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">{hint}</code>}</div>;
}
