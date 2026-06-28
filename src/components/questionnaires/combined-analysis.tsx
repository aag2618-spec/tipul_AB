"use client";

// ניתוח משולב חוצה-שאלונים למטופל, בכרטיס המטופל.
// מושך את תגובות השאלונים של המטופל (endpoint מגודר-PHI), מריץ את מנוע
// הפרשנות, ומציג תמונה לפי דומיינים + דגלי סיכון מצרפיים + תבניות + הדפסה במקום.

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Layers,
  ShieldAlert,
  AlertTriangle,
  Info,
  Printer,
  Loader2,
  GitMerge,
} from "lucide-react";
import { escapeHtml } from "@/lib/email-utils";
import {
  interpretResponse,
  interpretCombined,
  type TemplateLike,
  type ResponseLike,
  type Severity,
  type CombinedInterpretation,
  type Interpretation,
} from "@/lib/questionnaire-interpreter";

interface ApiResponse {
  id: string;
  status: string;
  completedAt: string | null;
  totalScore: number | null;
  subscores: Record<string, number> | null;
  answers: Array<{ value?: number; score?: number }> | null;
  template: TemplateLike;
}

const SEV_HEX: Record<Severity, string> = {
  none: "#22c55e",
  low: "#eab308",
  moderate: "#f97316",
  high: "#ef4444",
};
const SEV_BADGE: Record<Severity, string> = {
  none: "bg-green-500",
  low: "bg-yellow-500",
  moderate: "bg-orange-500",
  high: "bg-red-500",
};
const SEV_LABEL: Record<Severity, string> = {
  none: "תקין",
  low: "קל",
  moderate: "בינוני",
  high: "גבוה",
};

