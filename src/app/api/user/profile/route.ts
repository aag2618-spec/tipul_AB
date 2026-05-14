import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        license: true,
        image: true,
        defaultSessionDuration: true,
        defaultSessionPrice: true,
        // H4: 2FA status — נצרך ע"י SecurityTab. twoFactorSecret לעולם לא
        // נחזר ל-client.
        twoFactorEnabled: true,
        twoFactorMethod: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    logger.error("Get profile error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הפרופיל" },
      { status: 500 }
    );
  }
}

// M-validation: limits לפרופיל. כל השדות מוטמעים בקבלות/אימיילים/SMS,
// לכן חשוב גם length cap (DoS) וגם type check (XSS דרך escape contexts).
const MAX_NAME = 100;
const MAX_LICENSE = 50;
const PHONE_RE_IL = /^(\+?972|0)\d{8,9}$/; // ישראלי בלבד; מסיר רווחים/מקפים לפני הבדיקה

export async function PUT(request: NextRequest) {
  try {
    // disallowImpersonation: עריכת פרופיל אישי (שם, טלפון, רישיון) —
    // OWNER לא ישנה פרטים אישיים של ה-target בשמו.
    const auth = await requireAuth({ disallowImpersonation: true });
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    let body: Record<string, unknown>;
    try {
      const raw = await request.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
      }
      body = raw as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "גוף בקשה לא תקין (JSON)" }, { status: 400 });
    }

    const { name, phone, license, defaultSessionDuration, defaultSessionPrice } = body;

    // M-validation: name
    if (name !== undefined && name !== null) {
      if (typeof name !== "string") {
        return NextResponse.json({ message: "שם חייב להיות טקסט" }, { status: 400 });
      }
      if (name.trim().length === 0) {
        return NextResponse.json({ message: "שם לא יכול להיות ריק" }, { status: 400 });
      }
      if (name.length > MAX_NAME) {
        return NextResponse.json(
          { message: `שם ארוך מדי (מקסימום ${MAX_NAME} תווים)` },
          { status: 400 }
        );
      }
    }

    // M-validation: phone — אם סופק, חייב להיות טלפון ישראלי תקין.
    let phoneNormalized: string | null | undefined = undefined;
    if (phone !== undefined) {
      if (phone === null || phone === "") {
        phoneNormalized = null;
      } else if (typeof phone !== "string") {
        return NextResponse.json({ message: "טלפון חייב להיות טקסט" }, { status: 400 });
      } else {
        const cleaned = phone.replace(/[\s\-.()]/g, "");
        if (!PHONE_RE_IL.test(cleaned)) {
          return NextResponse.json(
            { message: "מספר טלפון לא תקין (חייב להיות ישראלי)" },
            { status: 400 }
          );
        }
        phoneNormalized = cleaned;
      }
    }

    // M-validation: license — נכנס לקבלות מס.
    if (license !== undefined && license !== null) {
      if (typeof license !== "string") {
        return NextResponse.json({ message: "רישיון חייב להיות טקסט" }, { status: 400 });
      }
      if (license.length > MAX_LICENSE) {
        return NextResponse.json(
          { message: `רישיון ארוך מדי (מקסימום ${MAX_LICENSE} תווים)` },
          { status: 400 }
        );
      }
    }

    // M-validation: duration 5-720 דקות.
    let durationNum: number | undefined = undefined;
    if (defaultSessionDuration !== undefined && defaultSessionDuration !== null && defaultSessionDuration !== "") {
      const parsed = typeof defaultSessionDuration === "number"
        ? defaultSessionDuration
        : parseInt(String(defaultSessionDuration), 10);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 5 || parsed > 720) {
        return NextResponse.json(
          { message: "משך פגישה חייב להיות בין 5 ל-720 דקות" },
          { status: 400 }
        );
      }
      durationNum = parsed;
    }

    // M-validation: price 0-100000 ש"ח. NaN/negative יזרק.
    let priceNum: number | null | undefined = undefined;
    if (defaultSessionPrice !== undefined) {
      if (defaultSessionPrice === null || defaultSessionPrice === "") {
        priceNum = null;
      } else {
        const parsed = typeof defaultSessionPrice === "number"
          ? defaultSessionPrice
          : parseFloat(String(defaultSessionPrice));
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
          return NextResponse.json(
            { message: "מחיר ברירת מחדל חייב להיות בין 0 ל-100,000" },
            { status: 400 }
          );
        }
        priceNum = parsed;
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: typeof name === "string" ? name.trim() : undefined,
        phone: phoneNormalized,
        license: license !== undefined ? ((license as string | null) || null) : undefined,
        defaultSessionDuration: durationNum,
        defaultSessionPrice: priceNum,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        license: true,
        defaultSessionDuration: true,
        defaultSessionPrice: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    logger.error("Update profile error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הפרופיל" },
      { status: 500 }
    );
  }
}













