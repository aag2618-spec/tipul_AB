"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronLeft, Phone, CalendarPlus, UserCheck, FileText } from "lucide-react";
import { format } from "date-fns";
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

export function ConsultationClientsSection({ clients }: ConsultationClientsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* כותרת מתקפלת */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="h-4 w-4 text-blue-600" /> : <ChevronLeft className="h-4 w-4 text-blue-600" />}
          <span className="font-medium text-blue-800">פגישות ייעוץ</span>
          <Badge variant="secondary" className="bg-blue-100 text-blue-700">{clients.length}</Badge>
        </div>
        <span className="text-xs text-blue-600">{isOpen ? "הסתר" : "הצג"}</span>
      </button>

      {/* תוכן */}
      {isOpen && (
        <div className="divide-y">
          {clients.map((client) => {
            const isExpanded = expandedClientId === client.id;

            return (
              <div key={client.id} className="bg-white">
                {/* שורת פונה */}
                <button
                  onClick={() => setExpandedClientId(isExpanded ? null : client.id)}
                  className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
                    <span className="font-medium text-sm">{client.name}</span>
                    {client.phone && (
                      <span className="text-xs text-muted-foreground" dir="ltr">{client.phone}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{client.sessions.length} פגישות</span>
                </button>

                {/* פירוט פגישות + כפתורי פעולה */}
                {isExpanded && (
                  <div className="px-4 pb-3 space-y-2">
                    {/* רשימת פגישות */}
                    {client.sessions.length > 0 ? (
                      <div className="space-y-1">
                        {client.sessions.map((session) => (
                          <Link
                            key={session.id}
                            href={`/dashboard/sessions/${session.id}`}
                            className="flex items-center justify-between text-xs px-3 py-2 rounded bg-slate-50 hover:bg-slate-100 transition-colors"
                          >
                            <span>{format(new Date(session.startTime), "d/M/yy")}</span>
                            <span className="text-muted-foreground flex-1 mx-3 truncate">{session.topic || "—"}</span>
                            <span>
                              {session.paymentStatus === "PAID" ? (
                                <Badge variant="outline" className="text-green-600 border-green-200 text-xs">שולם</Badge>
                              ) : session.paymentStatus === "PENDING" ? (
                                <Badge variant="outline" className="text-orange-600 border-orange-200 text-xs">ממתין</Badge>
                              ) : (
                                <Badge variant="outline" className="text-slate-500 border-slate-200 text-xs">
                                  {session.status === "COMPLETED" ? "הושלם" : session.status === "CANCELLED" ? "בוטל" : "מתוכנן"}
                                </Badge>
                              )}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-2">אין פגישות</p>
                    )}

                    {/* כפתורי פעולה */}
                    <div className="flex gap-2 pt-2">
                      <Button asChild size="sm" variant="outline" className="flex-1 text-xs gap-1">
                        <Link href={`/dashboard/calendar?client=${client.id}`}>
                          <CalendarPlus className="h-3 w-3" />
                          קבע פגישה
                        </Link>
                      </Button>
                      <Button asChild size="sm" className="flex-1 text-xs gap-1 bg-blue-600 hover:bg-blue-700">
                        <Link href={`/dashboard/clients/${client.id}?upgrade=true`}>
                          <UserCheck className="h-3 w-3" />
                          הפוך למטופל קבוע
                        </Link>
                      </Button>
                    </div>

                    {/* טלפון */}
                    {client.phone && (
                      <a
                        href={`tel:${client.phone}`}
                        className="flex items-center gap-2 text-xs text-green-600 hover:text-green-700 px-2"
                      >
                        <Phone className="h-3 w-3" />
                        התקשר
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
