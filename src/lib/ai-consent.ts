// src/lib/ai-consent.ts
//
// M1 (2026-05-17): שער הסכמת מטופל לעיבוד AI.
//
// במערכת PHI (טיפול פסיכולוגי), לפני שאנחנו שולחים נתוני מטופל לצד שלישי
// כמו Google Gemini, חייבת להיות הסכמה מפורשת של המטופל. חוק הגנת הפרטיות
// סעיף 13 ועוד מסגרות (HIPAA, GDPR) מחייבים זאת.
//
// הפתרון:
//   • שדה Client.consentToAI (Boolean?) מסמן אם המטופל הסכים.
//   • כל route AI שמטפל בנתוני מטופל ספציפי קורא ל-requireAiConsent()
//     לפני שליחת הטקסט ל-LLM.
//   • אם לא ניתנה הסכמה — 403 עם הודעה ברורה למטפל.
//
// הערה: ניתוחים שלא קשורים למטופל ספציפי (למשל "תן לי הצעות לטכניקות
// CBT") לא דורשים גמירת דעת — פשוט לא מעבירים clientId.

import { NextResponse } from "next/server";
import prisma from "./prisma";

export type AiConsentResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * בודק שמטופל אישר עיבוד נתונים ב-AI. אם לא — מחזיר response 403 עם הודעה
 * ברורה למטפל שיש לעדכן את ההסכמה. אם clientId == null — מאשר אוטומטית
 * (אין PHI ספציפי לבדוק).
 *
 * שימוש:
 *   const consent = await requireAiConsent(clientId);
 *   if (!consent.ok) return consent.response;
 *
 * הערה: הפונקציה לא בודקת בעלות על המטופל (זה תפקיד scope/buildClientWhere).
 * היא רק קוראת את ה-flag — אם clientId לא קיים בכלל, נחזיר 404-like 403
 * כדי לא לחשוף האם המטופל קיים.
 */
export async function requireAiConsent(
  clientId: string | null | undefined
): Promise<AiConsentResult> {
  if (!clientId) {
    return { ok: true };
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { consentToAI: true },
  });

  if (!client) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "המטופל לא נמצא או שלא הוגדרה הסכמה לעיבוד AI" },
        { status: 403 }
      ),
    };
  }

  // null = רשומה ישנה לפני המיגרציה. מתייחסים אליה כ-allow (תאימות לאחור).
  // false = המטופל בחר במפורש להחריג AI → חוסמים.
  // true = הסכים → עובר.
  if (client.consentToAI === false) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          message:
            "המטופל סימן שלא מאשר עיבוד נתוניו בכלי AI. ניתן לעדכן את ההסכמה בכרטיס המטופל.",
          requiresConsent: true,
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true };
}
