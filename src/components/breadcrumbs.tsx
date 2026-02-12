"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import { useRouter } from "next/navigation";
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
  documents: "מסמכים",
  recordings: "הקלטות",
  notifications: "התראות",
  communications: "תקשורת",
  tasks: "משימות",
  "consent-forms": "טפסי הסכמה",
  "cancellation-requests": "בקשות ביטול",
  "ai-prep": "הכנה לפגישה",
  "bulk-email": "דיוור",
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
  const router = useRouter();

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

  let currentPath = "";
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;

    // Skip "dashboard" since we already added it
    if (segment === "dashboard") continue;

    const isLast = i === segments.length - 1;

    // Check if it's a dynamic segment (like an ID)
    const isDynamic = segment.match(/^[a-z0-9]{20,}$/i) || segment.match(/^cm[a-z0-9]+$/i);
    
    if (isDynamic) {
      // For IDs, show a generic label based on parent
      const parent = segments[i - 1];
      const labels: Record<string, string> = {
        clients: "כרטיס מטופל",
        sessions: "פרטי פגישה",
        questionnaires: "שאלון",
        recordings: "הקלטה",
        payments: "תשלום",
        "intake-responses": "תשובת קליטה",
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
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="h-7 w-7 p-0 ml-2 text-teal-600 hover:text-teal-800 hover:bg-teal-50 dark:text-teal-400 dark:hover:text-teal-200 dark:hover:bg-teal-900/30"
      >
        <ChevronRight className="h-4 w-4" />
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
