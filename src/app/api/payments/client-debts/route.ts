import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllClientsDebtSummary } from "@/lib/payment-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    const clientDebts = await getAllClientsDebtSummary(session.user.id);
    return NextResponse.json(clientDebts);
  } catch (error) {
    console.error("Get client debts error:", error);
    return NextResponse.json(
      { message: "שגיאה בטעינת החובות" },
      { status: 500 }
    );
  }
}
