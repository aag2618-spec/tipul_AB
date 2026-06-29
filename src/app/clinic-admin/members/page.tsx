"use client";

import { useEffect, useState, useCallback } from "react";
import { PlanLimitsCard } from "@/components/clinic/plan-limits-card";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Users,
  Loader2,
  Crown,
  Stethoscope,
  Briefcase,
  Trash2,
  Settings,
  UserPlus,
  LogIn,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  SECRETARY_PERMS,
  DEFAULT_SECRETARY_PERMISSIONS,
  type SecretaryPermissions,
} from "@/lib/clinic/secretary-permissions-ui";

type ClinicRole = "OWNER" | "THERAPIST" | "SECRETARY";

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

  // הרשאות
  const [permsDialogOpen, setPermsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editPerms, setEditPerms] = useState<SecretaryPermissions>(DEFAULT_SECRETARY_PERMISSIONS);
  const [editIsTherapist, setEditIsTherapist] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);

  // הסרה
  const [removeId, setRemoveId] = useState<string | null>(null);

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

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  function openPermsDialog(member: Member) {
    setEditingMember(member);
    setEditPerms(member.secretaryPermissions || DEFAULT_SECRETARY_PERMISSIONS);
    setEditIsTherapist(Boolean(member.secretaryIsTherapist));
    setPermsDialogOpen(true);
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

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">חברי הקליניקה</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? "טוען..." : `${members.length} חברים פעילים`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/clinic-admin/invitations">
              <UserPlus className="ml-2 h-4 w-4" />
              הזמנת חבר/ה חדש/ה
            </Link>
          </Button>
        </div>
      </div>

      <PlanLimitsCard refreshKey={limitsRefreshKey} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
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
        </div>
      )}

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
    </div>
  );
}
