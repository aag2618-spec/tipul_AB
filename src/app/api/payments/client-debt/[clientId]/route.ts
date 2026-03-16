import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClientDebtSummary } from "@/lib/payment-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    const { clientId } = await params;
    const result = await getClientDebtSummary(session.user.id, clientId);

    if (!result) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get client debt error:", error);
    return NextResponse.json(
      { message: "שגיאה בטעינת נתונים" },
      { status: 500 }
    );
  }
}
