"use client";

// R5 (סבב 17e, 2026-05-20) — דשבורד אירועי אבטחה. ADMIN בלבד.
// תיעוד אירועי דליפה/חדירה/כשל לפי תקנות הגנת הפרטיות 2017 §11.

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Plus,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

const SEVERITY_LABELS: Record<string, string> = {
  LOW: "נמוך",
  MEDIUM: "בינוני",
  HIGH: "גבוה",
  CRITICAL: "קריטי",
};
const SEVERITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

const CATEGORY_LABELS: Record<string, string> = {
  UNAUTHORIZED_ACCESS: "גישה לא מורשית",
  DATA_LEAK: "דליפת נתונים",
  CREDENTIAL_COMPROMISE: "חשיפת credentials",
  PHISHING: "Phishing",
  SYSTEM_FAILURE: "תקלת מערכת",
  PHYSICAL_LOSS: "אובדן פיזי",
  THIRD_PARTY: "ספק חיצוני",
  OTHER: "אחר",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "פתוח",
  INVESTIGATING: "בחקירה",
  CONTAINED: "נעצר",
  RESOLVED: "נסגר",
  FALSE_ALARM: "אזעקת שווא",
};

interface BreachIncident {
  id: string;
  detectedAt: string;
  occurredAt: string | null;
  severity: string;
  category: string;
  title: string;
  description: string;
  affectedClientsCount: number;
  notifiedRegistrarAt: string | null;
  notifiedClientsAt: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  status: string;
  reportedByNameSnapshot: string;
  createdAt: string;
}

