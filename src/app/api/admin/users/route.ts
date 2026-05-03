import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

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
    const auth = await requirePermission("users.create");
    if ("error" in auth) return auth.error;

    const body = await request.json();
    const { name, email, password, phone, role } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { message: "חובה להזין אימייל וסיסמה" },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email || undefined },
          { phone: phone || undefined },
        ].filter(Boolean)
      }
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "משתמש עם אימייל או טלפון זה כבר קיים" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

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
          role: role || 'USER',
          userNumber: nextUserNumber,
        }
      });
    });

    return NextResponse.json({
      message: "המשתמש נוצר בהצלחה",
      user: { ...newUser, password: undefined }
    });
  } catch (error) {
    logger.error('Error creating user:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת המשתמש" },
      { status: 500 }
    );
  }
}
