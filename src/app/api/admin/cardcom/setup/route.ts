// src/app/api/admin/cardcom/setup/route.ts
// GET — ההגדרה הנוכחית; POST — קביעת mode (sandbox/production).
// Credentials עצמן ב-env vars; הראוט הזה רק שולט במתג mode.

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { getSiteSetting, setSiteSetting } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("settings.billing_provider");
  if ("error" in auth) return auth.error;

  const mode = ((await getSiteSetting<string>("admin_cardcom_mode")) ?? "sandbox") as
    | "sandbox"
    | "production";

  const productionConfigured =
    !!process.env.CARDCOM_ADMIN_TERMINAL_NUMBER && !!process.env.CARDCOM_ADMIN_API_NAME;

  return NextResponse.json({ mode, productionConfigured });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.billing_provider");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  let body: { mode?: "sandbox" | "production" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }

  if (body.mode !== "sandbox" && body.mode !== "production") {
    return NextResponse.json(
      { message: 'mode חייב להיות "sandbox" או "production"' },
      { status: 400 }
    );
  }

  if (body.mode === "production") {
    if (!process.env.CARDCOM_ADMIN_TERMINAL_NUMBER || !process.env.CARDCOM_ADMIN_API_NAME) {
      return NextResponse.json(
        { message: "פרטי Cardcom של פרודקשן לא הוגדרו ב-env" },
        { status: 400 }
      );
    }
  }

  const previousMode = await getSiteSetting<string>("admin_cardcom_mode");

  try {
    await withAudit(
      { kind: "user", session },
      {
        action: "update_admin_cardcom_mode",
        targetType: "site_setting",
        targetId: "admin_cardcom_mode",
        details: { previous: previousMode ?? "sandbox", next: body.mode },
      },
      async () => {
        await setSiteSetting("admin_cardcom_mode", body.mode, session.user.id);
      }
    );
    return NextResponse.json({ mode: body.mode });
  } catch (err) {
    logger.error("[admin/cardcom/setup POST] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שגיאה בשמירת המצב" }, { status: 500 });
  }
}
