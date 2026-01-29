"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Calendar,
  CheckCircle,
  Clock,
  Eye,
  FileText,
  MoreVertical,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface Session {
  id: string;
  startTime: Date;
  endTime: Date;
  type: string;
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
    getFilteredByDate(sessions.filter((s) => !s.sessionNote && s.type !== "BREAK" && !s.skipSummary && new Date(s.startTime) < new Date()))
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
      window.location.reload();
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
      window.location.reload();
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
              <div className="space-y-3">
                {unsummarizedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-4 border rounded-lg bg-orange-50/50 hover:bg-orange-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-orange-600" />
                      <div>
                        <p className="font-medium">
                          {format(new Date(session.startTime), "EEEE, d בMMMM yyyy", { locale: he })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(session.startTime), "HH:mm")} - {format(new Date(session.endTime), "HH:mm")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button asChild size="sm">
                        <Link href={`/dashboard/sessions/${session.id}`}>
                          <Plus className="h-4 w-4 ml-2" />
                          סכם פגישה
                        </Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-orange-600 focus:text-orange-600"
                            onClick={() => handleHideSession(session.id)}
                          >
                            <Trash2 className="h-4 w-4 ml-2" />
                            הסר מהרשימה
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
              <div className="space-y-3">
                {summarizedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Calendar className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium">
                            {format(new Date(session.startTime), "EEEE, d בMMMM yyyy", { locale: he })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(session.startTime), "HH:mm")} - {format(new Date(session.endTime), "HH:mm")}
                          </p>
                        </div>
                      </div>
                      {session.sessionNote && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mr-8">
                          {session.sessionNote.content}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/dashboard/sessions/${session.id}`}>
                          <Eye className="h-4 w-4 ml-2" />
                          צפה
                        </Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => handleDeleteSummary(session.id)}
                          >
                            <Trash2 className="h-4 w-4 ml-2" />
                            מחק סיכום
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
