"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  CheckCircle,
  Clock,
  Eye,
  FileText,
  Search,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

interface Session {
  id: string;
  startTime: Date;
  endTime: Date;
  type: string;
  status: string;
  skipSummary?: boolean;
  sessionNote: {
    content: string;
  } | null;
}

interface SummariesTabProps {
  clientId: string;
  sessions: Session[];
}

export function SummariesTab({ clientId, sessions }: SummariesTabProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");

  // Apply date filter
  const getFilteredByDate = (sessionsList: Session[]) => {
    if (dateFilter === "all") return sessionsList;
    
    const now = new Date();
    const filterDate = new Date();
    
    switch (dateFilter) {
      case "week":
        filterDate.setDate(now.getDate() - 7);
        break;
      case "month":
        filterDate.setMonth(now.getMonth() - 1);
        break;
      case "3months":
        filterDate.setMonth(now.getMonth() - 3);
        break;
      case "6months":
        filterDate.setMonth(now.getMonth() - 6);
        break;
      case "year":
        filterDate.setFullYear(now.getFullYear() - 1);
        break;
    }
    
    return sessionsList.filter(s => new Date(s.startTime) >= filterDate);
  };

  // Apply search filter
  const getFilteredBySearch = (sessionsList: Session[]) => {
    if (!searchQuery.trim()) return sessionsList;
    
    const query = searchQuery.toLowerCase();
    return sessionsList.filter(s => {
      const dateStr = format(new Date(s.startTime), "EEEE, d בMMMM yyyy", { locale: he }).toLowerCase();
      const noteContent = s.sessionNote?.content?.toLowerCase() || "";
      return dateStr.includes(query) || noteContent.includes(query);
    });
  };

  const unsummarizedSessions = getFilteredBySearch(
    getFilteredByDate(sessions.filter((s) =>
      !s.sessionNote &&
      s.type !== "BREAK" &&
      !s.skipSummary &&
      s.status === "COMPLETED"
    ))
  );
  const summarizedSessions = getFilteredBySearch(
    getFilteredByDate(sessions.filter((s) => s.sessionNote))
  );

  // הסרת פגישה מרשימת "ללא סיכום" (מסמן skipSummary = true)
  const handleHideSession = async (sessionId: string) => {
    if (!confirm("האם להסיר פגישה זו מהרשימה? (הפגישה תישאר ביומן)")) {
      return;
    }

    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipSummary: true }),
      });
      router.refresh();
    } catch (error) {
      console.error("Error hiding session:", error);
    }
  };

  // מחיקת סיכום בלבד (לא את הפגישה עצמה)
  const handleDeleteSummary = async (sessionId: string) => {
    if (!confirm("האם למחוק את הסיכום? (הפגישה תישאר ביומן ותחזור לרשימת 'ללא סיכום')")) {
      return;
    }

    try {
      await fetch(`/api/sessions/${sessionId}/summary`, {
        method: "DELETE",
      });
      router.refresh();
    } catch (error) {
      console.error("Error deleting summary:", error);
    }
  };

  return (
    <Tabs defaultValue="unsummarized" className="w-full">
      <div className="space-y-4 mb-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="unsummarized" className="gap-2">
              <Clock className="h-4 w-4" />
              ללא סיכום ({unsummarizedSessions.length})
            </TabsTrigger>
            <TabsTrigger value="summarized" className="gap-2">
              <CheckCircle className="h-4 w-4" />
              מסוכמות ({summarizedSessions.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {summarizedSessions.length > 0 && (
              <Button
                size="lg"
                className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all"
                asChild
              >
                <Link href={`/dashboard/clients/${clientId}/summaries/all`}>
                  <Eye className="h-5 w-5 ml-2" />
                  צפה בכל הסיכומים ברצף
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="חפש בסיכומים..."
              className="pr-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="סנן לפי תאריך" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל התקופות</SelectItem>
              <SelectItem value="week">שבוע אחרון</SelectItem>
              <SelectItem value="month">חודש אחרון</SelectItem>
              <SelectItem value="3months">3 חודשים</SelectItem>
              <SelectItem value="6months">6 חודשים</SelectItem>
              <SelectItem value="year">שנה אחרונה</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Unsummarized Sessions Tab */}
      <TabsContent value="unsummarized" className="mt-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-600" />
              פגישות ללא סיכום
            </CardTitle>
            <CardDescription>
              {unsummarizedSessions.length} פגישות ממתינות לסיכום
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unsummarizedSessions.length > 0 ? (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {unsummarizedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="border rounded-xl p-4 bg-card hover:shadow-md transition-all flex flex-col justify-between min-h-[120px] group"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-muted-foreground/70 mb-1">
                        <Calendar className="h-3.5 w-3.5" />
                        <span className="text-sm">
                          {format(new Date(session.startTime), "EEEE, d/M", { locale: he })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground/60">
                        {format(new Date(session.startTime), "HH:mm")} - {format(new Date(session.endTime), "HH:mm")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 shadow-none"
                        asChild
                      >
                        <Link href={`/dashboard/sessions/${session.id}?from=client&clientId=${clientId}`}>
                          <FileText className="h-3.5 w-3.5" />
                          סכם פגישה
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="px-2 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleHideSession(session.id)}
                        title="הסר מהרשימה"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="mx-auto h-12 w-12 mb-3 opacity-50 text-green-600" />
                <p>כל הפגישות סוכמו! 🎉</p>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Summarized Sessions Tab */}
      <TabsContent value="summarized" className="mt-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-600" />
              פגישות מסוכמות
            </CardTitle>
            <CardDescription>{summarizedSessions.length} סיכומים</CardDescription>
          </CardHeader>
          <CardContent>
            {summarizedSessions.length > 0 ? (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {summarizedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="border rounded-xl p-4 bg-card hover:shadow-md transition-all flex flex-col justify-between min-h-[120px] group"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-muted-foreground/70 mb-1">
                        <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-sm">
                          {format(new Date(session.startTime), "EEEE, d/M", { locale: he })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground/60">
                        {format(new Date(session.startTime), "HH:mm")} - {format(new Date(session.endTime), "HH:mm")}
                      </p>
                      {session.sessionNote && (
                        <p className="text-xs text-muted-foreground/50 line-clamp-4 mt-2">
                          {stripHtml(session.sessionNote.content)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" asChild>
                        <Link href={`/dashboard/sessions/${session.id}?from=client&clientId=${clientId}`}>
                          <Eye className="h-3.5 w-3.5" />
                          צפה / ערוך
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="px-2 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteSummary(session.id)}
                        title="מחק סיכום"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 mb-3 opacity-50" />
                <p>אין סיכומים עדיין</p>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
