"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, 
  Search,
  CreditCard,
  Users,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  Ban,
  ArrowUpCircle,
  CalendarPlus,
  Eye,
  ChevronRight,
  ChevronLeft,
  FileCheck,
  Crown,
  Zap,
  Building,
  Gift,
} from "lucide-react";
import { toast } from "sonner";

// ========================================
// Types
// ========================================

interface TermsRecord {
  id: string;
  termsVersion: string;
  action: string;
  planSelected: string | null;
  amountAgreed: number | null;
  ipAddress: string | null;
  createdAt: string;
}

interface PaymentRecord {
  id: string;
  amount: number;
  status: string;
  description: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface Subscriber {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  aiTier: string;
  subscriptionStatus: string;
  subscriptionStartedAt: string | null;
  subscriptionEndsAt: string | null;
  trialEndsAt: string | null;
  isBlocked: boolean;
  isFreeSubscription: boolean;
  freeSubscriptionNote: string | null;
  freeSubscriptionGrantedAt: string | null;
  createdAt: string;
  subscriptionPayments: PaymentRecord[];
  termsAcceptances: TermsRecord[];
}

interface Stats {
  total: number;
  active: number;
  cancelled: number;
  trialing: number;
  pastDue: number;
  blocked: number;
}

// ========================================
// Component
// ========================================

export default function AdminBillingPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<Subscriber | null>(null);
  const [actionDialog, setActionDialog] = useState<{ type: string; user: Subscriber } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [extendDays, setExtendDays] = useState("30");
  const [newTier, setNewTier] = useState("");
  const [freeTier, setFreeTier] = useState("PRO");
  const [freeDuration, setFreeDuration] = useState("365"); // ימים
  const [freeNote, setFreeNote] = useState("");

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search.trim()) params.set("search", search.trim());
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterTier !== "all") params.set("tier", filterTier);

      const res = await fetch(`/api/admin/subscribers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSubscribers(data.subscribers);
        setStats(data.stats);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch {
      toast.error("שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
  }, [page, search, filterStatus, filterTier]);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  const handleSearch = () => {
    // אם page כבר 1 - לא ישתנה ב-setPage, אז קוראים ישירות
    // אם page > 1 - setPage(1) ישנה אותו וה-useEffect יפעיל fetch
    if (page === 1) {
      fetchSubscribers();
    } else {
      setPage(1);
    }
  };

  // ========================================
  // פעולות על מנוי
  // ========================================

  const handleBlock = async (userId: string, block: boolean) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBlocked: block }),
      });
      if (res.ok) {
        toast.success(block ? "המשתמש נחסם" : "המשתמש שוחרר");
        fetchSubscribers();
        setActionDialog(null);
      }
    } catch {
      toast.error("שגיאה");
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeTier = async (userId: string) => {
    if (!newTier) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionStatus: "ACTIVE", aiTier: newTier }),
      });
      if (res.ok) {
        toast.success("המסלול עודכן");
        fetchSubscribers();
        setActionDialog(null);
      }
    } catch {
      toast.error("שגיאה");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtend = async (userId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extendDays: parseInt(extendDays) }),
      });
      if (res.ok) {
        toast.success(`המנוי הוארך ב-${extendDays} ימים`);
        fetchSubscribers();
        setActionDialog(null);
      }
    } catch {
      toast.error("שגיאה");
    } finally {
      setActionLoading(false);
    }
  };

  const handleGrantFree = async (userId: string) => {
    setActionLoading(true);
    try {
      const days = parseInt(freeDuration);
      const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          aiTier: freeTier,
          grantFree: true,
          freeNote: freeNote || undefined,
          subscriptionEndsAt: endDate.toISOString(),
        }),
      });
      if (res.ok) {
        toast.success(`מנוי חינם ניתן + מייל נשלח! ${freeTier} ל-${days} ימים`);
        fetchSubscribers();
        setActionDialog(null);
        setFreeNote("");
      } else {
        toast.error("שגיאה במתן מנוי חינם");
      }
    } catch {
      toast.error("שגיאה");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeFree = async (userId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeFree: true }),
      });
      if (res.ok) {
        toast.success("מנוי חינם בוטל + מייל עם קישור לתשלום נשלח");
        fetchSubscribers();
        setActionDialog(null);
      } else {
        toast.error("שגיאה");
      }
    } catch {
      toast.error("שגיאה");
    } finally {
      setActionLoading(false);
    }
  };

  // ========================================
  // Helpers
  // ========================================

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("he-IL");
  };

  const formatDateTime = (d: string) => {
    return new Date(d).toLocaleString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE": return <Badge className="bg-green-500/20 text-green-600 border-green-600/30">פעיל</Badge>;
      case "TRIALING": return <Badge className="bg-blue-500/20 text-blue-600 border-blue-600/30">ניסיון</Badge>;
      case "PAST_DUE": return <Badge className="bg-red-500/20 text-red-600 border-red-600/30">לתשלום</Badge>;
      case "CANCELLED": return <Badge className="bg-gray-500/20 text-gray-600 border-gray-600/30">בוטל</Badge>;
      case "PAUSED": return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-600/30">מושהה</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case "ESSENTIAL": return <Zap className="h-3.5 w-3.5 text-slate-500" />;
      case "PRO": return <Crown className="h-3.5 w-3.5 text-blue-500" />;
      case "ENTERPRISE": return <Building className="h-3.5 w-3.5 text-purple-500" />;
      default: return null;
    }
  };

  const getActionLabel = (a: string) => {
    switch (a) {
      case "SUBSCRIPTION_CREATE": return "יצירת מנוי";
      case "SUBSCRIPTION_UPGRADE": return "שדרוג";
      default: return a;
    }
  };

  const paymentStatusLabel = (s: string) => {
    switch (s) {
      case "PAID": return <Badge className="bg-green-100 text-green-700 text-xs">שולם</Badge>;
      case "PENDING": return <Badge className="bg-yellow-100 text-yellow-700 text-xs">ממתין</Badge>;
      case "OVERDUE": return <Badge className="bg-red-100 text-red-700 text-xs">באיחור</Badge>;
      case "CANCELLED": return <Badge className="bg-gray-100 text-gray-700 text-xs">בוטל</Badge>;
      case "REFUNDED": return <Badge className="bg-purple-100 text-purple-700 text-xs">הוחזר</Badge>;
      default: return <Badge variant="outline" className="text-xs">{s}</Badge>;
    }
  };

  // ========================================
  // Render
  // ========================================

  return (
    <div className="space-y-4 animate-fade-in">
      {/* כותרת */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="h-6 w-6" />
          ניהול מנויים ותשלומים
        </h1>
        <p className="text-sm text-muted-foreground">
          חיפוש, צפייה, שדרוג, חסימה ופרטי מנויים - הכל במקום אחד
        </p>
      </div>

      {/* ========================================
          סטטיסטיקות מהירות
          ======================================== */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-lg font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">סה״כ</div>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <div>
                <div className="text-lg font-bold text-green-600">{stats.active}</div>
                <div className="text-xs text-muted-foreground">פעילים</div>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-lg font-bold text-blue-600">{stats.trialing}</div>
                <div className="text-xs text-muted-foreground">ניסיון</div>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-gray-500" />
              <div>
                <div className="text-lg font-bold text-gray-500">{stats.cancelled}</div>
                <div className="text-xs text-muted-foreground">ביטלו</div>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <div>
                <div className="text-lg font-bold text-red-500">{stats.pastDue}</div>
                <div className="text-xs text-muted-foreground">פיגור</div>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-red-700" />
              <div>
                <div className="text-lg font-bold text-red-700">{stats.blocked}</div>
                <div className="text-xs text-muted-foreground">חסומים</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================
          חיפוש וסינון
          ======================================== */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs mb-1 block">חיפוש לפי שם / מייל / טלפון</Label>
              <Input
                placeholder="הקלד שם פרטי, משפחה, מייל..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="h-9"
              />
            </div>
            <div className="w-32">
              <Label className="text-xs mb-1 block">סטטוס</Label>
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  <SelectItem value="ACTIVE">פעיל</SelectItem>
                  <SelectItem value="TRIALING">ניסיון</SelectItem>
                  <SelectItem value="CANCELLED">בוטל</SelectItem>
                  <SelectItem value="PAST_DUE">פיגור</SelectItem>
                  <SelectItem value="PAUSED">מושהה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <Label className="text-xs mb-1 block">מסלול</Label>
              <Select value={filterTier} onValueChange={(v) => { setFilterTier(v); setPage(1); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  <SelectItem value="ESSENTIAL">Essential</SelectItem>
                  <SelectItem value="PRO">Pro</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-9" onClick={handleSearch}>
              <Search className="h-4 w-4 ml-1" />
              חפש
            </Button>
            {(search || filterStatus !== "all" || filterTier !== "all") && (
              <Button size="sm" variant="ghost" className="h-9" onClick={() => {
                setSearch(""); setFilterStatus("all"); setFilterTier("all"); setPage(1);
              }}>
                נקה
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ========================================
          טבלת מנויים
          ======================================== */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              מנויים ({total})
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchSubscribers}>
              <Loader2 className={`h-3 w-3 ml-1 ${loading ? "animate-spin" : ""}`} />
              רענן
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : subscribers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>לא נמצאו מנויים</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-8"></TableHead>
                    <TableHead className="text-right">שם</TableHead>
                    <TableHead className="text-right">מייל</TableHead>
                    <TableHead className="text-right">מסלול</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">תוקף עד</TableHead>
                    <TableHead className="text-right">חסום</TableHead>
                    <TableHead className="text-right">תנאים</TableHead>
                    <TableHead className="text-center">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscribers.map((sub) => (
                    <Fragment key={sub.id}>
                      <TableRow
                        className={`cursor-pointer hover:bg-muted/50 ${expandedUser === sub.id ? "bg-muted/30" : ""}`}
                        onClick={() => setExpandedUser(expandedUser === sub.id ? null : sub.id)}
                      >
                        <TableCell className="w-8 px-2">
                          <ChevronLeft className={`h-4 w-4 transition-transform ${expandedUser === sub.id ? "rotate-90" : ""}`} />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{sub.name || "ללא שם"}</div>
                          {sub.phone && <div className="text-xs text-muted-foreground">{sub.phone}</div>}
                        </TableCell>
                        <TableCell className="text-sm">{sub.email || "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getTierIcon(sub.aiTier)}
                            <span className="text-sm">{sub.aiTier}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getStatusBadge(sub.subscriptionStatus)}
                            {sub.isFreeSubscription && (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                                <Gift className="h-3 w-3 ml-0.5" />חינם
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(sub.subscriptionEndsAt)}
                        </TableCell>
                        <TableCell>
                          {sub.isBlocked ? (
                            <Badge variant="destructive" className="text-xs">חסום</Badge>
                          ) : (
                            <span className="text-xs text-green-600">תקין</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {sub.termsAcceptances.length > 0 ? (
                            <Badge variant="outline" className="text-xs gap-1">
                              <FileCheck className="h-3 w-3" />
                              {sub.termsAcceptances.length}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0"
                              title="פרטים מלאים"
                              onClick={() => setSelectedUser(sub)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0"
                              title="שדרוג מסלול"
                              onClick={() => { setNewTier(sub.aiTier); setActionDialog({ type: "upgrade", user: sub }); }}
                            >
                              <ArrowUpCircle className="h-3.5 w-3.5 text-blue-600" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0"
                              title="הארכת מנוי"
                              onClick={() => setActionDialog({ type: "extend", user: sub })}
                            >
                              <CalendarPlus className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            {sub.isFreeSubscription ? (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0"
                                title="בטל מנוי חינם (העבר לתשלום)"
                                onClick={() => setActionDialog({ type: "revoke-free", user: sub })}
                              >
                                <Gift className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            ) : (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0"
                                title="מנוי חינם"
                                onClick={() => { setFreeTier("PRO"); setFreeDuration("365"); setFreeNote(""); setActionDialog({ type: "free", user: sub }); }}
                              >
                                <Gift className="h-3.5 w-3.5 text-amber-500" />
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0"
                              title={sub.isBlocked ? "שחרר" : "חסום"}
                              onClick={() => setActionDialog({ type: "block", user: sub })}
                            >
                              <Ban className={`h-3.5 w-3.5 ${sub.isBlocked ? "text-green-600" : "text-red-600"}`} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* שורה מורחבת - תשלומים ותנאים */}
                      {expandedUser === sub.id && (
                        <TableRow key={`${sub.id}-expanded`}>
                          <TableCell colSpan={9} className="bg-muted/20 p-3">
                            <div className="grid md:grid-cols-2 gap-3">
                              {/* תשלומים */}
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                                  <CreditCard className="h-3 w-3" /> תשלומים אחרונים
                                </h4>
                                {sub.subscriptionPayments.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">אין תשלומים</p>
                                ) : (
                                  <div className="space-y-1">
                                    {sub.subscriptionPayments.map(p => (
                                      <div key={p.id} className="flex items-center justify-between bg-background rounded px-2 py-1 text-xs">
                                        <div className="flex items-center gap-2">
                                          {paymentStatusLabel(p.status)}
                                          <span className="font-medium">₪{Number(p.amount)}</span>
                                        </div>
                                        <span className="text-muted-foreground">
                                          {formatDate(p.paidAt || p.createdAt)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {/* אישורי תנאים */}
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                                  <Shield className="h-3 w-3" /> אישורי תנאים
                                </h4>
                                {sub.termsAcceptances.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">אין אישורי תנאים</p>
                                ) : (
                                  <div className="space-y-1">
                                    {sub.termsAcceptances.map(t => (
                                      <div key={t.id} className="flex items-center justify-between bg-background rounded px-2 py-1 text-xs">
                                        <div className="flex items-center gap-2">
                                          <FileCheck className="h-3 w-3 text-blue-500" />
                                          <span>{getActionLabel(t.action)}</span>
                                          {t.planSelected && <Badge variant="outline" className="text-[10px] py-0">{t.planSelected}</Badge>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {t.amountAgreed && <span className="text-muted-foreground">₪{Number(t.amountAgreed)}</span>}
                                          <span className="text-muted-foreground">{formatDate(t.createdAt)}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* מידע נוסף */}
                            <div className="mt-2 pt-2 border-t flex flex-wrap gap-4 text-xs text-muted-foreground">
                              <span>הצטרף: {formatDate(sub.createdAt)}</span>
                              <span>התחלת מנוי: {formatDate(sub.subscriptionStartedAt)}</span>
                              {sub.trialEndsAt && <span>סוף ניסיון: {formatDate(sub.trialEndsAt)}</span>}
                              <span>ID: <code className="font-mono text-[10px]">{sub.id}</code></span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronRight className="h-4 w-4" /> הקודם
          </Button>
          <span className="text-sm text-muted-foreground">עמוד {page} מתוך {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            הבא <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ========================================
          דיאלוג פרטים מלאים
          ======================================== */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              פרטי מנוי - {selectedUser?.name || selectedUser?.email}
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info">פרטים</TabsTrigger>
                <TabsTrigger value="payments">תשלומים ({selectedUser.subscriptionPayments.length})</TabsTrigger>
                <TabsTrigger value="terms">תנאים ({selectedUser.termsAcceptances.length})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="info" className="space-y-3 mt-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">שם:</span> <span className="font-medium">{selectedUser.name || "-"}</span></div>
                  <div><span className="text-muted-foreground">מייל:</span> <span className="font-medium">{selectedUser.email || "-"}</span></div>
                  <div><span className="text-muted-foreground">טלפון:</span> <span className="font-medium">{selectedUser.phone || "-"}</span></div>
                  <div><span className="text-muted-foreground">מסלול:</span> <span className="font-medium flex items-center gap-1">{getTierIcon(selectedUser.aiTier)} {selectedUser.aiTier}</span></div>
                  <div><span className="text-muted-foreground">סטטוס:</span> {getStatusBadge(selectedUser.subscriptionStatus)}</div>
                  <div><span className="text-muted-foreground">חסום:</span> {selectedUser.isBlocked ? <Badge variant="destructive">כן</Badge> : <span className="text-green-600">לא</span>}</div>
                  <div><span className="text-muted-foreground">תחילת מנוי:</span> <span className="font-medium">{formatDate(selectedUser.subscriptionStartedAt)}</span></div>
                  <div><span className="text-muted-foreground">תוקף עד:</span> <span className="font-medium">{formatDate(selectedUser.subscriptionEndsAt)}</span></div>
                  <div><span className="text-muted-foreground">הצטרף:</span> <span className="font-medium">{formatDate(selectedUser.createdAt)}</span></div>
                  {selectedUser.trialEndsAt && <div><span className="text-muted-foreground">סוף ניסיון:</span> <span className="font-medium">{formatDate(selectedUser.trialEndsAt)}</span></div>}
                  {selectedUser.isFreeSubscription && (
                    <div className="col-span-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300 font-medium mb-1">
                        <Gift className="h-4 w-4" />
                        מנוי חינם
                      </div>
                      {selectedUser.freeSubscriptionNote && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">סיבה: {selectedUser.freeSubscriptionNote}</p>
                      )}
                      {selectedUser.freeSubscriptionGrantedAt && (
                        <p className="text-xs text-muted-foreground">ניתן ב: {formatDate(selectedUser.freeSubscriptionGrantedAt)}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t">
                  <div className="text-xs text-muted-foreground">User ID: <code className="font-mono">{selectedUser.id}</code></div>
                </div>
              </TabsContent>

              <TabsContent value="payments" className="mt-3">
                {selectedUser.subscriptionPayments.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">אין תשלומים</p>
                ) : (
                  <div className="space-y-2">
                    {selectedUser.subscriptionPayments.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm">
                        <div className="flex items-center gap-3">
                          {paymentStatusLabel(p.status)}
                          <span className="font-bold">₪{Number(p.amount)}</span>
                          {p.description && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{p.description}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDateTime(p.paidAt || p.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="terms" className="mt-3">
                {selectedUser.termsAcceptances.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">אין אישורי תנאים</p>
                ) : (
                  <div className="space-y-2">
                    {selectedUser.termsAcceptances.map(t => (
                      <div key={t.id} className="p-2 bg-muted/50 rounded text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileCheck className="h-4 w-4 text-blue-500" />
                            <span className="font-medium">{getActionLabel(t.action)}</span>
                            {t.planSelected && <Badge variant="outline" className="text-xs">{t.planSelected}</Badge>}
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</span>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          {t.amountAgreed && <span>סכום: ₪{Number(t.amountAgreed)}</span>}
                          <span>גרסה: v{t.termsVersion}</span>
                          {t.ipAddress && <span>IP: {t.ipAddress}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================
          דיאלוגי פעולות
          ======================================== */}
      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "block" && (actionDialog.user.isBlocked ? "שחרור חסימה" : "חסימת משתמש")}
              {actionDialog?.type === "upgrade" && "שינוי מסלול"}
              {actionDialog?.type === "extend" && "הארכת מנוי"}
              {actionDialog?.type === "free" && "מנוי חינם"}
              {actionDialog?.type === "revoke-free" && "ביטול מנוי חינם"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog?.user.name || actionDialog?.user.email}
            </DialogDescription>
          </DialogHeader>

          {actionDialog?.type === "block" && (
            <p className="text-sm">
              {actionDialog.user.isBlocked 
                ? "האם לשחרר את החסימה? המשתמש יוכל להתחבר מחדש."
                : "האם לחסום את המשתמש? לא יוכל להתחבר למערכת."}
            </p>
          )}

          {actionDialog?.type === "upgrade" && (
            <div className="space-y-3">
              <p className="text-sm">מסלול נוכחי: <strong>{actionDialog.user.aiTier}</strong></p>
              <div>
                <Label>מסלול חדש</Label>
                <Select value={newTier} onValueChange={setNewTier}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ESSENTIAL">Essential</SelectItem>
                    <SelectItem value="PRO">Pro</SelectItem>
                    <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {actionDialog?.type === "extend" && (
            <div className="space-y-3">
              <p className="text-sm">
                תוקף נוכחי: <strong>{formatDate(actionDialog.user.subscriptionEndsAt)}</strong>
              </p>
              <div>
                <Label>הארכה בימים</Label>
                <Input 
                  type="number" 
                  value={extendDays} 
                  onChange={(e) => setExtendDays(e.target.value)}
                  min="1"
                />
              </div>
            </div>
          )}

          {actionDialog?.type === "free" && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex gap-2 items-center text-sm text-amber-800 dark:text-amber-300">
                  <Gift className="h-4 w-4 shrink-0" />
                  <span>מנוי חינם - לא יחויב בתשלום. ניתן לבטל בכל עת.</span>
                </div>
              </div>
              <div>
                <Label>מסלול</Label>
                <Select value={freeTier} onValueChange={setFreeTier}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ESSENTIAL">Essential</SelectItem>
                    <SelectItem value="PRO">Pro</SelectItem>
                    <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>תקופה (ימים)</Label>
                <Select value={freeDuration} onValueChange={setFreeDuration}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 ימים (חודש)</SelectItem>
                    <SelectItem value="90">90 ימים (3 חודשים)</SelectItem>
                    <SelectItem value="180">180 ימים (חצי שנה)</SelectItem>
                    <SelectItem value="365">365 ימים (שנה)</SelectItem>
                    <SelectItem value="3650">10 שנים (ללא הגבלה)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>הערה (למה חינם?)</Label>
                <Input
                  placeholder="לדוגמה: שותף, בטא טסטר, הנחה מיוחדת..."
                  value={freeNote}
                  onChange={(e) => setFreeNote(e.target.value)}
                />
              </div>
            </div>
          )}

          {actionDialog?.type === "revoke-free" && (
            <div className="space-y-3">
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex gap-2 items-center text-sm text-red-800 dark:text-red-300">
                  <Gift className="h-4 w-4 shrink-0" />
                  <span>ביטול המנוי החינמי יעביר את המשתמש לסטטוס "בוטל".</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                למשתמש תישלח הודעה במייל עם קישור לדף התשלום.
                לאחר שישלם, המנוי יופעל מחדש אוטומטית דרך ה-webhook.
              </p>
              {actionDialog.user.freeSubscriptionNote && (
                <p className="text-xs text-muted-foreground">
                  סיבת מנוי חינם: <span className="font-medium">{actionDialog.user.freeSubscriptionNote}</span>
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionDialog(null)}>ביטול</Button>
            <Button 
              onClick={() => {
                if (!actionDialog) return;
                if (actionDialog.type === "block") handleBlock(actionDialog.user.id, !actionDialog.user.isBlocked);
                if (actionDialog.type === "upgrade") handleChangeTier(actionDialog.user.id);
                if (actionDialog.type === "extend") handleExtend(actionDialog.user.id);
                if (actionDialog.type === "free") handleGrantFree(actionDialog.user.id);
                if (actionDialog.type === "revoke-free") handleRevokeFree(actionDialog.user.id);
              }}
              disabled={actionLoading}
              variant={
                (actionDialog?.type === "block" && !actionDialog.user.isBlocked) || 
                actionDialog?.type === "revoke-free" 
                  ? "destructive" 
                  : "default"
              }
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 
                actionDialog?.type === "free" ? "תן מנוי חינם" : 
                actionDialog?.type === "revoke-free" ? "בטל חינם ושלח מייל" :
                "אישור"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
