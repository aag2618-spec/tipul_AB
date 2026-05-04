"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Users,
  Plus,
  Loader2,
  Search,
  Crown,
  Stethoscope,
  Briefcase,
  Trash2,
  Settings,
  Check,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

type ClinicRole = "OWNER" | "THERAPIST" | "SECRETARY";

interface SecretaryPermissions {
  canViewPayments?: boolean;
  canIssueReceipts?: boolean;
  canSendReminders?: boolean;
  canCreateClient?: boolean;
  canViewDebts?: boolean;
  canViewStats?: boolean;
  canViewConsentForms?: boolean;
}

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: string;
  clinicRole: ClinicRole | null;
  secretaryPermissions: SecretaryPermissions | null;
  isBlocked: boolean;
  createdAt: string;
  _count: { clients: number };
}

interface SearchResult {
  id: string;
  name: string | null;
  email: string;
}

const SECRETARY_PERMS: { key: keyof SecretaryPermissions; label: string; help: string }[] = [
  { key: "canCreateClient", label: "יצירת מטופל חדש", help: "פתיחת תיק מטופל" },
  { key: "canSendReminders", label: "שליחת תזכורות", help: "SMS/Email לפגישות" },
  { key: "canViewPayments", label: "צפייה בתשלומים", help: "ראייה של היסטוריית חיוב" },
  { key: "canIssueReceipts", label: "הוצאת קבלות", help: "Cardcom — קבלה דיגיטלית" },
  { key: "canViewDebts", label: "צפייה בחובות", help: "מי לא שילם" },
  { key: "canViewStats", label: "סטטיסטיקות עסק", help: "דוחות ביצועים" },
  { key: "canViewConsentForms", label: "צפייה בטפסי הסכמה", help: "טפסי קבלה ותוכניות (אדמיניסטרטיבי)" },
];

const DEFAULT_SECRETARY_PERMS: SecretaryPermissions = {
  canViewPayments: false,
  canIssueReceipts: false,
  canSendReminders: true,
  canCreateClient: true,
  canViewDebts: false,
  canViewStats: false,
  canViewConsentForms: false,
};

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
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // הוספה
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null);
  const [newClinicRole, setNewClinicRole] = useState<"THERAPIST" | "SECRETARY">("THERAPIST");
  const [adding, setAdding] = useState(false);

  // הרשאות
  const [permsDialogOpen, setPermsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editPerms, setEditPerms] = useState<SecretaryPermissions>(DEFAULT_SECRETARY_PERMS);
  const [savingPerms, setSavingPerms] = useState(false);

  // הסרה
  const [removeId, setRemoveId] = useState<string | null>(null);

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

  // חיפוש משתמשים
  useEffect(() => {
    if (!addDialogOpen || selectedUser) return;
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/clinic-admin/members/search?q=${encodeURIComponent(searchQuery.trim())}`
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, addDialogOpen, selectedUser]);

  function openAddDialog() {
    setSelectedUser(null);
    setSearchQuery("");
    setSearchResults([]);
    setNewClinicRole("THERAPIST");
    setAddDialogOpen(true);
  }

  async function handleAdd() {
    if (!selectedUser) return;
    setAdding(true);
    try {
      const res = await fetch("/api/clinic-admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          clinicRole: newClinicRole,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      toast.success("החבר/ה נוספ/ה לקליניקה");
      setAddDialogOpen(false);
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בהוספה");
    } finally {
      setAdding(false);
    }
  }

  function openPermsDialog(member: Member) {
    setEditingMember(member);
    setEditPerms(member.secretaryPermissions || DEFAULT_SECRETARY_PERMS);
    setPermsDialogOpen(true);
  }

  async function handleSavePerms() {
    if (!editingMember) return;
    setSavingPerms(true);
    try {
      const res = await fetch(`/api/clinic-admin/members/${editingMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretaryPermissions: editPerms }),
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
        <Button onClick={openAddDialog}>
          <Plus className="ml-2 h-4 w-4" />
          הוסף חבר/ה
        </Button>
      </div>

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
                            {m.isBlocked && (
                              <Badge variant="destructive" className="text-[10px]">חסום</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {m.email} · {m._count.clients} מטופלים
                          </div>
                        </div>
                        <div className="flex gap-1.5">
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

      {/* הוספת חבר */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת חבר/ה לקליניקה</DialogTitle>
            <DialogDescription>
              חיפוש משתמשים קיימים שעדיין לא משויכים לקליניקה אחרת.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {selectedUser ? (
              <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-primary" />
                  <div>
                    <div className="font-medium">{selectedUser.name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{selectedUser.email}</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedUser(null)}>
                  החלף
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="חיפוש לפי אימייל או שם (לפחות 2 תווים)..."
                    className="pr-9"
                  />
                  {searching && (
                    <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {searchResults.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    {searchResults.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUser(u)}
                        className="w-full text-right px-3 py-2 hover:bg-muted transition-colors border-b border-border last:border-0"
                      >
                        <div className="font-medium text-sm">{u.name || u.email}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </button>
                    ))}
                  </div>
                )}
                {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    לא נמצאו משתמשים זמינים. ייתכן שהמשתמש כבר בקליניקה אחרת או חסום.
                  </p>
                )}
              </>
            )}

            {selectedUser && (
              <div className="space-y-2 pt-3 border-t border-border">
                <Label>תפקיד בקליניקה</Label>
                <Select
                  value={newClinicRole}
                  onValueChange={(v) => setNewClinicRole(v as "THERAPIST" | "SECRETARY")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="THERAPIST">מטפל/ת</SelectItem>
                    <SelectItem value="SECRETARY">מזכיר/ה</SelectItem>
                  </SelectContent>
                </Select>
                {newClinicRole === "SECRETARY" && (
                  <p className="text-xs text-muted-foreground">
                    הרשאות ברירת מחדל: יצירת מטופלים + שליחת תזכורות. ניתן לשנות אחרי
                    ההוספה.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={adding}>
              ביטול
            </Button>
            <Button onClick={handleAdd} disabled={!selectedUser || adding}>
              {adding && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              הוסף לקליניקה
            </Button>
          </DialogFooter>
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
                גישה לתוכן קליני (סיכומים, אבחנות, ניתוחי AI, הקלטות) חסומה תמיד —
                לא ניתנת לשינוי.
              </span>
            </DialogDescription>
          </DialogHeader>

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
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>הסר/י</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
