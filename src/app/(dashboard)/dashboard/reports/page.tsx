import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Users, Calendar, CreditCard, TrendingUp, Mic } from "lucide-react";
import { ReportsCharts } from "@/components/reports-charts";

async function getReportData(userId: string) {
  try {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // Get monthly data for the current year
    const monthlyData = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        const monthStart = new Date(now.getFullYear(), i, 1);
        const monthEnd = new Date(now.getFullYear(), i + 1, 0);

        const [sessions, payments, newClients] = await Promise.all([
          prisma.therapySession.count({
            where: {
              therapistId: userId,
              startTime: { gte: monthStart, lte: monthEnd },
              status: "COMPLETED",
              type: { not: "BREAK" },
            },
          }),
          prisma.payment.aggregate({
            where: {
              client: { therapistId: userId },
              status: "PAID",
              paidAt: { not: null, gte: monthStart, lte: monthEnd },
            },
            _sum: { amount: true },
          }),
          prisma.client.count({
            where: {
              therapistId: userId,
              createdAt: { gte: monthStart, lte: monthEnd },
            },
          }),
        ]);

        return {
          month: monthStart.toLocaleString("he-IL", { month: "short" }),
          sessions,
          income: Number(payments._sum.amount) || 0,
          newClients,
        };
      })
    );

    // Get totals
    const [totalClients, totalSessions, totalIncome, totalRecordings] = await Promise.all([
      prisma.client.count({ where: { therapistId: userId } }),
      prisma.therapySession.count({
        where: { therapistId: userId, startTime: { gte: yearStart }, status: "COMPLETED", type: { not: "BREAK" } },
      }),
      prisma.payment.aggregate({
        where: {
          client: { therapistId: userId },
          status: "PAID",
          paidAt: { not: null, gte: yearStart },
        },
        _sum: { amount: true },
      }),
      prisma.recording.count({
        where: {
          OR: [
            { client: { therapistId: userId } },
            { session: { therapistId: userId } },
          ],
        },
      }),
    ]);

    // Session type distribution
    const sessionTypes = await prisma.therapySession.groupBy({
      by: ["type"],
      where: { therapistId: userId, startTime: { gte: yearStart } },
      _count: true,
    });

    // Client status distribution
    const clientStatus = await prisma.client.groupBy({
      by: ["status"],
      where: { therapistId: userId },
      _count: true,
    });

    return {
      monthlyData,
      totals: {
        clients: totalClients,
        sessions: totalSessions,
        income: Number(totalIncome._sum.amount) || 0,
        recordings: totalRecordings,
      },
      sessionTypes: sessionTypes.map((s) => ({
        type: s.type === "ONLINE" ? "אונליין" : s.type === "PHONE" ? "טלפון" : "פרונטלי",
        count: s._count,
      })),
      clientStatus: clientStatus.map((c) => ({
        status: c.status === "ACTIVE" ? "פעילים" : c.status === "INACTIVE" ? "לא פעילים" : "בארכיון",
        count: c._count,
      })),
    };
  } catch (error) {
    console.error("Failed to get report data:", error);
    // Return empty data on error
    return {
      monthlyData: Array.from({ length: 12 }, (_, i) => ({
        month: new Date(new Date().getFullYear(), i, 1).toLocaleString("he-IL", { month: "short" }),
        sessions: 0,
        income: 0,
        newClients: 0,
      })),
      totals: { clients: 0, sessions: 0, income: 0, recordings: 0 },
      sessionTypes: [],
      clientStatus: [],
    };
  }
}

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const data = await getReportData(session.user.id);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">דוחות וסטטיסטיקות</h1>
        <p className="text-muted-foreground">
          סקירה שנתית של הפעילות בפרקטיקה
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">סה״כ מטופלים</p>
                <p className="text-2xl font-bold">{data.totals.clients}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">פגישות השנה</p>
                <p className="text-2xl font-bold">{data.totals.sessions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">הכנסות השנה</p>
                <p className="text-2xl font-bold">₪{data.totals.income.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* הקלטות - מוסתר לעת עתה
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                <Mic className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">הקלטות</p>
                <p className="text-2xl font-bold">{data.totals.recordings}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        */}
      </div>

      <Tabs defaultValue="income" className="w-full">
        <TabsList>
          <TabsTrigger value="income" className="gap-2">
            <CreditCard className="h-4 w-4" />
            הכנסות
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-2">
            <Calendar className="h-4 w-4" />
            פגישות
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-2">
            <Users className="h-4 w-4" />
            מטופלים
          </TabsTrigger>
        </TabsList>

        <TabsContent value="income" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>הכנסות חודשיות</CardTitle>
              <CardDescription>סכום ההכנסות לפי חודש</CardDescription>
            </CardHeader>
            <CardContent>
              <ReportsCharts
                data={data.monthlyData}
                dataKey="income"
                color="var(--chart-1)"
                formatType="currency"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>פגישות חודשיות</CardTitle>
                <CardDescription>מספר פגישות לפי חודש</CardDescription>
              </CardHeader>
              <CardContent>
                <ReportsCharts 
                  data={data.monthlyData} 
                  dataKey="sessions" 
                  color="var(--chart-2)"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>התפלגות סוגי פגישות</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.sessionTypes.map((item) => (
                    <div key={item.type} className="flex items-center justify-between">
                      <span>{item.type}</span>
                      <span className="font-bold">{item.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clients" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>מטופלים חדשים</CardTitle>
                <CardDescription>מטופלים חדשים לפי חודש</CardDescription>
              </CardHeader>
              <CardContent>
                <ReportsCharts 
                  data={data.monthlyData} 
                  dataKey="newClients" 
                  color="var(--chart-3)"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>התפלגות סטטוס מטופלים</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.clientStatus.map((item) => (
                    <div key={item.status} className="flex items-center justify-between">
                      <span>{item.status}</span>
                      <span className="font-bold">{item.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}













