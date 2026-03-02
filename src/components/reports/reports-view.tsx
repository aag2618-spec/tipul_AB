"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ReportsCharts } from "@/components/reports-charts";
import {
  Users, Calendar, TrendingUp, XCircle,
  Percent, Clock, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReportData {
  monthlyData: {
    month: string;
    sessions: number;
    income: number;
    newClients: number;
    cancelledSessions: number;
    cancellationRate: number;
    collectionRate: number;
  }[];
  totals: {
    clients: number;
    sessions: number;
    income: number;
    cancellationRate: number;
    collectionRate: number;
    pendingAmount: number;
    retentionRate: number;
    busiestDay: string;
    busiestDayCount: number;
  };
  sessionTypes: { type: string; count: number }[];
  clientStatus: { status: string; count: number }[];
  dayDistribution: { day: string; count: number }[];
}

type CardId = "clients" | "sessions" | "income" | "cancellation" | "collection" | "busiest" | "retention";

interface CardDef {
  id: CardId;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  bgColor: string;
  iconColor: string;
  subtext?: string;
}

export function ReportsView({ data }: { data: ReportData }) {
  const [activeCard, setActiveCard] = useState<CardId>("income");

  const mainCards: CardDef[] = [
    { id: "clients", icon: Users, label: "סה\"כ מטופלים", value: String(data.totals.clients), bgColor: "bg-primary/10", iconColor: "text-primary" },
    { id: "sessions", icon: Calendar, label: "פגישות השנה", value: String(data.totals.sessions), bgColor: "bg-sky-100", iconColor: "text-sky-600" },
    { id: "income", icon: TrendingUp, label: "הכנסות השנה", value: `₪${data.totals.income.toLocaleString()}`, bgColor: "bg-green-100", iconColor: "text-green-600" },
  ];

  const insightCards: CardDef[] = [
    { id: "cancellation", icon: XCircle, label: "אחוז ביטולים", value: `${data.totals.cancellationRate}%`, bgColor: "bg-red-50", iconColor: "text-red-500" },
    { id: "collection", icon: Percent, label: "שיעור גבייה", value: `${data.totals.collectionRate}%`, bgColor: "bg-amber-50", iconColor: "text-amber-500", subtext: data.totals.pendingAmount > 0 ? `₪${data.totals.pendingAmount.toLocaleString()} ממתינים` : undefined },
    { id: "busiest", icon: Clock, label: "יום הכי עמוס", value: `יום ${data.totals.busiestDay}`, bgColor: "bg-purple-50", iconColor: "text-purple-500", subtext: `${data.totals.busiestDayCount} פגישות` },
    { id: "retention", icon: Shield, label: "שיעור שימור", value: `${data.totals.retentionRate}%`, bgColor: "bg-teal-50", iconColor: "text-teal-500" },
  ];

  const renderCard = (card: CardDef) => (
    <Card
      key={card.id}
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02]",
        activeCard === card.id ? "ring-2 ring-primary/40 shadow-md" : ""
      )}
      onClick={() => setActiveCard(card.id)}
    >
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", card.bgColor)}>
            <card.icon className={cn("h-5 w-5", card.iconColor)} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
            {card.subtext && <p className="text-xs text-muted-foreground">{card.subtext}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderContent = () => {
    switch (activeCard) {
      case "clients":
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>מטופלים חדשים</CardTitle>
                <CardDescription>מטופלים חדשים לפי חודש</CardDescription>
              </CardHeader>
              <CardContent>
                <ReportsCharts data={data.monthlyData} dataKey="newClients" color="hsl(var(--primary))" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>התפלגות סטטוס מטופלים</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 pt-4">
                  {data.clientStatus.map(item => (
                    <div key={item.status} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                      <span className="font-medium">{item.status}</span>
                      <span className="font-bold text-lg">{item.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "sessions":
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>פגישות חודשיות</CardTitle>
                <CardDescription>מספר פגישות שהושלמו לפי חודש</CardDescription>
              </CardHeader>
              <CardContent>
                <ReportsCharts data={data.monthlyData} dataKey="sessions" color="hsl(200, 95%, 45%)" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>התפלגות סוגי פגישות</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 pt-4">
                  {data.sessionTypes.map(item => (
                    <div key={item.type} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                      <span className="font-medium">{item.type}</span>
                      <span className="font-bold text-lg">{item.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "income":
        return (
          <Card>
            <CardHeader>
              <CardTitle>הכנסות חודשיות</CardTitle>
              <CardDescription>סכום ההכנסות לפי חודש</CardDescription>
            </CardHeader>
            <CardContent>
              <ReportsCharts data={data.monthlyData} dataKey="income" formatType="currency" color="hsl(142, 71%, 45%)" />
            </CardContent>
          </Card>
        );

      case "cancellation":
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>ביטולים חודשיים</CardTitle>
                <CardDescription>מספר פגישות שבוטלו לפי חודש</CardDescription>
              </CardHeader>
              <CardContent>
                <ReportsCharts data={data.monthlyData} dataKey="cancelledSessions" color="hsl(0, 84%, 60%)" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>אחוז ביטולים חודשי</CardTitle>
                <CardDescription>אחוז הביטולים מתוך סה״כ פגישות</CardDescription>
              </CardHeader>
              <CardContent>
                <ReportsCharts data={data.monthlyData} dataKey="cancellationRate" formatType="percentage" color="hsl(0, 84%, 60%)" />
              </CardContent>
            </Card>
          </div>
        );

      case "collection":
        return (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>שיעור גבייה חודשי</CardTitle>
                <CardDescription>אחוז הגבייה מתוך סה״כ תשלומים</CardDescription>
              </CardHeader>
              <CardContent>
                <ReportsCharts data={data.monthlyData} dataKey="collectionRate" formatType="percentage" color="hsl(45, 93%, 47%)" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>סיכום גבייה שנתי</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-green-50">
                    <span className="text-green-700 font-medium">נגבה השנה</span>
                    <span className="font-bold text-green-700 text-lg">₪{data.totals.income.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-amber-50">
                    <span className="text-amber-700 font-medium">ממתין לגבייה</span>
                    <span className="font-bold text-amber-700 text-lg">₪{data.totals.pendingAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-sky-50">
                    <span className="text-sky-700 font-medium">שיעור גבייה כולל</span>
                    <span className="font-bold text-sky-700 text-lg">{data.totals.collectionRate}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "busiest":
        return (
          <Card>
            <CardHeader>
              <CardTitle>התפלגות פגישות לפי יום</CardTitle>
              <CardDescription>מספר פגישות שהושלמו לפי יום בשבוע</CardDescription>
            </CardHeader>
            <CardContent>
              <ReportsCharts
                data={data.dayDistribution}
                dataKey="count"
                xAxisKey="day"
                color="hsl(270, 60%, 55%)"
              />
            </CardContent>
          </Card>
        );

      case "retention":
        return (
          <Card>
            <CardHeader>
              <CardTitle>שיעור שימור מטופלים</CardTitle>
              <CardDescription>אחוז המטופלים הפעילים שנפגשו ב-3 החודשים האחרונים</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-6 py-8">
                <div className={cn(
                  "flex items-center justify-center w-32 h-32 rounded-full text-4xl font-bold",
                  data.totals.retentionRate >= 70 ? "bg-green-100 text-green-700" :
                  data.totals.retentionRate >= 40 ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                )}>
                  {data.totals.retentionRate}%
                </div>
                <div className="text-center space-y-2 max-w-md">
                  <p className="text-muted-foreground">
                    שיעור השימור מחושב לפי מטופלים פעילים (לא בארכיון) שהשתתפו
                    בפגישה אחת לפחות ב-3 החודשים האחרונים.
                  </p>
                  <p className={cn(
                    "text-sm font-medium",
                    data.totals.retentionRate >= 70 ? "text-green-600" :
                    data.totals.retentionRate >= 40 ? "text-amber-600" :
                    "text-red-600"
                  )}>
                    {data.totals.retentionRate >= 70 ? "שיעור שימור מצוין!" :
                     data.totals.retentionRate >= 40 ? "שיעור שימור סביר, יש מקום לשיפור" :
                     "שיעור שימור נמוך, שווה לבדוק את הסיבות"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">דוחות וסטטיסטיקות</h1>
        <p className="text-muted-foreground">סקירה שנתית של הפעילות בפרקטיקה</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {mainCards.map(renderCard)}
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {insightCards.map(renderCard)}
      </div>

      <div>{renderContent()}</div>
    </div>
  );
}
