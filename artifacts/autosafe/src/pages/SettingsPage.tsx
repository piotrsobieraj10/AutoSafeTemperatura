// SettingsPage.tsx v2
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label }  from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge }  from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bell, Bluetooth, Info, Monitor, Moon,
  Radio, Sun, Thermometer, Trash2, Vibrate,
} from "lucide-react";
import {
  clearAlerts, getSettings, getMeasurements,
  saveSettings, type AppSettings,
} from "@/services/storageService";
import {
  ensureDemoSensors, removeDemoSensors,
  startDemoLoop, stopDemoLoop,
} from "@/services/demoService";
import {
  isAdvertisementScanSupported, isBluetoothAvailable,
} from "@/services/bluetoothService";
import { sensorProfiles } from "@/services/sensorProfiles";
import { toast } from "sonner";

export function SettingsPage() {
  const [s, setS]         = useState<AppSettings>(getSettings);
  const [btOk, setBtOk]   = useState<boolean | null>(null);
  const [advOk, setAdvOk] = useState(false);
  const [msCount, setMsCount] = useState(0);

  useEffect(() => {
    isBluetoothAvailable().then(setBtOk);
    setAdvOk(isAdvertisementScanSupported());
    setMsCount(getMeasurements().length);
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);

    if (patch.theme != null) {
      const dark =
        patch.theme === "dark" ||
        (patch.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    }
    if (patch.demoMode === true)  { ensureDemoSensors(); startDemoLoop(() => {}); }
    if (patch.demoMode === false) { stopDemoLoop(); removeDemoSensors(); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Ustawienia</h1>
        <p className="text-sm text-muted-foreground">Konfiguruj aplikację, czujniki i alerty.</p>
      </div>

      {/* Demo */}
      <Card>
        <CardHeader>
          <CardTitle>Tryb demo</CardTitle>
          <CardDescription>
            Wirtualne czujniki do testowania bez sprzętu BLE. Automatycznie symuluje 6 różnych modeli.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Label htmlFor="demo">Włącz tryb demo</Label>
          <Switch id="demo" checked={s.demoMode} onCheckedChange={(v) => update({ demoMode: v })} />
        </CardContent>
      </Card>

      {/* Motyw */}
      <Card>
        <CardHeader>
          <CardTitle>Motyw</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {([
              { val: "light",  label: "Jasny",      icon: <Sun     className="h-4 w-4" /> },
              { val: "dark",   label: "Ciemny",     icon: <Moon    className="h-4 w-4" /> },
              { val: "system", label: "Systemowy",  icon: <Monitor className="h-4 w-4" /> },
            ] as const).map(({ val, label, icon }) => (
              <button key={val} onClick={() => update({ theme: val })}
                className={`flex flex-col items-center gap-2 rounded-2xl border-2 py-4 text-sm font-medium transition-all ${
                  s.theme === val
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/40"
                }`}>
                {icon} {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Jednostki */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" /> Jednostki
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Jednostka temperatury</Label>
            <div className="flex overflow-hidden rounded-full border">
              {(["C", "F"] as const).map((u) => (
                <button key={u} onClick={() => update({ tempUnit: u })}
                  className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
                    s.tempUnit === u ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}>
                  °{u}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Domyślny zakres wykresu</Label>
            <Select
              value={s.chartDefaultRange}
              onValueChange={(v) => update({ chartDefaultRange: v as AppSettings["chartDefaultRange"] })}
            >
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

      {/* Alerty */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" /> Alerty
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="sound" className="flex items-center gap-2">
              <Bell className="h-4 w-4" /> Dźwięk alertów
            </Label>
            <Switch id="sound" checked={s.alertSound} onCheckedChange={(v) => update({ alertSound: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="vib" className="flex items-center gap-2">
              <Vibrate className="h-4 w-4" /> Wibracje (mobile)
            </Label>
            <Switch id="vib" checked={s.alertVibration} onCheckedChange={(v) => update({ alertVibration: v })} />
          </div>
        </CardContent>
      </Card>

      {/* Status BT */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bluetooth className="h-5 w-5" /> Status Bluetooth
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusRow label="Web Bluetooth API" ok={btOk ?? false} pending={btOk === null} />
          <StatusRow
            label="Advertisement Scanning (ELA / RuuviTag)"
            ok={advOk}
            hint={!advOk ? "chrome://flags/#enable-web-bluetooth-scanning" : undefined}
          />
        </CardContent>
      </Card>

      {/* Obsługiwane czujniki */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" /> Obsługiwane czujniki
          </CardTitle>
          <CardDescription>{sensorProfiles.length} profilów w bazie</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sensorProfiles.map((p) => (
              <div key={p.id}
                className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5 text-sm">
                <div>
                  <span className="font-semibold">{p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{p.manufacturer}</span>
                </div>
                <div className="flex gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {p.source === "advertisement" ? "Adv" : "GATT"}
                  </Badge>
                  {p.supportsHumidity && <Badge variant="secondary" className="text-[10px]">Hum</Badge>}
                  {p.supportsPressure && <Badge variant="secondary" className="text-[10px]">Press</Badge>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dane lokalne */}
      <Card>
        <CardHeader>
          <CardTitle>Dane lokalne</CardTitle>
          <CardDescription>
            {msCount.toLocaleString("pl-PL")} pomiarów zapisanych lokalnie w przeglądarce.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm"
            onClick={() => { clearAlerts(); toast.success("Alerty wyczyszczone."); }}>
            <Bell className="mr-2 h-4 w-4" /> Wyczyść alerty
          </Button>
          <Button variant="destructive" size="sm" onClick={() => {
            if (confirm("Czy na pewno usunąć wszystkie dane aplikacji?")) {
              Object.keys(localStorage)
                .filter((k) => k.startsWith("thermo."))
                .forEach((k) => localStorage.removeItem(k));
              toast.success("Dane wyczyszczone. Odśwież stronę.");
            }
          }}>
            <Trash2 className="mr-2 h-4 w-4" /> Usuń wszystkie dane
          </Button>
        </CardContent>
      </Card>

      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle className="text-primary">Protokół ELA Blue Puck T</AlertTitle>
        <AlertDescription className="mt-1 space-y-1 text-xs">
          <p>
            Company ID:{" "}
            <code className="rounded border bg-background px-1 font-mono">0x0531</code>
            {" "}· Format: Temp int16LE÷10°C · Bateria uint8%
          </p>
          <p>Zasięg do 30m · Żywotność baterii: ok. 2 lata · Brak parowania BLE</p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function StatusRow({
  label, ok, pending, hint,
}: {
  label: string;
  ok: boolean;
  pending?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <Badge
          variant={pending ? "secondary" : ok ? "default" : "outline"}
          className={ok ? "border-green-500/30 bg-green-500/15 text-green-600 dark:text-green-400" : ""}
        >
          {pending ? "sprawdzanie…" : ok ? "Dostępne" : "Niedostępne"}
        </Badge>
      </div>
      {hint && !ok && (
        <code className="block rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
          {hint} → Enabled
        </code>
      )}
    </div>
  );
}
