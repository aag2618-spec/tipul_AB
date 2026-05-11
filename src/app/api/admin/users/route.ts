import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logger } from "@/lib/logger";
import { requirePermission, requireHighestPermission } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import type { Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Zod schema ליצירת משתמש. role הוא enum סגור — מונע mass-assignment.
// תפקידים מורשים (ADMIN/MANAGER/CLINIC_OWNER/CLINIC_SECRETARY) יאכפו דרך
// requireHighestPermission עם users.change_role נוסף ל-users.create.
const createUserSchema = z.object({
  // .min(1) הוסר במכוון — ה-UI שולח לעיתים string ריק עבור שם/טלפון לא ממולאים,
  // וה-API הקיים קיבל את זה כ-fallback לrole=USER עם שם ריק. שמירה על תאימות.
  name: z.string().trim().max(100).optional().nullable(),
  email: z.string().trim().toLowerCase().email("אימייל לא תקין").max(200),
  password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים").max(128),
  phone: z.string().trim().max(30).optional().nullable(),
  role: z
    .enum(["USER", "MANAGER", "ADMIN", "CLINIC_OWNER", "CLINIC_SECRETARY"])
    .optional(),
});

const PRIVILEGED_ROLES = new Set([
  "MANAGER",
  "ADMIN",
  "CLINIC_OWNER",
  "CLINIC_SECRETARY",
]);

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("users.view");
    if ("error" in auth) return auth.error;

    // Get search param
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';

    // Build where clause
    const where: Record<string, unknown> = {};
    if (search) {
      const orConditions: Record<string, unknown>[] = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
        { phone: { contains: search, mode: 'insensitive' as const } },
      ];
      const parsed = parseInt(search.replace('#', ''), 10);
      if (!isNaN(parsed)) {
        orConditions.push({ userNumber: parsed });
      }
      where.OR = orConditions;
    }

    // Get all users with AI usage stats
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isBlocked: true,
        blockReason: true,
        aiTier: true,
        subscriptionStatus: true,
        userNumber: true,
        createdAt: true,
        aiUsageStats: {
          select: {
            currentMonthCalls: true,
            currentMonthCost: true,
            dailyCalls: true,
          }
        },
        _count: {
          select: {
            clients: true,
            therapySessions: true,
            apiUsageLogs: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({
      users,
      total: users.length
    });
  } catch (error) {
    logger.error('Error fetching users:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת המשתמשים" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // ולידציה של ה-body לפני בדיקת ההרשאה — schema enum סגור על role
    // מונע mass-assignment של תפקיד privileged דרך מסעדה הbody.
    const parsed = await parseBody(request, createUserSchema);
    if ("error" in parsed) return parsed.error;
    const { name, email, password, phone, role } = parsed.data;

    // אכיפת הרשאה כפולה: users.create + users.change_role כאשר מבוקש תפקיד
    // privileged. MANAGER עם users.create בלבד יכול ליצור USER, אבל לא ADMIN.
    const requestedRole = role ?? "USER";
    const perms: Permission[] = ["users.create"];
    if (PRIVILEGED_ROLES.has(requestedRole)) {
      perms.push("users.change_role");
    }
    const auth = await requireHighestPermission(perms);
    if ("error" in auth) return auth.error;

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(phone ? [{ phone }] : []),
        ],
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "משתמש עם אימייל או טלפון זה כבר קיים" },
        { status: 400 }
      );
    }

    // Hash password — cost 12 (עקבי עם שאר הקוד)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user with auto-assigned userNumber
    const newUser = await prisma.$transaction(async (tx) => {
      const maxResult = await tx.user.aggregate({ _max: { userNumber: true } });
      const nextUserNumber = (maxResult._max.userNumber ?? 1000) + 1;

      return tx.user.create({
        data: {
          name,
          email,
          phone,
          password: hashedPassword,
          role: requestedRole,
          userNumber: nextUserNumber,
        },
      });
    });

    logger.info("[admin/users] user created", {
      createdBy: auth.userId,
      newUserId: newUser.id,
      role: requestedRole,
      privileged: PRIVILEGED_ROLES.has(requestedRole),
    });

    return NextResponse.json({
      message: "המשתמש נוצר בהצלחה",
      user: { ...newUser, password: undefined },
    });
  } catch (error) {
    logger.error('Error creating user:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת המשתמש" },
      { status: 500 }
    );
  }
}
