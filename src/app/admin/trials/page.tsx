"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FlaskConical,
  Search,
  Ban,
  CheckCircle,
  Gift,
  Users,
  TrendingUp,
  Clock,
  ShieldAlert,
  Mail,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface TrialUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  aiTier: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  emailVerified: string | null;
  isBlocked: boolean;
  isFreeSubscription: boolean;
  trialAiUsedCost: string;
  trialAiCostLimit: string;
  createdAt: string;
  subscriptionStartedAt: string | null;
  aiUsageStats: {
    totalCalls: number;
    totalCost: string;
    currentMonthCalls: number;
  } | null;
}

interface Stats {
  total: number;
  active: number;
  expired: number;
  converted: number;
  blocked: number;
  unverified: number;
}

export default function AdminTrialsPage() {
  const [users, setUsers] = useState<TrialUser[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, expired: 0, converted: 0, blocked: 0, unverified: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Dialog state
  const [blockDialog, setBlockDialog] = useState<TrialUser | null>(null);
  const [grantFreeDialog, setGrantFreeDialog] = useState<TrialUser | null>(null);
  const [grantFreeTier, setGrantFreeTier] = useState("PRO");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTrials = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/trials?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
        setStats(data.stats);
      }
    } catch {
      toast.error("שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchTrials();
  }, [fetchTrials]);

  const handleAction = async (userId: string, action: string, extra?: Record<string, unknown>) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/trials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, ...extra }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        fetchTrials();
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error("שגיאה בביצוע הפעולה");
    } finally {
      setActionLoading(false);
      setBlockDialog(null);
      setGrantFreeDialog(null);
    }
  };

  const getStatusBadge = (user: TrialUser) => {
    if (user.isBlocked) return <Badge variant="destructive">חסום</Badge>;
    if (user.isFreeSubscription) return <Badge className="bg-purple-600">מנוי חינם</Badge>;
    if (user.subscriptionStatus === "TRIALING") {
      const endsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
      const daysLeft = endsAt ? Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
      if (daysLeft > 3) return <Badge className="bg-green-600">ניסיון ({daysLeft} ימים)</Badge>;
      if (daysLeft > 0) return <Badge className="bg-amber-500">ניסיון ({daysLeft} ימים)</Badge>;
      return <Badge variant="destructive">ניסיון - פג תוקף</Badge>;
    }
    if (user.subscriptionStatus === "ACTIVE") return <Badge className="bg-blue-600">ממיר</Badge>;
    if (user.subscriptionStatus === "PAST_DUE") return <Badge className="bg-amber-600">חסד</Badge>;
    if (user.subscriptionStatus === "CANCELLED") return <Badge variant="destructive">בוטל</Badge>;
    return <Badge variant="outline">{user.subscriptionStatus}</Badge>;
  };

  const getAiUsage = (user: TrialUser) => {
    const used = parseFloat(user.trialAiUsedCost || "0");
    const limit = parseFloat(user.trialAiCostLimit || "5");
    const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    return { used, limit, percent };
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6" />
            ניהול תקופות ניסיון
          </h1>
          <p className="text-muted-foreground text-sm mt-1">מעקב וניהול משתמשי ניסיון</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTrials} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ml-1 ${loading ? "animate-spin" : ""}`} />
          רענון
        </Button>
      </div>

      {/* סטטיסטיקות */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-blue-600" />
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">סה&quot;כ</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <FlaskConical className="h-5 w-5 mx-auto mb-1 text-green-600" />
            <p className="text-2xl font-bold">{stats.active}</p>
            <p className="text-xs text-muted-foreground">פעילים</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-amber-600" />
            <p className="text-2xl font-bold">{stats.expired}</p>
            <p className="text-xs text-muted-foreground">פג תוקף</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-purple-600" />
            <p className="text-2xl font-bold">{stats.converted}</p>
            <p className="text-xs text-muted-foreground">המירו</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ShieldAlert className="h-5 w-5 mx-auto mb-1 text-red-600" />
            <p className="text-2xl font-bold">{stats.blocked}</p>
            <p className="text-xs text-muted-foreground">חסומים</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Mail className="h-5 w-5 mx-auto mb-1 text-slate-600" />
            <p className="text-2xl font-bold">{stats.unverified}</p>
            <p className="text-xs text-muted-foreground">לא אומתו</p>
          </CardContent>
        </Card>
      </div>

      {/* Conversion rate */}
      {stats.total > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">אחוז המרה</span>
              <span className="text-lg font-bold text-purple-600">
                {((stats.converted / stats.total) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                style={{ width: `${(stats.converted / stats.total) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* חיפוש וסינון */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">משתמשי ניסיון</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי שם, מייל או טלפון..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="active">פעילים</SelectItem>
                <SelectItem value="expired">פגי תוקף</SelectItem>
                <SelectItem value="converted">המירו</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FlaskConical className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>אין משתמשי ניסיון</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם</TableHead>
                    <TableHead className="text-right">מייל</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">שימוש AI</TableHead>
                    <TableHead className="text-right">נרשם</TableHead>
                    <TableHead className="text-right">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const ai = getAiUsage(user);
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          <div>
                            {user.name || "-"}
                            {!user.emailVerified && (
                              <span className="text-xs text-amber-500 mr-1">(לא מאומת)</span>
                            )}
                          </div>
                          {user.phone && <div className="text-xs text-muted-foreground">{user.phone}</div>}
                        </TableCell>
                        <TableCell className="text-sm">{user.email || "-"}</TableCell>
                        <TableCell>{getStatusBadge(user)}</TableCell>
                        <TableCell>
                          <div className="w-24">
                            <div className="flex justify-between text-xs mb-1">
                              <span>₪{ai.used.toFixed(2)}</span>
                              <span className="text-muted-foreground">/ ₪{ai.limit}</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${
                                  ai.percent >= 90 ? "bg-red-500" : ai.percent >= 70 ? "bg-amber-500" : "bg-green-500"
                                }`}
                                style={{ width: `${ai.percent}%` }}
                              />
                            </div>
                            {user.aiUsageStats && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {user.aiUsageStats.totalCalls} שיחות
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString("he-IL")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {/* Block / Unblock */}
                            {user.isBlocked ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAction(user.id, "unblock")}
                                disabled={actionLoading}
                                title="שחרור חסימה"
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setBlockDialog(user)}
                                disabled={actionLoading}
                                title="חסימה"
                              >
                                <Ban className="h-4 w-4 text-red-600" />
                              </Button>
                            )}

                            {/* Grant free subscription */}
                            {!user.isFreeSubscription && user.subscriptionStatus !== "ACTIVE" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setGrantFreeTier("PRO"); setGrantFreeDialog(user); }}
                                disabled={actionLoading}
                                title="העבר למנוי חינם"
                              >
                                <Gift className="h-4 w-4 text-purple-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block dialog */}
      <AlertDialog open={!!blockDialog} onOpenChange={(open) => { if (!open) setBlockDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>חסימת משתמש ניסיון</AlertDialogTitle>
            <AlertDialogDescription>
              האם לחסום את <strong>{blockDialog?.name}</strong> ({blockDialog?.email})?
              <br />המשתמש לא יוכל להתחבר למערכת.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse">
            <AlertDialogAction
              onClick={() => blockDialog && handleAction(blockDialog.id, "block")}
              className="bg-red-600 hover:bg-red-700"
            >
              חסום
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Grant free subscription dialog */}
      <AlertDialog open={!!grantFreeDialog} onOpenChange={(open) => { if (!open) setGrantFreeDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-purple-600" />
              העברה למנוי חינם
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  העבר את <strong className="text-foreground">{grantFreeDialog?.name}</strong> ({grantFreeDialog?.email}) למנוי חינם.
                </p>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">בחר מסלול:</label>
                  <Select value={grantFreeTier} onValueChange={setGrantFreeTier}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ESSENTIAL">Essential</SelectItem>
                      <SelectItem value="PRO">Pro</SelectItem>
                      <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  המשתמש יקבל גישה מלאה למסלול הנבחר ללא הגבלת זמן. 
                  ניתן לבטל בכל עת מדף ניהול המנויים.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse">
            <AlertDialogAction
              onClick={() => grantFreeDialog && handleAction(grantFreeDialog.id, "grantFree", { aiTier: grantFreeTier })}
              className="bg-purple-600 hover:bg-purple-700"
            >
              אשר
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
