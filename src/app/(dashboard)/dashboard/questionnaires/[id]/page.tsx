"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  ChevronRight,
  FileText,
  Printer,
  Loader2,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { escapeHtml } from "@/lib/email-utils";

interface Question {
  id: number;
  title: string;
  section?: string;
  sectionName?: string;
  options?: { value: number; text: string }[];
}

interface Template {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  category: string | null;
  testType: string;
  questions: Question[];
  scoring: {
    ranges?: { min: number; max: number; label: string; description: string }[];
    maxScore?: number;
    cutoff?: number;
    subscales?: Record<string, { items: number[]; name: string }>;
  };
}

interface Response {
  id: string;
  answers: any[];
  totalScore: number | null;
  subscores: Record<string, number> | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  template: Template;
  client: {
    id: string;
    name: string;
    birthDate: string | null;
  };
}

export default function QuestionnaireResultsPage() {
  const router = useRouter();
  const params = useParams();
  const responseId = params.id as string;

  const [response, setResponse] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    fetchResponse();
  }, [responseId]);

  const fetchResponse = async () => {
    try {
      const res = await fetch(`/api/questionnaires/responses/${responseId}`);
      if (res.ok) {
        const data = await res.json();
        setResponse(data);
      } else {
        toast.error("שאלון לא נמצא");
        router.push("/dashboard/questionnaires");
      }
    } catch (error) {
      console.error("Error fetching response:", error);
      toast.error("שגיאה בטעינת השאלון");
    } finally {
      setLoading(false);
    }
  };

  const getScoreLevel = () => {
    if (!response || response.totalScore === null) return null;
    
    const ranges = response.template.scoring?.ranges;
    if (!ranges) return null;
    
    return ranges.find(r => 
      response.totalScore! >= r.min && response.totalScore! <= r.max
    );
  };

  const getScoreColor = (level: string | undefined) => {
    switch (level) {
      case "מינימלי":
      case "תקין/מינימלי":
        return "bg-green-500";
      case "קל":
        return "bg-yellow-500";
      case "בינוני":
        return "bg-orange-500";
      case "חמור":
        return "bg-red-500";
      case "מתחת לסף":
        return "bg-green-500";
      case "מעל הסף":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  // בונה מסמך HTML עצמאי ומדפיס אותו דרך iframe מבודד (window.print).
  // למה הדפסה ולא צילום (html2canvas)? כי הדפדפן מפרק לעמודים נקיים עם שוליים
  // ולא חותך טקסט באמצע, מטפל בעברית/RTL מצוין, ולא נשבר על ערכת הצבעים oklch.
  // צבעי hex קשיחים בלבד; כל נתון מהמשתמש עובר escapeHtml למניעת הזרקת HTML.
  const buildPrintHtml = () => {
    if (!response) return "";
    const tmpl = response.template;
    const level = getScoreLevel();
    const max = tmpl.scoring?.maxScore || 100;
    const dateStr = new Date(
      response.completedAt || response.startedAt
    ).toLocaleDateString("he-IL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const levelHex = (label: string | undefined) => {
      const l = label || "";
      if (l.includes("חמור") || l.includes("מעל הסף")) return "#ef4444";
      if (l.includes("בינוני")) return "#f97316";
      if (l.includes("קל")) return "#eab308";
      if (l.includes("מינימלי") || l.includes("תקין") || l.includes("מתחת"))
        return "#22c55e";
      return "#64748b";
    };

    const subscoresHtml =
      response.subscores && Object.keys(response.subscores).length > 0
        ? `<div class="block">
             <div class="section-title">ציונים לפי קטגוריות</div>
             <table class="subscores"><tbody>${Object.entries(response.subscores)
               .map(([key, value]) => {
                 const sub = tmpl.scoring?.subscales?.[key];
                 return `<tr>
                   <td class="sub-name">${escapeHtml(sub?.name || key)}</td>
                   <td class="sub-val">${escapeHtml(String(value))}</td>
                 </tr>`;
               })
               .join("")}</tbody></table>
           </div>`
        : "";

    const answersHtml = tmpl.questions
      .map((q, i) => {
        const ans = response.answers[i];
        const opt = q.options?.find((o) => o.value === ans?.value);
        const text = opt?.text ?? ans?.value ?? "-";
        return `<tr>
          <td class="q"><span class="qnum">${i + 1}.</span> ${escapeHtml(q.title)}</td>
          <td class="a"><span class="badge">${escapeHtml(String(text))}</span></td>
        </tr>`;
      })
      .join("");

    const levelBlock = level
      ? `<div class="level-wrap"><span class="level" style="background:${levelHex(
          level.label
        )}">${escapeHtml(level.label || "")}</span></div>
         <div class="level-desc">${escapeHtml(level.description || "")}</div>`
      : "";

    return `<!DOCTYPE html><html dir="rtl" lang="he"><head>
      <meta charset="utf-8"/>
      <title>${escapeHtml(`${tmpl.name} - ${response.client.name}`)}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        @page { size:A4 portrait; margin:18mm 20mm; }
        body { font-family:'Segoe UI','Heebo',Arial,sans-serif; color:#1e293b; direction:rtl; text-align:right; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .header { display:flex; align-items:center; justify-content:space-between; gap:24px; border-bottom:3px solid #0f766e; padding-bottom:16px; margin-bottom:26px; }
        .header .title { font-size:23px; font-weight:800; color:#0f766e; }
        .header .meta { font-size:14px; color:#64748b; margin-top:6px; }
        .header .logo { max-height:58px; max-width:185px; width:auto; height:auto; flex-shrink:0; }
        .score { text-align:center; margin-bottom:26px; }
        .score .num { font-size:50px; font-weight:800; color:#0f172a; }
        .score .num small { font-size:22px; color:#94a3b8; font-weight:600; }
        .level-wrap { margin-top:14px; }
        .level { display:inline-block; padding:6px 22px; border-radius:999px; color:#fff; font-size:16px; font-weight:700; }
        .level-desc { color:#64748b; margin-top:10px; font-size:14px; }
        .block { margin-top:26px; }
        .section-title { font-weight:700; font-size:16px; margin-bottom:12px; color:#0f172a; page-break-after:avoid; }
        table.subscores { width:100%; border-collapse:collapse; table-layout:fixed; }
        table.subscores td { padding:10px 14px; background:#f1f5f9; border-bottom:3px solid #fff; }
        table.subscores .sub-name { font-size:14px; color:#334155; word-wrap:break-word; overflow-wrap:break-word; }
        table.subscores .sub-val { font-size:18px; font-weight:700; color:#0f172a; text-align:left; width:90px; }
        table.answers { width:100%; border-collapse:collapse; table-layout:fixed; }
        table.answers tr { page-break-inside:avoid; }
        table.answers td { padding:9px 0; border-bottom:1px solid #e2e8f0; font-size:13px; vertical-align:top; word-wrap:break-word; overflow-wrap:break-word; }
        table.answers td.q { color:#1e293b; text-align:right; width:64%; }
        table.answers .qnum { color:#0f766e; font-weight:700; }
        table.answers td.a { text-align:left; width:36%; padding-right:12px; }
        table.answers .badge { display:inline-block; background:#f0fdfa; border:1px solid #99f6e4; border-radius:6px; padding:3px 12px; color:#0f766e; font-size:12px; font-weight:600; white-space:normal; }
        .footer { margin-top:32px; padding-top:14px; border-top:1px solid #e2e8f0; font-size:11px; color:#94a3b8; text-align:center; }
      </style>
    </head><body>
      <div class="header">
        <div>
          <div class="title">${escapeHtml(tmpl.name)}</div>
          <div class="meta">${escapeHtml(response.client.name)} • ${escapeHtml(dateStr)}</div>
        </div>
        <img class="logo" src="/worksheets/mytipul-logo.png" alt="MyTipul" onerror="this.style.display='none'"/>
      </div>
      <div class="score">
        <div class="num">${response.totalScore ?? "-"}<small> / ${escapeHtml(String(max))}</small></div>
        ${levelBlock}
      </div>
      ${subscoresHtml}
      <div class="block">
        <div class="section-title">סיכום תשובות</div>
        <table class="answers"><tbody>${answersHtml}</tbody></table>
      </div>
      <div class="footer">הופק על ידי MyTipul • ${escapeHtml(dateStr)}</div>
    </body></html>`;
  };

  const handleDownloadPdf = async () => {
    if (!response) return;

    setDownloadingPdf(true);
    let iframe: HTMLIFrameElement | null = null;
    const cleanup = () => {
      if (iframe && iframe.parentNode) {
        document.body.removeChild(iframe);
        iframe = null;
      }
    };
    try {
      iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.top = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iDoc) throw new Error("Cannot access iframe document");

      iDoc.open();
      iDoc.write(buildPrintHtml());
      iDoc.close();

      // ממתינים לטעינת הלוגו לפני ההדפסה (אחרת הוא עלול לא להופיע)
      await new Promise<void>((resolve) => {
        const imgs = Array.from(iDoc.images || []);
        if (imgs.length === 0) return resolve();
        let pending = imgs.length;
        const done = () => {
          pending -= 1;
          if (pending <= 0) resolve();
        };
        imgs.forEach((img) => {
          if (img.complete) done();
          else {
            img.addEventListener("load", done);
            img.addEventListener("error", done);
          }
        });
        setTimeout(resolve, 3000);
      });

      const win = iframe.contentWindow;
      if (!win) throw new Error("Cannot access iframe window");

      // ניקוי ה-iframe אחרי שדיאלוג ההדפסה נסגר (+ רשת ביטחון)
      win.onafterprint = cleanup;
      win.focus();
      win.print();
      setTimeout(cleanup, 60000);
    } catch (err) {
      console.error("PDF print error:", err);
      toast.error('שגיאה בהכנת הדו"ח. נסה שוב מאוחר יותר.');
      cleanup();
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>שאלון לא נמצא</p>
      </div>
    );
  }

  const scoreLevel = getScoreLevel();
  const maxScore = response.template.scoring?.maxScore || 100;
  const scorePercentage = response.totalScore !== null 
    ? (response.totalScore / maxScore) * 100 
    : 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard/questionnaires")}
          >
            <ArrowRight className="h-4 w-4 ml-2" />
            חזרה לשאלונים
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{response.template.name}</h1>
            <p className="text-muted-foreground">
              {response.client.name} • {new Date(response.completedAt || response.startedAt).toLocaleDateString("he-IL")}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant={response.status === "ANALYZED" ? "default" : "secondary"}>
            {response.status === "COMPLETED" && "הושלם"}
            {response.status === "ANALYZED" && "נותח"}
            {response.status === "IN_PROGRESS" && "בתהליך"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* Score Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                תוצאות השאלון
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Total Score */}
              <div className="text-center space-y-4">
                <div className="text-6xl font-bold">
                  {response.totalScore ?? "-"}
                  <span className="text-2xl text-muted-foreground">
                    /{maxScore}
                  </span>
                </div>
                
                {scoreLevel && (
                  <div className="flex flex-col items-center gap-2">
                    <Badge 
                      className={`text-lg px-4 py-1 ${getScoreColor(scoreLevel.label)} text-white`}
                    >
                      {scoreLevel.label}
                    </Badge>
                    <p className="text-muted-foreground">{scoreLevel.description}</p>
                  </div>
                )}

                <Progress value={scorePercentage} className="w-full h-3" />
              </div>

              <Separator />

              {/* Subscores */}
              {response.subscores && Object.keys(response.subscores).length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-semibold">ציונים לפי קטגוריות</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(response.subscores).map(([key, value]) => {
                      const subscale = response.template.scoring?.subscales?.[key];
                      return (
                        <div key={key} className="p-3 bg-muted rounded-lg">
                          <p className="text-sm text-muted-foreground">
                            {subscale?.name || key}
                          </p>
                          <p className="text-xl font-semibold">{value}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Answers Summary */}
              <div className="space-y-4">
                <h3 className="font-semibold">סיכום תשובות</h3>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {response.template.questions.map((question, index) => {
                    const answer = response.answers[index];
                    const selectedOption = question.options?.find(
                      o => o.value === answer?.value
                    );
                    
                    return (
                      <div 
                        key={question.id} 
                        className="flex justify-between items-start p-2 text-sm border-b last:border-0"
                      >
                        <span className="flex-1">
                          <span className="font-medium">{index + 1}.</span> {question.title}
                        </span>
                        <Badge variant="outline" className="mr-2">
                          {selectedOption?.text || answer?.value || "-"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">פרטי השאלון</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">שם השאלון</p>
                <p className="font-medium">{response.template.name}</p>
                {response.template.nameEn && (
                  <p className="text-sm text-muted-foreground">{response.template.nameEn}</p>
                )}
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground">קטגוריה</p>
                <Badge variant="secondary">{response.template.category || "כללי"}</Badge>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">מטופל</p>
                <p className="font-medium">{response.client.name}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">תאריך מילוי</p>
                <p className="font-medium">
                  {new Date(response.completedAt || response.startedAt).toLocaleDateString("he-IL", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </p>
              </div>

              {response.template.description && (
                <div>
                  <p className="text-sm text-muted-foreground">תיאור</p>
                  <p className="text-sm">{response.template.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">פעולות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => router.push(`/dashboard/questionnaires/${responseId}/fill`)}
              >
                <FileText className="h-4 w-4 ml-2" />
                צפייה/עריכת תשובות
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
              >
                {downloadingPdf ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4 ml-2" />
                )}
                {downloadingPdf ? "מכין..." : "הדפסה / שמירה כ-PDF"}
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => router.push(`/dashboard/clients/${response.client.id}`)}
              >
                <ChevronRight className="h-4 w-4 ml-2" />
                לכרטיס המטופל
              </Button>
            </CardContent>
          </Card>

          {/* Warning Card for critical scores */}
          {scoreLevel && (scoreLevel.label === "חמור" || scoreLevel.label === "מעל הסף") && (
            <Card className="border-orange-500 bg-orange-50 dark:bg-orange-950">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-orange-600">
                  <AlertTriangle className="h-5 w-5" />
                  שים לב
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  הציון מצביע על רמה גבוהה של תסמינים. מומלץ לשקול התערבות מתאימה ומעקב צמוד.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
