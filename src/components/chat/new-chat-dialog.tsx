"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Check } from "lucide-react";
import type { ChatContact } from "./types";

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
}

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: ChatContact[];
  loading: boolean;
  creating: boolean;
  onCreateDirect: (contactId: string) => void;
  onCreateGroup: (title: string, ids: string[]) => void;
}

export function NewChatDialog({
  open,
  onOpenChange,
  contacts,
  loading,
  creating,
  onCreateDirect,
  onCreateGroup,
}: NewChatDialogProps) {
  // איפוס הבחירה בכל פתיחה נעשה ע"י remount (key) ב-TeamChatView — אין צורך
  // ב-useEffect, וכך נמנעים מ-setState בתוך effect.
  const [selected, setSelected] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState("");

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const isGroup = selected.length >= 2;

  const handleSubmit = () => {
    if (creating) return;
    if (selected.length === 1) {
      onCreateDirect(selected[0]);
    } else if (isGroup) {
      const title = groupTitle.trim();
      if (!title) return;
      onCreateGroup(title, selected);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>שיחה או קבוצה חדשה</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ms-2" />
            טוען אנשי צוות…
          </div>
        ) : contacts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            אין אנשי צוות זמינים לצ׳אט כרגע.
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              בחר/י איש צוות אחד לשיחה פרטית, או כמה כדי ליצור קבוצה.
            </p>

            <div className="divide-y max-h-72 overflow-y-auto">
              {contacts.map((c) => {
                const sel = selected.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    aria-pressed={sel}
                    className={`w-full text-right p-2 flex items-center gap-3 rounded-md transition-colors hover:bg-accent/50 ${
                      sel ? "bg-primary/10" : ""
                    }`}
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(c.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">
                        {c.name || "משתמש"}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.role}</p>
                    </div>
                    <span
                      className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${
                        sel
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {sel && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>

            {isGroup && (
              <Input
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="שם הקבוצה"
                maxLength={100}
                aria-label="שם הקבוצה"
              />
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-muted-foreground">
                {selected.length === 0
                  ? "לא נבחרו אנשי צוות"
                  : selected.length === 1
                  ? "שיחה פרטית"
                  : `קבוצה · ${selected.length} משתתפים`}
              </span>
              <Button
                onClick={handleSubmit}
                disabled={
                  creating ||
                  selected.length === 0 ||
                  (isGroup && !groupTitle.trim())
                }
                aria-busy={creating}
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isGroup ? (
                  "צור קבוצה"
                ) : (
                  "פתח שיחה"
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
