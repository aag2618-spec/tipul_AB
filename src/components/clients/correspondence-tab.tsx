"use client";

import { useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Send, ArrowRight, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface CommunicationLog {
  id: string;
  type: string;
  subject: string | null;
  content: string;
  status: string;
  sentAt: Date | null;
  createdAt: Date;
  isRead: boolean;
  readAt: Date | null;
  inReplyTo: string | null;
}

interface CorrespondenceTabProps {
  clientId: string;
  clientName: string;
  communicationLogs: CommunicationLog[];
}

export function CorrespondenceTab({
  clientId,
  clientName,
  communicationLogs,
}: CorrespondenceTabProps) {
  const router = useRouter();
  const [markingAsRead, setMarkingAsRead] = useState<string | null>(null);

  const sentEmails = communicationLogs.filter(
    (log) => log.type === "CUSTOM" && log.status === "SENT"
  );
  const receivedEmails = communicationLogs.filter(
    (log) => log.type === "INCOMING_EMAIL"
  );

  const handleMarkAsRead = async (logId: string) => {
    setMarkingAsRead(logId);
    try {
      const response = await fetch(`/api/communication-logs/${logId}/mark-read`, {
        method: "POST",
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error("Error marking as read:", error);
    } finally {
      setMarkingAsRead(null);
    }
  };

  const stripHtml = (html: string) => {
    return html.replace(/<[^>]*>/g, "").substring(0, 150) + "...";
  };

  return (
    <div className="space-y-6">
      {/* Unread Replies */}
      {receivedEmails.filter((log) => !log.isRead).length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <Mail className="h-5 w-5" />
              תשובות חדשות ({receivedEmails.filter((log) => !log.isRead).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {receivedEmails
                .filter((log) => !log.isRead)
                .map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between p-4 rounded-lg bg-white border border-orange-200"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="default" className="bg-orange-500">
                          חדש
                        </Badge>
                        <p className="font-medium">{log.subject || "ללא נושא"}</p>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {stripHtml(log.content)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        התקבל: {log.sentAt ? format(new Date(log.sentAt), "d בMMMM yyyy, HH:mm", { locale: he }) : "לא ידוע"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleMarkAsRead(log.id)}
                      disabled={markingAsRead === log.id}
                    >
                      <CheckCircle className="h-4 w-4 ml-1" />
                      סמן כנקרא
                    </Button>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Correspondence */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>היסטוריית התכתבויות</CardTitle>
            <Button size="sm" asChild>
              <a href={`/dashboard/clients/${clientId}/email`}>
                <Send className="h-4 w-4 ml-1" />
                שלח מייל חדש
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {communicationLogs.length > 0 ? (
            <div className="space-y-4">
              {communicationLogs.map((log) => {
                const isIncoming = log.type === "INCOMING_EMAIL";
                const isSent = log.type === "CUSTOM" && log.status === "SENT";

                if (!isIncoming && !isSent) return null;

                return (
                  <div
                    key={log.id}
                    className={`p-4 rounded-lg border ${
                      isIncoming
                        ? "bg-blue-50/50 border-blue-200"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isIncoming ? (
                          <>
                            <ArrowRight className="h-4 w-4 text-blue-600" />
                            <Badge variant="outline" className="border-blue-600 text-blue-600">
                              תשובה מ-{clientName}
                            </Badge>
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 text-gray-600" />
                            <Badge variant="outline" className="border-gray-600 text-gray-600">
                              נשלח ל-{clientName}
                            </Badge>
                          </>
                        )}
                        {isIncoming && !log.isRead && (
                          <Badge variant="default" className="bg-orange-500">
                            חדש
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {log.sentAt
                          ? format(new Date(log.sentAt), "d בMMMM yyyy, HH:mm", { locale: he })
                          : format(new Date(log.createdAt), "d בMMMM yyyy, HH:mm", { locale: he })}
                      </p>
                    </div>
                    <p className="font-medium mb-2">{log.subject || "ללא נושא"}</p>
                    <div
                      className="text-sm text-muted-foreground prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: log.content }}
                    />
                    {isIncoming && !log.isRead && (
                      <div className="mt-3 pt-3 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkAsRead(log.id)}
                          disabled={markingAsRead === log.id}
                        >
                          <CheckCircle className="h-4 w-4 ml-1" />
                          סמן כנקרא
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>אין עדיין התכתבויות עם {clientName}</p>
              <Button size="sm" className="mt-4" asChild>
                <a href={`/dashboard/clients/${clientId}/email`}>
                  <Send className="h-4 w-4 ml-1" />
                  שלח מייל ראשון
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
