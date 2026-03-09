import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await req.json();
    const { announcementId } = body;

    if (!announcementId) {
      return NextResponse.json(
        { message: "מזהה הודעה חסר" },
        { status: 400 }
      );
    }

    const announcement = await prisma.systemAnnouncement.findUnique({
      where: { id: announcementId },
    });

    if (!announcement) {
      return NextResponse.json({ message: "הודעה לא נמצאה" }, { status: 404 });
    }

    await prisma.announcementDismissal.upsert({
      where: {
        announcementId_userId: {
          announcementId,
          userId: session.user.id,
        },
      },
      update: {},
      create: {
        announcementId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Dismiss announcement error:", error);
    return NextResponse.json(
      { message: "שגיאה בדחיית ההודעה" },
      { status: 500 }
    );
  }
}
