"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, ChevronRight, ChevronLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const ACTION_LABELS: Record<string, string> = {
  block_user: "חסימת משתמש",
  unblock_user: "ביטול חסימת משתמש",
  grant_trial: "הענקת ניסיון",
  change_tier: "שינוי תוכנית",
  create_coupon: "יצירת קופון",
  delete_coupon: "מחיקת קופון",
  create_announcement: "יצירת הודעה",
  update_announcement: "עדכון הודעה",
  delete_announcement: "מחיקת הודעה",
  update_ai_settings: "עדכון הגדרות AI",
  reset_password: "איפוס סיסמה",
  create_user: "יצירת משתמש",
  delete_user: "מחיקת משתמש",
  update_user: "עדכון משתמש",
  toggle_feature_flag: "שינוי פיצ'ר",
  create_feature_flag: "יצירת פיצ'ר",
  delete_feature_flag: "מחיקת פיצ'ר",
  grant_free_subscription: "הענקת מנוי חינם",
  resolve_alert: "טיפול בהתראה",
};

interface AuditLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
  admin: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [filterAction, setFilterAction] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (filterAction && filterAction !== "all") params.set("action", filterAction);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);

      const res = await fetch(`/api/admin/audit-log?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      setLogs(data.logs);
      setTotalPages(data.totalPages);
      setTotal(data.total);
      if (data.actions) setActions(data.actions);
    } catch {
      toast.error("שגיאה בטעינת לוג הפעולות");
    } finally {
      setLoading(false);
    }
  }, [page, filterAction, filterFrom, filterTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function parseDetails(details: string | null): string {
    if (!details) return "—";
    try {
      const obj = JSON.parse(details);
      return Object.entries(obj)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
    } catch {
      return details;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">לוג פעולות</h1>
          <p className="text-muted-foreground">
            מעקב אחר כל פעולות המנהלים במערכת ({total} פעולות)
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm">סינון</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-52">
              <label className="text-xs text-muted-foreground mb-1 block">
                סוג פעולה
              </label>
              <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(1); }}>
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue placeholder="הכל" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACTION_LABELS[a] || a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                מתאריך
              </label>
              <Input
                type="date"
                value={filterFrom}
                onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }}
                className="bg-muted border-border w-40"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                עד תאריך
              </label>
              <Input
                type="date"
                value={filterTo}
                onChange={(e) => { setFilterTo(e.target.value); setPage(1); }}
                className="bg-muted border-border w-40"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilterAction("");
                setFilterFrom("");
                setFilterTo("");
                setPage(1);
              }}
              className="border-border"
            >
              <RefreshCw className="h-4 w-4 ml-1" />
              נקה סינון
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-right">תאריך</TableHead>
                <TableHead className="text-right">מנהל</TableHead>
                <TableHead className="text-right">פעולה</TableHead>
                <TableHead className="text-right">יעד</TableHead>
                <TableHead className="text-right">פרטים</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    טוען...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    אין פעולות להצגה
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} className="border-border">
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.admin.name || log.admin.email || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-muted text-foreground">
                        {ACTION_LABELS[log.action] || log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.targetType}
                      {log.targetId && (
                        <span className="text-xs mr-1 opacity-60">
                          ({log.targetId.slice(0, 8)}...)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {parseDetails(log.details)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="border-border"
          >
            <ChevronRight className="h-4 w-4" />
            הקודם
          </Button>
          <span className="text-sm text-muted-foreground">
            עמוד {page} מתוך {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="border-border"
          >
            הבא
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
