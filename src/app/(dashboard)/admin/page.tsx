import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Shield, Users, DollarSign, TrendingUp } from "lucide-react";
import Link from "next/link";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  
  const user = await prisma.user.findUnique({
    where: { id: session.user.id }
  });
  
  if (user?.role !== 'ADMIN') {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8 text-amber-600" />
          ניהול מערכת
        </h1>
        <p className="text-muted-foreground mt-1">
          ברוך הבא למרכז הניהול
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/ai-usage">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow border-2 border-primary h-full">
            <CardHeader>
              <Brain className="h-12 w-12 mb-3 text-primary" />
              <CardTitle>🤖 AI Usage Dashboard</CardTitle>
              <CardDescription>
                ניהול ובקרה על שימוש ב-AI במערכת
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>• סטטיסטיקות וניתוח שימוש</li>
                <li>• ניהול משתמשים ותוכניות</li>
                <li>• בקרת תקציב ועלויות</li>
                <li>• הגדרות גלובליות</li>
              </ul>
            </CardContent>
          </Card>
        </Link>

        <Card className="opacity-50">
          <CardHeader>
            <Users className="h-12 w-12 mb-3 text-muted-foreground" />
            <CardTitle>👥 ניהול משתמשים</CardTitle>
            <CardDescription>
              ניהול כל המשתמשים במערכת
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">בקרוב...</p>
          </CardContent>
        </Card>

        <Card className="opacity-50">
          <CardHeader>
            <DollarSign className="h-12 w-12 mb-3 text-muted-foreground" />
            <CardTitle>💳 ניהול תשלומים</CardTitle>
            <CardDescription>
              Stripe, חיובים, וחשבוניות
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">בקרוב...</p>
          </CardContent>
        </Card>

        <Card className="opacity-50">
          <CardHeader>
            <TrendingUp className="h-12 w-12 mb-3 text-muted-foreground" />
            <CardTitle>📊 דוחות ואנליטיקס</CardTitle>
            <CardDescription>
              גרפים, מגמות, ותחזיות
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">בקרוב...</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-600" />
            מידע חשוב למנהל
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="font-medium mb-1">🔐 אבטחה</p>
            <p className="text-sm text-muted-foreground">
              רק משתמשים עם role="ADMIN" יכולים לגשת לדפי ניהול אלו
            </p>
          </div>
          <div>
            <p className="font-medium mb-1">💰 תמחור</p>
            <p className="text-sm text-muted-foreground">
              Essential: 100₪ | Pro: 120₪ | Enterprise: 150₪ (ללא מע"מ)
            </p>
          </div>
          <div>
            <p className="font-medium mb-1">🚀 AI Models</p>
            <p className="text-sm text-muted-foreground">
              Pro: GPT-4o-mini (~0.002₪/קריאה) | Enterprise: GPT-4o (~0.03₪/קריאה)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
