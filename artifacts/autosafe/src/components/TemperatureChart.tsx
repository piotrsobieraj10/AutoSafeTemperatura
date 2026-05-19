import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getMeasurementsForSensor } from "@/services/storageService";

interface TemperatureChartProps {
  sensorId: string;
  range: "1h" | "24h" | "7d";
  refreshKey?: string | number;
}

const RANGES: Record<TemperatureChartProps["range"], number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export function TemperatureChart({ sensorId, range, refreshKey }: TemperatureChartProps) {
  const data = useMemo(() => {
    const measurements = getMeasurementsForSensor(sensorId, RANGES[range]);
    return measurements.map((m) => ({
      time: new Date(m.createdAt).getTime(),
      temperature: m.temperature,
      humidity: m.humidity,
    }));
  }, [sensorId, range, refreshKey]);

  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Za mało danych do wykresu — wykonaj kilka odczytów albo poczekaj na dane demo.
      </div>
    );
  }

  const fmt = (t: number) =>
    new Date(t).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  const chartId = sensorId.replace(/[^a-zA-Z0-9_-]/g, "");

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id={`tempFill-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`humFill-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--cold)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--cold)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="time" tickFormatter={fmt} stroke="var(--muted-foreground)" fontSize={11} />
          <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={11} domain={["auto", "auto"]} unit="°" />
          <YAxis yAxisId="right" orientation="right" stroke="var(--muted-foreground)" fontSize={11} domain={[0, 100]} unit="%" />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.75rem",
              color: "var(--popover-foreground)",
            }}
            labelFormatter={(v) => new Date(v as number).toLocaleString("pl-PL")}
            formatter={(v: number, k) => [`${v.toFixed(1)}${k === "temperature" ? "°C" : "%"}`, k === "temperature" ? "Temperatura" : "Wilgotność"]}
          />
          <Area yAxisId="left" type="monotone" dataKey="temperature" stroke="var(--primary)" strokeWidth={2} fill={`url(#tempFill-${chartId})`} />
          <Area yAxisId="right" type="monotone" dataKey="humidity" stroke="var(--cold)" strokeWidth={1.5} fill={`url(#humFill-${chartId})`} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
