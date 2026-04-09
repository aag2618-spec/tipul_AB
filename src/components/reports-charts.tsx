"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface ChartInnerProps {
  data: Record<string, string | number>[];
  dataKey: string;
  color?: string;
  xAxisKey: string;
}

interface ReportsChartsProps {
  data: Record<string, string | number>[];
  dataKey: string;
  xAxisKey?: string;
  color?: string;
  formatType?: "currency" | "number" | "percentage";
}

export function ReportsCharts({
  data,
  dataKey,
  xAxisKey = "month",
  color = "hsl(var(--primary))",
  formatType = "number",
}: ReportsChartsProps) {
  const [Chart, setChart] = useState<React.ComponentType<ChartInnerProps> | null>(null);

  const formatValue = (value: number): string => {
    if (formatType === "currency") return `₪${value.toLocaleString()}`;
    if (formatType === "percentage") return `${value}%`;
    return String(value);
  };

  useEffect(() => {
    import("recharts").then((mod) => {
      const ChartComponent = ({ data, dataKey, color, xAxisKey }: ChartInnerProps) => (
        <mod.ResponsiveContainer width="100%" height="100%">
          <mod.BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <mod.CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
            <mod.XAxis
              dataKey={xAxisKey}
              fontSize={12}
              tick={{ fill: "hsl(var(--muted-foreground))" }}
            />
            <mod.YAxis
              fontSize={12}
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={formatValue}
            />
            <mod.Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                direction: "rtl",
              }}
              formatter={(value: number | undefined) => [formatValue(typeof value === 'number' ? value : 0), ""]}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <mod.Bar
              dataKey={dataKey}
              fill={color}
              radius={[4, 4, 0, 0]}
            />
          </mod.BarChart>
        </mod.ResponsiveContainer>
      );
      setChart(() => ChartComponent);
    }).catch((err) => {
      console.error("Failed to load recharts:", err);
    });
  }, [formatType]);

  if (!Chart) {
    return (
      <div className="h-[300px] w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <Chart data={data} dataKey={dataKey} color={color} xAxisKey={xAxisKey} />
    </div>
  );
}
