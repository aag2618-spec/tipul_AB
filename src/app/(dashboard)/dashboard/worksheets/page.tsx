"use client";

import { Download, Eye, BookOpen } from "lucide-react";

const worksheets = [
  {
    id: "dbt-distress-tolerance",
    title: "סבילות למצוקה – TIPP",
    titleEn: "Distress Tolerance",
    approach: "DBT",
    approachHe: "טיפול דיאלקטי התנהגותי",
    description: "ארבע טכניקות גוף להורדת עוררות רגשית חריפה: טמפרטורה, פעילות גופנית, נשימה, הרפיית שרירים.",
    color: "violet",
    file: "/worksheets/dbt-distress-tolerance-mytipul.html",
  },
];

const colorMap: Record<string, { bg: string; border: string; text: string; badge: string; badgeText: string }> = {
  teal: {
    bg: "bg-teal-50",
    border: "border-teal-200",
    text: "text-teal-800",
    badge: "bg-teal-100",
    badgeText: "text-teal-700",
  },
  violet: {
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-800",
    badge: "bg-violet-100",
    badgeText: "text-violet-700",
  },
  orange: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-800",
    badge: "bg-orange-100",
    badgeText: "text-orange-700",
  },
};

export default function WorksheetsPage() {
  const handleDownload = (file: string, title: string) => {
    const link = document.createElement("a");
    link.href = file;
    link.download = file.split("/").pop() || "worksheet.html";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreview = (file: string) => {
    window.open(file, "_blank");
  };

  // Group by approach
  const grouped = worksheets.reduce((acc, ws) => {
    if (!acc[ws.approach]) acc[ws.approach] = [];
    acc[ws.approach].push(ws);
    return acc;
  }, {} as Record<string, typeof worksheets>);

  const approachOrder = ["CBT", "DBT", "ACT"];

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">דפי עבודה טיפוליים</h1>
          <p className="text-sm text-muted-foreground">
            דפי עבודה מקצועיים להורדה והדפסה, מקוטלגים לפי גישה טיפולית
          </p>
        </div>
      </div>

      {/* Worksheets by approach */}
      {approachOrder.map((approach) => {
        const items = grouped[approach];
        if (!items) return null;
        const colors = colorMap[items[0].color];

        return (
          <div key={approach} className="space-y-4">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${colors.badge} ${colors.badgeText}`}
              >
                {approach}
              </span>
              <span className="text-sm text-muted-foreground">
                {items[0].approachHe}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((ws) => {
                const c = colorMap[ws.color];
                return (
                  <div
                    key={ws.id}
                    className={`rounded-xl border-2 ${c.border} ${c.bg} p-5 transition-shadow hover:shadow-md`}
                  >
                    <div className="mb-3">
                      <h3 className={`text-lg font-bold ${c.text}`}>
                        {ws.title}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {ws.titleEn}
                      </p>
                    </div>
                    <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                      {ws.description}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownload(ws.file, ws.title)}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg ${c.badge} ${c.badgeText} px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-80`}
                      >
                        <Download className="h-4 w-4" />
                        הורדה
                      </button>
                      <button
                        onClick={() => handlePreview(ws.file)}
                        className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-opacity hover:opacity-80"
                      >
                        <Eye className="h-4 w-4" />
                        תצוגה
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
