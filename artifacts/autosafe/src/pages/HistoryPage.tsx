// routes/history.tsx v2
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemperatureChart } from "@/components/TemperatureChart";
import { useSensors } from "@/hooks/useSensors";
import { formatTemp, formatHumidity, getSettings, getMeasurementsForSensor } from "@/services/storageService";
import { Thermometer } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Range = "1h" | "24h" | "7d";
const RANGES: Record<Range, number> = { "1h": 3600_000, "24h": 86400_000, "7d": 604800_000 };

export function HistoryPage() {
  const { sensors } = useSensors();
  const [range, setRange] = useState<Range>("24h");
  const settings = getSettings();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Historia</h1>
          <p className="text-sm text-muted-foreground">Lokalne pomiary z czujników BLE.</p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList className="rounded-full">
            <TabsTrigger value="1h"  className="rounded-full">1h</TabsTrigger>
            <TabsTrigger value="24h" className="rounded-full">24h</TabsTrigger>
            <TabsTrigger value="7d"  className="rounded-full">7 dni</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {sensors.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Thermometer className="mx-auto h-10 w-10 mb-3 opacity-30" />
            Brak czujników — dodaj je w zakładce Czujniki.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {sensors.map((s) => {
          const ms = getMeasurementsForSensor(s.id, RANGES[range]);
          const last = ms[ms.length - 1];
          return (
            <Card key={s.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="font-display text-lg">{s.roomName}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{ms.length} pomiarów w zakresie</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="font-display text-xl font-bold">
                      {formatTemp(s.lastTemperature, settings.tempUnit)}
                    </span>
                    {s.lastHumidity != null && (
                      <Badge variant="secondary" className="text-xs">{formatHumidity(s.lastHumidity)}</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <TemperatureChart sensorId={s.id} range={range} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
