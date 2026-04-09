"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ArrowRight,
  Users,
  Calendar,
  Brain,
  CreditCard,
  FileText,
  Headphones,
  Shield,
  Ban,
  CheckCircle,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  isBlocked: boolean;
  aiTier: string;
  subscriptionStatus: string | null;
  subscriptionStartedAt: string | null;
  subscriptionEndsAt: string | null;
  trialEndsAt: string | null;
  isFreeSubscription: boolean;
  freeSubscriptionNote: string | null;
  userNumber: number | null;
  createdAt: string;
  aiUsageStats: {
    currentMonthCalls: number;
    currentMonthCost: number;
    totalCalls: number;
    totalCost: number;
    dailyCalls: number;
  } | null;
  _count: {
    clients: number;
    therapySessions: number;
    documents: number;
    supportTickets: number;
    apiUsageLogs: number;
  };
  subscriptionPayments: Array<{
    id: string;
    amount: number;
    status: string;
    description: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
  supportTickets: Array<{
    id: string;
    ticketNumber: number;
    subject: string;
    status: string;
    createdAt: string;
  }>;
}

const TIER_LABELS: Record<string, string> = {
  ESSENTIAL: "בסיסי",
  PRO: "מקצועי",
  ENTERPRISE: "ארגוני",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "פעיל",
  TRIALING: "בתקופת ניסיון",
  PAST_DUE: "פיגור בתשלום",
  CANCELLED: "בוטל",
  PAUSED: "מושהה",
};

const TICKET_STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: "פתוח", color: "bg-blue-500" },
  IN_PROGRESS: { label: "בטיפול", color: "bg-yellow-500" },
  WAITING: { label: "ממתין", color: "bg-orange-500" },
  RESOLVED: { label: "נפתר", color: "bg-green-500" },
  CLOSED: { label: "סגור", color: "bg-gray-500" },
};

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser();
  }, [params.id]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`/api/admin/users/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        toast.error("משתמש לא נמצא");
        router.push("/admin/users");
      }
    } catch {
      toast.error("שגיאה");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBlocked: !user.isBlocked }),
      });
      if (!res.ok) throw new Error("שגיאה");
      toast.success(user.isBlocked ? "המשתמש הופעל" : "המשתמש נחסם");
      fetchUser();
    } catch {
      toast.error("שגיאה");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/admin/users")} className="mb-2 text-muted-foreground">
            <ArrowRight className="ml-1 h-4 w-4" />
            חזרה לרשימה
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            {user.name || "ללא שם"}
            {user.userNumber && (
              <Badge variant="outline" className="font-mono text-sm bg-sky-500/10 text-sky-400 border-sky-500/30">
                #{user.userNumber}
              </Badge>
            )}
            {user.isBlocked && <Badge variant="destructive">חסום</Badge>}
          </h1>
          <p className="text-muted-foreground mt-1">{user.email} {user.phone && `| ${user.phone}`}</p>
        </div>
        <Button
          variant={user.isBlocked ? "default" : "destructive"}
          size="sm"
          onClick={handleToggleBlock}
        >
          {user.isBlocked ? <CheckCircle className="ml-1 h-4 w-4" /> : <Ban className="ml-1 h-4 w-4" />}
          {user.isBlocked ? "הפעל משתמש" : "חסום משתמש"}
        </Button>
      </div>

      {/* שורה ראשונה — פרטים + מנוי */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserIcon className="h-4 w-4" />
              פרטים אישיים
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">תפקיד</span>
              <Badge variant="outline">
                {user.role === "ADMIN" ? "מנהל מלא" : user.role === "MANAGER" ? "מנהל" : "משתמש"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">תוכנית</span>
              <Badge variant="outline">{TIER_LABELS[user.aiTier] || user.aiTier}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">סטטוס מנוי</span>
              <span>{STATUS_LABELS[user.subscriptionStatus || ""] || user.subscriptionStatus || "לא מוגדר"}</span>
            </div>
            {user.isFreeSubscription && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">מנוי חינם</span>
                <Badge className="bg-green-500">כן</Badge>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">נרשם</span>
              <span>{new Date(user.createdAt).toLocaleDateString("he-IL")}</span>
            </div>
            {user.trialEndsAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">סיום ניסיון</span>
                <span>{new Date(user.trialEndsAt).toLocaleDateString("he-IL")}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4" />
              שימוש בינה מלאכותית
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted rounded-lg text-center">
                <p className="text-2xl font-bold">{user.aiUsageStats?.currentMonthCalls || 0}</p>
                <p className="text-xs text-muted-foreground">קריאות החודש</p>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <p className="text-2xl font-bold">₪{Number(user.aiUsageStats?.currentMonthCost || 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">עלות החודש</p>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <p className="text-2xl font-bold">{user.aiUsageStats?.totalCalls || 0}</p>
                <p className="text-xs text-muted-foreground">סה"כ קריאות</p>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <p className="text-2xl font-bold">₪{Number(user.aiUsageStats?.totalCost || 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">סה"כ עלות</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* שורה שניה — סטטיסטיקות */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardContent className="py-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{user._count.clients}</p>
            <p className="text-xs text-muted-foreground">מטופלים</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <Calendar className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{user._count.therapySessions}</p>
            <p className="text-xs text-muted-foreground">פגישות</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <FileText className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{user._count.documents}</p>
            <p className="text-xs text-muted-foreground">מסמכים</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <Headphones className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{user._count.supportTickets}</p>
            <p className="text-xs text-muted-foreground">פניות</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <Brain className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{user._count.apiUsageLogs}</p>
            <p className="text-xs text-muted-foreground">קריאות API</p>
          </CardContent>
        </Card>
      </div>

      {/* שורה שלישית — תשלומים + פניות */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              תשלומים אחרונים
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user.subscriptionPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">אין תשלומים</p>
            ) : (
              <div className="space-y-2">
                {user.subscriptionPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{p.description || "תשלום"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.paidAt || p.createdAt).toLocaleDateString("he-IL")}
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="font-medium">₪{Number(p.amount).toLocaleString()}</p>
                      <Badge variant={p.status === "PAID" ? "outline" : "secondary"} className="text-xs">
                        {p.status === "PAID" ? "שולם" : p.status === "PENDING" ? "ממתין" : p.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Headphones className="h-4 w-4" />
              פניות אחרונות
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user.supportTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">אין פניות</p>
            ) : (
              <div className="space-y-2">
                {user.supportTickets.map((t) => {
                  const statusInfo = TICKET_STATUS[t.status] || TICKET_STATUS.OPEN;
                  return (
                    <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <Link href={`/admin/support/${t.id}`} className="text-sm font-medium hover:underline">
                          #{t.ticketNumber} — {t.subject}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {new Date(t.createdAt).toLocaleDateString("he-IL")}
                        </p>
                      </div>
                      <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
