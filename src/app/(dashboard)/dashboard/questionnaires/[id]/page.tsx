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
  Download,
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

  // בונה HTML עצמאי לדו"ח עם צבעים קשיחים (hex). חובה: ערכת הצבעים של האתר
  // היא oklch, ו-html2canvas@1.4.1 לא יודע לפענח oklch — ולכן אי-אפשר לצלם
  // ישירות את ה-DOM הממוסגר. זה בדיוק הדפוס של ייצוא הקבלות (receipts/page.tsx).
  // כל נתון מהמשתמש עובר escapeHtml למניעת הזרקת HTML.
  const buildReportHtml = () => {
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
      switch (label) {
        case "מינימלי":
        case "תקין/מינימלי":
        case "מתחת לסף":
          return "#22c55e";
        case "קל":
          return "#eab308";
        case "בינוני":
          return "#f97316";
        case "חמור":
        case "מעל הסף":
          return "#ef4444";
        default:
          return "#64748b";
      }
    };

    const subscoresHtml =
      response.subscores && Object.keys(response.subscores).length > 0
        ? `<div style="margin-top:24px;">
             <div style="font-weight:700;font-size:16px;margin-bottom:12px;color:#0f172a;">ציונים לפי קטגוריות</div>
             <div>${Object.entries(response.subscores)
               .map(([key, value]) => {
                 const sub = tmpl.scoring?.subscales?.[key];
                 return `<div style="display:inline-block;width:46%;margin:0 0 12px 2%;vertical-align:top;background:#f1f5f9;border-radius:8px;padding:12px 16px;box-sizing:border-box;">
                   <div style="font-size:13px;color:#64748b;">${escapeHtml(sub?.name || key)}</div>
                   <div style="font-size:20px;font-weight:600;color:#0f172a;">${escapeHtml(String(value))}</div>
                 </div>`;
               })
               .join("")}</div>
           </div>`
        : "";

    const answersHtml = tmpl.questions
      .map((q, i) => {
        const ans = response.answers[i];
        const opt = q.options?.find((o) => o.value === ans?.value);
        const text = opt?.text ?? ans?.value ?? "-";
        return `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;vertical-align:top;text-align:right;"><span style="font-weight:600;">${i + 1}.</span> ${escapeHtml(q.title)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:left;vertical-align:top;white-space:nowrap;"><span style="border:1px solid #cbd5e1;border-radius:6px;padding:2px 8px;color:#475569;font-size:12px;">${escapeHtml(String(text))}</span></td>
        </tr>`;
      })
      .join("");

    return `
      <div style="width:794px;padding:48px 56px;color:#1e293b;direction:rtl;text-align:right;background:#ffffff;box-sizing:border-box;">
        <div style="border-bottom:3px solid #0f766e;padding-bottom:16px;margin-bottom:28px;">
          <div style="font-size:24px;font-weight:800;color:#0f766e;">${escapeHtml(tmpl.name)}</div>
          <div style="font-size:14px;color:#64748b;margin-top:6px;">${escapeHtml(response.client.name)} • ${escapeHtml(dateStr)}</div>
        </div>
        <div style="text-align:center;margin-bottom:28px;">
          <div style="font-size:56px;font-weight:800;color:#0f172a;line-height:1;">${response.totalScore ?? "-"}<span style="font-size:24px;color:#94a3b8;font-weight:600;">/${escapeHtml(String(max))}</span></div>
          ${
            level
              ? `<div style="display:inline-block;margin-top:12px;padding:6px 20px;border-radius:999px;background:${levelHex(level.label)};color:#ffffff;font-size:16px;font-weight:700;">${escapeHtml(level.label)}</div>
                 <div style="color:#64748b;margin-top:10px;font-size:14px;">${escapeHtml(level.description)}</div>`
              : ""
          }
        </div>
        ${subscoresHtml}
        <div style="margin-top:28px;">
          <div style="font-weight:700;font-size:16px;margin-bottom:8px;color:#0f172a;">סיכום תשובות</div>
          <table style="width:100%;border-collapse:collapse;">${answersHtml}</table>
        </div>
        <div style="margin-top:36px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">הופק על ידי MyTipul • ${escapeHtml(dateStr)}</div>
      </div>`;
  };

  const handleDownloadPdf = async () => {
    if (!response) return;

    setDownloadingPdf(true);
    let iframe: HTMLIFrameElement | null = null;
    try {
      await document.fonts.ready;
      const h2cModule = await import("html2canvas");
      const h2c = h2cModule.default ?? h2cModule;
      const { jsPDF } = await import("jspdf");

      // מרנדרים את ה-HTML ב-iframe מבודד עם reset וצבעי hex בלבד (ללא oklch).
      iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.top = "0";
      iframe.style.width = "794px";
      iframe.style.height = "1200px";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iDoc) throw new Error("Cannot access iframe document");

      iDoc.open();
      iDoc.write(
        `<!DOCTYPE html><html dir="rtl"><head>` +
          `<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>` +
          `<style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',sans-serif;}</style>` +
          `</head><body style="background:white;">${buildReportHtml()}</body></html>`
      );
      iDoc.close();

      await new Promise((r) => setTimeout(r, 500));
      if (iDoc.fonts) await iDoc.fonts.ready;

      // מתאימים את גובה ה-iframe לתוכן המלא כדי ששאלון ארוך לא ייחתך בצילום.
      const target = (iDoc.body.firstElementChild as HTMLElement) || iDoc.body;
      const fullHeight = Math.max(target.scrollHeight, target.offsetHeight);
      iframe.style.height = `${fullHeight + 60}px`;
      await new Promise((r) => setTimeout(r, 50));

      const canvas = await h2c(target, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("portrait", "mm", "a4");
      const pageWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;

      // תוכן ארוך נפרס על פני כמה עמודים
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const fileDate = new Date(response.completedAt || response.startedAt)
        .toLocaleDateString("he-IL")
        .replace(/\//g, "-");
      const safeName = `${response.template.name}_${response.client.name}_${fileDate}`.replace(
        /[\\/:*?"<>|]/g,
        "-"
      );

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("שגיאה ביצירת PDF. נסה שוב מאוחר יותר.");
    } finally {
      if (iframe && iframe.parentNode) document.body.removeChild(iframe);
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
                  <Download className="h-4 w-4 ml-2" />
                )}
                {downloadingPdf ? "מכין PDF..." : 'הורדת דו"ח PDF'}
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
