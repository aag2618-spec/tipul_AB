"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface Commitment {
  id: string;
  commitmentNumber: string | null;
  form17Number: string | null;
  referringDoctor: string | null;
  referralDate: string | null;
  approvedSessions: number | null;
  usedSessions: number;
  copaymentAmount: number | null;
  startDate: string | null;
  endDate: string | null;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  notes: string | null;
  createdAt: string;
}

interface CommitmentFormData {
  commitmentNumber: string;
  form17Number: string;
  referringDoctor: string;
  referralDate: string;
  approvedSessions: string;
  copaymentAmount: string;
  startDate: string;
  endDate: string;
  notes: string;
}

const EMPTY_FORM: CommitmentFormData = {
  commitmentNumber: "",
  form17Number: "",
  referringDoctor: "",
  referralDate: "",
  approvedSessions: "",
  copaymentAmount: "",
  startDate: "",
  endDate: "",
  notes: "",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "פעילה",
  EXPIRED: "פגה",
  CANCELLED: "מבוטלת",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  ACTIVE: "default",
  EXPIRED: "secondary",
  CANCELLED: "destructive",
};

export function CommitmentManagement({ clientId }: { clientId: string }) {
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState<CommitmentFormData>(EMPTY_FORM);

  const fetchCommitments = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/commitments`);
      if (res.ok) {
        setCommitments(await res.json());
      }
    } catch {
      toast.error("שגיאה בטעינת ההתחייבויות");
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchCommitments();
  }, [fetchCommitments]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (c: Commitment) => {
    setEditingId(c.id);
    setFormData({
      commitmentNumber: c.commitmentNumber || "",
      form17Number: c.form17Number || "",
      referringDoctor: c.referringDoctor || "",
      referralDate: c.referralDate ? c.referralDate.split("T")[0] : "",
      approvedSessions: c.approvedSessions?.toString() || "",
      copaymentAmount: c.copaymentAmount?.toString() || "",
      startDate: c.startDate ? c.startDate.split("T")[0] : "",
      endDate: c.endDate ? c.endDate.split("T")[0] : "",
      notes: c.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        commitmentNumber: formData.commitmentNumber || null,
        form17Number: formData.form17Number || null,
        referringDoctor: formData.referringDoctor || null,
        referralDate: formData.referralDate || null,
        approvedSessions: formData.approvedSessions ? parseInt(formData.approvedSessions) : null,
        copaymentAmount: formData.copaymentAmount !== "" ? parseFloat(formData.copaymentAmount) : null,
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        notes: formData.notes || null,
      };

      const url = editingId
        ? `/api/clients/${clientId}/commitments/${editingId}`
        : `/api/clients/${clientId}/commitments`;

      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "שגיאה");
      }

      toast.success(editingId ? "ההתחייבות עודכנה" : "ההתחייבות נוצרה");
      setDialogOpen(false);
      fetchCommitments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בשמירה");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/commitments/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("שגיאה במחיקה");
      toast.success("ההתחייבות נמחקה");
      setDeleteId(null);
      fetchCommitments();
    } catch {
      toast.error("שגיאה במחיקת ההתחייבות");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (commitmentId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/commitments/${commitmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("שגיאה בעדכון");
      toast.success("הסטטוס עודכן");
      fetchCommitments();
    } catch {
      toast.error("שגיאה בעדכון הסטטוס");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          התחייבויות קופת חולים
        </h3>
        <Button type="button" onClick={openCreate} size="sm" variant="outline">
          <Plus className="h-4 w-4 ml-1" />
          הוסף התחייבות
        </Button>
      </div>

      {commitments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          אין התחייבויות קופת חולים למטופל זה
        </p>
      ) : (
        <div className="space-y-3">
          {commitments.map((c) => (
            <Card key={c.id}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={STATUS_VARIANTS[c.status]}>
                        {STATUS_LABELS[c.status]}
                      </Badge>
                      {c.commitmentNumber && (
                        <span className="text-sm font-medium">
                          התחייבות #{c.commitmentNumber}
                        </span>
                      )}
                      {c.form17Number && (
                        <span className="text-sm text-muted-foreground">
                          טופס 17: {c.form17Number}
                        </span>
                      )}
                    </div>

                    {c.approvedSessions && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>טיפולים: {c.usedSessions}/{c.approvedSessions}</span>
                          <span className="text-muted-foreground">
                            {c.approvedSessions - c.usedSessions > 0
                              ? `נותרו ${c.approvedSessions - c.usedSessions}`
                              : "הסתיימו"}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(
                            (c.usedSessions / c.approvedSessions) * 100,
                            100
                          )}
                          className="h-2"
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {c.referringDoctor && <span>ד״ר {c.referringDoctor}</span>}
                      {c.copaymentAmount != null && (
                        <span>השתתפות עצמית: ₪{c.copaymentAmount}</span>
                      )}
                      {c.startDate && (
                        <span>
                          {new Date(c.startDate).toLocaleDateString("he-IL")}
                          {c.endDate && ` – ${new Date(c.endDate).toLocaleDateString("he-IL")}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {c.status === "ACTIVE" && (
                      <Select
                        value={c.status}
                        onValueChange={(v) => handleStatusChange(c.id, v)}
                      >
                        <SelectTrigger className="h-8 w-[90px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE">פעילה</SelectItem>
                          <SelectItem value="EXPIRED">פגה</SelectItem>
                          <SelectItem value="CANCELLED">מבוטלת</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteId(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "עריכת התחייבות" : "הוספת התחייבות חדשה"}
            </DialogTitle>
            <DialogDescription>
              הזן את פרטי ההתחייבות מקופת החולים
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="commitmentNumber">מספר התחייבות</Label>
                <Input
                  id="commitmentNumber"
                  value={formData.commitmentNumber}
                  onChange={(e) => setFormData({ ...formData, commitmentNumber: e.target.value })}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="form17Number">מספר טופס 17</Label>
                <Input
                  id="form17Number"
                  value={formData.form17Number}
                  onChange={(e) => setFormData({ ...formData, form17Number: e.target.value })}
                  dir="ltr"
                  className="text-left"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="referringDoctor">רופא מפנה</Label>
              <Input
                id="referringDoctor"
                value={formData.referringDoctor}
                onChange={(e) => setFormData({ ...formData, referringDoctor: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="approvedSessions">טיפולים מאושרים</Label>
                <Input
                  id="approvedSessions"
                  type="number"
                  min="1"
                  value={formData.approvedSessions}
                  onChange={(e) => setFormData({ ...formData, approvedSessions: e.target.value })}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="copaymentAmount">השתתפות עצמית (₪)</Label>
                <Input
                  id="copaymentAmount"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.copaymentAmount}
                  onChange={(e) => setFormData({ ...formData, copaymentAmount: e.target.value })}
                  dir="ltr"
                  className="text-left"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="referralDate">תאריך הפניה</Label>
                <Input
                  id="referralDate"
                  type="date"
                  value={formData.referralDate}
                  onChange={(e) => setFormData({ ...formData, referralDate: e.target.value })}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="startDate">תחילת תקופה</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="endDate">סוף תקופה</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  dir="ltr"
                  className="text-left"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="commitmentNotes">הערות</Label>
              <Textarea
                id="commitmentNotes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              {editingId ? "עדכן" : "צור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת התחייבות</DialogTitle>
            <DialogDescription>
              האם למחוק את ההתחייבות? הפעולה בלתי הפיכה.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteId(null)}>
              ביטול
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              מחק
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
