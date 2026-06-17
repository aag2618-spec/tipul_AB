"use client";

import { useEffect, useId, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── צבעי הגרפים מתוך ה-theme ─────────────────────────────────────────────
// recharts מצייר את ה-fill/stroke כ-SVG attribute, ולכן `hsl(var(--x))` או
// `var(--x)` *לא* מתפענחים שם (var() תקף רק ב-CSS, לא ב-attribute). לכן קוראים
// את הערך הממשי (oklch) מתוך ה-:root דרך getComputedStyle ומעבירים מחרוזת-צבע
// שלמה. הזה גם מתקן באג ותיק: גרפים שהשתמשו ב-"hsl(var(--primary))" /
// "hsl(var(--muted))" צוירו בשחור/נשברו כי ה-theme עבר ל-oklch.
export type ColorToken =
  | "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5"
  | "primary" | "destructive" | "neutral";

type ThemeColors = Record<ColorToken, string> & {
  muted: string;
  mutedForeground: string;
  border: string;
  card: string;
  foreground: string;
};

// ערכי ברירת מחדל = ערכי ה-theme הבהיר מ-globals.css. גם בלי קריאה מה-DOM
// (SSR/first paint) הגרף ייראה נכון במצב בהיר; הקריאה מסנכרנת את המצב הכהה.
const FALLBACK: ThemeColors = {
  "chart-1": "oklch(0.55 0.15 180)",
  "chart-2": "oklch(0.6 0.1 150)",
  "chart-3": "oklch(0.5 0.12 250)",
  "chart-4": "oklch(0.7 0.15 85)",
  "chart-5": "oklch(0.65 0.08 200)",
  primary: "oklch(0.45 0.12 180)",
  destructive: "oklch(0.55 0.2 30)",
  neutral: "oklch(0.5 0.02 180)",
  muted: "oklch(0.95 0.01 180)",
  mutedForeground: "oklch(0.5 0.02 180)",
  border: "oklch(0.9 0.02 180)",
  card: "oklch(1 0 0)",
  foreground: "oklch(0.2 0.02 200)",
};

function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const s = getComputedStyle(root);
      const read = (cssVar: string, fallback: string) => {
        const v = s.getPropertyValue(cssVar).trim();
        return v || fallback;
      };
      setColors({
        "chart-1": read("--chart-1", FALLBACK["chart-1"]),
        "chart-2": read("--chart-2", FALLBACK["chart-2"]),
        "chart-3": read("--chart-3", FALLBACK["chart-3"]),
        "chart-4": read("--chart-4", FALLBACK["chart-4"]),
        "chart-5": read("--chart-5", FALLBACK["chart-5"]),
        primary: read("--primary", FALLBACK.primary),
        destructive: read("--destructive", FALLBACK.destructive),
        neutral: read("--muted-foreground", FALLBACK.neutral),
        muted: read("--muted", FALLBACK.muted),
        mutedForeground: read("--muted-foreground", FALLBACK.mutedForeground),
        border: read("--border", FALLBACK.border),
        card: read("--card", FALLBACK.card),
        foreground: read("--foreground", FALLBACK.foreground),
      });
    };
    sync();
    // מעקב אחרי החלפת מצב בהיר/כהה (toggle של class="dark" ב-<html>)
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

function formatBy(type: FormatType, value: number): string {
  if (type === "currency") return `₪${value.toLocaleString()}`;
  if (type === "percentage") return `${value}%`;
  return String(value);
}

// Tooltip מעוצב משותף — רקע כרטיס, פינה מעוגלת, RTL.
function ChartTooltip({
  active,
  payload,
  label,
  colors,
  formatType,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string | number;
  colors: ThemeColors;
  formatType: FormatType;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const value = typeof payload[0]?.value === "number" ? payload[0].value : 0;
  return (
    <div
      dir="rtl"
      style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        padding: "8px 12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      {label !== undefined && (
        <p style={{ color: colors.mutedForeground, fontSize: 12, margin: 0 }}>{label}</p>
      )}
      <p style={{ color: colors.foreground, fontSize: 15, fontWeight: 700, margin: 0 }}>
        {formatBy(formatType, value)}
      </p>
    </div>
  );
}

