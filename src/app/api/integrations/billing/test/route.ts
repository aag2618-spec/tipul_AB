// src/app/api/integrations/billing/test/route.ts
// בדיקת חיבור לספק חיוב - מאמת שה-API Key עובד

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { MeshulamClient } from "@/lib/meshulam";
import { SumitClient } from "@/lib/sumit/client";
import { ICountClient } from "@/lib/icount/client";
import { GreenInvoiceClient } from "@/lib/green-invoice/client";
import { logBillingApiCall } from "@/lib/billing-logger";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import type { BillingProviderType } from "@/lib/billing/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { providerId } = await request.json();

    if (!providerId) {
      return NextResponse.json({ message: "חסר מזהה ספק" }, { status: 400 });
    }

    // שליפת הספק
    const provider = await prisma.billingProvider.findFirst({
      where: {
        id: providerId,
        userId: userId,
      },
    });

    if (!provider) {
      return NextResponse.json({ message: "ספק לא נמצא" }, { status: 404 });
    }

    const apiKey = decrypt(provider.apiKey);
    const apiSecret = provider.apiSecret ? decrypt(provider.apiSecret) : "";

    let success = false;
    let message = "";

    switch (provider.provider) {
      case "MESHULAM": {
        try {
          const client = new MeshulamClient(apiKey);
          success = await client.testConnection();
          message = success ? "חיבור ל-Meshulam תקין!" : "חיבור נכשל";
        } catch (err) {
          message = `שגיאת חיבור ל-Meshulam: ${err instanceof Error ? err.message : "שגיאה לא ידועה"}`;
        }
        break;
      }
      case "SUMIT": {
        try {
          const client = new SumitClient(apiKey, apiSecret);
          success = await client.testConnection();
          message = success ? "חיבור ל-Sumit תקין!" : "חיבור נכשל";
        } catch (err) {
          message = `שגיאת חיבור ל-Sumit: ${err instanceof Error ? err.message : "שגיאה לא ידועה"}`;
        }
        break;
      }
      case "ICOUNT": {
        try {
          const client = new ICountClient(apiKey, apiSecret);
          success = await client.testConnection();
          message = success ? "חיבור ל-iCount תקין!" : "חיבור נכשל";
        } catch (err) {
          message = `שגיאת חיבור ל-iCount: ${err instanceof Error ? err.message : "שגיאה לא ידועה"}`;
        }
        break;
      }
      case "GREEN_INVOICE": {
        try {
          const client = new GreenInvoiceClient(apiKey, apiSecret);
          success = await client.testConnection();
          message = success ? "חיבור לחשבונית ירוקה תקין!" : "חיבור נכשל";
        } catch (err) {
          message = `שגיאת חיבור לחשבונית ירוקה: ${err instanceof Error ? err.message : "שגיאה לא ידועה"}`;
        }
        break;
      }
      case "CARDCOM": {
        // For Cardcom we stored apiKey=TerminalNumber, apiSecret=`${ApiName}:${ApiPassword}`.
        // Use a direct fetch (bypassing CardcomClient constructor) so sandbox terminal
        // can be ping-tested even when NODE_ENV=production. Documents/Search with a
        // 1-day window works as a lightweight credentials check.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
          // Split on FIRST colon only — passwords may contain ':' (matches user-config.ts).
          const colonIdx = apiSecret.indexOf(":");
          const apiName = colonIdx === -1 ? apiSecret : apiSecret.slice(0, colonIdx);
          const apiPassword = colonIdx === -1 ? "" : apiSecret.slice(colonIdx + 1);
          if (!apiName) throw new Error("חסר ApiName");
          const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, matches cron
          const res = await fetch("https://secure.cardcom.solutions/api/v11/Documents/Search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              TerminalNumber: apiKey,
              ApiName: apiName,
              ApiPassword: apiPassword,
              FromDate: today,
              ToDate: today,
            }),
            signal: controller.signal,
          });
          const data = (await res.json().catch(() => ({}))) as {
            ResponseCode?: number;
            Description?: string;
          };
          if (res.ok && data.ResponseCode === 0) {
            success = true;
            message = "חיבור ל-Cardcom תקין!";
          } else {
            message = `Cardcom דחה את הבקשה: ${data.Description || `HTTP ${res.status}`}`;
          }
        } catch (err) {
          const isAbort = err instanceof Error && err.name === "AbortError";
          message = isAbort
            ? "הבדיקה נקטעה לאחר 15 שניות (Cardcom לא הגיב)"
            : `שגיאת חיבור ל-Cardcom: ${err instanceof Error ? err.message : "שגיאה לא ידועה"}`;
        } finally {
          clearTimeout(timeout);
        }
        break;
      }
      default:
        message = "ספק לא מוכר";
    }

    // לוג הקריאה ל-API
    await logBillingApiCall({
      userId: userId,
      provider: provider.provider as BillingProviderType,
      action: "testConnection",
      success,
      error: success ? undefined : message,
    });

    // עדכון זמן סנכרון אחרון אם הצליח
    if (success) {
      await prisma.billingProvider.update({
        where: { id: provider.id },
        data: { lastSyncAt: new Date() },
      });
    }

    return NextResponse.json({ success, message });
  } catch (error) {
    logger.error("Test connection error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בבדיקת החיבור" },
      { status: 500 }
    );
  }
}
