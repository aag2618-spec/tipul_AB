"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bell,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  RefreshCw,
  Mail,
  CreditCard,
  Users,
  Zap,
  XCircle,
  Eye,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface AdminAlert {
  id: string;
  type: string;
  priority: string;
  status: string;
  title: string;
  message: string;
  userId: string | null;
  actionRequired: string | null;
  actionTaken: string | null;
  resolvedAt: string | null;
  scheduledFor: string | null;
  emailSent: boolean;
  createdAt: string;
}

const ALERT_TYPES = {
  PAYMENT_DUE: { label: "תשלום קרב", icon: CreditCard, color: "text-yellow-500" },
  PAYMENT_OVERDUE: { label: "תשלום באיחור", icon: AlertCircle, color: "text-red-500" },
  PAYMENT_FAILED: { label: "תשלום נכשל", icon: XCircle, color: "text-red-600" },
  SUBSCRIPTION_EXPIRING: { label: "מנוי עומד לפוג", icon: Clock, color: "text-orange-500" },
  SUBSCRIPTION_EXPIRED: { label: "מנוי פג", icon: AlertTriangle, color: "text-red-500" },
  HIGH_AI_USAGE: { label: "שימוש גבוה AI", icon: Zap, color: "text-purple-500" },
  NEW_USER: { label: "משתמש חדש", icon: Users, color: "text-green-500" },
  USER_BLOCKED: { label: "משתמש נחסם", icon: XCircle, color: "text-gray-500" },
  TIER_CHANGE_REQUEST: { label: "בקשת שינוי תוכנית", icon: RefreshCw, color: "text-blue-500" },
  MANUAL_REMINDER: { label: "תזכורת ידנית", icon: Bell, color: "text-blue-400" },
  SYSTEM: { label: "מערכת", icon: AlertCircle, color: "text-gray-400" },
};

const PRIORITY_BADGES = {
  URGENT: { label: "דחוף", variant: "destructive" as const },
  HIGH: { label: "גבוה", variant: "default" as const, className: "bg-orange-500" },
  MEDIUM: { label: "בינוני", variant: "secondary" as const },
  LOW: { label: "נמוך", variant: "outline" as const },
};

const STATUS_BADGES = {
  PENDING: { label: "ממתין", variant: "destructive" as const },
  IN_PROGRESS: { label: "בטיפול", variant: "default" as const, className: "bg-blue-500" },
  RESOLVED: { label: "טופל", variant: "secondary" as const, className: "bg-green-500 text-white" },
  DISMISSED: { label: "נדחה", variant: "outline" as const },
  SNOOZED: { label: "נדחה לאחר", variant: "outline" as const },
};

