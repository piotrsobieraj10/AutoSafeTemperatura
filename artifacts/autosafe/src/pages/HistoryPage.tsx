// pages/HistoryPage.tsx v5.6 — wykresy, statystyki, alerty i raport PDF/druk
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TemperatureChart } from "@/components/TemperatureChart";
import { downloadTextFile, exportCsv, formatHumidity, formatTemp, getAlerts, getMeasurementsForSensor, getSensors, getSettings, openHtmlReport } from "@/services/storageService";
import { BarChart3, Download, Droplets, FileText, Thermometer, BellRing } from "lucide-react";

type Range = "1h" | "24h" | "7d";
const RANGES: Record<Range, number> = { "1h": 3600_000, "24h": 86400_000, "7d": 604800_000 };

const alertLabel: Record<string, string> = {
  min_temp: "Za niska temperatura",
  max_temp: "Za wysoka temperatura",
  min_humidity: "Za niska wilgotność",
  max_humidity: "Za wysoka wilgotność",
  offline: "Brak odczytu",
  battery_low: "Słaba bateria",
};

export function HistoryPage() {
  const [range, setRange] = useState<Range>(getSettings().chartDefaultRange);
  const sensors = getSensors();
  const settings = getSettings();
  const alerts = getAlerts().slice(-30).reverse();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black">Historia i raporty</h1>
          <p className="text-sm text-muted-foreground">Wykresy, min/avg/max, alerty i raport do zapisania jako PDF.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}><TabsList className="rounded-full"><TabsTrigger value="1h" className="rounded-full">1h</TabsTrigger><TabsTrigger value="24h" className="rounded-full">24h</TabsTrigger><TabsTrigger value="7d" className="rounded-full">7 dni</TabsTrigger></TabsList></Tabs>
          <Button variant="outline" onClick={() => downloadTextFile(`autosafe-temperatura-${new Date().toISOString().slice(0,10)}.csv`, exportCsv(), "text/csv;charset=utf-8")}><Download className="mr-2 h-4 w-4" />CSV</Button>
          <Button onClick={openHtmlReport}><FileText className="mr-2 h-4 w-4" />Raport PDF/druk</Button>
        </div>
      </div>

      {sensors.length === 0 && <Card><CardContent className="py-16 text-center text-muted-foreground"><Thermometer className="mx-auto mb-3 h-10 w-10 opacity-30" />Brak czujników — dodaj je w zakładce Czujniki.</CardContent></Card>}

      <div className="grid gap-5 lg:grid-cols-2">
        {sensors.map((s) => {
          const ms = getMeasurementsForSensor(s.id, RANGES[range]);
          const temps = ms.map((m) => m.temperature).filter((v) => Number.isFinite(v));
          const hums = ms.map((m) => m.humidity).filter((v): v is number => v != null && Number.isFinite(v));
          const min = temps.length ? Math.min(...temps) : undefined;
          const max = temps.length ? Math.max(...temps) : undefined;
          const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : undefined;
          const humAvg = hums.length ? hums.reduce((a, b) => a + b, 0) / hums.length : undefined;
          return (
            <Card key={s.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="font-display text-lg">{s.roomName}</CardTitle>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{s.bluetoothName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{ms.length} pomiarów w zakresie</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="font-display text-xl font-black">{formatTemp(s.lastTemperature, settings.tempUnit)}</span>
                    {s.lastHumidity != null && <Badge variant="secondary" className="text-xs"><Droplets className="mr-1 h-3 w-3" />{formatHumidity(s.lastHumidity)}</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <TemperatureChart sensorId={s.id} range={range} />
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <Stat label="min" value={formatTemp(min, settings.tempUnit)} />
                  <Stat label="avg" value={formatTemp(avg, settings.tempUnit)} />
                  <Stat label="max" value={formatTemp(max, settings.tempUnit)} />
                  <Stat label="wilg." value={humAvg != null ? formatHumidity(humAvg) : "—"} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-primary" />Ostatnie alerty</CardTitle></CardHeader>
        <CardContent>
          {alerts.length === 0 ? <p className="text-sm text-muted-foreground">Brak alertów w historii.</p> : <div className="space-y-2">{alerts.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/40 px-3 py-2 text-sm"><div><span className="font-semibold">{a.roomName}</span><span className="ml-2 text-muted-foreground">{alertLabel[a.type] ?? a.type}</span></div><div className="flex items-center gap-2"><Badge variant={a.acknowledged ? "outline" : "secondary"}>{a.value} / próg {a.threshold}</Badge><span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString("pl-PL")}</span></div></div>)}</div>}
        </CardContent>
      </Card>

      {sensors.length > 0 && <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground"><BarChart3 className="mr-2 inline h-4 w-4" />Raport PDF/druk otwiera gotową stronę raportu. W przeglądarce wybierz Drukuj → Zapisz jako PDF.</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-muted/50 px-2 py-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-0.5 font-display text-sm font-bold">{value}</div></div>; }
