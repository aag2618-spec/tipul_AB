import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Test endpoint to check email configuration
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const hasResendKey = !!process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || "Not set";
  
  return NextResponse.json({
    resendConfigured: hasResendKey,
    resendKeyLength: hasResendKey ? process.env.RESEND_API_KEY?.length : 0,
    emailFrom,
    message: hasResendKey 
      ? "✅ Resend is configured" 
      : "❌ RESEND_API_KEY is missing - emails will NOT be sent",
  });
}
