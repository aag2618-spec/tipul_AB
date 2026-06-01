"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
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
  onPick: (contactId: string) => void;
}

export function NewChatDialog({
  open,
  onOpenChange,
  contacts,
  loading,
  onPick,
}: NewChatDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>שיחה חדשה</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ms-2" />
            טוען אנשי צוות…
          </div>
        ) : contacts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            אין אנשי צוות נוספים בקליניקה כרגע.
          </div>
        ) : (
          <div className="divide-y max-h-80 overflow-y-auto">
            {contacts.map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                className="w-full text-right p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors rounded-md"
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(c.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {c.name || "משתמש"}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.role}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
