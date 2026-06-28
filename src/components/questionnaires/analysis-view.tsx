"use client";

// תצוגת ניתוח עשיר לתגובת שאלון בודדת.
// רכיב הצגה טהור — מקבל Interpretation מוכן (מחושב במנוע) ומרנדר אותו.

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  ShieldAlert,
  Info,
  Lightbulb,
  Eye,
  CalendarClock,
  Layers,
  Stethoscope,
} from "lucide-react";
import type {
  Interpretation,
  Severity,
  RiskFlag,
} from "@/lib/questionnaire-interpreter";

const SEVERITY_STYLE: Record<
  Severity,
  { badge: string; bar: string; label: string }
> = {
  none: { badge: "bg-green-500", bar: "[&>div]:bg-green-500", label: "תקין" },
  low: { badge: "bg-yellow-500", bar: "[&>div]:bg-yellow-500", label: "קל" },
  moderate: {
    badge: "bg-orange-500",
    bar: "[&>div]:bg-orange-500",
    label: "בינוני",
  },
  high: { badge: "bg-red-500", bar: "[&>div]:bg-red-500", label: "גבוה" },
};

function RiskFlagCard({ flag }: { flag: RiskFlag }) {
  const isCritical = flag.level === "critical";
  const isWarning = flag.level === "warning";
  const cls = isCritical
    ? "border-red-500 bg-red-50 dark:bg-red-950"
    : isWarning
      ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
      : "border-blue-400 bg-blue-50 dark:bg-blue-950";
  const titleCls = isCritical
    ? "text-red-700 dark:text-red-300"
    : isWarning
      ? "text-orange-700 dark:text-orange-300"
      : "text-blue-700 dark:text-blue-300";
  const Icon = isCritical ? ShieldAlert : isWarning ? AlertTriangle : Info;
  return (
    <Card className={cls}>
      <CardHeader className="pb-2">
        <CardTitle className={`text-base flex items-center gap-2 ${titleCls}`}>
          <Icon className="h-5 w-5 shrink-0" />
          {flag.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed">{flag.body}</p>
      </CardContent>
    </Card>
  );
}

export function AnalysisView({
  interpretation,
}: {
  interpretation: Interpretation;
}) {
  const i = interpretation;
  const sev = SEVERITY_STYLE[i.severity];

  return (
    <div className="space-y-5">
      {/* דגלי סיכון — נעוצים בראש */}
      {i.riskFlags.length > 0 && (
        <div className="space-y-3">
          {i.riskFlags.map((f, idx) => (
            <RiskFlagCard key={idx} flag={f} />
          ))}
        </div>
      )}

      {/* רמה כוללת */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            ניתוח התוצאה
            {i.source === "auto" && (
              <Badge variant="outline" className="text-xs font-normal">
                ניתוח אוטומטי
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold">
              {i.totalScore}
              <span className="text-lg text-muted-foreground">
                /{i.maxScore}
              </span>
            </span>
            {i.level && (
              <Badge className={`${sev.badge} text-white text-base px-3 py-0.5`}>
                {i.level.label}
              </Badge>
            )}
          </div>
          <Progress value={i.percentage} className={`h-2.5 ${sev.bar}`} />
          <p className="text-muted-foreground">{i.headline}</p>

          {/* פסקאות משמעות קלינית */}
          {i.richBody && i.richBody.length > 0 && (
            <div className="space-y-2 pt-1">
              {i.richBody.map((p, idx) => (
                <p key={idx} className="text-sm leading-relaxed">
                  {p}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* על מה לשים לב */}
      {i.watchFor.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-5 w-5 text-amber-600" />
              על מה לשים לב
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {i.watchFor.map((w, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-amber-600 shrink-0">•</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* המלצות */}
      {i.recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-teal-600" />
              המלצות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {i.recommendations.map((r, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-teal-600 shrink-0">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            {i.followUp && (
              <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{i.followUp}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* תת-סולמות / אשכולות */}
      {i.subscales.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-600" />
              פירוט לפי תחומים
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {i.subscales.map((s) => (
              <div key={s.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-sm">{s.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {s.score}
                    {typeof s.maxScore === "number" ? `/${s.maxScore}` : ""}
                    {s.level ? ` · ${s.level}` : ""}
                  </span>
                </div>
                {s.note && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {s.note}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Separator />
      <p className="text-xs text-muted-foreground leading-relaxed">
        {i.disclaimer}
      </p>
    </div>
  );
}