export function CombinedAnalysis({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<
    Array<{ template: TemplateLike; response: ResponseLike; meta: ApiResponse }>
  >([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/questionnaires/responses?clientId=${clientId}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as ApiResponse[];
        const completed = data.filter(
          (r) =>
            (r.status === "COMPLETED" || r.status === "ANALYZED") &&
            r.template?.scoring != null
        );
        if (active)
          setItems(
            completed.map((r) => ({
              template: r.template,
              response: {
                answers: r.answers ?? [],
                totalScore: r.totalScore,
                subscores: r.subscores,
              },
              meta: r,
            }))
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clientId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin ml-2" />
          טוען ניתוח משולב…
        </CardContent>
      </Card>
    );
  }

  // ניתוח משולב רלוונטי כשיש לפחות שני שאלונים שהושלמו.
  if (items.length < 2) return null;

  const combined = interpretCombined(items);
  const perItem: Array<{ meta: ApiResponse; interp: Interpretation }> =
    items.map((it) => ({
      meta: it.meta,
      interp: interpretResponse(it.template, it.response),
    }));

  const handlePrint = () => {
    const html = buildCombinedPrintHtml(clientName, combined, perItem);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "-10000px";
    iframe.style.width = "0";
    iframe.style.height = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 250);
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-primary" />
              תמונת אבחון משולבת
            </CardTitle>
            <CardDescription>
              ניתוח חוצה-שאלונים על בסיס {items.length} שאלונים שהושלמו
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 ml-2" />
            הדפסה / הורדה כ-PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm leading-relaxed">{combined.summary}</p>

        {/* דגלי סיכון מצרפיים — בראש */}
        {combined.riskFlags.length > 0 && (
          <div className="space-y-2">
            {combined.riskFlags.map((f, idx) => {
              const isCrit = f.level === "critical";
              const Icon = isCrit
                ? ShieldAlert
                : f.level === "warning"
                  ? AlertTriangle
                  : Info;
              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 ${
                    isCrit
                      ? "border-red-500 bg-red-50 dark:bg-red-950"
                      : f.level === "warning"
                        ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
                        : "border-blue-400 bg-blue-50 dark:bg-blue-950"
                  }`}
                >
                  <p className="flex items-center gap-2 font-medium text-sm">
                    <Icon className="h-4 w-4 shrink-0" />
                    {f.title}
                  </p>
                  <p className="text-sm mt-1 leading-relaxed">{f.body}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* דומיינים */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-600" />
            תחומים שנבדקו
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {combined.domains.map((d) => (
              <div
                key={d.domain}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium text-sm">{d.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.items.join(" · ")}
                  </p>
                </div>
                <Badge className={`${SEV_BADGE[d.severity]} text-white shrink-0`}>
                  {SEV_LABEL[d.severity]}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* תבניות חוצות-דומיינים */}
        {combined.patterns.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold">תבניות והצטלבויות</h4>
            <ul className="space-y-1.5 text-sm">
              {combined.patterns.map((p, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-primary shrink-0">•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Separator />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {combined.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}

// בונה מסמך הדפסה עצמאי (window.print דרך iframe מבודד). hex קשיח בלבד,
// כל נתון דינמי עובר escapeHtml.
function buildCombinedPrintHtml(
  clientName: string,
  combined: CombinedInterpretation,
  perItem: Array<{ meta: ApiResponse; interp: Interpretation }>
): string {
  const dateStr = new Date().toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const riskHtml = combined.riskFlags.length
    ? `<div class="block">${combined.riskFlags
        .map((f) => {
          const hex =
            f.level === "critical"
              ? "#ef4444"
              : f.level === "warning"
                ? "#f97316"
                : "#3b82f6";
          return `<div class="risk" style="border-color:${hex}">
            <div class="risk-title" style="color:${hex}">${escapeHtml(
              f.title
            )}</div>
            <div class="risk-body">${escapeHtml(f.body)}</div>
          </div>`;
        })
        .join("")}</div>`
    : "";

  const domainsHtml = `<table class="tbl"><thead><tr><th>תחום</th><th>רמה</th><th>פירוט</th></tr></thead><tbody>${combined.domains
    .map(
      (d) => `<tr>
        <td>${escapeHtml(d.label)}</td>
        <td><span class="pill" style="background:${SEV_HEX[d.severity]}">${
          SEV_LABEL[d.severity]
        }</span></td>
        <td class="muted">${escapeHtml(d.items.join(" · "))}</td>
      </tr>`
    )
    .join("")}</tbody></table>`;

  const patternsHtml = combined.patterns.length
    ? `<div class="block"><div class="section-title">תבניות והצטלבויות</div><ul>${combined.patterns
        .map((p) => `<li>${escapeHtml(p)}</li>`)
        .join("")}</ul></div>`
    : "";

  const itemsHtml = `<table class="tbl"><thead><tr><th>שאלון</th><th>רמה</th><th>ציון</th></tr></thead><tbody>${perItem
    .map(
      ({ interp }) => `<tr>
        <td>${escapeHtml(interp.title)}</td>
        <td>${escapeHtml(interp.level?.label || SEV_LABEL[interp.severity])}</td>
        <td>${interp.totalScore}/${interp.maxScore}</td>
      </tr>`
    )
    .join("")}</tbody></table>`;

  return `<!DOCTYPE html><html dir="rtl" lang="he"><head>
    <meta charset="utf-8"/>
    <title>${escapeHtml(`תמונת אבחון משולבת - ${clientName}`)}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      @page { size:A4 portrait; margin:12mm; }
      body { font-family:'Segoe UI','Heebo',Arial,sans-serif; color:#1e293b; direction:rtl; text-align:right; padding:0 6mm; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .header { border-bottom:3px solid #0f766e; padding-bottom:14px; margin-bottom:22px; }
      .header .title { font-size:22px; font-weight:800; color:#0f766e; }
      .header .meta { font-size:13px; color:#64748b; margin-top:6px; }
      .summary { font-size:15px; line-height:1.6; margin-bottom:18px; }
      .block { margin-bottom:18px; }
      .section-title { font-size:15px; font-weight:700; color:#0f766e; margin-bottom:8px; }
      .risk { border:2px solid; border-radius:8px; padding:10px 12px; margin-bottom:8px; }
      .risk-title { font-weight:700; font-size:14px; }
      .risk-body { font-size:13px; line-height:1.5; margin-top:4px; }
      .tbl { width:100%; border-collapse:collapse; font-size:13px; }
      .tbl th, .tbl td { border:1px solid #e2e8f0; padding:7px 10px; text-align:right; vertical-align:top; }
      .tbl th { background:#f1f5f9; font-weight:700; }
      .pill { color:#fff; padding:2px 10px; border-radius:999px; font-size:12px; }
      .muted { color:#64748b; }
      ul { padding-right:18px; }
      li { font-size:13px; line-height:1.6; margin-bottom:4px; }
      .disclaimer { margin-top:24px; padding-top:12px; border-top:1px solid #e2e8f0; font-size:11px; color:#64748b; line-height:1.5; }
    </style></head><body>
    <div class="header">
      <div class="title">תמונת אבחון משולבת</div>
      <div class="meta">${escapeHtml(clientName)} · ${escapeHtml(dateStr)}</div>
    </div>
    <div class="summary">${escapeHtml(combined.summary)}</div>
    ${riskHtml}
    <div class="block"><div class="section-title">תחומים שנבדקו</div>${domainsHtml}</div>
    ${patternsHtml}
    <div class="block"><div class="section-title">שאלונים שנכללו</div>${itemsHtml}</div>
    <div class="disclaimer">${escapeHtml(combined.disclaimer)}</div>
  </body></html>`;
}
