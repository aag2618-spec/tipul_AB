import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  checkRateLimit,
  PASSWORD_RESET_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// POST - Reset password for a user (requires ADMIN_SECRET via x-admin-key header)
// Stage 1.19 — security hardening: timingSafe compare, stricter rate limit,
// stronger password rule, response masking, full audit log.
export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;
const MIN_ADMIN_SECRET_LENGTH = 32;
const GENERIC_ERROR = { error: "Unauthorized" } as const;

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // ── Rate limit (per IP, 3/hour) ──
  const rl = checkRateLimit(`admin-reset-password:${ip}`, PASSWORD_RESET_RATE_LIMIT);
  if (!rl.allowed) {
    logger.warn("[admin/reset-password] rate limit hit", { ip });
    return rateLimitResponse(rl);
  }

  // ── Secret presence + strength gate ──
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || adminSecret.length < MIN_ADMIN_SECRET_LENGTH) {
    logger.error("[admin/reset-password] ADMIN_SECRET missing or too weak", {
      configured: Boolean(adminSecret),
      length: adminSecret?.length ?? 0,
    });
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // ── Header check (timing-safe) ──
  const secretKey = request.headers.get("x-admin-key") ?? "";
  if (!safeCompare(secretKey, adminSecret)) {
    logger.warn("[admin/reset-password] unauthorized attempt", { ip });
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  // ── Body parse + validation ──
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "גוף הבקשה לא תקין" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "גוף הבקשה לא תקין" }, { status: 400 });
  }

  const { email, newPassword } = body as { email?: unknown; newPassword?: unknown };

  if (typeof email !== "string" || typeof newPassword !== "string") {
    return NextResponse.json(
      { error: "נדרש אימייל וסיסמה חדשה" },
      { status: 400 }
    );
  }

  const cleanEmail = email.trim().toLowerCase();
  // simple email shape + reject CRLF/whitespace embedded
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  if (!emailOk) {
    return NextResponse.json({ error: "אימייל לא תקין" }, { status: 400 });
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים` },
      { status: 400 }
    );
  }
  if (newPassword.length > 200) {
    return NextResponse.json({ error: "סיסמה ארוכה מדי" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true, email: true, name: true, role: true },
    });

    // ── Response masking: same response whether or not user exists ──
    if (!user) {
      logger.warn("[admin/reset-password] target email not found", {
        ip,
        email: cleanEmail,
      });
      return NextResponse.json({ message: "הסיסמה אופסה בהצלחה" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // ── High-priority audit trail ──
    logger.warn("[admin/reset-password] PASSWORD RESET PERFORMED", {
      ip,
      userId: user.id,
      email: user.email,
      role: user.role,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      message: "הסיסמה אופסה בהצלחה",
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("[admin/reset-password] internal error", {
      ip,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "שגיאה באיפוס הסיסמה" }, { status: 500 });
  }
}
