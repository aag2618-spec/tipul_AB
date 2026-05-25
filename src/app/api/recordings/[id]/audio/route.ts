// H17: הגשת קובץ אודיו של הקלטה דרך signed URL.
//
// אבטחה:
//   • בדיקת חתימה (HMAC) — לא דורשת cookie!
//     ה-token הוא תעודה: מי שמחזיק אותו יודע שמישהו מוסמך הפיק אותו.
//   • exp בדוק — URL פג תוקף תוך 15 דקות.
//   • binding ל-userId: ה-userId שצוין ב-signed URL חייב להתאים למי שמבקש
//     את הקובץ (cookie session) — defence-in-depth, אם cookie הוחזר אבל
//     userId לא תואם, זה suspect.
//   • ownership ב-DB: גם אם החתימה תקפה, בודקים שוב שההקלטה קיימת ושייכת
//     ל-scope של המשתמש. מונע "stale URL" אחרי שמשתמש איבד גישה.
//   • path traversal: ה-audioUrl ב-DB נשען על האחסון הקיים — אנחנו לא
//     בונים path מ-input משתמש, רק קוראים את audioUrl.

import { NextRequest, NextResponse } from "next/server";
import storage from "@/lib/storage";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { verifyRecordingSignature } from "@/lib/recording-signed-url";
import {
  loadScopeUser,
  buildClientWhere,
  buildSessionWhere,
  canSecretaryAccessModel,
} from "@/lib/scope";
import { requireAuth } from "@/lib/api-auth";
import { logDataAccess } from "@/lib/audit-logger";

export const dynamic = "force-dynamic";

const ALLOWED_AUDIO_EXTENSIONS: Record<string, string> = {
  webm: "audio/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recordingId } = await params;
    const url = new URL(request.url);
    const u = url.searchParams.get("u") || "";
    const eRaw = url.searchParams.get("e") || "";
    const s = url.searchParams.get("s") || "";

    const expiresAt = Number.parseInt(eRaw, 10);

    const verification = verifyRecordingSignature({
      recordingId,
      userId: u,
      expiresAt,
      signature: s,
    });

    if (!verification.valid) {
      // לא חושפים את הסיבה מבחוץ — תמיד 403 כללי כדי לא לאפשר probing.
      logger.warn("[recordings/audio] signature verification failed", {
        recordingId,
        reason: verification.reason,
      });
      return NextResponse.json({ message: "קישור לא תקף או פג תוקף" }, { status: 403 });
    }

    // defence-in-depth: גם החתימה תקפה — בודקים שהמשתמש שב-cookie תואם
    // ל-userId שב-token. אם לא — מישהו שגנב את ה-URL מנסה להשתמש בו
    // עם session אחר.
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    if (auth.userId !== verification.userId) {
      logger.warn("[recordings/audio] cookie/token user mismatch", {
        cookieUserId: auth.userId,
        tokenUserId: verification.userId,
        recordingId,
      });
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    // ownership recheck: גם אם חתום נכון — אם המשתמש איבד גישה (הקלטה הועברה,
    // משתמש הוסר מקליניקה, וכו') — לחסום.
    const scopeUser = await loadScopeUser(auth.userId);
    if (!canSecretaryAccessModel(scopeUser, "Recording")) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }
    const clientWhere = buildClientWhere(scopeUser);
    const sessionWhere = buildSessionWhere(scopeUser);

    const recording = await prisma.recording.findFirst({
      where: {
        id: recordingId,
        OR: [{ client: clientWhere }, { session: sessionWhere }],
      },
      select: { id: true, audioUrl: true, clientId: true },
    });

    if (!recording) {
      return NextResponse.json({ message: "הקלטה לא נמצאה" }, { status: 404 });
    }

    // H17 follow-up: audit log גם בעת הגשת הקובץ עצמו (בנוסף לאודיט של
    // signed-url generation). זה נותן ראייה מלאה — לא רק "מי קיבל הרשאה
    // לגישה" אלא גם "מי בפועל הוריד/האזין". חיוני להתאמה לתקנת ההגנה
    // על מידע רפואי-נפשי.
    logDataAccess({
      userId: auth.userId,
      recordType: "RECORDING",
      recordId: recordingId,
      action: "READ",
      clientId: recording.clientId,
      request,
      meta: { signedUrlServed: true },
    });

    // audioUrl לרוב נראה כמו "/uploads/recordings/abc/xxx.webm".
    // strip prefix כדי לקבל path יחסי ל-baseDir.
    const rawPath = recording.audioUrl.replace(/^\/+/, "");
    const relativePath = rawPath.startsWith("uploads/")
      ? rawPath.substring("uploads/".length)
      : rawPath;

    // path traversal guard
    if (
      relativePath.includes("..") ||
      relativePath.includes("\0") ||
      !relativePath.startsWith("recordings/")
    ) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const extension = relativePath.split(".").pop()?.toLowerCase() || "";
    const contentType = ALLOWED_AUDIO_EXTENSIONS[extension];
    if (!contentType) {
      return NextResponse.json({ message: "סוג קובץ לא נתמך" }, { status: 400 });
    }

    const fileExists = await storage.exists(relativePath);
    if (!fileExists) {
      return NextResponse.json({ message: "קובץ לא נמצא" }, { status: 404 });
    }

    const file = await storage.read(relativePath);

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": file.length.toString(),
        // private — לא לאחסן ב-proxies. max-age קצר — לא מאריך מעבר ל-TTL של החתימה.
        "Cache-Control": "private, max-age=300, no-transform",
        "X-Content-Type-Options": "nosniff",
        // Defence-in-depth: לא מאפשרים inline embedding ב-iframe מ-domain אחר.
        "X-Frame-Options": "SAMEORIGIN",
        // H17 hardening: ה-URL החתום בquery string לא ידלוף ל-third-party
        // דרך Referer header אם הדף מוטמע ב-context אחר.
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    logger.error("[recordings/audio] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה בטעינת הקלטה" }, { status: 500 });
  }
}
