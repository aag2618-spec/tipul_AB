"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Settings, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

const ALL_TIERS = [
  { value: "ESSENTIAL", label: "בסיסי" },
  { value: "PRO", label: "מקצועי" },
  { value: "ENTERPRISE", label: "ארגוני" },
];

const TIER_COLORS: Record<string, string> = {
  ESSENTIAL: "bg-slate-600 text-slate-100",
  PRO: "bg-blue-600 text-blue-100",
  ENTERPRISE: "bg-purple-600 text-purple-100",
};

const TIER_LABELS: Record<string, string> = {
  ESSENTIAL: "בסיסי",
  PRO: "מקצועי",
  ENTERPRISE: "ארגוני",
};

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  tiers: string[];
  createdAt: string;
  updatedAt: string;
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTiers, setNewTiers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [editFlag, setEditFlag] = useState<FeatureFlag | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTiers, setEditTiers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchFlags = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/feature-flags");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setFlags(data.flags);
    } catch {
      toast.error("שגיאה בטעינת פיצ'רים");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  async function handleToggle(flag: FeatureFlag) {
    try {
      const res = await fetch(`/api/admin/feature-flags/${flag.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !flag.isEnabled }),
      });
      if (!res.ok) throw new Error("Failed");
      setFlags((prev) =>
        prev.map((f) =>
          f.id === flag.id ? { ...f, isEnabled: !f.isEnabled } : f
        )
      );
      toast.success(`${flag.name} ${!flag.isEnabled ? "הופעל" : "כובה"}`);
    } catch {
      toast.error("שגיאה בעדכון");
    }
  }

  async function handleCreate() {
    if (!newKey || !newName) {
      toast.error("יש למלא מפתח ושם");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newKey,
          name: newName,
          description: newDescription || null,
          tiers: newTiers,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed");
      }
      toast.success("פיצ'ר נוצר בהצלחה");
      setCreateOpen(false);
      setNewKey("");
      setNewName("");
      setNewDescription("");
      setNewTiers([]);
      fetchFlags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירה");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(flag: FeatureFlag) {
    if (!confirm(`למחוק את "${flag.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/feature-flags/${flag.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      setFlags((prev) => prev.filter((f) => f.id !== flag.id));
      toast.success("נמחק בהצלחה");
    } catch {
      toast.error("שגיאה במחיקה");
    }
  }

  function openEdit(flag: FeatureFlag) {
    setEditFlag(flag);
    setEditName(flag.name);
    setEditDescription(flag.description || "");
    setEditTiers([...flag.tiers]);
  }

  async function handleSaveEdit() {
    if (!editFlag) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/feature-flags/${editFlag.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDescription || null,
          tiers: editTiers,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("עודכן בהצלחה");
      setEditFlag(null);
      fetchFlags();
    } catch {
      toast.error("שגיאה בעדכון");
    } finally {
      setSaving(false);
    }
  }

  function toggleTier(tier: string, current: string[], setter: (v: string[]) => void) {
    if (current.includes(tier)) {
      setter(current.filter((t) => t !== tier));
    } else {
      setter([...current, tier]);
    }
  }

  function TierSelector({ tiers, onChange }: { tiers: string[]; onChange: (t: string[]) => void }) {
    return (
      <div className="flex flex-wrap gap-2">
        {ALL_TIERS.map((t) => {
          const active = tiers.includes(t.value);
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => toggleTier(t.value, tiers, onChange)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all border ${
                active
                  ? TIER_COLORS[t.value] + " border-transparent"
                  : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ניהול פיצ'רים</h1>
            <p className="text-muted-foreground">ניהול פיצ׳רים והרשאות תוכניות</p>
          </div>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 ml-1" />
              הוסף פיצ'ר
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>יצירת פיצ'ר חדש</DialogTitle>
              <DialogDescription>הגדר מפתח, שם ותוכניות מורשות</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>מפתח (key)</Label>
                <Input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="לדוגמה: ai_session_prep"
                  className="bg-muted border-border mt-1"
                  dir="ltr"
                />
              </div>
              <div>
                <Label>שם תצוגה</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="הכנה לפגישה עם AI"
                  className="bg-muted border-border mt-1"
                />
              </div>
              <div>
                <Label>תיאור</Label>
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="תיאור קצר..."
                  className="bg-muted border-border mt-1"
                />
              </div>
              <div>
                <Label className="mb-2 block">תוכניות מורשות</Label>
                <TierSelector tiers={newTiers} onChange={setNewTiers} />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
                className="border-border"
              >
                ביטול
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="bg-primary hover:bg-primary/90"
              >
                {creating ? "יוצר..." : "צור"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">כל הפיצ'רים</CardTitle>
          <CardDescription>{flags.length} פיצ'רים מוגדרים</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-right">מצב</TableHead>
                <TableHead className="text-right">מפתח</TableHead>
                <TableHead className="text-right">שם</TableHead>
                <TableHead className="text-right">תוכניות</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    טוען...
                  </TableCell>
                </TableRow>
              ) : flags.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    אין פיצ'רים מוגדרים
                  </TableCell>
                </TableRow>
              ) : (
                flags.map((flag) => (
                  <TableRow key={flag.id} className="border-border">
                    <TableCell>
                      <Switch
                        checked={flag.isEnabled}
                        onCheckedChange={() => handleToggle(flag)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm" dir="ltr">
                      {flag.key}
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="text-sm font-medium">{flag.name}</span>
                        {flag.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {flag.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {flag.tiers.length === 0 ? (
                          <span className="text-xs text-muted-foreground">כולם</span>
                        ) : (
                          flag.tiers.map((tier) => (
                            <Badge
                              key={tier}
                              className={TIER_COLORS[tier] || "bg-muted text-foreground"}
                            >
                              {TIER_LABELS[tier] || tier}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(flag)}
                          className="h-8 w-8 hover:bg-muted"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(flag)}
                          className="h-8 w-8 hover:bg-red-500/20 hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editFlag} onOpenChange={(open) => !open && setEditFlag(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>עריכת פיצ'ר</DialogTitle>
            <DialogDescription>
              מפתח: <code dir="ltr" className="bg-muted px-1 py-0.5 rounded text-xs">{editFlag?.key}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>שם תצוגה</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-muted border-border mt-1"
              />
            </div>
            <div>
              <Label>תיאור</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="bg-muted border-border mt-1"
              />
            </div>
            <div>
              <Label className="mb-2 block">תוכניות מורשות</Label>
              <TierSelector tiers={editTiers} onChange={setEditTiers} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditFlag(null)}
              className="border-border"
            >
              ביטול
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={saving}
              className="bg-primary hover:bg-primary/90"
            >
              {saving ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
