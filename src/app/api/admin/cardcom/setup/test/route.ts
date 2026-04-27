// src/app/api/admin/cardcom/setup/test/route.ts
// בדיקת חיבור לעבר Cardcom — יצירת LowProfile minimal של ₪1 ובדיקה שמתקבל URL חוקי.
// לא מבצע עסקה — סנדבוקס מחזיר תגובה ללא חיוב כסף.
//
// NOTE: כל בדיקה יוצרת LowProfile אצל Cardcom (יוצר רשומה זמנית בסנדבוקס/פרודקשן).
// אצל Cardcom יש endpoint נקי `Account/Test` או דומה — שווה לאמת מולם
// במסגרת 8 השאלות הפתוחות (סעיף 18 בביקורת קורסור). לעת עתה: rate-limit ב-middleware
// כ-SENSITIVE (5/דקה) שומר על rate סביר.

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { getAdminCardcomClient } from "@/lib/cardcom/admin-config";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requirePermission("settings.billing_provider");
  if ("error" in auth) return auth.error;

  try {
    const client = await getAdminCardcomClient();
    const result = await client.createPaymentPage({
      amount: 1,
      description: "Cardcom connection test",
      returnValue: `test_${Date.now()}`,
      successRedirectUrl: "https://example.com/success",
      failedRedirectUrl: "https://example.com/failed",
      webhookUrl: "https://example.com/webhook",
      documentType: "Receipt",
      customer: { name: "Test", email: "test@example.com" },
      products: [{ description: "Test", unitCost: 1, quantity: 1 }],
    });

    if (!result.url || !result.lowProfileId) {
      return NextResponse.json({ ok: false, message: "תגובה לא תקינה מ-Cardcom" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      message: "חיבור תקין",
      lowProfileId: result.lowProfileId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("[admin/cardcom/setup/test] failed", { error: message });
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
