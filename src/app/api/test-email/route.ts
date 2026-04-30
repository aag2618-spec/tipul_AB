import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

// Test endpoint to check email configuration
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  // H7: rich diagnostic — ADMIN בלבד. לפני התיקון, אורך המפתח דלף לכל
  // משתמש מאומת (סייע ל-dictionary attack). עכשיו: מותר רק לאדמין,
  // ולא חושף אורך מפתח כלל.
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (auth.session.user.role !== "ADMIN") {
    return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
  }

  const hasResendKey = !!process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || "Not set";

  return NextResponse.json({
    resendConfigured: hasResendKey,
    emailFrom,
    message: hasResendKey
      ? "✅ Resend is configured"
      : "❌ RESEND_API_KEY is missing - emails will NOT be sent",
  });
}
