"use client";

import { FileText, Image as ImageIcon, Download } from "lucide-react";

export interface SupportAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  fileUrl: string;
  uploadedAt: string;
}

interface AttachmentListProps {
  attachments: SupportAttachment[] | null | undefined;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}

export function AttachmentList({ attachments }: AttachmentListProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">קבצים מצורפים:</p>
      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => (
          <a
            key={att.id}
            href={att.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={att.filename}
            className="flex items-center gap-2 px-3 py-2 rounded-md border bg-background hover:bg-muted transition-colors text-xs max-w-full"
            title={`${att.filename} (${formatSize(att.size)})`}
          >
            {isImage(att.contentType) ? (
              <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-primary" />
            )}
            <span className="truncate max-w-[180px]">{att.filename}</span>
            <span className="text-muted-foreground shrink-0">({formatSize(att.size)})</span>
            <Download className="h-3 w-3 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </div>
  );
}