export default function AdminAlertsPage() {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [counts, setCounts] = useState({ PENDING: 0, IN_PROGRESS: 0, RESOLVED: 0, DISMISSED: 0, SNOOZED: 0 });
  const [pendingByPriority, setPendingByPriority] = useState({ URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("PENDING");
  const [filterType, setFilterType] = useState("all");
  
  // New alert dialog
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [newAlert, setNewAlert] = useState({
    type: "MANUAL_REMINDER",
    priority: "MEDIUM",
    title: "",
    message: "",
    actionRequired: "",
  });

  // View dialog
  const [selectedAlert, setSelectedAlert] = useState<AdminAlert | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [actionTaken, setActionTaken] = useState("");

  useEffect(() => {
    fetchAlerts();
  }, [filterStatus, filterType]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterType !== "all") params.set("type", filterType);

      const response = await fetch(`/api/admin/alerts?${params}`);
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts);
        setCounts(data.counts);
        setPendingByPriority(data.pendingByPriority);
      } else {
        toast.error("שגיאה בטעינת ההתראות");
      }
    } catch (error) {
      console.error("Error fetching alerts:", error);
      toast.error("שגיאה בטעינת ההתראות");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAlert = async () => {
    if (!newAlert.title || !newAlert.message) {
      toast.error("נא למלא כותרת והודעה");
      return;
    }

    try {
      const response = await fetch("/api/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAlert),
      });

      if (response.ok) {
        toast.success("התראה נוצרה בהצלחה");
        setIsNewDialogOpen(false);
        setNewAlert({ type: "MANUAL_REMINDER", priority: "MEDIUM", title: "", message: "", actionRequired: "" });
        fetchAlerts();
      } else {
        toast.error("שגיאה ביצירת ההתראה");
      }
    } catch (error) {
      toast.error("שגיאה ביצירת ההתראה");
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/admin/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, actionTaken: actionTaken || undefined }),
      });

      if (response.ok) {
        toast.success("סטטוס עודכן");
        setIsViewDialogOpen(false);
        setSelectedAlert(null);
        setActionTaken("");
        fetchAlerts();
      } else {
        toast.error("שגיאה בעדכון");
      }
    } catch (error) {
      toast.error("שגיאה בעדכון");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("האם למחוק את ההתראה?")) return;

    try {
      const response = await fetch(`/api/admin/alerts/${id}`, { method: "DELETE" });
      if (response.ok) {
        toast.success("התראה נמחקה");
        fetchAlerts();
      } else {
        toast.error("שגיאה במחיקה");
      }
    } catch (error) {
      toast.error("שגיאה במחיקה");
    }
  };

  const getAlertTypeInfo = (type: string) => {
    return ALERT_TYPES[type as keyof typeof ALERT_TYPES] || { label: type, icon: Bell, color: "text-gray-500" };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-8 w-8 text-amber-500" />
            מרכז התראות
          </h1>
          <p className="text-slate-400 mt-1">ניהול התראות, תזכורות ומעקב תשלומים</p>
        </div>

        <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-amber-500 hover:bg-amber-600 text-black">
              <Plus className="ml-2 h-4 w-4" />
              התראה חדשה
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white">יצירת התראה/תזכורת</DialogTitle>
              <DialogDescription>צור תזכורת ידנית או התראה</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">סוג</label>
                  <Select
                    value={newAlert.type}
                    onValueChange={(v) => setNewAlert({ ...newAlert, type: v })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ALERT_TYPES).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">עדיפות</label>
                  <Select
                    value={newAlert.priority}
                    onValueChange={(v) => setNewAlert({ ...newAlert, priority: v })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="URGENT">דחוף</SelectItem>
                      <SelectItem value="HIGH">גבוה</SelectItem>
                      <SelectItem value="MEDIUM">בינוני</SelectItem>
                      <SelectItem value="LOW">נמוך</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">כותרת</label>
                <Input
                  value={newAlert.title}
                  onChange={(e) => setNewAlert({ ...newAlert, title: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                  placeholder="כותרת ההתראה..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">הודעה</label>
                <Textarea
                  value={newAlert.message}
                  onChange={(e) => setNewAlert({ ...newAlert, message: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                  placeholder="תוכן ההתראה..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">פעולה נדרשת (אופציונלי)</label>
                <Input
                  value={newAlert.actionRequired}
                  onChange={(e) => setNewAlert({ ...newAlert, actionRequired: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                  placeholder="מה צריך לעשות?"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsNewDialogOpen(false)} className="text-slate-400">
                ביטול
              </Button>
              <Button onClick={handleCreateAlert} className="bg-amber-500 hover:bg-amber-600 text-black">
                צור התראה
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-slate-900 border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors"
              onClick={() => setFilterStatus("PENDING")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">ממתינים לטיפול</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{counts.PENDING}</div>
            <p className="text-xs text-slate-500 mt-1">
              {pendingByPriority.URGENT > 0 && <span className="text-red-500">{pendingByPriority.URGENT} דחופים</span>}
              {pendingByPriority.URGENT > 0 && pendingByPriority.HIGH > 0 && " | "}
              {pendingByPriority.HIGH > 0 && <span className="text-orange-500">{pendingByPriority.HIGH} גבוהים</span>}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors"
              onClick={() => setFilterStatus("IN_PROGRESS")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">בטיפול</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{counts.IN_PROGRESS}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors"
              onClick={() => setFilterStatus("RESOLVED")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">טופלו</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{counts.RESOLVED}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors"
              onClick={() => setFilterStatus("all")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">סה"כ</CardTitle>
            <Bell className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {counts.PENDING + counts.IN_PROGRESS + counts.RESOLVED + counts.DISMISSED + counts.SNOOZED}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700">
                <SelectValue placeholder="סטטוס" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסטטוסים</SelectItem>
                <SelectItem value="PENDING">ממתין</SelectItem>
                <SelectItem value="IN_PROGRESS">בטיפול</SelectItem>
                <SelectItem value="RESOLVED">טופל</SelectItem>
                <SelectItem value="DISMISSED">נדחה</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48 bg-slate-800 border-slate-700">
                <SelectValue placeholder="סוג" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסוגים</SelectItem>
                {Object.entries(ALERT_TYPES).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={fetchAlerts} className="border-slate-700">
              <RefreshCw className="h-4 w-4 ml-2" />
              רענן
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alerts Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">רשימת התראות ({alerts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>אין התראות</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-400">סוג</TableHead>
                  <TableHead className="text-slate-400">עדיפות</TableHead>
                  <TableHead className="text-slate-400">כותרת</TableHead>
                  <TableHead className="text-slate-400">סטטוס</TableHead>
                  <TableHead className="text-slate-400">תאריך</TableHead>
                  <TableHead className="text-slate-400">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => {
                  const typeInfo = getAlertTypeInfo(alert.type);
                  const TypeIcon = typeInfo.icon;
                  const priorityInfo = PRIORITY_BADGES[alert.priority as keyof typeof PRIORITY_BADGES];
                  const statusInfo = STATUS_BADGES[alert.status as keyof typeof STATUS_BADGES];

                  return (
                    <TableRow key={alert.id} className="border-slate-800">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TypeIcon className={`h-4 w-4 ${typeInfo.color}`} />
                          <span className="text-sm text-slate-300">{typeInfo.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={priorityInfo.variant} className={priorityInfo.className}>
                          {priorityInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-white">{alert.title}</p>
                          <p className="text-xs text-slate-500 truncate max-w-xs">{alert.message}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant} className={statusInfo.className}>
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {format(new Date(alert.createdAt), "dd/MM/yyyy HH:mm", { locale: he })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedAlert(alert);
                              setIsViewDialogOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-400"
                            onClick={() => handleDelete(alert.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View/Edit Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {selectedAlert && (
                <>
                  {(() => {
                    const typeInfo = getAlertTypeInfo(selectedAlert.type);
                    const TypeIcon = typeInfo.icon;
                    return <TypeIcon className={`h-5 w-5 ${typeInfo.color}`} />;
                  })()}
                  {selectedAlert.title}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500">סוג</label>
                  <p className="text-white">{getAlertTypeInfo(selectedAlert.type).label}</p>
                </div>
                <div>
                  <label className="text-xs text-slate-500">עדיפות</label>
                  <Badge variant={PRIORITY_BADGES[selectedAlert.priority as keyof typeof PRIORITY_BADGES]?.variant}>
                    {PRIORITY_BADGES[selectedAlert.priority as keyof typeof PRIORITY_BADGES]?.label}
                  </Badge>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500">הודעה</label>
                <p className="text-white whitespace-pre-wrap">{selectedAlert.message}</p>
              </div>

              {selectedAlert.actionRequired && (
                <div>
                  <label className="text-xs text-slate-500">פעולה נדרשת</label>
                  <p className="text-amber-400">{selectedAlert.actionRequired}</p>
                </div>
              )}

              {selectedAlert.actionTaken && (
                <div>
                  <label className="text-xs text-slate-500">מה נעשה</label>
                  <p className="text-green-400">{selectedAlert.actionTaken}</p>
                </div>
              )}

              <div>
                <label className="text-xs text-slate-500">תאריך יצירה</label>
                <p className="text-slate-300">
                  {format(new Date(selectedAlert.createdAt), "dd/MM/yyyy HH:mm", { locale: he })}
                </p>
              </div>

              {selectedAlert.status === "PENDING" || selectedAlert.status === "IN_PROGRESS" ? (
                <div className="space-y-2 border-t border-slate-700 pt-4">
                  <label className="text-sm font-medium text-slate-300">תיעוד פעולה</label>
                  <Textarea
                    value={actionTaken}
                    onChange={(e) => setActionTaken(e.target.value)}
                    className="bg-slate-800 border-slate-700"
                    placeholder="מה עשית? (לדוגמה: שלחתי מייל ללקוח, התקשרתי, וכו')"
                    rows={2}
                  />
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {selectedAlert?.status === "PENDING" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleUpdateStatus(selectedAlert.id, "IN_PROGRESS")}
                  className="border-blue-500 text-blue-500"
                >
                  סמן כ"בטיפול"
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleUpdateStatus(selectedAlert.id, "DISMISSED")}
                  className="border-slate-500 text-slate-400"
                >
                  דחה
                </Button>
              </>
            )}
            {(selectedAlert?.status === "PENDING" || selectedAlert?.status === "IN_PROGRESS") && (
              <Button
                onClick={() => handleUpdateStatus(selectedAlert.id, "RESOLVED")}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 ml-2" />
                סמן כ"טופל"
              </Button>
            )}
            <Button variant="ghost" onClick={() => setIsViewDialogOpen(false)} className="text-slate-400">
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
