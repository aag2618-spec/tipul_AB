"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Mail, Link as LinkIcon, Unlink, CheckCircle, AlertCircle } from "lucide-react";

interface GoogleCalendarSectionProps {
  googleConnected: boolean;
  googleEmail: string | null;
  disconnecting: boolean;
  connectGoogle: () => Promise<void>;
  disconnectGoogle: () => Promise<void>;
}

export function GoogleCalendarSection({
  googleConnected,
  googleEmail,
  disconnecting,
  connectGoogle,
  disconnectGoogle,
}: GoogleCalendarSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-sky-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Google Calendar
                {googleConnected ? (
                  <Badge className="bg-emerald-50 text-emerald-900 border border-emerald-200"><CheckCircle className="h-3 w-3 ml-1" />מחובר</Badge>
                ) : (
                  <Badge variant="secondary"><AlertCircle className="h-3 w-3 ml-1" />לא מחובר</Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">סנכרון דו-כיווני: פגישות שתיצור כאן יופיעו ב-Google Calendar ולהפך</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {googleConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              מחובר כ: <strong>{googleEmail}</strong>
            </div>
            <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={disconnectGoogle} disabled={disconnecting}>
              <Unlink className="h-3 w-3" />{disconnecting ? "מנתק..." : "נתק"}
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={connectGoogle} className="gap-1">
            <LinkIcon className="h-3 w-3" />התחבר עם Google
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
