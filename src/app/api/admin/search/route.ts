import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (adminUser?.role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    if (!q) {
      return NextResponse.json({ results: [] });
    }

    const orConditions: Record<string, unknown>[] = [
      { name: { contains: q, mode: "insensitive" as const } },
      { email: { contains: q, mode: "insensitive" as const } },
      { phone: { contains: q, mode: "insensitive" as const } },
    ];
    const parsed = parseInt(q.replace("#", ""), 10);
    if (!isNaN(parsed)) {
      orConditions.push({ userNumber: parsed });
    }

    const users = await prisma.user.findMany({
      where: { OR: orConditions },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        userNumber: true,
        role: true,
        aiTier: true,
        isBlocked: true,
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    const results = users.map((u) => ({
      id: u.id,
      type: "user" as const,
      typeLabel: "משתמש",
      title: u.name || u.email || "ללא שם",
      subtitle: [
        u.email,
        u.phone,
        u.userNumber ? `#${u.userNumber}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      role: u.role,
      aiTier: u.aiTier,
      isBlocked: u.isBlocked,
      href: `/admin/ai-dashboard?user=${u.id}`,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error in admin search:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
