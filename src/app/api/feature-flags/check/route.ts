import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) {
      return NextResponse.json({ enabled: false });
    }
    const { userId } = auth;

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
      where: { id: userId },
      select: { aiTier: true },
    });

    if (!user) {
      return NextResponse.json({ enabled: false });
    }

    const enabled = flag.tiers.includes(user.aiTier);
    return NextResponse.json({ enabled });
  } catch (error) {
    logger.error("Error checking feature flag:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ enabled: false });
  }
}
