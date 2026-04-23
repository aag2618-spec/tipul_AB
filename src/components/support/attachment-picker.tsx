"use client";

import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENTS,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/support-attachments-config";

interface AttachmentPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentPicker({ files, onChange, disabled }: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;

    const combined = [...files, ...picked];

    if (combined.length > MAX_ATTACHMENTS) {
      toast.error(`ניתן לצרף עד ${MAX_ATTACHMENTS} קבצים בלבד`);
      e.target.value = "";
      return;
    }

    for (const f of picked) {
      if (f.size > MAX_FILE_SIZE_BYTES) {
        toast.error(`הקובץ "${f.name}" גדול מדי — מקסימום 5MB`);
        e.target.value = "";
        return;
      }
      if (!ALLOWED_MIME_TYPES.includes(f.type as (typeof ALLOWED_MIME_TYPES)[number])) {
        toast.error(`סוג הקובץ "${f.name}" לא נתמך. ניתן לצרף תמונות, PDF, או מסמכי Word`);
        e.target.value = "";
        return;
      }
    }

    onChange(combined);
    e.target.value = "";
  };

  const handleRemove = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/gif,image/webp,.pdf,.doc,.docx"
        onChange={handleSelect}
        disabled={disabled || files.length >= MAX_ATTACHMENTS}
        className="hidden"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || files.length >= MAX_ATTACHMENTS}
        >
          <Paperclip className="ml-1 h-4 w-4" />
          צרף קבצים
        </Button>
        <span className="text-xs text-muted-foreground">
          עד {MAX_ATTACHMENTS} קבצים, כל אחד עד 5MB (תמונות, PDF, Word)
        </span>
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, idx) => (
            <div
              key={`${f.name}-${idx}`}
              className="flex items-center gap-2 px-2 py-1 rounded-md border bg-muted text-xs"
            >
              <span className="truncate max-w-[180px]" title={f.name}>
                {f.name}
              </span>
              <span className="text-muted-foreground">({formatSize(f.size)})</span>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                disabled={disabled}
                className="hover:text-destructive transition-colors"
                aria-label={`הסר את ${f.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
