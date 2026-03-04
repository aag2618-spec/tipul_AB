"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Download, Pencil, Check, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface DocumentItemProps {
  doc: {
    id: string;
    name: string;
    fileUrl: string;
    createdAt: string;
  };
}

export function DocumentItem({ doc }: DocumentItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(doc.name);
  const [displayName, setDisplayName] = useState(doc.name);

  const handleRename = async () => {
    if (!newName.trim() || newName === displayName) {
      setIsRenaming(false);
      setNewName(displayName);
      return;
    }

    try {
      const response = await fetch(`/api/documents/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (response.ok) {
        setDisplayName(newName.trim());
        setIsRenaming(false);
        toast.success("שם הקובץ עודכן");
      } else {
        toast.error("שגיאה בשינוי שם");
      }
    } catch {
      toast.error("שגיאה בשינוי שם");
    }
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-background">
      <div className="flex items-center gap-4 flex-1">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          {isRenaming ? (
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-8 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") { setIsRenaming(false); setNewName(displayName); }
                }}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRename}>
                <Check className="h-4 w-4 text-green-600" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setIsRenaming(false); setNewName(displayName); }}>
                <X className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-medium">{displayName}</p>
              <button
                onClick={() => setIsRenaming(true)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="שנה שם"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {format(new Date(doc.createdAt), "dd/MM/yyyy")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
            <FileText className="h-4 w-4 ml-2" />
            פתח
          </a>
        </Button>
        <Button variant="ghost" size="icon" asChild>
          <a href={doc.fileUrl} download target="_blank" rel="noopener noreferrer">
            <Download className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
