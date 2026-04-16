import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const userId = searchParams.get("state");
    const error = searchParams.get("error");

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const redirectUrl = `${baseUrl}/dashboard/settings?tab=connections`;

    if (error) {
      logger.error("[GoogleCalendar] OAuth error:", { error });
      return NextResponse.redirect(`${redirectUrl}&google_error=denied`);
    }

    if (!code || !userId) {
      return NextResponse.redirect(`${redirectUrl}&google_error=missing_params`);
    }

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.redirect(`${redirectUrl}&google_error=invalid_user`);
    }

    // Exchange code for tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${baseUrl}/api/auth/google-calendar/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);

    // Get user's Google email
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    // Store or update the Google account
    const existingAccount = await prisma.account.findFirst({
      where: { userId, provider: "google" },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          access_token: tokens.access_token || null,
          refresh_token: tokens.refresh_token || existingAccount.refresh_token,
          expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
          token_type: tokens.token_type || null,
          scope: tokens.scope || null,
          id_token: tokens.id_token || null,
        },
      });
    } else {
      await prisma.account.create({
        data: {
          userId,
          type: "oauth",
          provider: "google",
          providerAccountId: profile.id || `google_${userId}`,
          access_token: tokens.access_token || null,
          refresh_token: tokens.refresh_token || null,
          expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
          token_type: tokens.token_type || null,
          scope: tokens.scope || null,
          id_token: tokens.id_token || null,
        },
      });
    }

    logger.info(`Google Calendar connected for user ${userId} (${profile.email})`);
    return NextResponse.redirect(`${redirectUrl}&google_connected=true`);
  } catch (error) {
    logger.error("[GoogleCalendar] Callback error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return NextResponse.redirect(`${baseUrl}/dashboard/settings?tab=connections&google_error=failed`);
  }
}
