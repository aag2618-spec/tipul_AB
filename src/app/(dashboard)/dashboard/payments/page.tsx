import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, Plus, TrendingUp, Clock, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

async function getPayments(userId: string) {
  return prisma.payment.findMany({
    where: { client: { therapistId: userId } },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true } },
      session: { select: { id: true, startTime: true } },
    },
  });
}

async function getPaymentStats(userId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [thisMonth, lastMonth, pending, total] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        client: { therapistId: userId },
        status: "PAID",
        paidAt: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        client: { therapistId: userId },
        status: "PAID",
        paidAt: { gte: lastMonthStart, lt: monthStart },
      },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        client: { therapistId: userId },
        status: "PENDING",
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: {
        client: { therapistId: userId },
        status: "PAID",
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    thisMonth: Number(thisMonth._sum.amount) || 0,
    lastMonth: Number(lastMonth._sum.amount) || 0,
    pending: Number(pending._sum.amount) || 0,
    pendingCount: pending._count?._all || 0,
    total: Number(total._sum.amount) || 0,
  };
}

export default async function PaymentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const [payments, stats] = await Promise.all([
    getPayments(session.user.id),
    getPaymentStats(session.user.id),
  ]);

  const pendingPayments = payments.filter((p) => p.status === "PENDING");
  const paidPayments = payments.filter((p) => p.status === "PAID");

  const getMethodLabel = (method: string) => {
    switch (method) {
      case "CASH": return "מזומן";
      case "CREDIT_CARD": return "אשראי";
      case "BANK_TRANSFER": return "העברה";
      case "CHECK": return "צ׳ק";
      default: return "אחר";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">תשלומים</h1>
          <p className="text-muted-foreground">ניהול תשלומים וחיובים</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/payments/new">
            <Plus className="ml-2 h-4 w-4" />
            תשלום חדש
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">החודש</p>
                <p className="text-2xl font-bold">₪{stats.thisMonth.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <CreditCard className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">חודש קודם</p>
                <p className="text-2xl font-bold">₪{stats.lastMonth.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">ממתין לגבייה</p>
                <p className="text-2xl font-bold">₪{stats.pending.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">סה״כ שנגבה</p>
                <p className="text-2xl font-bold">₪{stats.total.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            ממתינים ({pendingPayments.length})
          </TabsTrigger>
          <TabsTrigger value="paid" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            שולמו ({paidPayments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>תשלומים ממתינים</CardTitle>
              <CardDescription>
                {stats.pendingCount} תשלומים בסך ₪{stats.pending.toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingPayments.length > 0 ? (
                <div className="space-y-3">
                  {pendingPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className={`flex items-center justify-between p-4 rounded-lg border ${payment.session ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}
                    >
                      <div>
                        <p className="font-medium">{payment.client.firstName} {payment.client.lastName}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(payment.createdAt), "dd/MM/yyyy")}
                          {payment.session ? (
                            <> • פגישה מ-{format(new Date(payment.session.startTime), "dd/MM")}</>
                          ) : (
                            <span className="text-red-500 ml-2">(ללא פגישה משויכת)</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold">₪{Number(payment.amount)}</span>
                        <Button size="sm" asChild>
                          <Link href={`/dashboard/payments/${payment.id}/mark-paid`}>
                            סמן כשולם
                          </Link>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/dashboard/clients/${payment.client.id}`}>תיק מטופל</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="mx-auto h-12 w-12 mb-3 text-green-500 opacity-50" />
                  <p>אין תשלומים ממתינים!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paid" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>תשלומים ששולמו</CardTitle>
            </CardHeader>
            <CardContent>
              {paidPayments.length > 0 ? (
                <div className="space-y-3">
                  {paidPayments.slice(0, 20).map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{payment.client.firstName} {payment.client.lastName}</p>
                        <p className="text-sm text-muted-foreground">
                          {payment.paidAt && format(new Date(payment.paidAt), "dd/MM/yyyy")}
                          {" • "}
                          {getMethodLabel(payment.method)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold">₪{Number(payment.amount)}</span>
                        <Badge variant="default">שולם</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="mx-auto h-12 w-12 mb-3 opacity-50" />
                  <p>אין תשלומים עדיין</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}













