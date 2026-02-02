import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if admin
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (adminUser?.role !== 'ADMIN') {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // Get search param
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';

    // Build where clause
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

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
        aiTier: true,
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
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if admin
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (adminUser?.role !== 'ADMIN') {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, phone, role } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { message: "Email and password are required" },
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

    // Create user
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        role: role || 'USER',
      }
    });

    return NextResponse.json({
      message: "User created successfully",
      user: { ...newUser, password: undefined }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
