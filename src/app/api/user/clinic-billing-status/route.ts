// GET /api/user/clinic-billing-status
// מחזיר למטפל/ת המחובר/ת את מצב סליקת המטופלים שלו/ה בקליניקה — כדי שלשונית
// "חיבורים" תציג באנר מנחה כשהבעלים הגדיר/ה אותו/ה ל"חשבון עצמאי" אך טרם
// חיבר/ה מסוף Cardcom פעיל. נוגע רק לסליקת המטופלים — לא למנוי התוכנה.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { effectiveBillingMode } from "@/lib/clinic/billing-mode";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const [user, cardcom] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true, clinicBillingMode: true },
    }),
    prisma.billingProvider.findFirst({
      where: { userId, provider: "CARDCOM", isActive: true },
      select: { id: true },
    }),
  ]);

  const cardcomConnected = !!cardcom;
  return NextResponse.json({
    inClinic: !!user?.organizationId,
    // מצב אפקטיבי (null=legacy נגזר לפי קיום מסוף פרטי) כדי שהבאנר בלשונית
    // החיבורים יתאים בדיוק לניתוב בפועל של resolveCardcomBilling.
    clinicBillingMode: effectiveBillingMode(
      user?.clinicBillingMode ?? null,
      cardcomConnected,
    ),
    cardcomConnected,
  });
}
