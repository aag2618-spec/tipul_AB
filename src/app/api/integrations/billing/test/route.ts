// src/app/api/integrations/billing/test/route.ts
// בדיקת חיבור לספק חיוב - מאמת שה-API Key עובד

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { MeshulamClient } from "@/lib/meshulam";
import { SumitClient } from "@/lib/sumit/client";
import { ICountClient } from "@/lib/icount/client";
import { GreenInvoiceClient } from "@/lib/green-invoice/client";
import { logBillingApiCall } from "@/lib/billing-logger";

// פונקציית פענוח מוצפן (זהה לזו שב-billing service)
function decryptApiKey(encrypted: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return encrypted;
  
  try {
    const { createDecipheriv } = require("node:crypto");
    const [ivHex, authTagHex, encryptedHex] = encrypted.split(":");
    if (!ivHex || !authTagHex || !encryptedHex) return encrypted;
    
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const keyBuffer = Buffer.from(key, "hex");
    
    const decipher = createDecipheriv("aes-256-gcm", keyBuffer, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return encrypted;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const { providerId } = await request.json();

    if (!providerId) {
      return NextResponse.json({ error: "חסר מזהה ספק" }, { status: 400 });
    }

    // שליפת הספק
    const provider = await prisma.billingProvider.findFirst({
      where: {
        id: providerId,
        userId: session.user.id,
      },
    });

    if (!provider) {
      return NextResponse.json({ error: "ספק לא נמצא" }, { status: 404 });
    }

    const apiKey = decryptApiKey(provider.apiKey);
    const apiSecret = provider.apiSecret ? decryptApiKey(provider.apiSecret) : "";

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
      default:
        message = "ספק לא מוכר";
    }

    // לוג הקריאה ל-API
    await logBillingApiCall({
      userId: session.user.id,
      provider: provider.provider as "MESHULAM" | "SUMIT" | "ICOUNT" | "GREEN_INVOICE",
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
    console.error("Test connection error:", error);
    return NextResponse.json(
      { error: "שגיאה בבדיקת החיבור" },
      { status: 500 }
    );
  }
}
