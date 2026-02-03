"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users,
  Search,
  TrendingUp,
  DollarSign,
  Brain,
  Filter,
  RefreshCw,
  Lock,
  Unlock,
  Edit,
  BarChart3,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface UserData {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  aiTier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  isBlocked: boolean;
  subscriptionStatus: string;
  createdAt: string;
  _count: {
    clients: number;
    therapySessions: number;
  };
  aiUsage?: {
    currentMonthCalls: number;
    currentMonthCost: number;
    totalCalls: number;
  };
}

export default function AdminAIDashboard() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [newTier, setNewTier] = useState<string>("");

  // Stats
  const [stats, setStats] = useState({
    totalUsers: 0,
    essentialUsers: 0,
    proUsers: 0,
    enterpriseUsers: 0,
    totalAICalls: 0,
    totalRevenue: 0,
    avgCallsPerUser: 0,
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/ai-dashboard");
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
        calculateStats(data.users);
      } else {
        toast.error("שגיאה בטעינת נתונים");
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (usersData: UserData[]) => {
    const essential = usersData.filter((u) => u.aiTier === "ESSENTIAL").length;
    const pro = usersData.filter((u) => u.aiTier === "PRO").length;
    const enterprise = usersData.filter((u) => u.aiTier === "ENTERPRISE").length;

    const totalCalls = usersData.reduce(
      (sum, u) => sum + (u.aiUsage?.currentMonthCalls || 0),
      0
    );

    const prices = { ESSENTIAL: 117, PRO: 145, ENTERPRISE: 220 };
    const revenue =
      essential * prices.ESSENTIAL +
      pro * prices.PRO +
      enterprise * prices.ENTERPRISE;

    setStats({
      totalUsers: usersData.length,
      essentialUsers: essential,
      proUsers: pro,
      enterpriseUsers: enterprise,
      totalAICalls: totalCalls,
      totalRevenue: revenue,
      avgCallsPerUser: usersData.length > 0 ? Math.round(totalCalls / usersData.length) : 0,
    });
  };

  const handleChangeTier = async () => {
    if (!editingUser || !newTier) return;

    try {
      const response = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiTier: newTier }),
      });

      if (response.ok) {
        toast.success("תוכנית שונתה בהצלחה!");
        setEditDialogOpen(false);
        fetchUsers();
      } else {
        toast.error("שגיאה בשינוי התוכנית");
      }
    } catch (error) {
      toast.error("שגיאה בשינוי התוכנית");
    }
  };

  const handleToggleBlock = async (userId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/toggle-block`, {
        method: "POST",
      });

      if (response.ok) {
        toast.success(currentStatus ? "משתמש שוחרר" : "משתמש נחסם");
        fetchUsers();
      } else {
        toast.error("שגיאה");
      }
    } catch (error) {
      toast.error("שגיאה");
    }
  };

  // Filter users
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.phone?.includes(searchQuery);

    const matchesTier = filterTier === "all" || user.aiTier === filterTier;
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "blocked" && user.isBlocked) ||
      (filterStatus === "active" && !user.isBlocked);

    return matchesSearch && matchesTier && matchesStatus;
  });

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "ESSENTIAL":
        return <Badge variant="outline">Essential 117₪</Badge>;
      case "PRO":
        return <Badge className="bg-blue-500">Pro 145₪</Badge>;
      case "ENTERPRISE":
        return <Badge className="bg-purple-500">Enterprise 220₪</Badge>;
      default:
        return <Badge>{tier}</Badge>;
    }
  };

  const getStatusBadge = (isBlocked: boolean) => {
    return isBlocked ? (
      <Badge variant="destructive">חסום</Badge>
    ) : (
      <Badge variant="default" className="bg-green-500">
        פעיל
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold">🤖 ניהול AI ומשתמשים</h1>
        <p className="text-muted-foreground mt-2">
          ניהול מרכזי של כל המשתמשים, תוכניות ושימוש ב-AI
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">סה"כ משתמשים</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Essential: {stats.essentialUsers} | Pro: {stats.proUsers} |
              Enterprise: {stats.enterpriseUsers}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">הכנסות חודשיות</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRevenue.toLocaleString()}₪</div>
            <p className="text-xs text-muted-foreground mt-1">לפי תוכניות נוכחיות</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">קריאות AI החודש</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAICalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              ממוצע למשתמש: {stats.avgCallsPerUser}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">רווח נטו</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {(stats.totalUsers * 100).toLocaleString()}₪
            </div>
            <p className="text-xs text-muted-foreground mt-1">100₪ למשתמש</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            סינון וחיפוש
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חפש לפי שם, אימייל או טלפון..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>

            <Select value={filterTier} onValueChange={setFilterTier}>
              <SelectTrigger>
                <SelectValue placeholder="סנן לפי תוכנית" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל התוכניות</SelectItem>
                <SelectItem value="ESSENTIAL">Essential</SelectItem>
                <SelectItem value="PRO">Pro</SelectItem>
                <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="סנן לפי סטטוס" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="active">פעיל</SelectItem>
                <SelectItem value="blocked">חסום</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>רשימת משתמשים ({filteredUsers.length})</CardTitle>
            <Button onClick={fetchUsers} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 ml-2" />
              רענן
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>משתמש</TableHead>
                  <TableHead>תוכנית</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>מטופלים</TableHead>
                  <TableHead>פגישות</TableHead>
                  <TableHead>שימוש AI</TableHead>
                  <TableHead>תאריך הצטרפות</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      לא נמצאו משתמשים
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.name || "ללא שם"}</div>
                          <div className="text-xs text-muted-foreground">
                            {user.email || user.phone || "ללא פרטי קשר"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getTierBadge(user.aiTier)}</TableCell>
                      <TableCell>{getStatusBadge(user.isBlocked)}</TableCell>
                      <TableCell>{user._count.clients}</TableCell>
                      <TableCell>{user._count.therapySessions}</TableCell>
                      <TableCell>
                        {user.aiUsage ? (
                          <div className="text-sm">
                            <div>{user.aiUsage.currentMonthCalls} קריאות</div>
                            <div className="text-xs text-muted-foreground">
                              ₪{user.aiUsage.currentMonthCost.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(user.createdAt), "dd/MM/yyyy", { locale: he })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingUser(user);
                              setNewTier(user.aiTier);
                              setEditDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant={user.isBlocked ? "default" : "destructive"}
                            onClick={() => handleToggleBlock(user.id, user.isBlocked)}
                          >
                            {user.isBlocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ערוך תוכנית</DialogTitle>
            <DialogDescription>
              שינוי תוכנית עבור {editingUser?.name || "משתמש"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">תוכנית נוכחית</label>
              <div className="mt-2">{editingUser && getTierBadge(editingUser.aiTier)}</div>
            </div>

            <div>
              <label className="text-sm font-medium">תוכנית חדשה</label>
              <Select value={newTier} onValueChange={setNewTier}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ESSENTIAL">Essential - 117₪</SelectItem>
                  <SelectItem value="PRO">Pro - 145₪</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise - 220₪</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleChangeTier}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
