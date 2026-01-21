import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "לא מורשה" }, { status: 403 });
    }

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
        clients: {
          select: {
            _count: {
              select: {
                recordings: true,
              },
            },
          },
        },
      },
    });

    // Calculate storage per user (estimates)
    const storageByUser = users.map((user) => {
      const documentsCount = user._count.documents;
      const recordingsCount = user.clients.reduce(
        (sum, client) => sum + client._count.recordings,
        0
      );

      // Estimates: avg 5MB per document, 10MB per recording
      const documentsStorageMB = documentsCount * 5;
      const recordingsStorageMB = recordingsCount * 10;
      const totalStorageMB = documentsStorageMB + recordingsStorageMB;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        documentsCount,
        recordingsCount,
        documentsStorageMB,
        recordingsStorageMB,
        totalStorageMB,
        totalStorageGB: totalStorageMB / 1024,
      };
    });

    // Sort by total storage
    storageByUser.sort((a, b) => b.totalStorageMB - a.totalStorageMB);

    // Calculate totals
    const totalDocuments = storageByUser.reduce((sum, u) => sum + u.documentsCount, 0);
    const totalRecordings = storageByUser.reduce((sum, u) => sum + u.recordingsCount, 0);
    const totalStorageMB = storageByUser.reduce((sum, u) => sum + u.totalStorageMB, 0);

    return NextResponse.json({
      users: storageByUser,
      totals: {
        totalDocuments,
        totalRecordings,
        totalStorageMB,
        totalStorageGB: totalStorageMB / 1024,
      },
    });
  } catch (error) {
    console.error("Get storage error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת נתוני האחסון" },
      { status: 500 }
    );
  }
}
