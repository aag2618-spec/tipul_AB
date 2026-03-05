import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ enabled: false });
    }

    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json(
        { message: "key parameter is required" },
        { status: 400 }
      );
    }

    const flag = await prisma.featureFlag.findUnique({ where: { key } });
    if (!flag || !flag.isEnabled) {
      return NextResponse.json({ enabled: false });
    }

    if (flag.tiers.length === 0) {
      return NextResponse.json({ enabled: true });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { aiTier: true },
    });

    if (!user) {
      return NextResponse.json({ enabled: false });
    }

    const enabled = flag.tiers.includes(user.aiTier);
    return NextResponse.json({ enabled });
  } catch (error) {
    console.error("Error checking feature flag:", error);
    return NextResponse.json({ enabled: false });
  }
}
