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
  TrendingDown,
  TrendingUp,
  Minus,
  Fingerprint,
  Flame,
  Sparkles,
  HelpCircle,
  Target,
  ClipboardList,
  FileSearch,
  FileText,
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

// באנר שינוי לעומת מדידה קודמת
function ChangeBanner({ change }: { change: NonNullable<Interpretation["change"]> }) {
  const improved = change.direction === "improved";
  const worsened = change.direction === "worsened";
  const Icon = improved ? TrendingDown : worsened ? TrendingUp : Minus;
  const cls = improved
    ? "border-green-500 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200"
    : worsened
      ? "border-red-400 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200"
      : "border-muted bg-muted/40";
  return (
    <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${cls}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <span>{change.note}</span>
    </div>
  );
}

function ListCard({
  icon,
  title,
  items,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  color: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm">
          {items.map((t, idx) => (
            <li key={idx} className="flex gap-2">
              <span className={`${color} shrink-0`}>•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
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

      {/* שינוי לעומת מדידה קודמת */}
      {i.change && <ChangeBanner change={i.change} />}

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

          {/* דפוס / חתימה */}
          {i.pattern && (
            <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
              <Fingerprint className="h-5 w-5 mt-0.5 shrink-0 text-purple-600" />
              <div>
                <p className="font-medium text-sm">{i.pattern.name}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {i.pattern.description}
                </p>
              </div>
            </div>
          )}

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

      {/* סיכום קליני נרטיבי */}
      {i.narrative && (
        <Card className="border-teal-200 dark:border-teal-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-teal-600" />
              סיכום קליני
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{i.narrative}</p>
          </CardContent>
        </Card>
      )}

      {/* מוקדי מצוקה ואזורי חוסן */}
      {((i.topItems && i.topItems.length > 0) ||
        (i.strengths && i.strengths.length > 0)) && (
        <div className="grid gap-4 md:grid-cols-2">
          {i.topItems && i.topItems.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="h-5 w-5 text-red-500" />
                  מוקדי המצוקה הבולטים
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {i.topItems.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>{t.title}</span>
                      <Badge variant="outline" className="shrink-0">
                        {t.value}/{t.max}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {i.strengths && i.strengths.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-green-600" />
                  אזורי חוסן
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {i.strengths.map((s) => (
                    <li key={s.id} className="flex gap-2">
                      <span className="text-green-600 shrink-0">•</span>
                      <span>{s.title}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* על מה לשים לב */}
      <ListCard
        icon={<Eye className="h-5 w-5 text-amber-600" />}
        title="על מה לשים לב"
        items={i.watchFor}
        color="text-amber-600"
      />

      {/* שאלות לבירור בפגישה הבאה */}
      <ListCard
        icon={<HelpCircle className="h-5 w-5 text-blue-600" />}
        title="שאלות לבירור בפגישה הבאה"
        items={i.questionsToAsk || []}
        color="text-blue-600"
      />

      {/* יעדי טיפול */}
      <ListCard
        icon={<Target className="h-5 w-5 text-rose-600" />}
        title="יעדי טיפול מוצעים"
        items={i.treatmentTargets || []}
        color="text-rose-600"
      />

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

      {/* שאלונים משלימים מומלצים */}
      {i.complementary && i.complementary.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-cyan-600" />
              שאלונים משלימים מומלצים
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {i.complementary.map((c) => (
              <div key={c.code} className="text-sm">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground"> — {c.reason}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* אבחנה מבדלת */}
      {i.differential && i.differential.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-slate-600" />
              לבדיקה / לשלילה (לא אבחנה)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {i.differential.map((d, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-slate-500 shrink-0">•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
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
