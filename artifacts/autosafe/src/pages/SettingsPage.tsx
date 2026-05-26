import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Download, Info, Moon, Sun, Radio, Bluetooth,
  Thermometer, RotateCcw, Upload,
} from "lucide-react";
import {
  buildBackup, getSettings, importBackup, resetLocalData,
  saveSettings, type AppBackup, type AppSettings, clearMeasurements,
} from "@/services/storageService";
import { ensureDemoSensors, removeDemoSensors, startDemoLoop, stopDemoLoop } from "@/services/demoService";
import { isBluetoothAvailable, isAdvertisementScanSupported } from "@/services/bluetoothService";
import { toast } from "sonner";
import { APP_VERSION } from "@/config/app";

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
  const [advSupported, setAdvSupported] = useState<boolean>(false);
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    isBluetoothAvailable().then(setBtAvailable);
    setAdvSupported(isAdvertisementScanSupported());
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);

    if (patch.theme !== undefined) {
      document.documentElement.classList.toggle("dark", next.theme === "dark");
    }
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
    clearMeasurements();
    setSettings(getSettings());
    stopDemoLoop();
    toast.success("Wyczyszczono lokalne dane aplikacji.");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Ustawienia</h1>
        <p className="text-sm text-muted-foreground">Skonfiguruj aplikację i czujniki ELA. Wersja: {APP_VERSION}.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tryb demo</CardTitle>
          <CardDescription>
            Generuje wirtualne czujniki ELA Blue Puck T — przetestuj bez prawdziwego sprzętu.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Label htmlFor="demo">Włącz tryb demo</Label>
          <Switch id="demo" checked={settings.demoMode} onCheckedChange={(v) => update({ demoMode: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Motyw</CardTitle>
          <CardDescription>Jasny lub ciemny interfejs.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Label htmlFor="theme" className="flex items-center gap-2">
            {settings.theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            Ciemny motyw
          </Label>
          <Switch
            id="theme"
            checked={settings.theme === "dark"}
            onCheckedChange={(v) => update({ theme: v ? "dark" : "light" })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" />
            Jednostka temperatury
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Label htmlFor="tempunit" className="flex items-center gap-2">
            Celsius / Fahrenheit
            <Badge variant="secondary">°{settings.tempUnit}</Badge>
          </Label>
          <Switch
            id="tempunit"
            checked={settings.tempUnit === "F"}
            onCheckedChange={(v) => update({ tempUnit: v ? "F" : "C" })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bluetooth className="h-5 w-5" />
            Status Bluetooth
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Web Bluetooth API</span>
            <Badge
              variant={btAvailable ? "default" : "destructive"}
              className={btAvailable ? "border-ok/30 bg-ok/15 text-ok" : undefined}
            >
              {btAvailable === null ? "sprawdzanie…" : btAvailable ? "Dostępne" : "Niedostępne"}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <Radio className="h-4 w-4 text-primary" />
              Advertisement Scanning (ELA)
            </span>
            <Badge
              variant={advSupported ? "default" : "outline"}
              className={advSupported ? "border-ok/30 bg-ok/15 text-ok" : undefined}
            >
              {advSupported ? "Dostępne" : "Wymagana flaga Chrome"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Alert className="border-primary/30 bg-primary/5">
        <Radio className="h-4 w-4 text-primary" />
        <AlertTitle className="text-primary">Konfiguracja ELA Blue Puck T</AlertTitle>
        <AlertDescription className="mt-2 space-y-2 text-sm">
          <p>
            Blue Puck T nadaje wyłącznie przez BLE Advertisement.
            Aby odebrać dane bez trwałego parowania, włącz w Chrome:
          </p>
          <code className="block rounded-lg border bg-background px-3 py-2 font-mono text-xs">
            chrome://flags/#enable-web-bluetooth-scanning → Enabled
          </code>
          <p className="text-xs text-muted-foreground">
            Wspierany: Chrome/Edge ≥ 79 na Windows, macOS, Linux, Android.
            iOS nie wspiera Web Bluetooth — użyj trybu demo lub bramki BLE (RPi/ESP32).
          </p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Protokół ELA Blue Puck T</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Jak działa ELA Blue Puck T</AlertTitle>
            <AlertDescription className="mt-1 space-y-1 text-xs leading-relaxed">
              <p><strong>Protokół:</strong> BLE Advertisement (Manufacturer Specific Data, Company ID 0x0531).</p>
              <p><strong>Format danych:</strong> Typ produktu (1B) + Flagi (1B) + Temperatura int16 LE / 10°C (2B) + Bateria uint8 % (1B) + Licznik (2B).</p>
              <p><strong>Zasięg:</strong> do 30m w terenie otwartym.</p>
              <p><strong>Bateria:</strong> CR2032, żywotność do 2 lat przy domyślnym interwale 1s.</p>
            </AlertDescription>
          </Alert>
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
    </div>
  );
}
