"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Stethoscope, Search, Plus } from "lucide-react";
import { AddCommitmentDialog } from "./add-commitment-dialog";

const HEALTH_FUND_LABELS: Record<string, string> = {
  CLALIT: "כללית",
  MACCABI: "מכבי",
  MEUHEDET: "מאוחדת",
  LEUMIT: "לאומית",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "פעילה",
  EXPIRED: "פגה",
  CANCELLED: "בוטלה",
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-900 border-emerald-200",
  EXPIRED: "bg-amber-100 text-amber-900 border-amber-200",
  CANCELLED: "bg-slate-100 text-slate-700 border-slate-200",
};

export interface CommitmentListItem {
  id: string;
  status: string;
  approvedSessions: number | null;
  usedSessions: number;
  copaymentAmount: number | null;
  startDate: string | null;
  endDate: string | null;
  commitmentNumber: string | null;
  client: {
    id: string;
    name: string;
    healthFund: string | null;
  };
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("he-IL");
}

function CommitmentCard({ c }: { c: CommitmentListItem }) {
  const copayment = c.copaymentAmount != null ? Number(c.copaymentAmount) : null;
  const progress =
    c.approvedSessions && c.approvedSessions > 0
      ? Math.min(100, (c.usedSessions / c.approvedSessions) * 100)
      : 0;
  const endDate = formatDate(c.endDate);

  return (
    <Card className="relative hover:shadow-md hover:border-primary/50 transition-all h-full">
      {/* כפתור הוספת התחייבות נוספת למטופל — מחוץ ל-Link כדי שלא יפעיל ניווט */}
      <div className="absolute top-2 left-2 z-10">
        <AddCommitmentDialog
          clientId={c.client.id}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              title="הוסף התחייבות נוספת למטופל"
            >
              <Plus className="h-4 w-4" />
            </Button>
          }
        />
      </div>

      <Link href={`/dashboard/commitments/${c.id}`} className="block">
        <CardContent className="p-4 space-y-3 cursor-pointer">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-base truncate">{c.client.name}</h3>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                {c.client.healthFund
                  ? HEALTH_FUND_LABELS[c.client.healthFund] || c.client.healthFund
                  : "ללא קופה"}
              </div>
            </div>
            <Badge className={`${STATUS_BADGE[c.status] || ""} font-semibold shrink-0`}>
              {STATUS_LABELS[c.status] || c.status}
            </Badge>
          </div>

          {c.commitmentNumber && (
            <div className="text-xs text-muted-foreground">
              מס&apos; התחייבות: <span className="font-mono">{c.commitmentNumber}</span>
            </div>
          )}

          {c.approvedSessions != null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">טיפולים</span>
                <span className="font-semibold">
                  {c.usedSessions}/{c.approvedSessions}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-sm pt-2 border-t">
            {copayment != null ? (
              <span className="font-semibold text-blue-700">השתתפות עצמית: ₪{copayment}</span>
            ) : (
              <span className="text-muted-foreground">לא נקבעה השתתפות עצמית</span>
            )}
            {endDate && <span className="text-xs text-muted-foreground">עד {endDate}</span>}
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

export function CommitmentsBrowser({ commitments }: { commitments: CommitmentListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commitments;
    return commitments.filter((c) => c.client.name.toLowerCase().includes(q));
  }, [commitments, query]);

  const active = filtered.filter((c) => c.status === "ACTIVE");
  const expired = filtered.filter((c) => c.status === "EXPIRED");
  const cancelled = filtered.filter((c) => c.status === "CANCELLED");

  const renderSection = (title: string, items: CommitmentListItem[]) =>
    items.length > 0 ? (
      <section>
        <h2 className="text-lg font-semibold mb-3">
          {title} ({items.length})
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((c) => (
            <CommitmentCard key={c.id} c={c} />
          ))}
        </div>
      </section>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם מטופל..."
          className="pr-9"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          לא נמצאו התחייבויות התואמות לחיפוש
        </p>
      ) : (
        <div className="space-y-6">
          {renderSection("פעילות", active)}
          {renderSection("פגות תוקף", expired)}
          {renderSection("בוטלו", cancelled)}
        </div>
      )}
    </div>
  );
}