type FormatType = "currency" | "number" | "percentage";
type ChartType = "area" | "bar";

interface ReportsChartsProps {
  data: Record<string, string | number>[];
  dataKey: string;
  xAxisKey?: string;
  colorToken?: ColorToken;
  formatType?: FormatType;
  type?: ChartType;
}

export function ReportsCharts({
  data,
  dataKey,
  xAxisKey = "month",
  colorToken = "primary",
  formatType = "number",
  type = "area",
}: ReportsChartsProps) {
  const colors = useThemeColors();
  const gradId = useId().replace(/:/g, "");
  const color = colors[colorToken];

  const axisTick = { fill: colors.mutedForeground, fontSize: 12 } as const;

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        {type === "area" ? (
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
            <XAxis dataKey={xAxisKey} tick={axisTick} tickLine={false} axisLine={{ stroke: colors.border }} />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => formatBy(formatType, v)}
            />
            <Tooltip
              cursor={{ stroke: colors.border, strokeWidth: 1 }}
              content={<ChartTooltip colors={colors} formatType={formatType} />}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${gradId})`}
              activeDot={{ r: 5, fill: color, stroke: colors.card, strokeWidth: 2 }}
            />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
            <XAxis dataKey={xAxisKey} tick={axisTick} tickLine={false} axisLine={{ stroke: colors.border }} />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => formatBy(formatType, v)}
            />
            <Tooltip
              cursor={{ fill: colors.muted, opacity: 0.4 }}
              content={<ChartTooltip colors={colors} formatType={formatType} />}
            />
            <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} maxBarSize={48} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ── גרף טבעת (donut) להתפלגויות ─────────────────────────────────────────
interface DonutDatum {
  name: string;
  value: number;
}

interface ReportsDonutProps {
  data: DonutDatum[];
  colorTokens?: ColorToken[];
  /** טקסט תחת המספר במרכז הטבעת (למשל "פגישות"). */
  centerLabel?: string;
}

const DEFAULT_DONUT_TOKENS: ColorToken[] = ["chart-1", "chart-2", "chart-4", "chart-3", "chart-5"];

export function ReportsDonut({ data, colorTokens = DEFAULT_DONUT_TOKENS, centerLabel }: ReportsDonutProps) {
  const colors = useThemeColors();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const sliceColor = (i: number) => colors[colorTokens[i % colorTokens.length]];

  if (total === 0) {
    return (
      <div className="flex h-[260px] w-full items-center justify-center text-sm text-muted-foreground">
        אין נתונים להצגה
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* מקרא עם אחוזים */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
        {data.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: sliceColor(i) }} />
            <span className="font-medium text-foreground">{d.name}</span>
            <span>
              {d.value} ({total > 0 ? Math.round((d.value / total) * 100) : 0}%)
            </span>
          </span>
        ))}
      </div>

      <div className="relative h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data as unknown as React.ComponentProps<typeof Pie>["data"]}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke={colors.card}
              strokeWidth={3}
              startAngle={90}
              endAngle={-270}
            >
              {data.map((d, i) => (
                <Cell key={d.name} fill={sliceColor(i)} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip colors={colors} total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        {/* סך-הכול במרכז הטבעת */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-foreground">{total}</span>
          <span className="text-xs text-muted-foreground">{centerLabel ?? "סה״כ"}</span>
        </div>
      </div>
    </div>
  );
}

function DonutTooltip({
  active,
  payload,
  colors,
  total,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number }[];
  colors: ThemeColors;
  total: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const name = payload[0]?.name ?? "";
  const value = typeof payload[0]?.value === "number" ? payload[0].value : 0;
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      dir="rtl"
      style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        padding: "8px 12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <p style={{ color: colors.foreground, fontSize: 14, fontWeight: 700, margin: 0 }}>
        {name}: {value} ({pct}%)
      </p>
    </div>
  );
}
