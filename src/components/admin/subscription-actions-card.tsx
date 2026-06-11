"use client";

// src/components/admin/subscription-actions-card.tsx
// Stage 6 — קומפוננטת פעולות אדמין על מנוי משתמש.
// משלובת ב-/admin/users/[id]/page.tsx. מבצעת POST /api/admin/users/[id]/subscription.
//
// 5 פעולות:
//   - extend_trial — הארכת ניסיון
//   - grant_package — מתן חבילת SMS/AI חינם
//   - change_tier — שינוי תוכנית
//   - override_price — דריסת מחיר אישית
//   - set_free / unset_free — מנוי חינם

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Calendar,
  CalendarPlus,
  Gift,
  Crown,
  DollarSign,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";

interface Props {
  userId: string;
  aiTier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  isFreeSubscription: boolean;
  freeSubscriptionNote: string | null;
  trialEndsAtIso: string | null;
  subscriptionEndsAtIso: string | null;
  onUpdated: () => void;
}

type DialogKind =
  | null
  | "extend_trial"
  | "extend_subscription"
  | "grant_package"
  | "change_tier"
  | "override_price"
  | "set_free";

export function SubscriptionActionsCard({
  userId,
  aiTier,
  isFreeSubscription,
  freeSubscriptionNote,
  trialEndsAtIso,
  subscriptionEndsAtIso,
  onUpdated,
}: Props) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── extend_trial state ──
  const [extendDays, setExtendDays] = useState<string>("14");

  // ── extend_subscription state ──
  const [extendSubDays, setExtendSubDays] = useState<string>("30");
  const [extendSubNote, setExtendSubNote] = useState<string>("");

  // ── grant_package state ──
  const [packageType, setPackageType] = useState<"SMS" | "AI_DETAILED_ANALYSIS">(
    "SMS"
  );
  const [packageCredits, setPackageCredits] = useState<string>("100");
  const [packageNote, setPackageNote] = useState<string>("");

  // ── change_tier state ──
  const [newTier, setNewTier] = useState<"ESSENTIAL" | "PRO" | "ENTERPRISE">(
    aiTier
  );
  const [changeTierNote, setChangeTierNote] = useState<string>("");

  // ── override_price state ──
  const [overrideTier, setOverrideTier] = useState<
    "ESSENTIAL" | "PRO" | "ENTERPRISE"
  >(aiTier);
  const [overrideMonthly, setOverrideMonthly] = useState<string>("");
  const [overrideNote, setOverrideNote] = useState<string>("");

  // ── set_free state ──
  const [freeNote, setFreeNote] = useState<string>(freeSubscriptionNote || "");

  // סוכן 3 UX ממצא #4: כשהמשתמש מתעדכן (onUpdated→fetchUser), aiTier יכול
  // להשתנות. useState מקבל ערך התחלתי בלבד; נדרש useEffect לסנכרון.
  useEffect(() => {
    setNewTier(aiTier);
    setOverrideTier(aiTier);
  }, [aiTier]);
  useEffect(() => {
    setFreeNote(freeSubscriptionNote || "");
  }, [freeSubscriptionNote]);

  const closeDialog = () => {
    if (submitting) return;
    setDialog(null);
  };

  const callApi = async (body: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "שגיאה");
        return false;
      }
      toast.success(data.message || "הפעולה הושלמה");
      onUpdated();
      return true;
    } catch {
      toast.error("שגיאה בתקשורת");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-4 w-4" />
            פעולות אדמין על המנוי
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog("extend_trial")}
              className="justify-start"
            >
              <Calendar className="h-4 w-4 ml-1" />
              הארכת ניסיון
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog("extend_subscription")}
              className="justify-start"
            >
              <CalendarPlus className="h-4 w-4 ml-1" />
              הוסף ימים למנוי
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog("grant_package")}
              className="justify-start"
            >
              <Gift className="h-4 w-4 ml-1" />
              מתן חבילה
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog("change_tier")}
              className="justify-start"
            >
              <Crown className="h-4 w-4 ml-1" />
              שינוי תוכנית
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog("override_price")}
              className="justify-start"
            >
              <DollarSign className="h-4 w-4 ml-1" />
              מחיר מותאם
            </Button>
            <Button
              variant={isFreeSubscription ? "destructive" : "outline"}
              size="sm"
              onClick={() => setDialog("set_free")}
              className="col-span-2 justify-start"
            >
              {isFreeSubscription ? (
                <XCircle className="h-4 w-4 ml-1" />
              ) : (
                <CheckCircle className="h-4 w-4 ml-1" />
              )}
              {isFreeSubscription ? "ביטול מנוי חינם" : "הגדר כמנוי חינם"}
            </Button>
          </div>
          {isFreeSubscription && freeSubscriptionNote && (
            <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
              <strong>מנוי חינם:</strong> {freeSubscriptionNote}
            </div>
          )}
          {trialEndsAtIso && (
            <div className="text-xs text-muted-foreground">
              סיום ניסיון נוכחי:{" "}
              {new Date(trialEndsAtIso).toLocaleDateString("he-IL")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* === Dialog: Extend Trial === */}
      <Dialog open={dialog === "extend_trial"} onOpenChange={closeDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>הארכת תקופת ניסיון</DialogTitle>
            <DialogDescription>
              הוספת ימים לתקופת הניסיון הנוכחית של המשתמש. מקסימום 90 ימים
              לפעולה.
              {trialEndsAtIso && (
                <span className="block mt-2 text-foreground">
                  סיום נוכחי:{" "}
                  <strong>
                    {new Date(trialEndsAtIso).toLocaleDateString("he-IL")}
                  </strong>
                  {parseInt(extendDays, 10) > 0 &&
                    Number.isInteger(parseInt(extendDays, 10)) && (
                      <>
                        {" → סיום חדש: "}
                        <strong>
                          {new Date(
                            Math.max(
                              new Date(trialEndsAtIso).getTime(),
                              Date.now()
                            ) +
                              parseInt(extendDays, 10) *
                                24 *
                                60 *
                                60 *
                                1000
                          ).toLocaleDateString("he-IL")}
                        </strong>
                      </>
                    )}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="extend-days">מספר ימים</Label>
            <Input
              id="extend-days"
              type="number"
              min={1}
              max={90}
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={submitting}>
              ביטול
            </Button>
            <Button
              disabled={submitting}
              onClick={async () => {
                const days = parseInt(extendDays, 10);
                if (!Number.isInteger(days) || days <= 0) {
                  toast.error("מספר ימים לא תקין");
                  return;
                }
                const ok = await callApi({ action: "extend_trial", days });
                if (ok) setDialog(null);
              }}
            >
              {submitting && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
              הארך/י
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Dialog: Extend Subscription === */}
      <Dialog
        open={dialog === "extend_subscription"}
        onOpenChange={closeDialog}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת ימים למנוי פעיל</DialogTitle>
            <DialogDescription>
              הוספת ימים לתאריך סיום המנוי של המשתמש (לא לתקופת ניסיון).
              השימוש: פיצוי על תקלה, מתנה, יישוב חוב.
              {subscriptionEndsAtIso && (() => {
                const daysNum = parseInt(extendSubDays, 10);
                const validDays =
                  Number.isInteger(daysNum) && daysNum > 0 && daysNum <= 365;
                return (
                  <span className="block mt-2 text-foreground">
                    תוקף נוכחי:{" "}
                    <strong>
                      {new Date(subscriptionEndsAtIso).toLocaleDateString(
                        "he-IL"
                      )}
                    </strong>
                    {validDays && (
                      <>
                        {" → תוקף חדש: "}
                        <strong>
                          {new Date(
                            Math.max(
                              new Date(subscriptionEndsAtIso).getTime(),
                              Date.now()
                            ) +
                              daysNum * 24 * 60 * 60 * 1000
                          ).toLocaleDateString("he-IL")}
                        </strong>
                      </>
                    )}
                  </span>
                );
              })()}
              {!subscriptionEndsAtIso && (
                <span className="block mt-2 text-amber-700 dark:text-amber-400">
                  ⚠ למשתמש אין מנוי פעיל. הפעולה תיצור תוקף חדש שמתחיל מהיום
                  (ללא חיוב). עדיף ליצור מנוי חינמי דרך &quot;הגדר כמנוי
                  חינמי&quot;.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="extend-sub-days">מספר ימים (1-365)</Label>
              <Input
                id="extend-sub-days"
                type="number"
                min={1}
                max={365}
                value={extendSubDays}
                onChange={(e) => setExtendSubDays(e.target.value)}
                aria-required="true"
                aria-describedby="extend-sub-days-hint"
              />
              {(() => {
                const d = parseInt(extendSubDays, 10);
                if (!Number.isInteger(d) || d <= 0 || d > 365) {
                  return (
                    <p
                      id="extend-sub-days-hint"
                      className="text-xs text-destructive mt-1"
                    >
                      יש להזין מספר שלם בין 1 ל-365.
                    </p>
                  );
                }
                return null;
              })()}
            </div>
            <div>
              <Label htmlFor="extend-sub-note">סיבה (חובה — תיעוד)</Label>
              <Textarea
                id="extend-sub-note"
                placeholder="לדוגמה: פיצוי על תקלת תשלום מ-15/5/2026 / מתנה / יישוב חוב"
                value={extendSubNote}
                onChange={(e) => setExtendSubNote(e.target.value)}
                aria-required="true"
                aria-describedby="extend-sub-note-hint"
              />
              {extendSubNote.trim().length > 0 &&
                extendSubNote.trim().length < 3 && (
                  <p
                    id="extend-sub-note-hint"
                    className="text-xs text-muted-foreground mt-1"
                  >
                    יש למלא לפחות 3 תווים.
                  </p>
                )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={submitting}>
              ביטול
            </Button>
            <Button
              disabled={submitting || extendSubNote.trim().length < 3}
              onClick={async () => {
                const days = parseInt(extendSubDays, 10);
                if (!Number.isInteger(days) || days <= 0) {
                  toast.error("מספר ימים לא תקין");
                  return;
                }
                if (days > 365) {
                  toast.error("מקסימום 365 ימים לפעולה אחת");
                  return;
                }
                if (extendSubNote.trim().length < 3) {
                  toast.error("חובה למלא הערה (לפחות 3 תווים)");
                  return;
                }
                const ok = await callApi({
                  action: "extend_subscription",
                  days,
                  note: extendSubNote.trim(),
                });
                if (ok) {
                  setDialog(null);
                  setExtendSubNote("");
                  setExtendSubDays("30");
                }
              }}
            >
              {submitting && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
              הוסף ימים
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Dialog: Grant Package === */}
      <Dialog open={dialog === "grant_package"} onOpenChange={closeDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>מתן חבילה חינם</DialogTitle>
            <DialogDescription>
              הענקת חבילת SMS או AI חינם למשתמש. החבילה תיווצר עם source=MANUAL.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>סוג חבילה</Label>
              <Select
                value={packageType}
                onValueChange={(v) =>
                  setPackageType(v as "SMS" | "AI_DETAILED_ANALYSIS")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMS">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="grant-credits">כמות יחידות</Label>
              <Input
                id="grant-credits"
                type="number"
                min={1}
                value={packageCredits}
                onChange={(e) => setPackageCredits(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="grant-note">הערה (חובה — תיעוד)</Label>
              <Textarea
                id="grant-note"
                placeholder="לדוגמה: פיצוי על תקלה / מתנה / מנוי ניסיון"
                value={packageNote}
                onChange={(e) => setPackageNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={submitting}>
              ביטול
            </Button>
            <Button
              disabled={submitting}
              onClick={async () => {
                const credits = parseInt(packageCredits, 10);
                if (!Number.isInteger(credits) || credits <= 0) {
                  toast.error("כמות לא תקינה");
                  return;
                }
                if (!packageNote.trim()) {
                  toast.error("חובה למלא הערה");
                  return;
                }
                const ok = await callApi({
                  action: "grant_package",
                  packageType,
                  credits,
                  note: packageNote.trim(),
                });
                if (ok) {
                  setDialog(null);
                  setPackageNote("");
                }
              }}
            >
              {submitting && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
              הענק/י
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Dialog: Change Tier === */}
      <Dialog open={dialog === "change_tier"} onOpenChange={closeDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>שינוי תוכנית ידני</DialogTitle>
            <DialogDescription>
              שינוי תוכנית של המשתמש מ-{aiTier} לתוכנית אחרת. השינוי מיידי.
              {" "}
              <strong>אם יש מנוי פעיל עם חיוב עתידי</strong> — החיוב הבא יבוצע
              לפי התוכנית והמחיר החדשים. חיובים שכבר בוצעו לא משתנים. אם הוגדרה
              תוכנית ממתינה (pendingTier) — היא תימחק.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>תוכנית חדשה</Label>
              <Select
                value={newTier}
                onValueChange={(v) =>
                  setNewTier(v as "ESSENTIAL" | "PRO" | "ENTERPRISE")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ESSENTIAL">בסיסי</SelectItem>
                  <SelectItem value="PRO">מקצועי</SelectItem>
                  <SelectItem value="ENTERPRISE">ארגוני</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tier-note">הערה (אופציונלי)</Label>
              <Textarea
                id="tier-note"
                placeholder="סיבת השינוי"
                value={changeTierNote}
                onChange={(e) => setChangeTierNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={submitting}>
              ביטול
            </Button>
            <Button
              disabled={submitting || newTier === aiTier}
              onClick={async () => {
                const ok = await callApi({
                  action: "change_tier",
                  toTier: newTier,
                  note: changeTierNote.trim() || undefined,
                });
                if (ok) {
                  setDialog(null);
                  setChangeTierNote("");
                }
              }}
            >
              {submitting && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
              שנה/י
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Dialog: Override Price === */}
      <Dialog open={dialog === "override_price"} onOpenChange={closeDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>מחיר מותאם אישית</DialogTitle>
            <DialogDescription>
              הגדרת מחיר ייחודי למשתמש זה, גובר על תמחור הקליניקה/הגלובלי.
              המחיר יחול אוטומטית מהחיוב הבא — חיובים שבוצעו לא ישתנו.
              {" "}
              <strong>אם יש למשתמש מנוי פעיל</strong>, החיוב הבא יבוצע במחיר
              החדש.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>תוכנית</Label>
              <Select
                value={overrideTier}
                onValueChange={(v) =>
                  setOverrideTier(v as "ESSENTIAL" | "PRO" | "ENTERPRISE")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ESSENTIAL">בסיסי</SelectItem>
                  <SelectItem value="PRO">מקצועי</SelectItem>
                  <SelectItem value="ENTERPRISE">ארגוני</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="override-monthly">מחיר חודשי (₪)</Label>
              <Input
                id="override-monthly"
                type="number"
                min={1}
                step={0.01}
                value={overrideMonthly}
                onChange={(e) => setOverrideMonthly(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="override-note">הערה</Label>
              <Textarea
                id="override-note"
                placeholder="סיבת המחיר המותאם"
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={submitting}>
              ביטול
            </Button>
            <Button
              disabled={submitting}
              onClick={async () => {
                const monthly = parseFloat(overrideMonthly);
                if (!Number.isFinite(monthly) || monthly <= 0) {
                  toast.error("מחיר לא תקין");
                  return;
                }
                const ok = await callApi({
                  action: "override_price",
                  planTier: overrideTier,
                  monthlyIls: monthly,
                  note: overrideNote.trim() || undefined,
                });
                if (ok) {
                  setDialog(null);
                  setOverrideMonthly("");
                  setOverrideNote("");
                }
              }}
            >
              {submitting && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
              צור/י מחיר מותאם
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Dialog: Set/Unset Free === */}
      <Dialog open={dialog === "set_free"} onOpenChange={closeDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {isFreeSubscription ? "ביטול מנוי חינם" : "הגדר כמנוי חינם"}
            </DialogTitle>
            <DialogDescription>
              {isFreeSubscription
                ? "המשתמש יחזור לתשלום רגיל. תזכורות וחיובים יחזרו אוטומטית. סטטוס המנוי לא ישתנה אוטומטית."
                : "המנוי יוגדר חינם — לא יחויב גם אם יש לו כרטיס שמור. אם המנוי במצב בוטל/פיגור — יחזור ל-ACTIVE. אם המשתמש חסום עקב חוב — החסימה תוסר אוטומטית."}
            </DialogDescription>
          </DialogHeader>
          {!isFreeSubscription && (
            <div className="space-y-2">
              <Label htmlFor="free-note">סיבה (חובה — תיעוד)</Label>
              <Textarea
                id="free-note"
                placeholder="לדוגמה: מטפל אורח / רישיון משותף / פיצוי"
                value={freeNote}
                onChange={(e) => setFreeNote(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={submitting}>
              ביטול
            </Button>
            <Button
              variant={isFreeSubscription ? "destructive" : "default"}
              disabled={
                submitting ||
                (!isFreeSubscription && freeNote.trim().length < 3)
              }
              onClick={async () => {
                const ok = await callApi({
                  action: "set_free",
                  isFree: !isFreeSubscription,
                  note: !isFreeSubscription ? freeNote.trim() : null,
                });
                if (ok) {
                  setDialog(null);
                  setFreeNote("");
                }
              }}
            >
              {submitting && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
              {isFreeSubscription ? "ביטול חינם" : "הפעל חינם"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
