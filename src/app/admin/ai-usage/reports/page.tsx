"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, Calendar, DollarSign } from "lucide-react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function AdminReportsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/ai-stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const usageByDay = stats?.usageByDay || [];
  const tierDistribution = stats?.tierDistribution || [];
  const monthlyTrend = stats?.monthlyTrend || [];
  const topUsers = stats?.topUsers || [];
  const summary = stats?.summary || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">📊 דוחות ואנליטיקס</h1>
          <p className="text-muted-foreground mt-1">
            מגמות, תובנות, וניתוח שימוש
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/ai-usage">
            חזרה לסקירה
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">סה״כ קריאות היום</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(summary.todayCalls || 0).toLocaleString()}</div>
            <div className={`flex items-center gap-1 text-xs ${(summary.callsChange || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {(summary.callsChange || 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span>{summary.callsChange || 0}% מאתמול</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">עלות היום</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.todayCost || 0}₪</div>
            <div className={`flex items-center gap-1 text-xs ${(summary.costChange || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {(summary.costChange || 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span>{summary.costChange || 0}% מאתמול</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">משתמשים פעילים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.activeUsers || 0}/{summary.totalUsers || 0}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>היום</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">סה״כ משתמשים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalUsers || 0}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>רשומים</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage by Day */}
      <Card>
        <CardHeader>
          <CardTitle>שימוש לפי יום</CardTitle>
          <CardDescription>קריאות AI ועלויות בשבוע האחרון</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={usageByDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="calls" fill="#3b82f6" name="קריאות" />
              <Bar yAxisId="right" dataKey="cost" fill="#8b5cf6" name="עלות (₪)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Tier Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>חלוקת משתמשים לפי תוכנית</CardTitle>
            <CardDescription>התפלגות נוכחית</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={tierDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {tierDistribution.map((entry: { name: string; value: number; color: string }, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {tierDistribution.map((tier: { name: string; value: number; color: string }) => (
                <div key={tier.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tier.color }} />
                    <span>{tier.name}</span>
                  </div>
                  <span className="font-medium">{tier.value} משתמשים</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Users */}
        <Card>
          <CardHeader>
            <CardTitle>משתמשים מובילים</CardTitle>
            <CardDescription>Top 5 לפי שימוש החודש</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topUsers.map((user: { name: string; calls: number; tier: string }, index: number) => (
                <div key={user.name} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.calls} קריאות</p>
                    </div>
                  </div>
                  <Badge variant={user.tier === 'ENTERPRISE' ? 'default' : 'secondary'}>
                    {user.tier === 'ENTERPRISE' ? '🥇' : '🥈'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend */}
      <Card>
        <CardHeader>
          <CardTitle>מגמה חודשית</CardTitle>
          <CardDescription>צמיחה במשתמשים, הכנסות ועלויות</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="users" stroke="#3b82f6" strokeWidth={2} name="משתמשים" />
              <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name="הכנסות (₪)" />
              <Line yAxisId="right" type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={2} name="עלויות (₪)" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Insights */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader>
            <CardTitle>💡 תובנה</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {tierDistribution.length > 0 
                ? `${tierDistribution.reduce((s: number, t: { value: number }) => s + t.value, 0)} משתמשים רשומים. ${(summary.callsChange || 0) > 0 ? `השימוש גדל ב-${summary.callsChange}% מאתמול.` : 'השימוש יציב.'}`
                : 'טוען נתונים...'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-sky-500/30 bg-sky-500/5">
          <CardHeader>
            <CardTitle>📈 הזדמנות</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {tierDistribution.length > 0
                ? `${tierDistribution.find((t: { name: string }) => t.name === 'Essential')?.value || 0} משתמשי בסיסי - פוטנציאל שדרוג למקצועי.`
                : 'טוען נתונים...'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardHeader>
            <CardTitle>🎯 סטטיסטיקה</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {topUsers.length > 0
                ? `המשתמש הפעיל ביותר: ${topUsers[0].name} עם ${topUsers[0].calls} קריאות החודש.`
                : 'אין נתוני שימוש עדיין.'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
