"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  UserPlus,
  Plus,
  Loader2,
  Send,
  Trash2,
  Clock,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

type ClinicRole = "THERAPIST" | "SECRETARY";
type Status = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" | "REJECTED";

interface Invitation {
  id: string;
  email: string;
  phone: string | null;
  intendedName: string | null;
  clinicRole: ClinicRole | "OWNER";
  billingPaidByClinic: boolean;
  status: Status;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastResentAt: string | null;
}

const STATUS_LABEL: Record<Status, { label: string; cls: string }> = {
  PENDING: { label: "בהמתנה", cls: "bg-amber-500/20 text-amber-400" },
  ACCEPTED: { label: "התקבלה", cls: "bg-emerald-500/20 text-emerald-400" },
  EXPIRED: { label: "פגה", cls: "bg-slate-500/20 text-slate-400" },
  REVOKED: { label: "בוטלה", cls: "bg-red-500/20 text-red-400" },
  REJECTED: { label: "נדחתה", cls: "bg-orange-500/20 text-orange-400" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "פג";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 24) return `${Math.floor(hours / 24)} ימים`;
  if (hours >= 1) return `${hours} שעות`;
  const min = Math.floor(ms / 60000);
  return `${min} דקות`;
}

export default function ClinicInvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<ClinicRole>("THERAPIST");
  const [formBillingPaidByClinic, setFormBillingPaidByClinic] =
    useState<boolean>(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Revoke
  const [revokeId, setRevokeId] = useState<string | null>(null);

  // Resend
  const [resendingId, setResendingId] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/clinic-admin/invitations");
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => null);
      // Defensive: API חוזר עם array; אם משום מה לא — דורסים ל-[] כדי לא לקרוס.
      setInvitations(Array.isArray(data) ? data : []);
    } catch {
      toast.error("שגיאה בטעינת ההזמנות");
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  function openCreate() {
    setFormEmail("");
    setFormPhone("");
    setFormName("");
    setFormRole("THERAPIST");
    setFormBillingPaidByClinic(true);
    setCreateError(null);
    setCreateOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!formEmail.trim()) {
      setCreateError("יש להזין אימייל");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/clinic-admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formEmail.trim(),
          phone: formPhone.trim() || undefined,
          intendedName: formName.trim() || undefined,
          clinicRole: formRole,
          billingPaidByClinic: formBillingPaidByClinic,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.message || "שגיאה ביצירת ההזמנה");
        return;
      }
      const detail =
        data.otpRequired && data.otpSent
          ? "נשלחו מייל + SMS עם קוד אימות"
          : data.otpRequired
          ? "נשלח מייל; שליחת SMS נכשלה — שקול/י 'שלח שוב'"
          : "נשלח מייל למוזמן/ת";
      toast.success(`ההזמנה נשלחה. ${detail}`);
      setCreateOpen(false);
      fetchInvitations();
    } catch {
      setCreateError("שגיאת רשת");
    } finally {
      setCreating(false);
    }
  }

  async function handleResend(id: string) {
    setResendingId(id);
    try {
      const res = await fetch(
        `/api/clinic-admin/invitations/${id}/resend`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "שגיאה בשליחה החוזרת");
        return;
      }
      toast.success("ההזמנה נשלחה שוב");
      fetchInvitations();
    } catch {
      toast.error("שגיאת רשת");
    } finally {
      setResendingId(null);
    }
  }

  async function handleRevoke() {
    if (!revokeId) return;
    try {
      const res = await fetch(`/api/clinic-admin/invitations/${revokeId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || "שגיאה בביטול ההזמנה");
        return;
      }
      toast.success("ההזמנה בוטלה");
      setRevokeId(null);
      fetchInvitations();
    } catch {
      toast.error("שגיאת רשת");
    }
  }

  const pending = invitations.filter((i) => i.status === "PENDING");
  const past = invitations.filter((i) => i.status !== "PENDING");

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <UserPlus className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">הזמנות לקליניקה</h1>
            <p className="text-sm text-muted-foreground">
              {loading
                ? "טוען..."
                : `${pending.length} בהמתנה · ${past.length} בהיסטוריה`}
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="ml-2 h-4 w-4" />
          הזמנה חדשה
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400" />
                הזמנות פעילות
                <span className="text-muted-foreground font-normal">
                  ({pending.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  אין הזמנות פעילות.
                </p>
              ) : (
                <div className="space-y-2">
                  {pending.map((inv) => (
                    <InvitationRow
                      key={inv.id}
                      invitation={inv}
                      onResend={() => handleResend(inv.id)}
                      onRevoke={() => setRevokeId(inv.id)}
                      isResending={resendingId === inv.id}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {past.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  היסטוריה (30 ימים)
                  <span className="text-muted-foreground font-normal">
                    ({past.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {past.map((inv) => (
                    <InvitationRow
                      key={inv.id}
                      invitation={inv}
                      historic
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* יצירת הזמנה */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>הזמנה חדשה</DialogTitle>
            <DialogDescription>
              נשלח מייל עם קישור אישי. אם תוסיפו טלפון — נשלח גם SMS עם קוד
              אימות.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="invite-email">אימייל המוזמן/ת</Label>
              <Input
                id="invite-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                required
                dir="ltr"
                disabled={creating}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="invite-phone">טלפון (לא חובה — לאימות SMS)</Label>
              <Input
                id="invite-phone"
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="05X-XXXXXXX"
                disabled={creating}
              />
              <p className="text-xs text-muted-foreground">
                הוספת טלפון מוסיפה שכבת אימות נוספת לאישור ההצטרפות.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="invite-name">שם רמז (לא חובה)</Label>
              <Input
                id="invite-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="לדוגמה: יעל לוי"
                disabled={creating}
              />
            </div>

            <div className="space-y-1">
              <Label>תפקיד</Label>
              <Select
                value={formRole}
                onValueChange={(v) => setFormRole(v as ClinicRole)}
                disabled={creating}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="THERAPIST">מטפל/ת</SelectItem>
                  <SelectItem value="SECRETARY">מזכיר/ה</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formRole === "THERAPIST" && (
              <div className="space-y-2 pt-3 border-t border-border">
                <Label>מי משלם על המנוי של המטפל/ת?</Label>
                <RadioGroup
                  value={formBillingPaidByClinic ? "clinic" : "self"}
                  onValueChange={(v) =>
                    setFormBillingPaidByClinic(v === "clinic")
                  }
                  disabled={creating}
                >
                  <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-md">
                    <RadioGroupItem
                      value="clinic"
                      id="billing-clinic"
                      className="mt-1"
                    />
                    <div>
                      <Label
                        htmlFor="billing-clinic"
                        className="font-medium cursor-pointer"
                      >
                        הקליניקה משלמת
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        המנוי האישי של המטפל/ת מושעה. החיוב מתבצע דרך הקליניקה.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-md">
                    <RadioGroupItem
                      value="self"
                      id="billing-self"
                      className="mt-1"
                    />
                    <div>
                      <Label
                        htmlFor="billing-self"
                        className="font-medium cursor-pointer"
                      >
                        המטפל/ת משלם/ת בעצמו/ה
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        המנוי האישי ממשיך פעיל. הקליניקה לא מחויבת עליו/ה.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            )}

            {formRole === "SECRETARY" && (
              <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                מזכירות תמחור נקבע לפי תוכנית הקליניקה (3 חינם / לפי תוכנית).
              </p>
            )}

            {createError && (
              <div className="text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                ביטול
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                <Send className="ml-2 h-4 w-4" />
                שליחת הזמנה
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ביטול הזמנה */}
      <AlertDialog
        open={!!revokeId}
        onOpenChange={(o) => !o && setRevokeId(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לבטל את ההזמנה?</AlertDialogTitle>
            <AlertDialogDescription>
              הקישור יפסיק לפעול מיידית. אם כבר לחצו עליו, הם יראו שההזמנה
              בוטלה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>חזרה</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              ביטול ההזמנה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InvitationRow({
  invitation,
  onResend,
  onRevoke,
  isResending,
  historic,
}: {
  invitation: Invitation;
  onResend?: () => void;
  onRevoke?: () => void;
  isResending?: boolean;
  historic?: boolean;
}) {
  const role =
    invitation.clinicRole === "THERAPIST"
      ? "מטפל/ת"
      : invitation.clinicRole === "SECRETARY"
      ? "מזכיר/ה"
      : "—";
  const statusInfo = STATUS_LABEL[invitation.status];
  const isPending = invitation.status === "PENDING";
  const remaining = isPending ? timeUntil(invitation.expiresAt) : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/30 rounded-md">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">
            {invitation.intendedName || invitation.email}
          </span>
          <Badge className={statusInfo.cls}>{statusInfo.label}</Badge>
          <Badge variant="outline" className="text-[10px]">
            {role}
          </Badge>
          {invitation.billingPaidByClinic &&
            invitation.clinicRole === "THERAPIST" && (
              <Badge variant="outline" className="text-[10px]">
                הקליניקה משלמת
              </Badge>
            )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          <span dir="ltr">{invitation.email}</span>
          {invitation.phone && (
            <>
              {" · "}
              <span dir="ltr">{invitation.phone}</span>
            </>
          )}
          {" · נשלחה: "}
          {formatDate(invitation.createdAt)}
          {isPending && (
            <>
              {" · "}
              <span className="text-amber-400">נותרו {remaining}</span>
            </>
          )}
          {historic && invitation.acceptedAt && (
            <>
              {" · התקבלה: "}
              {formatDate(invitation.acceptedAt)}
            </>
          )}
        </div>
      </div>
      {!historic && (
        <div className="flex gap-1.5">
          {onResend && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResend}
              disabled={isResending}
              title="שלח שוב"
            >
              {isResending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          {onRevoke && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRevoke}
              title="ביטול ההזמנה"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
      {historic && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {invitation.status === "ACCEPTED" ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      )}
    </div>
  );
}
