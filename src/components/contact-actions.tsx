"use client";

import { Phone, MessageCircle } from "lucide-react";
import { normalizeIsraeliPhone } from "@/lib/booking-core";

interface ContactActionsProps {
  phone?: string | null;
  /** גודל האייקונים. ברירת מחדל "sm". */
  size?: "sm" | "md";
}

/**
 * כפתורי "התקשר" (tel:) ו-WhatsApp (wa.me) לטלפון ישראלי. מנרמל את המספר
 * ל-05XXXXXXXX; ל-WhatsApp ממיר ל-972XXXXXXXXX. אם המספר לא תקין — לא מציג כלום.
 * משותף ליומן/מוקד/חיפוש מהיר. `stopPropagation` כדי שלא להפעיל את לחיצת השורה.
 */
export function ContactActions({ phone, size = "sm" }: ContactActionsProps) {
  const norm = phone ? normalizeIsraeliPhone(phone) : null;
  if (!norm) return null;
  const wa = "972" + norm.slice(1);
  const icon = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  const box = size === "md" ? "h-8 w-8" : "h-7 w-7";

  return (
    <span
      className="flex items-center gap-1 shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <a
        href={`tel:${norm}`}
        title="התקשר"
        aria-label="התקשר"
        className={`${box} flex items-center justify-center rounded-md border text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors`}
      >
        <Phone className={icon} aria-hidden />
      </a>
      <a
        href={`https://wa.me/${wa}`}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp"
        aria-label="WhatsApp"
        className={`${box} flex items-center justify-center rounded-md border text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors`}
      >
        <MessageCircle className={icon} aria-hidden />
      </a>
    </span>
  );
}
