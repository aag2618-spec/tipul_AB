"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronLeft,
  Copy,
  CalendarPlus,
  UserCheck,
  MoreVertical,
  FileText,
  FolderOpen,
  Calendar,
  Search,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import Link from "next/link";

interface ConsultationSession {
  id: string;
  startTime: string;
  status: string;
  topic: string | null;
  paymentStatus: string | null;
}

interface ConsultationClient {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  sessions: ConsultationSession[];
}

interface ConsultationClientsSectionProps {
  clients: ConsultationClient[];
}

const sessionStatusLabel: Record<string, string> = {
  COMPLETED: "הושלמה",
  SCHEDULED: "מתוכננת",
  CANCELLED: "בוטלה",
  NO_SHOW: "לא הגיע",
  PENDING_APPROVAL: "ממתינה",
};

const paymentStatusLabel: Record<string, string> = {
  PAID: "שולם",
  PENDING: "ממתין",
  PARTIAL: "חלקי",
};

export function ConsultationClientsSection({ clients }: ConsultationClientsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const sectionRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);

  // גלילה אוטומטית כשפותחים את הסקשן
  useEffect(() => {
    if (isOpen && sectionRef.current) {
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [isOpen]);

  // גלילה אוטומטית כשפותחים פגישות של פונה — עם מרווח תחתון
  useEffect(() => {
    if (expandedClientId && expandedRef.current) {
      setTimeout(() => {
        expandedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [expandedClientId]);

  const filtered = search.trim()
    ? clients.filter((c) => c.name.includes(search.trim()))
    : clients;

  return (
    <div className="mt-10 mb-16 scroll-mt-6" id="consultation-section" ref={sectionRef}>
      {/* כותרת — כרטיס מעוצב */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-xl border border-sky-200 bg-gradient-to-l from-sky-50 to-white p-5 shadow-sm hover:shadow-md transition-all"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-sky-100">
              <Users className="h-5 w-5 text-sky-600" />
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sky-900">פונים לייעוץ</span>
                <Badge className="bg-sky-500 text-white border-0 text-xs">
                  {clients.length}
                </Badge>
              </div>
              <p className="text-xs text-sky-600 mt-0.5">
                לחץ לצפייה בפונים מזדמנים
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-sky-500">
            <span className="text-xs">{isOpen ? "הסתר" : "הצג"}</span>
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </div>
        </div>
      </button>

      {/* תוכן */}
      {isOpen && (
        <div className="mt-3 border border-sky-100 rounded-xl p-4 pb-6 space-y-4 bg-white shadow-sm">
          {/* חיפוש */}
          <div className="relative max-w-xs">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>

          {/* כרטיסי פונים */}
          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((client) => {
                const isExpanded = expandedClientId === client.id;

                return (
                  <div key={client.id} className="col-span-1">
                    {/* כרטיס פונה */}
                    <button
                      onClick={() =>
                        setExpandedClientId(isExpanded ? null : client.id)
                      }
                      className={`w-full text-right rounded-lg border p-3 transition-all ${
                        isExpanded
                          ? "bg-sky-50 border-sky-300 shadow-sm"
                          : "bg-sky-50/50 border-sky-200 hover:bg-sky-50 hover:border-sky-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-sky-900 truncate">
                          {client.name}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                        ) : (
                          <ChevronLeft className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {client.phone && (
                          <span className="text-xs text-muted-foreground" dir="ltr">
                            {client.phone}
                          </span>
                        )}
                        <span className="text-xs text-sky-600 mr-auto">
                          {client.sessions.length} פגישות
                        </span>
                      </div>
                    </button>

                    {/* פגישות מתחת לכרטיס */}
                    {isExpanded && (
                      <div className="mt-2 space-y-2" ref={expandedRef}>
                        {client.sessions.length > 0 ? (
                          client.sessions.map((session) => (
                            <div
                              key={session.id}
                              className="flex items-center justify-between rounded-md border bg-white p-2 text-xs"
                            >
                              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                <span className="font-medium">
                                  {format(new Date(session.startTime), "d/M/yy")}
                                </span>
                                <span className="text-muted-foreground truncate">
                                  {session.topic || "—"}
                                </span>
                                <div className="flex gap-1 flex-wrap">
                                  {/* סטטוס פגישה */}
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0 ${
                                      session.status === "COMPLETED"
                                        ? "text-emerald-600 border-emerald-200"
                                        : session.status === "CANCELLED"
                                        ? "text-red-500 border-red-200"
                                        : "text-sky-600 border-sky-200"
                                    }`}
                                  >
                                    {sessionStatusLabel[session.status] || session.status}
                                  </Badge>
                                  {/* סטטוס תשלום */}
                                  {session.paymentStatus && (
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] px-1.5 py-0 ${
                                        session.paymentStatus === "PAID"
                                          ? "text-green-600 border-green-200"
                                          : session.paymentStatus === "PARTIAL"
                                          ? "text-amber-600 border-amber-200"
                                          : "text-orange-600 border-orange-200"
                                      }`}
                                    >
                                      {paymentStatusLabel[session.paymentStatus] ||
                                        session.paymentStatus}
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {/* 3 נקודות */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="p-1 rounded hover:bg-slate-100 shrink-0">
                                    <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="text-sm">
                                  <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/sessions/${session.id}`}>
                                      <FileText className="h-3.5 w-3.5 ml-2" />
                                      כניסה לסיכום
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/clients/${client.id}`}>
                                      <FolderOpen className="h-3.5 w-3.5 ml-2" />
                                      תיקיית מטופל
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/calendar?date=${format(new Date(session.startTime), "yyyy-MM-dd")}&highlight=${session.id}`}>
                                      <Calendar className="h-3.5 w-3.5 ml-2" />
                                      הצג ביומן
                                    </Link>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            אין פגישות
                          </p>
                        )}

                        {/* כפתורי פעולה */}
                        <div className="flex gap-2">
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs gap-1 h-7"
                          >
                            <Link href={`/dashboard/calendar?client=${client.id}`}>
                              <CalendarPlus className="h-3 w-3" />
                              קבע פגישה
                            </Link>
                          </Button>
                          <Button
                            asChild
                            size="sm"
                            className="flex-1 text-xs gap-1 h-7 bg-sky-600 hover:bg-sky-700"
                          >
                            <Link
                              href={`/dashboard/clients/new?fromQuick=${client.id}&name=${encodeURIComponent(client.name)}&phone=${encodeURIComponent(client.phone || "")}&email=${encodeURIComponent(client.email || "")}`}
                            >
                              <UserCheck className="h-3 w-3" />
                              הפוך למטופל קבוע
                            </Link>
                          </Button>
                        </div>

                        {/* העתקת מספר טלפון */}
                        {client.phone && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(client.phone!);
                                toast.success("המספר הועתק ללוח");
                              } catch {
                                toast.error("לא ניתן להעתיק — העתק ידנית: " + client.phone);
                              }
                            }}
                            className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700"
                          >
                            <Copy className="h-3 w-3" />
                            {client.phone}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              לא נמצאו פונים
            </p>
          )}
        </div>
      )}
    </div>
  );
}
