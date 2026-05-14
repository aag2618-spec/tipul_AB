import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { updateInsurerSettingsSchema } from "@/lib/validations/misc";

// scope.ts: ההגדרות הללו הן per-user (InsurerSettings.therapistId @unique).
// אין צורך ב-buildClientWhere/Org filtering — נשארות כמות שהן (Pattern G).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const settings = await prisma.insurerSettings.findUnique({
      where: { therapistId: userId },
    });

    // Return defaults if no settings exist
    if (!settings) {
      return NextResponse.json({
        enabled: false,
        clalit: { enabled: false, apiKey: "", facilityId: "" },
        maccabi: { enabled: false, apiKey: "", providerId: "" },
        meuhedet: { enabled: false, username: "", password: "" },
        leumit: { enabled: false, apiKey: "", clinicCode: "" },
        autoSubmit: false,
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    logger.error("Get insurer settings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת הגדרות" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    // H12: validation דרך zod — .strict() כדי לחסום שדות לא מוכרים שיכלו
    // להיכנס ל-upsert כתוצאה מפריסת body גולמי. בלי זה תוקף יכל להזריק שדה
    // שלא קיים ב-schema ולקבל 500.
    const parsed = await parseBody(request, updateInsurerSettingsSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;

    const settings = await prisma.insurerSettings.upsert({
      where: { therapistId: userId },
      create: {
        therapistId: userId,
        ...body,
      },
      update: body,
    });

    return NextResponse.json(settings);
  } catch (error) {
    logger.error("Update insurer settings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בשמירת הגדרות" },
      { status: 500 }
    );
  }
}
