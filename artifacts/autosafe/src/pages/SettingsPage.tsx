import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Check, Download, Info, MonitorSmartphone, Moon, RotateCcw, Sun, Upload } from "lucide-react";
import { buildBackup, getSettings, importBackup, resetLocalData, saveSettings, type AppBackup, type AppSettings, type ThemeMode } from "@/services/storageService";
import { ensureDemoSensors, removeDemoSensors, startDemoLoop, stopDemoLoop } from "@/services/demoService";
import { isBluetoothAvailable } from "@/services/bluetoothService";
import { toast } from "sonner";
import { APP_NAME, APP_VERSION } from "@/config/app";
import { applyTheme, notifyThemeChanged } from "@/services/themeService";

const downloadJson = (filename: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());
  const [btAvailable, setBtAvailable] = useState<boolean | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { isBluetoothAvailable().then(setBtAvailable); }, []);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    applyTheme(next.theme);
    notifyThemeChanged();
    if (patch.demoMode === true) {
      ensureDemoSensors();
      startDemoLoop(() => {});
    } else if (patch.demoMode === false) {
      stopDemoLoop();
      removeDemoSensors();
    }
  };

  const handleExport = () => {
    downloadJson("autosafe-temperatura-backup.json", buildBackup());
    toast.success("Pobrano kopię danych aplikacji.");
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      importBackup(JSON.parse(text) as Partial<AppBackup>);
      setSettings(getSettings());
      toast.success("Zaimportowano kopię danych.");
    } catch {
      toast.error("Nie udało się zaimportować pliku JSON.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const handleReset = () => {
    resetLocalData();
    setSettings(getSettings());
    stopDemoLoop();
    toast.success("Wyczyszczono lokalne dane aplikacji.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Ustawienia</h1>
        <p className="text-sm text-muted-foreground">Skonfiguruj aplikację pod siebie. Wersja: {APP_VERSION}.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tryb demo</CardTitle>
          <CardDescription>Generuje wirtualne czujniki — przetestuj aplikację bez prawdziwego Bluetooth.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <Label htmlFor="demo">Włącz tryb demo</Label>
          <Switch id="demo" checked={settings.demoMode} onCheckedChange={(v) => update({ demoMode: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Motyw</CardTitle>
          <CardDescription>Auto dopasowuje aplikację do telefonu. Jasny tryb jest lżejszy w dzień, ciemny zostaje premium czarno-złoty.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              { value: "auto", label: "Auto", icon: MonitorSmartphone, desc: "Według systemu" },
              { value: "light", label: "Jasny", icon: Sun, desc: "Praca w dzień" },
              { value: "dark", label: "Ciemny", icon: Moon, desc: "Premium noc" },
            ] as const).map((item) => {
              const Icon = item.icon;
              const active = settings.theme === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => update({ theme: item.value as ThemeMode })}
                  className={`rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-primary bg-primary/12 shadow-glow"
                      : "border-border bg-card hover:border-primary/50 hover:bg-accent/60"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <Icon className="h-5 w-5 text-primary" />
                    {active && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="font-display text-sm font-semibold">{item.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.desc}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Odczyty i świeżość danych</CardTitle>
          <CardDescription>Ustawienia przygotowane pod późniejszą automatyzację odczytów/gateway.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Docelowy interwał odczytu (min)</Label>
            <Input type="number" min={1} value={settings.autoReadMinutes} onChange={(e) => update({ autoReadMinutes: Math.max(1, +e.target.value || 1) })} />
          </div>
          <div className="space-y-2">
            <Label>Po ilu minutach odczyt jest stary</Label>
            <Input type="number" min={1} value={settings.staleMinutes} onChange={(e) => update({ staleMinutes: Math.max(1, +e.target.value || 1) })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bluetooth</CardTitle></CardHeader>
        <CardContent>
          <div className="text-sm">
            Status Web Bluetooth:{" "}
            <strong className={btAvailable ? "text-ok" : "text-destructive"}>
              {btAvailable === null ? "sprawdzanie..." : btAvailable ? "dostępne" : "niedostępne"}
            </strong>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kopia danych</CardTitle>
          <CardDescription>Eksportuj czujniki, ustawienia i historię pomiarów do pliku JSON.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Eksportuj backup</Button>
          <Button variant="outline" onClick={() => importRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Importuj backup</Button>
          <Button variant="ghost" onClick={handleReset}><RotateCcw className="mr-2 h-4 w-4" /> Wyczyść dane</Button>
          <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(e) => handleImport(e.target.files?.[0])} />
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Informacja techniczna</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          Web Bluetooth działa głównie w Chrome/Edge na Windows, macOS, Linux i Androidzie. iOS nie wspiera Web Bluetooth w standardowej przeglądarce.
          Przeglądarki często ukrywają prawdziwy adres MAC, dlatego aplikacja zapisuje device.id, a MAC można dopisać ręcznie.
          Do pełnego monitoringu 24/7 najlepszym kolejnym krokiem będzie gateway BLE, np. Raspberry Pi albo ESP32.
        </AlertDescription>
      </Alert>
    </div>
  );
}
