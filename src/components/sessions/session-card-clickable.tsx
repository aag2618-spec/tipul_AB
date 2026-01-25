"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";

interface SessionCardClickableProps {
  sessionId: string;
  children: ReactNode;
}

export function SessionCardClickable({ sessionId, children }: SessionCardClickableProps) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/dashboard/sessions/${sessionId}`)}
      className="flex items-center justify-between p-4 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors cursor-pointer"
    >
      {children}
    </div>
  );
}
