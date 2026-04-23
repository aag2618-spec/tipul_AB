import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// תאימות לאחור — קישורים ישנים שנשלחו במייל לפני שהדף החדש נוצר
// מפנים לדף החדש שמטפל באימות בצורה מעוצבת
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const target = new URL("/verify-email", request.nextUrl.origin);
  if (token) {
    target.searchParams.set("token", token);
  }
  return NextResponse.redirect(target);
}
