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

  // Mock data for demonstration
  const usageByDay = [
    { day: 'ראשון', calls: 245, cost: 0.5 },
    { day: 'שני', calls: 312, cost: 0.65 },
    { day: 'שלישי', calls: 289, cost: 0.58 },
    { day: 'רביעי', calls: 401, cost: 0.82 },
    { day: 'חמישי', calls: 378, cost: 0.76 },
    { day: 'שישי', calls: 156, cost: 0.32 },
    { day: 'שבת', calls: 89, cost: 0.18 },
  ];

  const tierDistribution = [
    { name: 'Essential', value: 45, color: '#94a3b8' },
    { name: 'Pro', value: 35, color: '#3b82f6' },
    { name: 'Enterprise', value: 20, color: '#8b5cf6' },
  ];

  const monthlyTrend = [
    { month: 'ינואר', users: 85, revenue: 9500, cost: 35 },
    { month: 'פברואר', users: 100, revenue: 11450, cost: 52 },
    { month: 'מרץ', users: 115, revenue: 13200, cost: 68 },
    { month: 'אפריל', users: 128, revenue: 14800, cost: 85 },
  ];

  const topUsers = [
    { name: 'ד״ר כהן', calls: 856, tier: 'ENTERPRISE' },
    { name: 'פסיכולוג לוי', calls: 734, tier: 'PRO' },
    { name: 'ד״ר מזרחי', calls: 689, tier: 'ENTERPRISE' },
    { name: 'טיפול ישראל', calls: 623, tier: 'PRO' },
    { name: 'ד״ר אברהם', calls: 567, tier: 'ENTERPRISE' },
  ];

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
            חזרה לדשבורד
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
            <div className="text-2xl font-bold">1,870</div>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <TrendingUp className="h-3 w-3" />
              <span>+12% מאתמול</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">עלות היום</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3.81₪</div>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <TrendingUp className="h-3 w-3" />
              <span>+8% מאתמול</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">משתמשים פעילים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">87/100</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>היום</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">רווח היום</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">373₪</div>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <TrendingUp className="h-3 w-3" />
              <span>98% מרווח</span>
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
                  {tierDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {tierDistribution.map((tier) => (
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
              {topUsers.map((user, index) => (
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
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="text-green-900">💡 תובנה</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-green-900">
              השימוש ב-AI גדל ב-23% בחודש האחרון. שקול להוסיף עוד משתמשי Enterprise.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-sky-50 border-sky-200">
          <CardHeader>
            <CardTitle className="text-sky-900">📈 הזדמנות</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-sky-900">
              35% מהמשתמשים Essential - יש פוטנציאל לשדרוג ל-Pro (700₪ הכנסה נוספת).
            </p>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-200">
          <CardHeader>
            <CardTitle className="text-purple-900">🎯 המלצה</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-purple-900">
              מרווח הרווח 98% - מחירים אופטימליים. שמור על המודל הנוכחי.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
