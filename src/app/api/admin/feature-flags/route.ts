import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { DEFAULT_FEATURE_FLAGS } from "@/lib/defaults";

// alias זמני — שומר על שם ה-constant המקומי כדי למזער שינויים בהמשך הקובץ
const DEFAULT_FLAGS = DEFAULT_FEATURE_FLAGS;

async function seedDefaultFlags(session: Session) {
  // bootstrap חד-פעמי — רץ רק כאשר count=0. עטוף ב-withAudit כדי להשאיר רישום
  // של מי גרם לראיות החשאיות לצוץ בפעם הראשונה.
  return withAudit(
    { kind: "user", session },
    {
      action: "seed_default_feature_flags",
      targetType: "feature_flag",
      details: { keys: DEFAULT_FLAGS.map((f) => f.key) },
    },
    async (tx) => {
      for (const flag of DEFAULT_FLAGS) {
        await tx.featureFlag.upsert({
          where: { key: flag.key },
          update: {},
          create: {
            key: flag.key,
            name: flag.name,
            description: flag.description,
            isEnabled: true,
            // spread נדרש כי DEFAULT_FEATURE_FLAGS הוא `as const` (readonly tuples)
            // ו-Prisma דורש mutable string[].
            tiers: [...flag.tiers],
          },
        });
      }
    }
  );
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requirePermission("settings.feature_flags");
    if ("error" in auth) return auth.error;

    const count = await prisma.featureFlag.count();
    if (count === 0) {
      await seedDefaultFlags(auth.session);
    }

    const flags = await prisma.featureFlag.findMany({
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ flags });
  } catch (error) {
    logger.error("Error fetching feature flags:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת feature flags" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.feature_flags");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const { key, name, description, tiers } = body;

    if (!key || !name) {
      return NextResponse.json(
        { message: "חובה לציין key ו-name" },
        { status: 400 }
      );
    }

    const existing = await prisma.featureFlag.findUnique({ where: { key } });
    if (existing) {
      return NextResponse.json(
        { message: "כבר קיים feature flag עם key זה" },
        { status: 400 }
      );
    }

    const flag = await withAudit(
      { kind: "user", session },
      {
        action: "create_feature_flag",
        targetType: "feature_flag",
        details: { key, name, tiers: tiers ?? [] },
      },
      async (tx) =>
        tx.featureFlag.create({
          data: {
            key,
            name,
            description: description || null,
            isEnabled: true,
            tiers: tiers || [],
          },
        })
    );

    return NextResponse.json({ flag });
  } catch (error) {
    logger.error("Error creating feature flag:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת feature flag" },
      { status: 500 }
    );
  }
}
