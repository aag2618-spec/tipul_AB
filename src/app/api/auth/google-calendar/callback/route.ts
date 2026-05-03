import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { verifyGoogleOAuthState } from "@/lib/google-oauth-state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const stateParam = searchParams.get("state");
    const error = searchParams.get("error");

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const redirectUrl = `${baseUrl}/dashboard/settings?tab=connections`;

    // 2FA gate + ownership check: ה-route תחת /api/auth/* (מוחרג מ-middleware),
    // אז דרושות בדיקות מפורשות.
    // 1. session חייב להיות (אחרת מישהו יכול להריץ OAuth ל-userId של מישהו אחר).
    // 2. requires2FA — חוסם משתמש חצי-מאומת.
    // 3. state חתום עם HMAC + תוקף 10 דק' (verifyGoogleOAuthState).
    // 4. state.userId חייב להתאים ל-session.user.id — מונע confused-deputy.
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.redirect(`${redirectUrl}&google_error=not_authenticated`);
    }
    if (session.user.requires2FA) {
      return NextResponse.redirect(new URL("/auth/2fa-verify", baseUrl));
    }

    if (error) {
      logger.error("[GoogleCalendar] OAuth error:", { error });
      return NextResponse.redirect(`${redirectUrl}&google_error=denied`);
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(`${redirectUrl}&google_error=missing_params`);
    }

    // אימות state HMAC — חוסם זיוף, replay (state ישן), וערך לא תקני.
    const stateCheck = verifyGoogleOAuthState(stateParam);
    if (!stateCheck.valid || !stateCheck.userId) {
      logger.error("[GoogleCalendar] invalid OAuth state", {
        reason: stateCheck.reason,
        sessionUserId: session.user.id,
      });
      return NextResponse.redirect(`${redirectUrl}&google_error=invalid_state`);
    }
    const userId = stateCheck.userId;

    // ownership check — state.userId חייב להתאים ל-session.user.id
    if (userId !== session.user.id) {
      logger.error("[GoogleCalendar] state mismatch — possible confused-deputy attack", {
        sessionUserId: session.user.id,
      });
      return NextResponse.redirect(`${redirectUrl}&google_error=invalid_state`);
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
