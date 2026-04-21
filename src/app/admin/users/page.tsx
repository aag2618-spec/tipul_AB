"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Search,
  Plus,
  Pencil,
  Trash2,
  Ban,
  CheckCircle,
  Users,
  Shield,
  User as UserIcon,
  Brain,
  CreditCard,
  UserX,
  RefreshCw,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { exportToCSV } from "@/lib/export-utils";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: "USER" | "MANAGER" | "ADMIN";
  aiTier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  subscriptionStatus: string | null;
  isBlocked: boolean;
  userNumber: number | null;
  createdAt: string;
  aiUsageStats: {
    currentMonthCalls: number;
    currentMonthCost: number;
    dailyCalls: number;
  } | null;
  _count: {
    clients: number;
    therapySessions: number;
    apiUsageLogs: number;
  };
}

const TIER_LABELS: Record<string, string> = {
  ESSENTIAL: "בסיסי",
  PRO: "מקצועי",
  ENTERPRISE: "ארגוני",
};

const TIER_BADGE_STYLES: Record<string, string> = {
  ESSENTIAL: "",
  PRO: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  ENTERPRISE: "bg-purple-500/15 text-purple-600 border-purple-500/30",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // דיאלוג עריכה/יצירה
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "USER" as "USER" | "MANAGER" | "ADMIN",
  });
  const [editTier, setEditTier] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [search]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);

      const response = await fetch(`/api/admin/users?${params}`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // סינון בצד הלקוח
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (filterRole !== "all" && user.role !== filterRole) return false;
      if (filterTier !== "all" && user.aiTier !== filterTier) return false;
      if (filterStatus === "active" && user.isBlocked) return false;
      if (filterStatus === "blocked" && !user.isBlocked) return false;
      if (filterStatus === "trialing" && user.subscriptionStatus !== "TRIALING") return false;
      return true;
    });
  }, [users, filterRole, filterTier, filterStatus]);

  // סטטיסטיקות
  const stats = useMemo(() => {
    const blocked = users.filter(u => u.isBlocked).length;
    const byTier = {
      ESSENTIAL: users.filter(u => u.aiTier === "ESSENTIAL").length,
      PRO: users.filter(u => u.aiTier === "PRO").length,
      ENTERPRISE: users.filter(u => u.aiTier === "ENTERPRISE").length,
    };
    const totalAiCalls = users.reduce((sum, u) => sum + (u.aiUsageStats?.currentMonthCalls || 0), 0);
    return { total: users.length, blocked, byTier, totalAiCalls };
  }, [users]);

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      const url = editingUser
        ? `/api/admin/users/${editingUser.id}`
        : "/api/admin/users";

      const method = editingUser ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message);
      }

      toast.success(editingUser ? "המשתמש עודכן בהצלחה" : "המשתמש נוצר בהצלחה");
      setIsDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangeTier = async () => {
    if (!editingUser || !editTier) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiTier: editTier }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "שגיאה בשינוי תוכנית");
      }

      toast.success("התוכנית שונתה בהצלחה");
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message);
      }
      toast.success("המשתמש נמחק בהצלחה");
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה במחיקה");
    }
  };

  const handleToggleBlock = async (user: User) => {
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBlocked: !user.isBlocked }),
      });
      if (!response.ok) throw new Error("שגיאה");
      toast.success(user.isBlocked ? "המשתמש הופעל" : "המשתמש נחסם");
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה");
    }
  };

  const resetForm = () => {
    setFormData({ name: "", email: "", password: "", phone: "", role: "USER" });
    setEditingUser(null);
    setEditTier("");
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name || "",
      email: user.email || "",
      password: "",
      phone: user.phone || "",
      role: user.role,
    });
    setEditTier(user.aiTier);
    setIsDialogOpen(true);
  };

  const handleExportCSV = () => {
    const data = filteredUsers.map((u) => ({
      userNumber: u.userNumber ? `#${u.userNumber}` : "",
      name: u.name || "",
      email: u.email || "",
      phone: u.phone || "",
      role: u.role === "ADMIN" ? "מנהל מלא" : u.role === "MANAGER" ? "מנהל" : "משתמש",
      tier: TIER_LABELS[u.aiTier] || u.aiTier,
      status: u.isBlocked ? "חסום" : "פעיל",
      clients: u._count.clients,
      aiCalls: u.aiUsageStats?.currentMonthCalls || 0,
      createdAt: new Date(u.createdAt).toLocaleDateString("he-IL"),
    }));
    exportToCSV(data, [
      { key: "userNumber", label: "מספר" },
      { key: "name", label: "שם" },
      { key: "email", label: "אימייל" },
      { key: "phone", label: "טלפון" },
      { key: "role", label: "תפקיד" },
      { key: "tier", label: "תוכנית" },
      { key: "status", label: "סטטוס" },
      { key: "clients", label: "מטופלים" },
      { key: "aiCalls", label: "קריאות AI" },
      { key: "createdAt", label: "תאריך הרשמה" },
    ], "משתמשים");
    toast.success("הקובץ הורד בהצלחה");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ניהול משתמשים</h1>
          <p className="text-muted-foreground mt-1">{total} משתמשים במערכת</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 ml-1" />
            ייצוא
          </Button>
          <Button variant="outline" size="sm" onClick={fetchUsers}>
            <RefreshCw className="h-4 w-4 ml-1" />
            רענן
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="ml-2 h-4 w-4" />
                משתמש חדש
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingUser ? `עריכת משתמש ${editingUser.userNumber ? `#${editingUser.userNumber}` : ""}` : "משתמש חדש"}
                </DialogTitle>
                <DialogDescription>
                  {editingUser ? "עדכן את פרטי המשתמש" : "הזן את פרטי המשתמש החדש"}
                </DialogDescription>
              </DialogHeader>

              {editingUser ? (
                <Tabs defaultValue="details" dir="rtl">
                  <TabsList className="w-full">
                    <TabsTrigger value="details" className="flex-1">פרטים אישיים</TabsTrigger>
                    <TabsTrigger value="plan" className="flex-1">תוכנית ומנוי</TabsTrigger>
                    <TabsTrigger value="stats" className="flex-1">סטטיסטיקות</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>שם</Label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>אימייל</Label>
                      <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>סיסמה חדשה (השאר ריק לשמירה)</Label>
                      <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>טלפון</Label>
                      <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>תפקיד</Label>
                      <Select value={formData.role} onValueChange={(value: "USER" | "MANAGER" | "ADMIN") => setFormData({ ...formData, role: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USER">משתמש</SelectItem>
                          <SelectItem value="MANAGER">מנהל (ניהול)</SelectItem>
                          <SelectItem value="ADMIN">מנהל מלא</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  <TabsContent value="plan" className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>תוכנית נוכחית</Label>
                      <div>
                        <Badge variant="outline" className={TIER_BADGE_STYLES[editingUser.aiTier]}>
                          {TIER_LABELS[editingUser.aiTier]}
                        </Badge>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>שנה תוכנית</Label>
                      <Select value={editTier} onValueChange={setEditTier}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ESSENTIAL">🥉 בסיסי - 117₪</SelectItem>
                          <SelectItem value="PRO">🥈 מקצועי - 145₪</SelectItem>
                          <SelectItem value="ENTERPRISE">🥇 ארגוני - 220₪</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {editTier !== editingUser.aiTier && (
                      <Button onClick={handleChangeTier} disabled={isSaving} size="sm">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמור תוכנית"}
                      </Button>
                    )}
                    <div className="space-y-2">
                      <Label>סטטוס מנוי</Label>
                      <p className="text-sm text-muted-foreground">
                        {editingUser.subscriptionStatus === "ACTIVE" ? "פעיל" :
                         editingUser.subscriptionStatus === "TRIALING" ? "בתקופת ניסיון" :
                         editingUser.subscriptionStatus === "CANCELLED" ? "בוטל" :
                         editingUser.subscriptionStatus === "PAST_DUE" ? "פיגור בתשלום" :
                         editingUser.subscriptionStatus === "PAUSED" ? "מושהה" :
                         editingUser.subscriptionStatus || "לא מוגדר"}
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="stats" className="space-y-3 py-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground">מטופלים</p>
                        <p className="text-lg font-bold">{editingUser._count.clients}</p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground">פגישות</p>
                        <p className="text-lg font-bold">{editingUser._count.therapySessions}</p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground">קריאות AI החודש</p>
                        <p className="text-lg font-bold">{editingUser.aiUsageStats?.currentMonthCalls || 0}</p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground">עלות AI החודש</p>
                        <p className="text-lg font-bold">₪{Number(editingUser.aiUsageStats?.currentMonthCost || 0).toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      נרשם: {new Date(editingUser.createdAt).toLocaleDateString("he-IL")}
                    </div>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>שם</Label>
                    <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>אימייל</Label>
                    <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>סיסמה</Label>
                    <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>טלפון</Label>
                    <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>תפקיד</Label>
                    <Select value={formData.role} onValueChange={(value: "USER" | "MANAGER" | "ADMIN") => setFormData({ ...formData, role: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USER">משתמש</SelectItem>
                        <SelectItem value="MANAGER">מנהל (ניהול)</SelectItem>
                        <SelectItem value="ADMIN">מנהל מלא</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-muted-foreground">
                  ביטול
                </Button>
                <Button onClick={handleSubmit} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingUser ? "עדכן" : "צור משתמש"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* כרטיסי סטטיסטיקה */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">סה"כ משתמשים</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              בסיסי: {stats.byTier.ESSENTIAL} | מקצועי: {stats.byTier.PRO} | ארגוני: {stats.byTier.ENTERPRISE}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">פעילים / חסומים</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total - stats.blocked} / {stats.blocked}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.blocked > 0 ? `${stats.blocked} משתמשים חסומים` : "אין משתמשים חסומים"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">קריאות AI החודש</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAiCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              ממוצע: {stats.total > 0 ? Math.round(stats.totalAiCalls / stats.total) : 0} למשתמש
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">הכנסה חודשית (משוער)</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₪{(stats.byTier.ESSENTIAL * 117 + stats.byTier.PRO * 145 + stats.byTier.ENTERPRISE * 220).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">לפי תוכניות נוכחיות</p>
          </CardContent>
        </Card>
      </div>

      {/* חיפוש וסינון */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative md:col-span-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="שם, מייל, טלפון, #מספר..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger><SelectValue placeholder="תפקיד" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל התפקידים</SelectItem>
                <SelectItem value="USER">משתמש</SelectItem>
                <SelectItem value="MANAGER">מנהל</SelectItem>
                <SelectItem value="ADMIN">מנהל מלא</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterTier} onValueChange={setFilterTier}>
              <SelectTrigger><SelectValue placeholder="תוכנית" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל התוכניות</SelectItem>
                <SelectItem value="ESSENTIAL">בסיסי</SelectItem>
                <SelectItem value="PRO">מקצועי</SelectItem>
                <SelectItem value="ENTERPRISE">ארגוני</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="סטטוס" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="active">פעיל</SelectItem>
                <SelectItem value="blocked">חסום</SelectItem>
                <SelectItem value="trialing">בניסיון</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* טבלת משתמשים */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{filteredUsers.length} משתמשים</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>לא נמצאו משתמשים</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">מס׳</TableHead>
                  <TableHead className="text-muted-foreground">משתמש</TableHead>
                  <TableHead className="text-muted-foreground">תפקיד</TableHead>
                  <TableHead className="text-muted-foreground">תוכנית</TableHead>
                  <TableHead className="text-muted-foreground">סטטוס</TableHead>
                  <TableHead className="text-muted-foreground">מטופלים</TableHead>
                  <TableHead className="text-muted-foreground">שימוש AI</TableHead>
                  <TableHead className="text-muted-foreground">נוצר</TableHead>
                  <TableHead className="text-muted-foreground">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} className="border-border">
                    <TableCell>
                      {user.userNumber ? (
                        <Badge variant="outline" className="font-mono text-xs bg-sky-500/10 text-sky-400 border-sky-500/30">
                          #{user.userNumber}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <Link href={`/admin/users/${user.id}`} className="font-medium hover:underline hover:text-primary">
                          {user.name || "ללא שם"}
                        </Link>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.role === "ADMIN" ? "default" : user.role === "MANAGER" ? "secondary" : "outline"}
                        className={
                          user.role === "ADMIN"
                            ? "bg-primary/15 text-primary"
                            : user.role === "MANAGER"
                            ? "bg-sky-500/20 text-sky-500"
                            : ""
                        }
                      >
                        {user.role === "ADMIN" ? (
                          <><Shield className="ml-1 h-3 w-3" /> מנהל מלא</>
                        ) : user.role === "MANAGER" ? (
                          <><Shield className="ml-1 h-3 w-3" /> ניהול</>
                        ) : (
                          <><UserIcon className="ml-1 h-3 w-3" /> משתמש</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TIER_BADGE_STYLES[user.aiTier]}>
                        {TIER_LABELS[user.aiTier]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isBlocked ? "destructive" : "outline"}>
                        {user.isBlocked ? "חסום" : "פעיל"}
                      </Badge>
                    </TableCell>
                    <TableCell>{user._count.clients}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {user.aiUsageStats?.currentMonthCalls || 0}
                        <span className="text-xs text-muted-foreground mr-1">קריאות</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(user.createdAt).toLocaleDateString("he-IL")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(user)} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleBlock(user)}
                          className={`h-8 w-8 ${user.isBlocked ? "text-green-500 hover:text-green-400" : "text-orange-500 hover:text-orange-400"}`}
                        >
                          {user.isBlocked ? <CheckCircle className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-400">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>מחיקת משתמש</AlertDialogTitle>
                              <AlertDialogDescription>
                                האם אתה בטוח שברצונך למחוק את {user.name || user.email}?
                                פעולה זו תמחק את כל הנתונים של המשתמש ולא ניתן לשחזר.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>ביטול</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(user.id)} className="bg-red-600 hover:bg-red-700">
                                מחק
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
