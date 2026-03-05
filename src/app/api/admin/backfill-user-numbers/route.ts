import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST() {
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

    const result = await prisma.$transaction(async (tx) => {
      const maxResult = await tx.user.aggregate({ _max: { userNumber: true } });
      let nextNumber = (maxResult._max.userNumber ?? 1000) + 1;

      const usersWithout = await tx.user.findMany({
        where: { userNumber: null },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      for (const user of usersWithout) {
        await tx.user.update({
          where: { id: user.id },
          data: { userNumber: nextNumber },
        });
        nextNumber++;
      }

      return usersWithout.length;
    });

    return NextResponse.json({
      message: `הוקצו מספרים ל-${result} משתמשים`,
      count: result,
    });
  } catch (error) {
    console.error("Backfill error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
