import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
  }

  // 2FA gate: ה-route תחת /api/auth/* (מוחרג מ-middleware matcher),
  // אז חייבים בדיקה מפורשת כאן — מונע ממשתמש חצי-מאומת לחבר Google Calendar.
  if (session.user.requires2FA) {
    return NextResponse.redirect(new URL("/auth/2fa-verify", process.env.NEXTAUTH_URL));
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/google-calendar/callback`
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state: session.user.id,
  });

  return NextResponse.redirect(authUrl);
}
