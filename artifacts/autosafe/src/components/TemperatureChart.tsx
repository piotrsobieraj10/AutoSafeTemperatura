import { useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis, ReferenceLine,
} from "recharts";
import { getMeasurementsForSensor, getSettings, getSensors } from "@/services/storageService";

interface TemperatureChartProps {
  sensorId: string;
  range: "1h" | "24h" | "7d";
  refreshKey?: string | number;
}

const RANGES: Record<TemperatureChartProps["range"], number> = {
  "1h":  60 * 60 * 1_000,
  "24h": 24 * 60 * 60 * 1_000,
  "7d":  7 * 24 * 60 * 60 * 1_000,
};

export function TemperatureChart({ sensorId, range, refreshKey }: TemperatureChartProps) {
  const settings = getSettings();
  const sensor = getSensors().find((s) => s.id === sensorId);

  const data = useMemo(() => {
    const measurements = getMeasurementsForSensor(sensorId, RANGES[range]);
    return measurements.map((m) => ({
      time: new Date(m.createdAt).getTime(),
      temperature: settings.tempUnit === "F"
        ? +(m.temperature * 9 / 5 + 32).toFixed(1)
        : m.temperature,
      humidity: m.humidity,
      rssi: m.rssi,
    }));
  }, [sensorId, range, refreshKey, settings.tempUnit]);

  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Za mało danych — czujnik jeszcze zbiera pomiary.
      </div>
    );
  }

  const fmt = (t: number) =>
    new Date(t).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

  const chartId = sensorId.replace(/[^a-zA-Z0-9_-]/g, "");
  const unit = settings.tempUnit;
  const minAlert = sensor?.minTempAlert != null
    ? (unit === "F" ? +(sensor.minTempAlert * 9 / 5 + 32).toFixed(1) : sensor.minTempAlert)
    : undefined;
  const maxAlert = sensor?.maxTempAlert != null
    ? (unit === "F" ? +(sensor.maxTempAlert * 9 / 5 + 32).toFixed(1) : sensor.maxTempAlert)
    : undefined;

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
          <YAxis
            yAxisId="left"
            stroke="var(--muted-foreground)"
            fontSize={11}
            domain={["auto", "auto"]}
            unit={`°${unit}`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="var(--muted-foreground)"
            fontSize={11}
            domain={[0, 100]}
            unit="%"
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.75rem",
              color: "var(--popover-foreground)",
            }}
            labelFormatter={(v) => new Date(v as number).toLocaleString("pl-PL")}
            formatter={(v: number, k) => [
              `${v.toFixed(1)}${k === "temperature" ? `°${unit}` : "%"}`,
              k === "temperature" ? "Temperatura" : "Wilgotność",
            ]}
          />
          {minAlert != null && (
            <ReferenceLine
              yAxisId="left"
              y={minAlert}
              stroke="var(--cold)"
              strokeDasharray="4 2"
              label={{ value: `min ${minAlert}°${unit}`, fill: "var(--cold)", fontSize: 10 }}
            />
          )}
          {maxAlert != null && (
            <ReferenceLine
              yAxisId="left"
              y={maxAlert}
              stroke="var(--hot)"
              strokeDasharray="4 2"
              label={{ value: `max ${maxAlert}°${unit}`, fill: "var(--hot)", fontSize: 10 }}
            />
          )}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="temperature"
            stroke="var(--primary)"
            strokeWidth={2}
            fill={`url(#tempFill-${chartId})`}
          />
          <Area
            yAxisId="right"
            type="monotone"
            dataKey="humidity"
            stroke="var(--cold)"
            strokeWidth={1.5}
            fill={`url(#humFill-${chartId})`}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
