import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Calendar, Lock, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SessionPrepCard } from "@/components/ai/session-prep-card";

async function getTodaysSessions(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const sessions = await prisma.therapySession.findMany({
    where: {
      therapistId: userId,
      startTime: {
        gte: today,
        lt: tomorrow,
      },
      status: {
        in: ['SCHEDULED', 'COMPLETED']
      },
      clientId: { not: null }
    },
    include: {
      client: true,
    },
    orderBy: { startTime: 'asc' }
  });

  return sessions;
}

async function getUserWithTier(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiTier: true,
      therapeuticApproaches: true,
      name: true,
    }
  });
}

export default async function AIPrepPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const user = await getUserWithTier(session.user.id);
  const sessions = await getTodaysSessions(session.user.id);

  if (!user) {
    redirect("/auth/signin");
  }

  const isAIEnabled = user.aiTier !== 'ESSENTIAL';
  const hasApproaches = (user.therapeuticApproaches?.length || 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-primary" />
            AI Session Prep
          </h1>
          <p className="text-muted-foreground mt-1">
            הכנה חכמה ומקצועית לפגישות היום
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAIEnabled && (
            <Badge variant={user.aiTier === 'ENTERPRISE' ? 'default' : 'secondary'} className="text-sm">
              {user.aiTier === 'ENTERPRISE' ? '🥇 ארגוני' : '🥈 מקצועי'} - Gemini 2.0
            </Badge>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/settings/ai-assistant">
              הגדרות AI
            </Link>
          </Button>
        </div>
      </div>

      {/* Not Enabled State */}
      {!isAIEnabled && (
        <Card className="border-2 border-primary bg-gradient-to-br from-blue-50 to-purple-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-6 w-6 text-primary" />
              <CardTitle>AI Session Prep - Premium Feature</CardTitle>
            </div>
            <CardDescription>שדרג כדי לקבל הכנה חכמה לכל פגישה</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              AI Session Prep מספק ניתוח מעמיק של הפגישות האחרונות, זיהוי דפוסים, והמלצות מותאמות לכל פגישה.
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                <span>ניתוח אוטומטי של דפוסים ונושאים חוזרים</span>
              </div>
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                <span>המלצות מבוססות על הגישה הטיפולית שלך</span>
              </div>
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                <span>שאלות והתערבויות מוצעות</span>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 pt-3">
              <div className="p-3 border rounded-lg bg-white">
                <p className="font-semibold mb-1">🥈 מקצועי (Professional)</p>
                <p className="text-2xl font-bold mb-1">145₪</p>
                <p className="text-xs text-muted-foreground mb-2">Gemini 2.0 - תמציתי</p>
                <Button className="w-full" size="sm" asChild>
                  <Link href="/dashboard/settings/billing">
                    שדרג
                  </Link>
                </Button>
              </div>
              <div className="p-3 border-2 border-primary rounded-lg bg-white">
                <p className="font-semibold mb-1">🥇 ארגוני (Enterprise)</p>
                <p className="text-2xl font-bold mb-1">220₪</p>
                <p className="text-xs text-muted-foreground mb-2">Gemini 2.0 - מפורט עם גישות</p>
                <Button className="w-full" size="sm" asChild>
                  <Link href="/dashboard/settings/billing">
                    שדרג
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Not Configured State */}
      {isAIEnabled && !hasApproaches && (
        <Card className="border-2 border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-orange-600" />
              נדרשת הגדרת AI
            </CardTitle>
            <CardDescription>
              כדי להשתמש ב-AI Session Prep, יש להגדיר את הגישות הטיפוליות שלך
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/settings/ai-assistant">
                הגדר עכשיו
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Today's Sessions */}
      {isAIEnabled && hasApproaches && (
        <>
          {sessions.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  אין פגישות היום
                </CardTitle>
                <CardDescription>
                  AI Session Prep יהיה זמין כשיהיו לך פגישות מתוכננות
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Session Prep מנתח את הפגישות האחרונות ומכין לך briefing מקצועי לפני כל פגישה.
                </p>
                <Button variant="outline" asChild>
                  <Link href="/dashboard/calendar">
                    לוח שנה
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {sessions.length} פגישות היום
                </h2>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(), 'EEEE, dd MMMM yyyy', { locale: he })}
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {sessions.map((therapySession) => (
                  <SessionPrepCard
                    key={therapySession.id}
                    session={{
                      id: therapySession.id,
                      clientId: therapySession.clientId!,
                      clientName: therapySession.client?.name || 'לקוח',
                      startTime: therapySession.startTime,
                    }}
                    userTier={user.aiTier}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Info Cards */}
      {isAIEnabled && hasApproaches && sessions.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-blue-50/50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-base">💡 עצה</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                לחץ על "צור Session Prep" לפני כל פגישה כדי לקבל briefing מקצועי ומותאם
              </p>
            </CardContent>
          </Card>

          <Card className="bg-green-50/50 border-green-200">
            <CardHeader>
              <CardTitle className="text-base">🎯 תובנות</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                ה-AI מזהה דפוסים ונושאים חוזרים אוטומטית מהסיכומים האחרונים
              </p>
            </CardContent>
          </Card>

          <Card className="bg-purple-50/50 border-purple-200">
            <CardHeader>
              <CardTitle className="text-base">⚡ מהיר</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                כל briefing נוצר תוך 3-5 שניות ומבוסס על הגישה הטיפולית שלך
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
