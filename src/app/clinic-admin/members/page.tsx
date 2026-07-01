"use client";

import { useEffect, useState, useCallback } from "react";
import { PlanLimitsCard } from "@/components/clinic/plan-limits-card";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Users,
  Loader2,
  Crown,
  Stethoscope,
  Briefcase,
  Trash2,
  Settings,
  UserPlus,
  LogIn,
  Plus,
  Send,
  Clock,
  Check,
  X,
  AlertCircle,
  Info,
  Mail,
  Smartphone,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  SECRETARY_PERMS,
  DEFAULT_SECRETARY_PERMISSIONS,
  type SecretaryPermissions,
} from "@/lib/clinic/secretary-permissions-ui";

type ClinicRole = "OWNER" | "THERAPIST" | "SECRETARY";
// תפקיד שניתן להזמין אליו (בעלים לא מוזמן — נוצר אחרת).
type InviteRole = "THERAPIST" | "SECRETARY";
type InviteStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" | "REJECTED";

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: string;
  clinicRole: ClinicRole | null;
  secretaryPermissions: SecretaryPermissions | null;
  secretaryIsTherapist?: boolean;
  isBlocked: boolean;
  createdAt: string;
  billingPaidByClinic?: boolean;
  subscriptionPausedReason?: string | null;
  _count: { clients: number };
}

interface Invitation {
  id: string;
  email: string;
  phone: string | null;
  intendedName: string | null;
  clinicRole: InviteRole | "OWNER";
  billingPaidByClinic: boolean;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastResentAt: string | null;
}

