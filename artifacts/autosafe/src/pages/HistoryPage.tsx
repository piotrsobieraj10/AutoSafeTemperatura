import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Trash2 } from "lucide-react";
import { TemperatureChart } from "@/components/TemperatureChart";
import { useSensors } from "@/hooks/useSensors";
import { buildMeasurementsCsv, clearMeasurements, getMeasurements } from "@/services/storageService";
import { toast } from "sonner";

type Range = "1h" | "24h" | "7d";

const downloadTextFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export function HistoryPage() {
  const { sensors, refresh } = useSensors();
  const [range, setRange] = useState<Range>("1h");
  const totalMeasurements = getMeasurements().length;

  const handleExportCsv = () => {
    downloadTextFile("autosafe-temperatura-pomiary.csv", buildMeasurementsCsv(), "text/csv;charset=utf-8");
    toast.success("Wyeksportowano historię CSV.");
  };

  const handleClear = () => {
    clearMeasurements();
    refresh();
    toast.success("Wyczyszczono historię pomiarów.");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Historia pomiarów</h1>
          <p className="text-sm text-muted-foreground">Lokalna historia z eksportem CSV. Liczba zapisanych pomiarów: {totalMeasurements}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList>
              <TabsTrigger value="1h">1h</TabsTrigger>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7 dni</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" onClick={handleExportCsv} disabled={totalMeasurements === 0}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="ghost" onClick={handleClear} disabled={totalMeasurements === 0}>
            <Trash2 className="mr-2 h-4 w-4" /> Wyczyść
          </Button>
        </div>
      </div>

      {sensors.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Brak danych.</CardContent></Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {sensors.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span className="truncate">{s.roomName}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {s.lastTemperature != null ? `${s.lastTemperature.toFixed(1)}°C` : "—"}
                  {s.lastHumidity != null ? ` · ${s.lastHumidity.toFixed(0)}%` : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TemperatureChart sensorId={s.id} range={range} refreshKey={s.lastReadAt} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
