// src/app/api/integrations/cardcom/setup/route.ts
// GET — האם המטפל חיבר Cardcom + פרטי תצוגה (last4, status); POST — חיבור/עדכון.
//
// Convention for Cardcom BillingProvider rows:
//   apiKey        = TerminalNumber (encrypted for consistency, not strictly required)
//   apiSecret     = `${ApiName}:${ApiPassword}` (ApiPassword may be empty)
//   webhookSecret = HMAC secret for /api/webhooks/cardcom/user verification
//   settings.mode = 'sandbox' | 'production'

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface SetupBody {
  terminalNumber: string;
  apiName: string;
  apiPassword?: string;
  webhookSecret: string;
  mode?: "sandbox" | "production";
  isPrimary?: boolean;
  displayName?: string;
}

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  try {
    const provider = await prisma.billingProvider.findFirst({
      where: { userId, provider: "CARDCOM" },
      select: {
        id: true,
        isActive: true,
        isPrimary: true,
        displayName: true,
        lastSyncAt: true,
        settings: true,
        createdAt: true,
      },
    });

    if (!provider) {
      return NextResponse.json({ connected: false });
    }

    const settings = (provider.settings as { mode?: string } | null) ?? null;
    return NextResponse.json({
      connected: true,
      id: provider.id,
      isActive: provider.isActive,
      isPrimary: provider.isPrimary,
      displayName: provider.displayName,
      mode: settings?.mode ?? "sandbox",
      lastSyncAt: provider.lastSyncAt?.toISOString() ?? null,
      createdAt: provider.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error("[integrations/cardcom/setup GET] failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת הגדרות הסליקה" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, session } = auth;

  let body: SetupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }

  if (!body.terminalNumber?.trim() || !body.apiName?.trim()) {
    return NextResponse.json(
      { message: "TerminalNumber ו-ApiName חובה" },
      { status: 400 }
    );
  }
  const mode = body.mode === "production" ? "production" : "sandbox";

  const apiSecretCombined = body.apiPassword?.trim()
    ? `${body.apiName.trim()}:${body.apiPassword.trim()}`
    : body.apiName.trim();

  try {
    const result = await withAudit(
      { kind: "user", session },
      {
        action: "user_cardcom_setup",
        targetType: "billing_provider",
        targetId: userId,
        details: {
          mode,
          isPrimary: body.isPrimary ?? false,
          // never log credentials — only metadata
          terminalNumberLength: body.terminalNumber.trim().length,
          hasApiPassword: !!body.apiPassword?.trim(),
        },
      },
      async (tx) => {
        if (body.isPrimary) {
          await tx.billingProvider.updateMany({
            where: { userId, isPrimary: true },
            data: { isPrimary: false },
          });
        }

        const existing = await tx.billingProvider.findFirst({
          where: { userId, provider: "CARDCOM" },
        });

        // For new connections webhookSecret is mandatory.
        // For updates, an empty webhookSecret means "keep existing" — prevents
        // accidental rotation when the user only wants to change credentials/mode.
        if (!existing && !body.webhookSecret?.trim()) {
          throw new Error("CARDCOM_MISSING_WEBHOOK_SECRET");
        }

        const newWebhookSecret = body.webhookSecret?.trim()
          ? encrypt(body.webhookSecret.trim())
          : null;

        const baseData = {
          provider: "CARDCOM" as const,
          displayName: body.displayName?.trim() || "Cardcom",
          apiKey: encrypt(body.terminalNumber.trim()),
          apiSecret: encrypt(apiSecretCombined),
          isActive: true,
          isPrimary: body.isPrimary ?? false,
          settings: { mode } satisfies Record<string, unknown>,
        };

        if (existing) {
          // Rotation: only when a NEW secret was provided. Keep the OLD secret
          // valid for 24h so in-flight Cardcom retries signed with it still verify.
          const isRotation =
            !!newWebhookSecret &&
            !!existing.webhookSecret &&
            existing.webhookSecret !== newWebhookSecret;
          return tx.billingProvider.update({
            where: { id: existing.id },
            data: {
              ...baseData,
              ...(newWebhookSecret ? { webhookSecret: newWebhookSecret } : {}),
              ...(isRotation && existing.webhookSecret
                ? {
                    previousWebhookSecret: existing.webhookSecret,
                    previousWebhookSecretValidUntil: new Date(
                      Date.now() + 24 * 60 * 60 * 1000
                    ),
                  }
                : {}),
            },
          });
        }
        // newWebhookSecret is guaranteed non-null here (checked above).
        return tx.billingProvider.create({
          data: { ...baseData, webhookSecret: newWebhookSecret!, userId },
        });
      }
    );

    return NextResponse.json({
      connected: true,
      id: result.id,
      isPrimary: result.isPrimary,
      mode,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "CARDCOM_MISSING_WEBHOOK_SECRET") {
      return NextResponse.json(
        { message: "סוד Webhook חובה ליצירת חיבור חדש" },
        { status: 400 }
      );
    }
    logger.error("[integrations/cardcom/setup POST] failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שגיאה בשמירת ההגדרות" }, { status: 500 });
  }
}

export async function DELETE() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, session } = auth;

  try {
    await withAudit(
      { kind: "user", session },
      {
        action: "user_cardcom_disconnect",
        targetType: "billing_provider",
        targetId: userId,
      },
      async (tx) => {
        await tx.billingProvider.updateMany({
          where: { userId, provider: "CARDCOM" },
          data: { isActive: false, isPrimary: false },
        });
      }
    );
    return NextResponse.json({ disconnected: true });
  } catch (err) {
    logger.error("[integrations/cardcom/setup DELETE] failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שגיאה בניתוק" }, { status: 500 });
  }
}
