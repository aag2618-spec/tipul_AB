import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Plus, Clock, User } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

async function getRecordings(userId: string) {
  return prisma.recording.findMany({
    where: {
      OR: [
        { client: { therapistId: userId } },
        { session: { therapistId: userId } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true } },
      session: { select: { id: true, startTime: true } },
      transcription: {
        include: { analysis: true },
      },
    },
  });
}

export default async function RecordingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const recordings = await getRecordings(session.user.id);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="secondary">ממתין לתמלול</Badge>;
      case "TRANSCRIBING":
        return <Badge variant="secondary">מתמלל...</Badge>;
      case "TRANSCRIBED":
        return <Badge variant="outline">תומלל</Badge>;
      case "ANALYZED":
        return <Badge variant="default">נותח</Badge>;
      case "ERROR":
        return <Badge variant="destructive">שגיאה</Badge>;
      default:
        return null;
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">הקלטות</h1>
          <p className="text-muted-foreground">
            {recordings.length} הקלטות במערכת
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/recordings/new">
            <Plus className="ml-2 h-4 w-4" />
            הקלטה חדשה
          </Link>
        </Button>
      </div>

      {recordings.length > 0 ? (
        <div className="grid gap-4">
          {recordings.map((recording) => (
            <Card key={recording.id} className="hover:bg-muted/30 transition-colors">
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Mic className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">
                        {recording.type === "INTAKE" ? "שיחת קבלה" : "הקלטת פגישה"}
                      </p>
                      {getStatusBadge(recording.status)}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      {recording.client && (
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {recording.client.firstName} {recording.client.lastName}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDuration(recording.durationSeconds)}
                      </span>
                      <span>
                        {format(new Date(recording.createdAt), "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {recording.status === "PENDING" && (
                    <Button variant="outline" asChild>
                      <Link href={`/dashboard/recordings/${recording.id}`}>
                        תמלל
                      </Link>
                    </Button>
                  )}
                  {recording.status === "TRANSCRIBED" && (
                    <Button variant="outline" asChild>
                      <Link href={`/dashboard/recordings/${recording.id}`}>
                        נתח
                      </Link>
                    </Button>
                  )}
                  <Button variant="ghost" asChild>
                    <Link href={`/dashboard/recordings/${recording.id}`}>
                      צפה
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Mic className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="mb-2">אין הקלטות עדיין</CardTitle>
            <CardDescription className="mb-4">
              הקלט שיחות עם מטופלים לתמלול וניתוח אוטומטי
            </CardDescription>
            <Button asChild>
              <Link href="/dashboard/recordings/new">
                <Plus className="ml-2 h-4 w-4" />
                הקלטה ראשונה
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}








