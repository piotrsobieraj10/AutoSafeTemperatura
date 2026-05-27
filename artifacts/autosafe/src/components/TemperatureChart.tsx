// TemperatureChart.tsx v2
import { useMemo } from "react";
import {
  CartesianGrid, ComposedChart, Line, Area,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  getMeasurementsForSensor, getSettings, getSensors, toDisplayTemp,
} from "@/services/storageService";
import { getProfile } from "@/services/sensorProfiles";

interface Props {
  sensorId: string;
  range: "1h" | "24h" | "7d";
  refreshKey?: string | number;
}

const RANGES = { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000 };

const fmtTime = (t: number, range: string) =>
  new Date(t).toLocaleTimeString("pl-PL",
    range === "7d"
      ? { weekday: "short", hour: "2-digit" }
      : { hour: "2-digit", minute: "2-digit" }
  );

export function TemperatureChart({ sensorId, range, refreshKey }: Props) {
  const settings = getSettings();
  const sensor   = getSensors().find((s) => s.id === sensorId);
  const profile  = getProfile(sensor?.profileId);

  const data = useMemo(() => {
    const ms = getMeasurementsForSensor(sensorId, RANGES[range]);
    if (ms.length > 200) {
      const bucket = Math.ceil(ms.length / 200);
      return ms.filter((_, i) => i % bucket === 0);
    }
    return ms;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensorId, range, refreshKey]);

  if (data.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
        Za mało danych — czujnik jeszcze zbiera pomiary.
      </div>
    );
  }

  const chartData = data.map((m) => ({
    time:        new Date(m.createdAt).getTime(),
    temperature: toDisplayTemp(m.temperature, settings.tempUnit),
    humidity:    m.humidity,
    pressure:    m.pressure,
  }));

  const hasHum  = !!(profile?.supportsHumidity && data.some((d) => d.humidity != null));
  const minAlert = sensor?.minTempAlert != null
    ? toDisplayTemp(sensor.minTempAlert, settings.tempUnit) : undefined;
  const maxAlert = sensor?.maxTempAlert != null
    ? toDisplayTemp(sensor.maxTempAlert, settings.tempUnit) : undefined;

  const tooltipStyle = {
    background:   "var(--popover)",
    border:       "1px solid var(--border)",
    borderRadius: "0.875rem",
    color:        "var(--popover-foreground)",
    fontSize:     "12px",
    boxShadow:    "var(--shadow-md)",
  };

  const vals = chartData.map((d) => d.temperature);
  const statMin = Math.min(...vals);
  const statMax = Math.max(...vals);
  const statAvg = vals.reduce((a, b) => a + b, 0) / vals.length;

  return (
    <div className="space-y-3">
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={`tg-${sensorId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="oklch(0.68 0.18 265)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="oklch(0.68 0.18 265)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke="var(--border)" strokeDasharray="4 4"
              strokeOpacity={0.5} vertical={false}
            />
            <XAxis
              dataKey="time"
              tickFormatter={(t) => fmtTime(t as number, range)}
              stroke="var(--muted-foreground)" fontSize={11}
              tickLine={false} axisLine={false}
            />
            <YAxis
              yAxisId="temp"
              stroke="var(--muted-foreground)" fontSize={11}
              tickLine={false} axisLine={false}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v}°`}
            />
            {hasHum && (
              <YAxis
                yAxisId="hum"
                orientation="right"
                stroke="var(--muted-foreground)" fontSize={11}
                tickLine={false} axisLine={false}
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
              />
            )}

            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(v) => new Date(v as number).toLocaleString("pl-PL")}
              formatter={(v: number, k: string) => {
                if (k === "temperature") return [`${v.toFixed(2)}°${settings.tempUnit}`, "Temperatura"];
                if (k === "humidity")    return [`${v.toFixed(1)}%`, "Wilgotność"];
                if (k === "pressure")   return [`${v.toFixed(1)} hPa`, "Ciśnienie"];
                return [v, k];
              }}
            />

            {minAlert != null && (
              <ReferenceLine yAxisId="temp" y={minAlert}
                stroke="oklch(0.65 0.18 240)" strokeDasharray="5 4" strokeOpacity={0.7}
                label={{ value: `min ${minAlert}°`, position: "insideBottomLeft", fontSize: 10, fill: "oklch(0.65 0.18 240)", opacity: 0.8 }}
              />
            )}
            {maxAlert != null && (
              <ReferenceLine yAxisId="temp" y={maxAlert}
                stroke="oklch(0.65 0.22 28)" strokeDasharray="5 4" strokeOpacity={0.7}
                label={{ value: `max ${maxAlert}°`, position: "insideTopLeft", fontSize: 10, fill: "oklch(0.65 0.22 28)", opacity: 0.8 }}
              />
            )}

            <Area
              yAxisId="temp" type="monotone" dataKey="temperature"
              stroke="oklch(0.68 0.18 265)" strokeWidth={2.5}
              fill={`url(#tg-${sensorId})`} dot={false}
              activeDot={{ r: 4, fill: "oklch(0.68 0.18 265)", stroke: "var(--background)", strokeWidth: 2 }}
            />
            {hasHum && (
              <Line
                yAxisId="hum" type="monotone" dataKey="humidity"
                stroke="oklch(0.65 0.16 220)" strokeWidth={1.5} dot={false}
                strokeDasharray="4 2"
                activeDot={{ r: 3 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {([["min", statMin], ["avg", statAvg], ["max", statMax]] as const).map(([label, val]) => (
          <div key={label} className="rounded-xl bg-muted/50 px-2 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="font-display mt-0.5 text-sm font-bold">
              {(val as number).toFixed(1)}°{settings.tempUnit}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
