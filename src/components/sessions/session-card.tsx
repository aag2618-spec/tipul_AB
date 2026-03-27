"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar as CalendarIcon,
  Clock,
  XCircle,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import Link from "next/link";

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  price: number;
  topic?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  sessionNote?: string | null;
  payment?: { id: string; status: string } | null;
  client?: {
    id: string;
    name: string;
    isQuickClient?: boolean;
    creditBalance?: number | null;
  } | null;
}

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "הושלמה",
  CANCELLED: "בוטלה",
  NO_SHOW: "אי הופעה",
  NOT_UPDATED: "לא עודכן",
  PENDING_APPROVAL: "ממתין לאישור",
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "text-emerald-600 border-transparent",
  CANCELLED: "text-red-500 border-transparent",
  NO_SHOW: "text-red-500 border-transparent",
  NOT_UPDATED: "bg-orange-50 text-orange-600 border-orange-300 cursor-pointer hover:bg-orange-100",
  PENDING_APPROVAL: "bg-amber-50 text-amber-600 border-amber-300",
};

const CARD_BG: Record<string, string> = {
  SCHEDULED_FUTURE: "bg-emerald-50/60 border-emerald-200",
  SCHEDULED_PAST: "bg-sky-50/60 border-sky-200",
  COMPLETED: "bg-white border-emerald-300",
  CANCELLED: "bg-red-50/40 border-red-200",
  NO_SHOW: "bg-red-50/50 border-red-200",
  PENDING_APPROVAL: "bg-amber-50/60 border-amber-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  COMPLETED: null,
  CANCELLED: null,
  NO_SHOW: null,
  NOT_UPDATED: <Clock className="h-3 w-3" />,
};

interface SessionCardProps {
  session: Session;
  showCancel: boolean;
  now: Date;
  isWithinWeek: (dateStr: string) => boolean;
  onCancelClick: (session: Session) => void;
  onUpdateClick: (session: Session) => void;
  onApprove: (session: Session) => void;
  onReject: (session: Session) => void;
}

function getCardBg(s: Session, now: Date) {
  if (s.status === "COMPLETED") return CARD_BG.COMPLETED;
  if (s.status === "CANCELLED") return CARD_BG.CANCELLED;
  if (s.status === "NO_SHOW") return CARD_BG.NO_SHOW;
  if (s.status === "PENDING_APPROVAL") return CARD_BG.PENDING_APPROVAL;
  if (s.status === "SCHEDULED" && new Date(s.startTime) < now) return CARD_BG.SCHEDULED_PAST;
  return CARD_BG.SCHEDULED_FUTURE;
}

export function SessionCard({
  session: s,
  showCancel,
  now,
  isWithinWeek,
  onCancelClick,
  onUpdateClick,
  onApprove,
  onReject,
}: SessionCardProps) {
  return (
    <div
      className={`group relative rounded-xl border p-4
        hover:shadow-md hover:-translate-y-0.5 transition-all duration-200
        flex flex-col justify-between min-h-[130px] ${getCardBg(s, now)}`}
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="font-semibold text-[15px] truncate flex-1">{s.client?.name || "ללא מטופל"}</p>
          {!showCancel && s.status === "SCHEDULED" && new Date(s.startTime) < now ? (
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-5 font-normal gap-1 shrink-0 mr-2 ${STATUS_COLORS["NOT_UPDATED"]}`}
              onClick={(e) => {
                e.stopPropagation();
                onUpdateClick(s);
              }}
            >
              {STATUS_ICONS["NOT_UPDATED"]}
              לא עודכן · עדכן
            </Badge>
          ) : !showCancel && s.status !== "SCHEDULED" ? (
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-5 font-normal gap-1 shrink-0 mr-2 ${STATUS_COLORS[s.status] || ""}`}
            >
              {STATUS_ICONS[s.status]}
              {STATUS_LABELS[s.status]}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground/70">
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm">
            {format(new Date(s.startTime), "EEEE, d/M", { locale: he })}
            {s.type && s.type !== "IN_PERSON" && (
              <span className="text-xs mr-1">· {s.type === "ONLINE" ? "אונליין" : s.type === "PHONE" ? "טלפון" : s.type === "BREAK" ? "הפסקה" : ""}</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground/70">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm">
            {format(new Date(s.startTime), "HH:mm")} - {format(new Date(s.endTime), "HH:mm")}
          </span>
        </div>
      </div>

      {s.cancellationReason && !showCancel && (
        <p className="text-xs text-muted-foreground/50 mt-2 pt-2 border-t border-muted-foreground/5 truncate">
          {s.status === "CANCELLED" ? "סיבת ביטול" : "סיבת אי הופעה"}: {s.cancellationReason}
        </p>
      )}
      {!showCancel && (s.status === "CANCELLED" || s.status === "NO_SHOW") && !s.payment && s.sessionNote && (
        <p className="text-xs text-muted-foreground/50 mt-1 truncate">
          סיבת אי חיוב: {s.sessionNote}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-muted-foreground/5">
        {s.status === "PENDING_APPROVAL" ? (
          <>
            <Button
              type="button"
              size="sm"
              className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
              onClick={(e) => {
                e.stopPropagation();
                onApprove(s);
              }}
            >
              <CheckCircle2 className="h-3 w-3 ml-1" />
              אשר
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="flex-1 h-8 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onReject(s);
              }}
            >
              <XCircle className="h-3 w-3 ml-1" />
              דחה
            </Button>
          </>
        ) : (
          <>
            {(!showCancel || isWithinWeek(s.startTime)) && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs border-muted-foreground/10 hover:bg-muted/30"
                asChild
              >
                <Link href={`/dashboard/sessions/${s.id}`}>
                  <Eye className="h-3 w-3 ml-1" />
                  פרטים
                </Link>
              </Button>
            )}
            {showCancel && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground/60 hover:text-red-500 hover:bg-red-50/50"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelClick(s);
                }}
              >
                <XCircle className="h-3.5 w-3.5 ml-1" />
                ביטול
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export { type Session, STATUS_LABELS, STATUS_COLORS, CARD_BG, STATUS_ICONS };
