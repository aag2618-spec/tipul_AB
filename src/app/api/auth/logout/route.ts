// Server-side logout — מבטל את ה-session בצד השרת בנוסף למחיקת ה-cookie בדפדפן.
//
// רקע (ממצא אבטחה 2026-06-29, מחזור חיי session): signOut של NextAuth במצב JWT
// מוחק רק את ה-cookie בדפדפן. ה-JWT עצמו נשאר תקף בצד השרת עד לתפוגתו (maxAge
// 24h, עד 30 יום ב-session פעיל), כך ש-token שנחשף/נגנב לפני ההתנתקות עדיין
// ניתן להזרקה חוזרת אחרי שהמשתמש "התנתק". כאן מבצעים bump ל-sessionVersion +
// ניקוי ה-JWT cache, כך שכל JWT שהונפק לפני רגע זה (כולל ה-token שנמחק מהדפדפן)
// ייפסל מיידית ב-jwt callback (sessionStale) ולא ניתן עוד לשימוש חוזר.
//
// הערה התנהגותית: sessionVersion הוא מונה גלובלי פר-משתמש, ולכן ההתנתקות מבטלת
// את כל ה-sessions הפעילים של המשתמש בכל המכשירים ("התנתקות מכל המכשירים").
// במערכת רפואית עם PHI זו ברירת מחדל מקובלת ובטוחה (אין כרגע מנגנון ביטול
// פר-token בודד — sessionVersion הוא לֵבֶר הביטול היחיד בצד השרת).
//
// אבטחה:
//   • CSRF — נתיבי /api/auth/* מוחרגים מה-proxy (כדי לא להפריע ל-NextAuth flow),
//     ולכן בדיקת המקור (defense-in-depth מעבר ל-SameSite=Lax) מתבצעת כאן ידנית.
//   • rate-limit (per-user) — מגביל הצפת כתיבות ל-DB.
//   • אין session → no-op עם 200, כדי לא לשבור את ה-flow בצד הלקוח (signOut ירוץ
//     בכל מקרה). גם הנתיב הזה לא מבצע כתיבת DB.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions, invalidateJwtCache } from "@/lib/auth";
import { isCrossOriginMutation } from "@/lib/csrf";
import {
  checkRateLimit,
  LOGOUT_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // CSRF — /api/auth/* מוחרג מה-proxy, אז בודקים מקור כאן.
  if (
    isCrossOriginMutation(
      request.method,
      request.headers,
      request.headers.get("host") ?? request.nextUrl.host
    )
  ) {
    return NextResponse.json(
      { message: "הבקשה נחסמה: מקור לא מורשה." },
      { status: 403 }
    );
  }

  const session = await getServerSession(authOptions);
  // בעת impersonation, session.user.id הוא ה-target — אבל ה-JWT שייך ל-OWNER
  // המקורי (originalUserId). מבטלים את ה-sessionVersion של ה-principal שה-token
  // באמת מייצג, אחרת היינו מבטלים בטעות את הסשנים של ה-target.
  const userId = session?.user?.originalUserId ?? session?.user?.id;

  // אין session (כבר מנותק / אין cookie) — no-op כדי לא לשבור את ה-flow בצד הלקוח.
  if (!userId) {
    return NextResponse.json({ ok: true });
  }

  // rate-limit לפי משתמש — מונע הצפת כתיבות ל-DB (משתמש לגיטימי לא מתנתק
  // יותר מכמה פעמים בדקה).
  const rl = checkRateLimit(`logout:${userId}`, LOGOUT_RATE_LIMIT);
  if (!rl.allowed) {
    return rateLimitResponse(rl);
  }

  try {
    // bump sessionVersion → כל JWT שהונפק לפני רגע זה ייפסל ב-jwt callback
    // (dbUser.sessionVersion > token.sv → sessionStale) ולא יהיה ניתן להזרקה חוזרת.
    await prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
    // סגירת חלון 30s של ה-JWT cache — אחרת ה-token היה ממשיך לעבוד עד שה-cache פג.
    invalidateJwtCache(userId);
  } catch (error) {
    logger.error("[auth/logout] server-side session revocation failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בהתנתקות בצד השרת" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
