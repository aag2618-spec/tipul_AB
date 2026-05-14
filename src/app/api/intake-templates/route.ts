import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";

export const dynamic = "force-dynamic";

// H12: schema לתבנית אינטייק. questions הוא JSON field אבל UI (intake/[clientId]/page.tsx:49)
// קורא ל-.map() — חייב להישאר array. cap על גודל JSON כדי למנוע DoS.
const intakeTemplateSchema = z.object({
  name: z.string().trim().min(1, "שם התבנית חובה").max(200, "שם ארוך מדי"),
  questions: z
    .array(z.unknown())
    .refine(
      (v) => {
        try {
          return JSON.stringify(v).length <= 50_000;
        } catch {
          return false;
        }
      },
      { message: "שאלון גדול מדי (מקסימום 50,000 תווים)" }
    ),
  isDefault: z.boolean().optional(),
});

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const templates = await prisma.intakeTemplate.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(templates);
  } catch (error) {
    logger.error("Get intake templates error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת התבניות" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const parsed = await parseBody(request, intakeTemplateSchema);
    if ("error" in parsed) return parsed.error;
    const { name, questions, isDefault } = parsed.data;

    // If this is marked as default, unmark all others
    if (isDefault) {
      await prisma.intakeTemplate.updateMany({
        where: { userId: userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.intakeTemplate.create({
      data: {
        userId: userId,
        name,
        questions: questions as Prisma.InputJsonValue,
        isDefault: isDefault || false,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    logger.error("Create intake template error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת התבנית" },
      { status: 500 }
    );
  }
}







