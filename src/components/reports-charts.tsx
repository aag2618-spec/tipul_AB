"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface ReportsChartsProps {
  data: { month: string; [key: string]: string | number }[];
  dataKey: string;
  color?: string;
  formatType?: "currency" | "number";
}

export function ReportsCharts({
  data,
  dataKey,
  color = "hsl(var(--primary))",
  formatType = "number",
}: ReportsChartsProps) {
  const [Chart, setChart] = useState<React.ComponentType<any> | null>(null);

  // Format function defined inside the client component
  const formatValue = (value: number): string => {
    if (formatType === "currency") {
      return `₪${value.toLocaleString()}`;
    }
    return String(value);
  };

  useEffect(() => {
    // Dynamic import on client side only
    import("recharts").then((mod) => {
      const ChartComponent = ({ data, dataKey, color }: Omit<ReportsChartsProps, "formatType">) => (
        <mod.ResponsiveContainer width="100%" height="100%">
          <mod.BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <mod.CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
            <mod.XAxis
              dataKey="month"
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
      <Chart data={data} dataKey={dataKey} color={color} />
    </div>
  );
}

