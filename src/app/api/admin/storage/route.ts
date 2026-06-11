import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("users.view");
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    // Get all users with their storage stats
    const users = await prisma.user.findMany({
      where: userId ? { id: userId } : {},
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: {
            documents: true,
          },
        },
      },
    });

    // Calculate storage per user (estimates)
    const storageByUser = users.map((user) => {
      const documentsCount = user._count.documents;

      // Estimates: avg 5MB per document
      const documentsStorageMB = documentsCount * 5;
      const totalStorageMB = documentsStorageMB;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        documentsCount,
        documentsStorageMB,
        totalStorageMB,
        totalStorageGB: totalStorageMB / 1024,
      };
    });

    // Sort by total storage
    storageByUser.sort((a, b) => b.totalStorageMB - a.totalStorageMB);

    // Calculate totals
    const totalDocuments = storageByUser.reduce((sum, u) => sum + u.documentsCount, 0);
    const totalStorageMB = storageByUser.reduce((sum, u) => sum + u.totalStorageMB, 0);

    return NextResponse.json({
      users: storageByUser,
      totals: {
        totalDocuments,
        totalStorageMB,
        totalStorageGB: totalStorageMB / 1024,
      },
    });
  } catch (error) {
    logger.error("Get storage error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת נתוני האחסון" },
      { status: 500 }
    );
  }
}
