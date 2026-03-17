import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ message: "אין הרשאה" }, { status: 401 }) };
  }
  return { userId: session.user.id, session };
}

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ message: "אין הרשאה" }, { status: 401 }) };
  }
  if ((session.user as any).role !== "ADMIN") {
    return { error: NextResponse.json({ message: "אין הרשאת מנהל" }, { status: 403 }) };
  }
  return { userId: session.user.id, session };
}
