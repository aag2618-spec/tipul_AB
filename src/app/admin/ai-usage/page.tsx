import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Brain, 
  TrendingUp, 
  DollarSign, 
  Users, 
  AlertCircle,
  Settings,
  BarChart3,
  Activity
} from "lucide-react";
import Link from "next/link";

async function getAIUsageStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Get all users with their AI usage
  const users = await prisma.user.findMany({
    include: {
      aiUsageStats: true,
      clients: {
        where: { status: 'ACTIVE' }
      }
    }
  });
  
  // Calculate totals
  const totalUsers = users.length;
  const usersWithAI = users.filter(u => u.aiTier !== 'ESSENTIAL').length;
  
  const tierCounts = {
    ESSENTIAL: users.filter(u => u.aiTier === 'ESSENTIAL').length,
    PRO: users.filter(u => u.aiTier === 'PRO').length,
    ENTERPRISE: users.filter(u => u.aiTier === 'ENTERPRISE').length,
  };
  
  const totalCalls = users.reduce((sum, u) => sum + (u.aiUsageStats?.currentMonthCalls || 0), 0);
  const totalCost = users.reduce((sum, u) => sum + Number(u.aiUsageStats?.currentMonthCost || 0), 0);
  
  // Get API usage logs for this month
  const apiLogs = await prisma.apiUsageLog.findMany({
    where: {
      createdAt: { gte: startOfMonth },
      endpoint: { startsWith: '/api/ai' }
    },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  
  // Find heavy users
  const heavyUsers = users
    .filter(u => (u.aiUsageStats?.currentMonthCalls || 0) > 500)
    .sort((a, b) => (b.aiUsageStats?.currentMonthCalls || 0) - (a.aiUsageStats?.currentMonthCalls || 0))
    .slice(0, 10);
  
  // Calculate revenue
  const revenue = 
    tierCounts.ESSENTIAL * 100 +
    tierCounts.PRO * 120 +
    tierCounts.ENTERPRISE * 150;
  
  return {
    totalUsers,
    usersWithAI,
    tierCounts,
    totalCalls,
    totalCost,
    apiLogs,
    heavyUsers,
    revenue,
  };
}

export default async function AdminAIUsagePage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect("/login");
  }
  
  // Check if admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id }
  });
  
  if (user?.role !== 'ADMIN') {
    redirect("/dashboard");
  }
  
  const stats = await getAIUsageStats();
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">🤖 AI Usage Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            ניהול ובקרה על שימוש ב-AI במערכת
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/ai-usage/settings">
            <Settings className="h-4 w-4 ml-2" />
            הגדרות גלובליות
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">משתמשים כולל</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {stats.usersWithAI} עם AI ({Math.round(stats.usersWithAI / stats.totalUsers * 100)}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">קריאות AI החודש</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              ממוצע: {(stats.totalCalls / (stats.usersWithAI || 1)).toFixed(0)} לכל משתמש
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">עלות AI החודש</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCost.toFixed(2)}₪</div>
            <p className="text-xs text-muted-foreground">
              ממוצע: {(stats.totalCost / stats.totalCalls || 0).toFixed(3)}₪ לקריאה
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">הכנסות חודשיות</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.revenue.toLocaleString()}₪</div>
            <p className="text-xs text-muted-foreground">
              רווח: {(stats.revenue - stats.totalCost).toFixed(0)}₪ ({Math.round((stats.revenue - stats.totalCost) / stats.revenue * 100)}%)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tier Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>חלוקת משתמשים לפי תוכניות</CardTitle>
          <CardDescription>כמה משתמשים בכל תוכנית</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                  <span className="text-2xl">🥉</span>
                </div>
                <div>
                  <p className="font-medium">בסיסי - Essential (117₪)</p>
                  <p className="text-sm text-muted-foreground">ללא AI</p>
                </div>
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold">{stats.tierCounts.ESSENTIAL}</p>
                <p className="text-xs text-muted-foreground">משתמשים</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-sky-100 flex items-center justify-center">
                  <span className="text-2xl">🥈</span>
                </div>
                <div>
                  <p className="font-medium">מקצועי - Professional (145₪)</p>
                  <p className="text-sm text-muted-foreground">Gemini 2.0 Flash - תמציתי</p>
                </div>
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold">{stats.tierCounts.PRO}</p>
                <p className="text-xs text-muted-foreground">משתמשים</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                  <span className="text-2xl">🥇</span>
                </div>
                <div>
                  <p className="font-medium">ארגוני - Enterprise (220₪)</p>
                  <p className="text-sm text-muted-foreground">Gemini 2.0 Flash - מפורט עם גישות</p>
                </div>
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold">{stats.tierCounts.ENTERPRISE}</p>
                <p className="text-xs text-muted-foreground">משתמשים</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Heavy Users Alert */}
      {stats.heavyUsers.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <CardTitle>משתמשים עם שימוש גבוה</CardTitle>
            </div>
            <CardDescription>משתמשים שעברו 500 קריאות החודש</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.heavyUsers.map(user => (
                <div key={user.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Badge variant={
                      user.aiTier === 'ENTERPRISE' ? 'default' : 
                      user.aiTier === 'PRO' ? 'secondary' : 
                      'outline'
                    }>
                      {user.aiTier}
                    </Badge>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-bold">{user.aiUsageStats?.currentMonthCalls || 0}</p>
                    <p className="text-xs text-muted-foreground">
                      {Number(user.aiUsageStats?.currentMonthCost || 0).toFixed(2)}₪
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/admin/ai-usage/users">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
            <CardHeader>
              <Users className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>ניהול משתמשים</CardTitle>
              <CardDescription>צפה ונהל משתמשים ושימוש</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/ai-usage/settings">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
            <CardHeader>
              <Settings className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>הגדרות גלובליות</CardTitle>
              <CardDescription>מגבלות, תקציב, והתנהגות</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/ai-usage/reports">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
            <CardHeader>
              <BarChart3 className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>דוחות ואנליטיקס</CardTitle>
              <CardDescription>גרפים, מגמות, ותובנות</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
