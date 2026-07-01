/**
 * קישור אישי לניהול/ביטול פגישות ע"י המטופל (עמוד "הפגישות שלי").
 *
 * ממחזר את מודל BookingLink הקיים (per-client, token 256 ביט, OTP מייל/SMS,
 * תוקף 60 יום) — בלי שינוי סכמה. חשוב: קיום BookingLink אינו מפעיל זימון עצמי;
 * הזימון מגודר בנפרד ב-bookingSettings.enabled. הקישור כאן משמש רק לעמוד הביטול,
 * שמגודר ב-allowClientCancellation.
 *
 * העמוד: /p/appointments/[token]. ה-API: /api/p/appointments/[token].
 */

import prisma from "@/lib/prisma";
import { generateSecureToken } from "@/lib/clinic-invitations";
import { computeBookingLinkExpiresAt } from "@/lib/booking-links";
import { env } from "@/lib/env";

/**
 * מחזיר token פעיל של BookingLink למטופל — reuse אם קיים ולא-פג, אחרת יוצר חדש.
 * מיישר בעלות (therapistId/organizationId) ומעדכן snapshot פרטי קשר, כמו
 * send-link. מחזיר null אם אין למטופל אף ערוץ (מייל/טלפון) לשליחת קוד.
 *
 * מזהה: זהה בכוונה ללוגיקת ה-reuse ב-user/booking-settings/send-link — אותו
 * קישור משמש גם לזימון עצמי (אם מופעל) וגם לניהול פגישות.
 */
export async function ensureManageLinkToken(client: {
  id: string;
  email: string | null;
  phone: string | null;
  therapistId: string;
  organizationId?: string | null;
}): Promise<string | null> {
  if (!client.email && !client.phone) return null;

  const now = new Date();
  const newExpiry = computeBookingLinkExpiresAt(now);
  const existing = await prisma.bookingLink.findFirst({
    where: { clientId: client.id, status: "ACTIVE", expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true },
  });

  if (existing) {
    await prisma.bookingLink.update({
      where: { id: existing.id },
      data: {
        therapistId: client.therapistId,
        organizationId: client.organizationId ?? null,
        expiresAt: newExpiry,
        destinationEmail: client.email ?? null,
        destinationPhone: client.phone ?? null,
      },
    });
    return existing.token;
  }

  const created = await prisma.bookingLink.create({
    data: {
      token: generateSecureToken(),
      clientId: client.id,
      therapistId: client.therapistId,
      organizationId: client.organizationId ?? null,
      destinationEmail: client.email ?? null,
      destinationPhone: client.phone ?? null,
      expiresAt: newExpiry,
    },
    select: { token: true },
  });
  return created.token;
}

/** בונה את כתובת עמוד "הפגישות שלי" מהטוקן. */
export function buildManageUrl(token: string): string {
  const base = env.NEXTAUTH_URL.replace(/\/+$/, "");
  return `${base}/p/appointments/${token}`;
}
