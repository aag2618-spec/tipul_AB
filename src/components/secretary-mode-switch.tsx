"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Stethoscope, Briefcase } from "lucide-react";

// ⚠️ חייב להתאים ל-SECRETARY_MODE_COOKIE ב-src/lib/secretary-mode.ts (השרת קורא אותו).
const SECRETARY_MODE_COOKIE = "mytipul_sec_mode";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type SecretaryMode = "secretary" | "therapist";

/**
 * כפתור מעבר בין "מסך המזכירות" ל"מסך הטיפול שלי" — למזכיר/ה שהוא/היא גם
 * מטפל/ת (User.secretaryIsTherapist). מציב את ה-cookie למצב היעד ואז מנווט
 * לעמוד המתאים. השרת קורא את אותו cookie (secretary-mode.ts) ומחיל את התפקיד
 * האפקטיבי (THERAPIST במצב טיפול / SECRETARY במצב מזכירות).
 *
 * אפשרות ב' (מעבר פשוט בין עמודים) — לא מתג גלובלי, אלא כפתור ייעודי בכל עולם
 * שמוביל לעולם השני.
 */
export function SecretaryModeSwitch({
  to,
  href,
  className,
}: {
  /** מצב היעד שאליו עוברים בלחיצה. */
  to: SecretaryMode;
  /** העמוד שאליו מנווטים אחרי הצבת ה-cookie. */
  href: string;
  className?: string;
}) {
  const router = useRouter();

  const handleSwitch = () => {
    document.cookie = `${SECRETARY_MODE_COOKIE}=${to}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    router.push(href);
    router.refresh();
  };

  const isToTherapist = to === "therapist";

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSwitch}
      className={className ?? "justify-start text-muted-foreground hover:text-foreground hover:bg-muted"}
    >
      {isToTherapist ? (
        <Stethoscope className="ml-2 h-4 w-4" />
      ) : (
        <Briefcase className="ml-2 h-4 w-4" />
      )}
      {isToTherapist ? "למסך הטיפול שלי" : "למסך המזכירות"}
    </Button>
  );
}