export default function BreachIncidentsPage() {
  const [items, setItems] = useState<BreachIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (severityFilter && severityFilter !== "all") params.set("severity", severityFilter);
      const res = await fetch(`/api/admin/breach-incidents?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setItems(data.items);
    } catch {
      toast.error("שגיאה בטעינת אירועי האבטחה");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  return (
    <div className="container mx-auto py-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-red-600" />
            אירועי אבטחה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            תיעוד ומעקב אירועי אבטחה לפי תקנות הגנת הפרטיות (אבטחת מידע) 2017 §11.
            <br />
            <span className="font-semibold text-red-700">
              חובה לדווח לרשם הגנת הפרטיות תוך 72 שעות מגילוי אירוע חמור.
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchItems} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 ml-1" />
            רענן
          </Button>
          <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-1" />
                תיעוד אירוע חדש
              </Button>
            </DialogTrigger>
            <NewIncidentDialog
              onCreated={() => {
                setNewDialogOpen(false);
                void fetchItems();
              }}
            />
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">סינון</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs">סטטוס</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="הכל" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs">חומרה</Label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="הכל" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  {Object.entries(SEVERITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{loading ? "טוען..." : `${items.length} אירועים`}</CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>אין אירועי אבטחה מתועדים. זה חדשות טובות.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>חומרה</TableHead>
                  <TableHead>קטגוריה</TableHead>
                  <TableHead>כותרת</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>מטופלים</TableHead>
                  <TableHead>זוהה</TableHead>
                  <TableHead>דווח לרשם</TableHead>
                  <TableHead>מדווח</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <IncidentRow
                    key={item.id}
                    item={item}
                    onUpdated={fetchItems}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IncidentRow({
  item,
  onUpdated,
}: {
  item: BreachIncident;
  onUpdated: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const detected = new Date(item.detectedAt);
  const detectedStr = detected.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
  });
  const notifiedRegistrar = item.notifiedRegistrarAt
    ? new Date(item.notifiedRegistrarAt).toLocaleDateString("he-IL")
    : "—";
  const hoursSinceDetect =
    (Date.now() - detected.getTime()) / (1000 * 60 * 60);
  const overdueRegistrar =
    !item.notifiedRegistrarAt &&
    hoursSinceDetect > 72 &&
    item.status !== "FALSE_ALARM" &&
    (item.severity === "HIGH" || item.severity === "CRITICAL");

  return (
    <TableRow className={overdueRegistrar ? "bg-red-50" : ""}>
      <TableCell>
        <Badge className={SEVERITY_COLORS[item.severity]}>
          {SEVERITY_LABELS[item.severity] ?? item.severity}
        </Badge>
      </TableCell>
      <TableCell className="text-sm">
        {CATEGORY_LABELS[item.category] ?? item.category}
      </TableCell>
      <TableCell className="max-w-[280px]">
        <div className="font-medium truncate" title={item.title}>
          {item.title}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{STATUS_LABELS[item.status] ?? item.status}</Badge>
      </TableCell>
      <TableCell className="text-sm text-center">
        {item.affectedClientsCount}
      </TableCell>
      <TableCell className="text-xs">{detectedStr}</TableCell>
      <TableCell className="text-xs">
        {overdueRegistrar ? (
          <span className="text-red-700 font-bold">חרגת מ-72ש!</span>
        ) : (
          notifiedRegistrar
        )}
      </TableCell>
      <TableCell className="text-xs">{item.reportedByNameSnapshot}</TableCell>
      <TableCell>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              ערוך
            </Button>
          </DialogTrigger>
          <EditIncidentDialog
            item={item}
            onUpdated={() => {
              setEditOpen(false);
              onUpdated();
            }}
          />
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

function NewIncidentDialog({ onCreated }: { onCreated: () => void }) {
  const [severity, setSeverity] = useState("MEDIUM");
  const [category, setCategory] = useState("UNAUTHORIZED_ACCESS");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [affectedCount, setAffectedCount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (title.trim().length < 3 || description.trim().length < 10) {
      toast.error("נדרשים כותרת ותיאור (לפחות 3 ו-10 תווים)");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        severity,
        category,
        title: title.trim(),
        description: description.trim(),
      };
      if (occurredAt) body.occurredAt = new Date(occurredAt).toISOString();
      if (affectedCount) body.affectedClientsCount = Number(affectedCount);

      const res = await fetch("/api/admin/breach-incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "שגיאה");
      }
      toast.success("אירוע אבטחה תועד בהצלחה");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירת אירוע");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl" dir="rtl">
      <DialogHeader>
        <DialogTitle>תיעוד אירוע אבטחה חדש</DialogTitle>
        <DialogDescription>
          כל אירוע חמור (HIGH/CRITICAL) חייב להיות מדווח לרשם הגנת הפרטיות
          תוך 72 שעות מהגילוי.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>חומרה</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SEVERITY_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>קטגוריה</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>כותרת *</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="לדוגמה: דליפת רשימת אימיילים דרך Resend"
            maxLength={500}
          />
        </div>
        <div>
          <Label>תיאור מפורט *</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="מה קרה? מה נחשף? מתי? איך זוהה?"
            maxLength={10000}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>תאריך התרחשות (אם ידוע)</Label>
            <Input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
          <div>
            <Label>מספר מטופלים שנפגעו</Label>
            <Input
              type="number"
              min="0"
              value={affectedCount}
              onChange={(e) => setAffectedCount(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "שומר..." : "תעד אירוע"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditIncidentDialog({
  item,
  onUpdated,
}: {
  item: BreachIncident;
  onUpdated: () => void;
}) {
  const [status, setStatus] = useState(item.status);
  const [resolution, setResolution] = useState(item.resolution ?? "");
  const [notifiedRegistrar, setNotifiedRegistrar] = useState(
    item.notifiedRegistrarAt ? item.notifiedRegistrarAt.slice(0, 16) : ""
  );
  const [notifiedClients, setNotifiedClients] = useState(
    item.notifiedClientsAt ? item.notifiedClientsAt.slice(0, 16) : ""
  );
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { status };
      if (resolution.trim() !== (item.resolution ?? "").trim()) {
        body.resolution = resolution.trim() || null;
      }
      if (notifiedRegistrar) {
        body.notifiedRegistrarAt = new Date(notifiedRegistrar).toISOString();
      } else if (item.notifiedRegistrarAt) {
        body.notifiedRegistrarAt = null;
      }
      if (notifiedClients) {
        body.notifiedClientsAt = new Date(notifiedClients).toISOString();
      } else if (item.notifiedClientsAt) {
        body.notifiedClientsAt = null;
      }
      const res = await fetch(`/api/admin/breach-incidents/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "שגיאה");
      }
      toast.success("האירוע עודכן");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בעדכון");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl" dir="rtl">
      <DialogHeader>
        <DialogTitle>עדכון אירוע: {item.title}</DialogTitle>
        <DialogDescription>
          חומרה: {SEVERITY_LABELS[item.severity]} | קטגוריה:{" "}
          {CATEGORY_LABELS[item.category]}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="bg-slate-50 p-3 rounded text-sm whitespace-pre-wrap">
          {item.description}
        </div>
        <div>
          <Label>סטטוס</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>דווח לרשם הגנת הפרטיות</Label>
            <Input
              type="datetime-local"
              value={notifiedRegistrar}
              onChange={(e) => setNotifiedRegistrar(e.target.value)}
            />
          </div>
          <div>
            <Label>יודעו המטופלים שנפגעו</Label>
            <Input
              type="datetime-local"
              value={notifiedClients}
              onChange={(e) => setNotifiedClients(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>סיכום פתרון</Label>
          <Textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={4}
            placeholder="מה נעשה כדי לסגור את האירוע?"
            maxLength={10000}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "שומר..." : "עדכן"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
