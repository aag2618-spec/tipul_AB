import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import prisma from "@/lib/prisma";
import { questionnaires } from "@/data/questionnaire-seeds";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

// POST - Seed questionnaires to database
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(request: NextRequest) {
  try {
    // Allow with secret key OR with session (ADMIN/MANAGER).
    // Stage 1.19 — removed weak hardcoded fallback ("tipul-seed-2024"); if
    // SEED_SECRET is missing or short, the secret-based path is disabled and
    // only session auth is honored.
    const secretKey = request.headers.get("x-seed-key");
    const validSecret = process.env.SEED_SECRET;
    const secretAuthOk =
      !!validSecret &&
      validSecret.length >= 32 &&
      !!secretKey &&
      safeEqual(secretKey, validSecret);

    if (!secretAuthOk) {
      const auth = await requireAuth();
      if ("error" in auth) return auth.error;
      const { session } = auth;

      // בדיקת הרשאות - רק ADMIN או MANAGER
      const userRole = session.user.role;
      if (userRole !== "ADMIN" && userRole !== "MANAGER") {
        return NextResponse.json({ message: "Forbidden - requires ADMIN or MANAGER role" }, { status: 403 });
      }
    }

    const results = {
      created: [] as string[],
      updated: [] as string[],
      errors: [] as string[]
    };

    for (const q of questionnaires) {
      try {
        const existing = await prisma.questionnaireTemplate.findUnique({
          where: { code: q.code }
        });

        const data = {
          name: q.name,
          nameEn: q.nameEn,
          description: q.description,
          category: q.category,
          testType: q.testType as "SELF_REPORT" | "CLINICIAN_RATED" | "PROJECTIVE" | "INTELLIGENCE" | "NEUROPSYCH" | "INTERVIEW",
          questions: q.questions,
          scoring: q.scoring,
        };

        if (existing) {
          await prisma.questionnaireTemplate.update({
            where: { code: q.code },
            data
          });
          results.updated.push(q.code);
        } else {
          await prisma.questionnaireTemplate.create({
            data: {
              code: q.code,
              ...data
            }
          });
          results.created.push(q.code);
        }
      } catch (err) {
        results.errors.push(`${q.code}: ${err}`);
      }
    }

    return NextResponse.json({
      message: "Seed completed",
      created: results.created.length,
      updated: results.updated.length,
      errors: results.errors.length,
      details: results
    });
  } catch (error) {
    logger.error("Error seeding questionnaires:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to seed questionnaires" },
      { status: 500 }
    );
  }
}

// GET - Check current questionnaire count
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const count = await prisma.questionnaireTemplate.count();
    const templates = await prisma.questionnaireTemplate.findMany({
      select: { code: true, name: true, category: true, testType: true }
    });

    return NextResponse.json({
      count,
      templates,
      availableToSeed: questionnaires.map(q => ({ code: q.code, name: q.name }))
    });
  } catch (error) {
    logger.error("Error checking questionnaires:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to check questionnaires" },
      { status: 500 }
    );
  }
}