const STATUS_LABEL: Record<InviteStatus, { label: string; cls: string }> = {
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

function MemberRoleBadge({ role }: { role: ClinicRole | null }) {
  if (role === "OWNER") {
    return (
      <Badge className="bg-amber-500/20 text-amber-400">
        <Crown className="ml-1 h-3 w-3" />
        בעלים
      </Badge>
    );
  }
  if (role === "THERAPIST") {
    return (
      <Badge className="bg-blue-500/20 text-blue-400">
        <Stethoscope className="ml-1 h-3 w-3" />
        מטפל/ת
      </Badge>
    );
  }
  if (role === "SECRETARY") {
    return (
      <Badge className="bg-purple-500/20 text-purple-400">
        <Briefcase className="ml-1 h-3 w-3" />
        מזכיר/ה
      </Badge>
    );
  }
  return <Badge variant="secondary">—</Badge>;
}

export default function ClinicMembersPage() {
  const router = useRouter();
  const { update: updateSession } = useSession();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // הזמנות (אוחד לתוך מסך הצוות) — נטענות במקביל לחברים.
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  // הרשאות
  const [permsDialogOpen, setPermsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editPerms, setEditPerms] = useState<SecretaryPermissions>(DEFAULT_SECRETARY_PERMISSIONS);
  const [editIsTherapist, setEditIsTherapist] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);

  // הסרת חבר
  const [removeId, setRemoveId] = useState<string | null>(null);

  // יצירת הזמנה
  const [createOpen, setCreateOpen] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<InviteRole>("THERAPIST");
  const [formBillingPaidByClinic, setFormBillingPaidByClinic] = useState<boolean>(true);
  const [formSecretaryPerms, setFormSecretaryPerms] =
    useState<SecretaryPermissions>(DEFAULT_SECRETARY_PERMISSIONS);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ביטול הזמנה + שליחה חוזרת
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // refreshKey עבור PlanLimitsCard — מועלה אחרי שינוי שמשפיע על תקרה.
  const [limitsRefreshKey, setLimitsRefreshKey] = useState(0);
  const bumpLimitsRefresh = useCallback(() => setLimitsRefreshKey((k) => k + 1), []);

  // Impersonation
  const [impersonateTarget, setImpersonateTarget] = useState<Member | null>(null);
  const [impersonateReason, setImpersonateReason] = useState("");
  const [startingImpersonation, setStartingImpersonation] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/clinic-admin/members");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMembers(data);
    } catch {
      toast.error("שגיאה בטעינת חברי הקליניקה");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInvitations = useCallback(async () => {
    try {
      const res = await fetch("/api/clinic-admin/invitations");
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => null);
      // Defensive: API חוזר עם array; אם משום מה לא — דורסים ל-[] כדי לא לקרוס.
      setInvitations(Array.isArray(data) ? data : []);
    } catch {
      // ההזמנות הן מידע משני במסך — לא חוסמים אם נכשל; משאירים ריק.
      setInvitations([]);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
    fetchInvitations();
  }, [fetchMembers, fetchInvitations]);

  function openPermsDialog(member: Member) {
    setEditingMember(member);
    setEditPerms(member.secretaryPermissions || DEFAULT_SECRETARY_PERMISSIONS);
    setEditIsTherapist(Boolean(member.secretaryIsTherapist));
    setPermsDialogOpen(true);
  }

  function openCreate() {
    setFormEmail("");
    setFormPhone("");
    setFormName("");
    setFormRole("THERAPIST");
    setFormBillingPaidByClinic(true);
    setFormSecretaryPerms(DEFAULT_SECRETARY_PERMISSIONS);
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
          // הרשאות נשלחות רק עבור מזכיר/ה; עבור מטפל/ת — undefined.
          secretaryPermissions:
            formRole === "SECRETARY" ? formSecretaryPerms : undefined,
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
      bumpLimitsRefresh();
    } catch {
      setCreateError("שגיאת רשת");
    } finally {
      setCreating(false);
    }
  }

  async function handleResend(id: string) {
    setResendingId(id);
    try {
      const res = await fetch(`/api/clinic-admin/invitations/${id}/resend`, {
        method: "POST",
      });
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
      bumpLimitsRefresh();
    } catch {
      toast.error("שגיאת רשת");
    }
  }

  async function handleSavePerms() {
    if (!editingMember) return;
    setSavingPerms(true);
    try {
      const res = await fetch(`/api/clinic-admin/members/${editingMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secretaryPermissions: editPerms,
          secretaryIsTherapist: editIsTherapist,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      toast.success("ההרשאות נשמרו");
      setPermsDialogOpen(false);
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSavingPerms(false);
    }
  }

  async function handleStartImpersonation() {
    if (!impersonateTarget) return;
    if (impersonateReason.trim().length < 5) {
      toast.error("יש להזין סיבה (לפחות 5 תווים)");
      return;
    }
    setStartingImpersonation(true);
    try {
      const res = await fetch("/api/clinic-admin/impersonate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: impersonateTarget.id,
          reason: impersonateReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "שגיאה");
      // שמירת actingAs ב-token דרך update
      await updateSession({ actingAs: data.actingAs });
      toast.success(`נכנסת לחווית המשתמש של ${impersonateTarget.name || "החבר/ה"}`);
      setImpersonateTarget(null);
      setImpersonateReason("");
      // ניווט לדשבורד של ה-target — שם רוב הביקורת
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setStartingImpersonation(false);
    }
  }

  async function handleRemove() {
    if (!removeId) return;
    try {
      const res = await fetch(`/api/clinic-admin/members/${removeId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      toast.success("החבר/ה הוסר/ה מהקליניקה");
      setRemoveId(null);
      fetchMembers();
      bumpLimitsRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה");
    }
  }

  const owners = members.filter((m) => m.clinicRole === "OWNER");
  const therapists = members.filter((m) => m.clinicRole === "THERAPIST");
  const secretaries = members.filter((m) => m.clinicRole === "SECRETARY");

  const pending = invitations.filter((i) => i.status === "PENDING");
  const past = invitations.filter((i) => i.status !== "PENDING");

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">צוות הקליניקה</h1>
            <p className="text-sm text-muted-foreground">
              {loading
                ? "טוען..."
                : `${members.length} חברים פעילים · ${pending.length} הזמנות ממתינות`}
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <UserPlus className="ml-2 h-4 w-4" />
          צירוף חבר/ה
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3 items-start">
          {/* עמודה ראשית — חברים פעילים + הזמנות */}
          <div className="lg:col-span-2 space-y-6">
            {/* חברים פעילים, מקובצים לפי תפקיד */}
            {[
              { label: "בעלים", list: owners, icon: Crown, color: "text-amber-400" },
              { label: "מטפלים", list: therapists, icon: Stethoscope, color: "text-blue-400" },
              { label: "מזכירות", list: secretaries, icon: Briefcase, color: "text-purple-400" },
            ].map(({ label, list, icon: Icon, color }) => (
              <Card key={label}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${color}`} />
                    {label}
                    <span className="text-muted-foreground font-normal">({list.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground">אין</p>
                  ) : (
                    <div className="space-y-2">
                      {list.map((m) => (
                        <div
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/30 rounded-md"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{m.name || "—"}</span>
                              <MemberRoleBadge role={m.clinicRole} />
                              {m.clinicRole === "SECRETARY" && m.secretaryIsTherapist && (
                                <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">
                                  <Stethoscope className="ml-1 h-3 w-3" />
                                  גם מטפל/ת
                                </Badge>
                              )}
                              {m.billingPaidByClinic &&
                                m.clinicRole === "THERAPIST" && (
                                  <span
                                    title="הקליניקה משלמת על המנוי האישי של המטפל/ת ב-MyTipul. המנוי האישי מושהה כל זמן השיוך."
                                  >
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] border-blue-500/40 text-blue-400"
                                    >
                                      הקליניקה משלמת
                                    </Badge>
                                  </span>
                                )}
                              {m.isBlocked && (
                                <Badge variant="destructive" className="text-[10px]">חסום</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {m.email} · {m._count.clients} מטופלים
                            </div>
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            {m.clinicRole === "SECRETARY" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openPermsDialog(m)}
                              >
                                <Settings className="ml-1.5 h-3.5 w-3.5" />
                                הרשאות
                              </Button>
                            )}
                            {m.clinicRole !== "OWNER" && !m.isBlocked && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setImpersonateTarget(m);
                                  setImpersonateReason("");
                                }}
                                title="כניסה כעין החבר/ה לצורך ביקורת — כל פעולה תתועד"
                              >
                                <LogIn className="ml-1.5 h-3.5 w-3.5" />
                                היכנס/י כעין
                              </Button>
                            )}
                            {m.clinicRole !== "OWNER" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRemoveId(m.id)}
                                title="הסר/י מהקליניקה"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* הזמנות ממתינות */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-400" />
                  הזמנות ממתינות
                  <span className="text-muted-foreground font-normal">
                    ({pending.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pending.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                    <div className="p-3 bg-muted/50 rounded-full">
                      <UserPlus className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      אין כרגע הזמנות שממתינות לאישור.
                    </p>
                    <Button size="sm" onClick={openCreate}>
                      <Plus className="ml-2 h-4 w-4" />
                      צירוף חבר/ה
                    </Button>
                  </div>
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

            {/* היסטוריית הזמנות */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  היסטוריית הזמנות (30 ימים)
                  <span className="text-muted-foreground font-normal">
                    ({past.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {past.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    הזמנות שהתקבלו, פגו או בוטלו ב-30 הימים האחרונים יופיעו כאן.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {past.map((inv) => (
                      <InvitationRow key={inv.id} invitation={inv} historic />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* עמודה צדדית — מכסת מקומות + הסבר קצר */}
          <div className="space-y-6">
            <PlanLimitsCard refreshKey={limitsRefreshKey} />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  איך הצירוף עובד?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <span>נשלח מייל עם קישור אישי למוזמן/ת להצטרפות.</span>
                </div>
                <div className="flex items-start gap-2">
                  <Smartphone className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <span>
                    הוספת טלפון מוסיפה אימות SMS עם קוד — שכבת ביטחון נוספת.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <span>
                    כל הזמנה תקפה לזמן מוגבל; אפשר לשלוח שוב או לבטל בכל רגע.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <span>
                    גישת מזכיר/ה לתוכן קליני חסומה תמיד; ההרשאות נקבעות בהזמנה.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* יצירת הזמנה (צירוף חבר/ה) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>צירוף חבר/ה לקליניקה</DialogTitle>
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
                onValueChange={(v) => setFormRole(v as InviteRole)}
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
              <div className="space-y-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                  מזכירות תמחור נקבע לפי תוכנית הקליניקה (3 חינם / לפי תוכנית).
                </p>
                <div className="space-y-1">
                  <Label>הרשאות מזכיר/ה</Label>
                  <p className="text-xs text-muted-foreground">
                    גישה לתוכן קליני (סיכומים, אבחנות) חסומה
                    תמיד. ניתן לעדכן את ההרשאות גם מאוחר יותר כאן ב&quot;צוות
                    הקליניקה&quot;.
                  </p>
                </div>
                <div className="space-y-2">
                  {SECRETARY_PERMS.map((p) => (
                    <label
                      key={p.key}
                      className="flex items-start gap-3 p-2.5 bg-muted/30 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(formSecretaryPerms[p.key])}
                        onChange={(e) =>
                          setFormSecretaryPerms({
                            ...formSecretaryPerms,
                            [p.key]: e.target.checked,
                          })
                        }
                        className="mt-1"
                        disabled={creating}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{p.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.help}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
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

      {/* הרשאות מזכירה */}
      <Dialog open={permsDialogOpen} onOpenChange={setPermsDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>הרשאות מזכיר/ה</DialogTitle>
            <DialogDescription>
              {editingMember?.name || editingMember?.email}
              <br />
              <span className="text-xs">
                גישה לתוכן קליני (סיכומים, אבחנות) חסומה תמיד —
                לא ניתנת לשינוי.
              </span>
            </DialogDescription>
          </DialogHeader>

          {/* מזכיר/ה גם מטפל/ת — הגדרה מבנית (לא הרשאת תוכן), מודגשת בנפרד */}
          <label className="flex items-start gap-3 p-3 rounded-md cursor-pointer border border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
            <input
              type="checkbox"
              checked={editIsTherapist}
              onChange={(e) => setEditIsTherapist(e.target.checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="font-medium text-sm flex items-center gap-1.5">
                <Stethoscope className="h-3.5 w-3.5 text-blue-400" />
                מזכיר/ה גם מטפל/ת
              </div>
              <div className="text-xs text-muted-foreground">
                בנוסף למסך המזכירות, מקבל/ת דשבורד טיפולי משלו/ה (מטופלים אישיים +
                גישה קלינית מלאה אליהם בלבד), עם כפתור מעבר בין שני המסכים.
              </div>
            </div>
          </label>

          <div className="space-y-3 py-2">
            {SECRETARY_PERMS.map((p) => (
              <label
                key={p.key}
                className="flex items-start gap-3 p-3 bg-muted/30 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={Boolean(editPerms[p.key])}
                  onChange={(e) => setEditPerms({ ...editPerms, [p.key]: e.target.checked })}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.help}</div>
                </div>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermsDialogOpen(false)} disabled={savingPerms}>
              ביטול
            </Button>
            <Button onClick={handleSavePerms} disabled={savingPerms}>
              {savingPerms && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              שמור הרשאות
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* התחזות (Impersonation) */}
      <Dialog
        open={!!impersonateTarget}
        onOpenChange={(o) => {
          if (!o) {
            setImpersonateTarget(null);
            setImpersonateReason("");
          }
        }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>כניסה כעין {impersonateTarget?.name || "החבר/ה"}?</DialogTitle>
            <DialogDescription>
              כל פעולה שתבצע/י במצב ההתחזות תיוחס ל-{impersonateTarget?.name || "החבר/ה"} במערכת,
              אך תיתועד באודיט עם זהותך האמיתית כאחראי/ת לפעולה.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            <p className="text-amber-600 dark:text-amber-400 font-medium">
              ⚠ השתמש/י רק לביקורת ובדיקה — לא לפעולות יזומות בשם החבר/ה.
            </p>
            <p className="text-xs text-muted-foreground">
              מקסימום 30 דקות. ניתן לצאת בכל רגע מהבאנר העליון.
            </p>
          </div>

          <div className="space-y-2 py-2">
            <Label htmlFor="impersonate-reason">סיבה (חובה — לפחות 5 תווים)</Label>
            <Textarea
              id="impersonate-reason"
              value={impersonateReason}
              onChange={(e) => setImpersonateReason(e.target.value)}
              rows={3}
              placeholder="לדוגמה: בדיקת תקלה שדווחה, בירור מצב הרשאות, ביקורת תקופתית..."
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-left">
              {impersonateReason.length} / 500
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImpersonateTarget(null);
                setImpersonateReason("");
              }}
              disabled={startingImpersonation}
            >
              ביטול
            </Button>
            <Button
              onClick={handleStartImpersonation}
              disabled={startingImpersonation || impersonateReason.trim().length < 5}
            >
              {startingImpersonation && (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              )}
              היכנס/י למצב התחזות
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* הסרת חבר */}
      <AlertDialog open={!!removeId} onOpenChange={(o) => !o && setRemoveId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>הסרת חבר/ה מהקליניקה?</AlertDialogTitle>
            <AlertDialogDescription>
              החבר/ה יישאר/תישאר משתמש/ת במערכת אבל לא יהיה/תהיה משויכ/ת לקליניקה.
              הפעולה לא הופכת חוזרת — צריך להוסיף מחדש כדי להחזיר.
              <br />
              <br />
              לחבר/ה יש מטופלים פעילים? המערכת תחסום את הפעולה. תחילה העבר/י את
              המטופלים למטפל/ת אחר/ת.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(() => {
            const removingMember = members.find((m) => m.id === removeId);
            if (
              removingMember?.billingPaidByClinic &&
              removingMember?.subscriptionPausedReason === "PAID_BY_CLINIC"
            ) {
              return (
                <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/40 rounded-md text-sm text-amber-700 dark:text-amber-300">
                  ⚠ <strong>שים/י לב:</strong> הקליניקה משלמת כעת על מנוי MyTipul
                  של {removingMember.name || "החבר/ה"}. הסרה תחזיר את החיוב למטפל/ת
                  באופן אישי — מיד עם ההסרה. אם זה לא מה שרצית — בטל/י עכשיו.
                </div>
              );
            }
            return null;
          })()}
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              הסר/י
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
