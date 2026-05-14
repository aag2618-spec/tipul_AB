// H18: ניהול recovery codes ל-2FA TOTP.
//
// GET    /api/auth/2fa/recovery-codes — מחזיר רק את הספירה (לא את הקודים).
//                                        משמש את ה-UI להצגת "נותרו X קודים".
// POST   /api/auth/2fa/recovery-codes — מייצר 10 קודים חדשים (מבטל ישנים).
//                                        דורש TOTP code תקף כאישור.
//
// אבטחה:
//   • requireAuth — רק המשתמש עצמו
//   • disallowImpersonation — אסור ל-OWNER להפיק קודים בשם משתמש אחר
//   • POST דורש TOTP code תקף — לא ניתן להחליף קודים בלי שליטה על הטלפון

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import {
  countRemainingRecoveryCodes,
  generateRecoveryCodes,
  hashRecoveryCodes,
  verifyTotpCode,
} from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth({ disallowImpersonation: true });
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const remaining = await countRemainingRecoveryCodes(userId);
  return NextResponse.json({ remaining });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth({ disallowImpersonation: true });
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json(
      { message: "נדרש קוד אימות מהאפליקציה ליצירת קודים חדשים" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorMethod: true, twoFactorSecret: true },
  });
  if (!user || user.twoFactorMethod !== "TOTP" || !user.twoFactorSecret) {
    return NextResponse.json(
      { message: "TOTP לא הוגדר. אנא הפעל/י Authenticator תחילה." },
      { status: 400 }
    );
  }

  if (!verifyTotpCode(user.twoFactorSecret, code)) {
    return NextResponse.json(
      { message: "קוד שגוי. נסה/י שוב." },
      { status: 400 }
    );
  }

  // יצירת קודים חדשים — מבטלת אוטומטית את הישנים (overwrite).
  const recoveryCodes = generateRecoveryCodes();
  const recoveryHashes = await hashRecoveryCodes(recoveryCodes);

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorRecoveryCodes: JSON.stringify(recoveryHashes) },
  });

  logger.info("[2fa/recovery-codes] codes regenerated", {
    userId,
    count: recoveryCodes.length,
  });

  return NextResponse.json({ success: true, recoveryCodes });
}
