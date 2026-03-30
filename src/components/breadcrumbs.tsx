"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

// מיפוי נתיבים לשמות בעברית
const pathNames: Record<string, string> = {
  dashboard: "דשבורד",
  clients: "מטופלים",
  sessions: "פגישות",
  calendar: "יומן",
  payments: "תשלומים",
  settings: "הגדרות",
  questionnaires: "שאלונים",
  reports: "דוחות",
  receipts: "קבלות",
  documents: "מסמכים",
  recordings: "הקלטות",
  notifications: "התראות",
  communications: "הודעות",
  tasks: "ממתינים לסיכום",
  "consent-forms": "טפסי הסכמה",
  "ai-prep": "הכנה לפגישה",
  "bulk-email": "שליחת הודעה",
  new: "חדש",
  edit: "עריכה",
  fill: "מילוי",
  profile: "פרופיל",
  billing: "חיוב ומנוי",
  integrations: "אינטגרציות",
  business: "עסק",
  "ai-assistant": "עוזר AI",
  "health-insurers": "קופות חולים",
  sms: "הודעות SMS",
  communication: "תקשורת",
  upload: "העלאה",
  "mark-paid": "סימון תשלום",
  pay: "תשלום",
  summaries: "סיכומים",
  all: "הכל",
  email: "מייל",
  intake: "קליטה",
  "intake-responses": "תשובות קליטה",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const clientIdParam = searchParams.get("clientId");

  // Don't show on main dashboard
  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    return null;
  }

  // Build breadcrumb segments
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: { label: string; href: string; isLast: boolean }[] = [];

  // Always start with dashboard
  breadcrumbs.push({
    label: "דשבורד",
    href: "/dashboard",
    isLast: false,
  });

  // אם הגענו מדף אחר (from=tasks / from=client) — להוסיף את המקור לשרשור
  if (fromParam === "tasks" && pathname.startsWith("/dashboard/sessions/")) {
    breadcrumbs.push({
      label: "ממתינים לסיכום",
      href: "/dashboard/tasks",
      isLast: false,
    });
  } else if (fromParam === "client" && clientIdParam && pathname.startsWith("/dashboard/sessions/")) {
    breadcrumbs.push({
      label: "מטופלים",
      href: "/dashboard/clients",
      isLast: false,
    });
    breadcrumbs.push({
      label: "כרטיס מטופל",
      href: `/dashboard/clients/${clientIdParam}`,
      isLast: false,
    });
  }

  // נתיבי ביניים שאינם דפים עצמאיים (מופיעים לפני ID ואין להם דף משלהם)
  const intermediateSegments = new Set(["pay", "mark-paid"]);

  let currentPath = "";
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;

    // Skip "dashboard" since we already added it
    if (segment === "dashboard") continue;

    // כשיש from — לדלג על "sessions" כי כבר הוספנו את המקור האמיתי (tasks/client)
    if (fromParam && segment === "sessions" && pathname.startsWith("/dashboard/sessions/")) {
      continue;
    }

    const isLast = i === segments.length - 1;

    // Check if it's a dynamic segment (like an ID)
    const isDynamic = segment.match(/^[a-z0-9]{20,}$/i) || segment.match(/^cm[a-z0-9]+$/i);

    // דלג על נתיבי ביניים (כמו pay, mark-paid) שלא מייצגים דף עצמאי
    if (intermediateSegments.has(segment) && !isLast) {
      continue;
    }

    if (isDynamic) {
      // For IDs, show a generic label based on parent (skip intermediate segments)
      let parent = segments[i - 1];
      if (intermediateSegments.has(parent)) {
        parent = segments[i - 2] || parent;
      }
      const labels: Record<string, string> = {
        clients: "כרטיס מטופל",
        sessions: "פרטי פגישה",
        questionnaires: "שאלון",
        recordings: "הקלטה",
        payments: "תשלום",
        "intake-responses": "תשובת קליטה",
        intake: "קליטה",
      };
      breadcrumbs.push({
        label: labels[parent] || "פרטים",
        href: currentPath,
        isLast,
      });
    } else {
      breadcrumbs.push({
        label: pathNames[segment] || segment,
        href: currentPath,
        isLast,
      });
    }
  }

  // Don't show if only dashboard (shouldn't happen due to early return, but safety)
  if (breadcrumbs.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 px-6 pt-4 pb-1">
      {/* Back button — navigates to parent page */}
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="h-7 w-7 p-0 ml-2 text-teal-600 hover:text-teal-800 hover:bg-teal-50 dark:text-teal-400 dark:hover:text-teal-200 dark:hover:bg-teal-900/30"
      >
        <Link href={breadcrumbs.length >= 2 ? breadcrumbs[breadcrumbs.length - 2].href : "/dashboard"}>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </Button>

      {/* Breadcrumb trail */}
      <nav className="flex items-center gap-1 text-sm flex-wrap" dir="rtl">
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
            )}
            {crumb.isLast ? (
              <span className="font-medium text-teal-700 dark:text-teal-300">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
              >
                {index === 0 ? (
                  <span className="flex items-center gap-1">
                    <Home className="h-3.5 w-3.5" />
                    {crumb.label}
                  </span>
                ) : (
                  crumb.label
                )}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </div>
  );
}
