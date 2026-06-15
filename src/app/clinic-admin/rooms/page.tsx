"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DoorOpen,
  Plus,
  Loader2,
  Trash2,
  Check,
  X,
  Pencil,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

interface Room {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export default function ClinicRoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // עריכת שם inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  // פעולה רצה על שורה ספציפית (toggle / rename / delete)
  const [busyId, setBusyId] = useState<string | null>(null);
  // אישור מחיקה — מחיקה היא בלתי הפיכה, ולכן עוברת דיאלוג (עקבי עם שאר clinic-admin).
  const [confirmDeleteRoom, setConfirmDeleteRoom] = useState<Room | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/clinic/rooms", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Room[];
      setRooms(Array.isArray(data) ? data : []);
    } catch {
      setLoadError("שגיאה בטעינת החדרים");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("נא להזין שם חדר");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/clinic/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sortOrder: rooms.length }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "שגיאה ביצירת החדר");
      }
      setNewName("");
      toast.success("החדר נוסף");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ביצירת החדר");
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = editName.trim();
    if (!name) {
      toast.error("שם החדר לא יכול להיות ריק");
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/clinic/rooms/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "שגיאה בעדכון השם");
      }
      setEditingId(null);
      setEditName("");
      toast.success("השם עודכן");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בעדכון השם");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (room: Room) => {
    setBusyId(room.id);
    try {
      const res = await fetch(`/api/clinic/rooms/${room.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !room.isActive }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "שגיאה בעדכון החדר");
      }
      toast.success(room.isActive ? "החדר הושבת" : "החדר הופעל");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בעדכון החדר");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (room: Room) => {
    setBusyId(room.id);
    try {
      const res = await fetch(`/api/clinic/rooms/${room.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        // 409 = יש פגישות משויכות — מציעים השבתה במקום מחיקה.
        throw new Error(err?.message || "שגיאה במחיקת החדר");
      }
      toast.success("החדר נמחק");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה במחיקת החדר");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <DoorOpen className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">ניהול חדרי טיפול</h1>
          <p className="text-sm text-muted-foreground">
            חדרים שתגדירו כאן יופיעו לבחירה בעת קביעת פגישה, ומונעים הזמנה כפולה
            של אותו חדר באותה שעה.
          </p>
        </div>
      </div>

      {/* הוספת חדר */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            הוספת חדר
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="למשל: חדר 1, חדר שקט, אונליין"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !creating) handleCreate();
              }}
              maxLength={100}
              disabled={creating}
            />
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="ml-1 h-4 w-4" />
                  הוסף
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* רשימת חדרים */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">החדרים שלי</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <div className="text-center py-8 space-y-3">
              <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
              <p className="text-sm">{loadError}</p>
              <Button variant="outline" size="sm" onClick={load}>
                נסה שוב
              </Button>
            </div>
          ) : rooms.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              עדיין אין חדרים. הוסיפו חדר ראשון למעלה.
            </p>
          ) : (
            <div className="space-y-2">
              {rooms.map((room) => {
                const isEditing = editingId === room.id;
                const isBusy = busyId === room.id;
                return (
                  <div
                    key={room.id}
                    className={`flex items-center justify-between gap-2 py-2 px-3 rounded-md border ${
                      room.isActive
                        ? "bg-muted/30 border-border"
                        : "bg-muted/10 border-dashed border-border opacity-70"
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !isBusy) handleRename(room.id);
                            if (e.key === "Escape") {
                              setEditingId(null);
                              setEditName("");
                            }
                          }}
                          maxLength={100}
                          autoFocus
                          className="h-8"
                          disabled={isBusy}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-green-600"
                          onClick={() => handleRename(room.id)}
                          disabled={isBusy}
                          aria-label="שמור שם"
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => {
                            setEditingId(null);
                            setEditName("");
                          }}
                          disabled={isBusy}
                          aria-label="בטל עריכה"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{room.name}</span>
                        {!room.isActive && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            מושבת
                          </Badge>
                        )}
                      </div>
                    )}

                    {!isEditing && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingId(room.id);
                            setEditName(room.name);
                          }}
                          disabled={isBusy}
                          aria-label="שנה שם"
                          title="שנה שם"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleToggleActive(room)}
                          disabled={isBusy}
                          aria-label={room.isActive ? "השבת חדר" : "הפעל חדר"}
                          title={room.isActive ? "השבת (לא יוצג בבחירה)" : "הפעל"}
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : room.isActive ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-red-600"
                          onClick={() => setConfirmDeleteRoom(room)}
                          disabled={isBusy}
                          aria-label="מחק חדר"
                          title="מחק (רק אם אין פגישות משויכות)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
            * מחיקה אפשרית רק לחדר שאין לו פגישות. חדר עם היסטוריית פגישות אפשר
            <strong> להשבית</strong> — הוא לא יוצג יותר בבחירה, אך הנתונים נשמרים.
          </p>
        </CardContent>
      </Card>

      {/* אישור מחיקה — מונע מחיקה בלחיצת טעות (עקבי עם members/invitations). */}
      <AlertDialog
        open={!!confirmDeleteRoom}
        onOpenChange={(o) => {
          if (!o) setConfirmDeleteRoom(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את החדר?</AlertDialogTitle>
            <AlertDialogDescription>
              מחיקת החדר &quot;{confirmDeleteRoom?.name}&quot; היא בלתי הפיכה. אם
              משויכות אליו פגישות — המחיקה תיחסם, ועדיף להשבית את החדר במקום.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const room = confirmDeleteRoom;
                setConfirmDeleteRoom(null);
                if (room) handleDelete(room);
              }}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
