import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { updateProfileSchema } from "@/lib/validations/profile";

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
        usesContentFilter: true,
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

// PHONE_RE_IL — מוודא ישראלי תקין אחרי הסרת רווחים/מקפים. נשאר כאן כי הnormalize
// (cleaning של whitespace/dashes) דורש שלב pre-regex שלא מתאים ל-zod transform.
const PHONE_RE_IL = /^(\+?972|0)\d{8,9}$/;

export async function PUT(request: NextRequest) {
  try {
    // disallowImpersonation: עריכת פרופיל אישי (שם, טלפון, רישיון) —
    // OWNER לא ישנה פרטים אישיים של ה-target בשמו.
    const auth = await requireAuth({ disallowImpersonation: true });
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // H12: zod אוכף types + caps + ranges. phone עוד נורמל ידנית אחרי schema.
    const parsed = await parseBody(request, updateProfileSchema);
    if ("error" in parsed) return parsed.error;
    const { name, phone, license, defaultSessionDuration, defaultSessionPrice, usesContentFilter } = parsed.data;

    // phone normalization — מסיר רווחים/מקפים ואז אוכף PHONE_RE_IL.
    let phoneNormalized: string | null | undefined = undefined;
    if (phone !== undefined) {
      if (phone === null || phone === "") {
        phoneNormalized = null;
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

    // duration/price → number אחרי schema (schema רק אימת טווח).
    const durationNum: number | undefined =
      defaultSessionDuration !== undefined &&
      defaultSessionDuration !== null &&
      defaultSessionDuration !== ""
        ? (typeof defaultSessionDuration === "number"
            ? defaultSessionDuration
            : parseInt(String(defaultSessionDuration), 10))
        : undefined;
    const priceNum: number | null | undefined =
      defaultSessionPrice === undefined
        ? undefined
        : defaultSessionPrice === null || defaultSessionPrice === ""
          ? null
          : typeof defaultSessionPrice === "number"
            ? defaultSessionPrice
            : parseFloat(String(defaultSessionPrice));

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: typeof name === "string" ? name.trim() : undefined,
        phone: phoneNormalized,
        license: license !== undefined ? ((license as string | null) || null) : undefined,
        defaultSessionDuration: durationNum,
        defaultSessionPrice: priceNum,
        usesContentFilter:
          usesContentFilter !== undefined ? usesContentFilter : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        license: true,
        defaultSessionDuration: true,
        defaultSessionPrice: true,
        usesContentFilter: true,
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













