// src/app/api/contact/route.ts
// טופס "צרו קשר" ציבורי-אנונימי מדף הנחיתה (בעיקר קליניקות).
// אבטחה: rate-limit לפי IP, zod עם caps על אורכים, honeypot נגד בוטים.
// הליד נשמר ב-DB תמיד (כדי שלא יאבד בשבת או בכשל מייל); המייל ל-admin הוא
// best-effort — כשלים בו לא מכשילים את הבקשה.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  checkRateLimit,
  CONTACT_RATE_LIMIT,
  CONTACT_GLOBAL_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { parseBody } from "@/lib/validations/helpers";
import { contactLeadSchema } from "@/lib/validations/contact";
import { getSiteSetting } from "@/lib/site-settings";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`contact:${ip}`, CONTACT_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);
    // שכבה שנייה: תקרה גלובלית נגד botnet מבוזר שמתפצל על IPs רבים.
    const rlGlobal = checkRateLimit("contact:global", CONTACT_GLOBAL_RATE_LIMIT);
    if (!rlGlobal.allowed) return rateLimitResponse(rlGlobal);

    const parsed = await parseBody(request, contactLeadSchema);
    if ("error" in parsed) return parsed.error;
    const { name, email, phone, organization, message, website } = parsed.data;

    // honeypot — בוט מילא שדה נסתר. מחזירים success בשקט בלי לשמור/לשלוח.
    if (website && website.trim() !== "") {
      return NextResponse.json({ success: true });
    }

    const lead = await prisma.lead.create({
      data: {
        name,
        email,
        phone: phone?.trim() || null,
        organization: organization?.trim() || null,
        message,
        source: "landing_contact",
      },
      select: { id: true },
    });

    // מייל ל-admin — best-effort. כשל/שבת לא מכשילים (הליד כבר נשמר ב-DB).
    try {
      const adminEmail =
        (await getSiteSetting<string>("admin_business_email")) ||
        process.env.ADMIN_EMAIL ||
        "";
      if (adminEmail) {
        const safe = {
          name: escapeHtml(name),
          email: escapeHtml(email),
          phone: escapeHtml(phone?.trim() || "—"),
          organization: escapeHtml(organization?.trim() || "—"),
          message: escapeHtml(message),
        };
        await sendEmail({
          to: adminEmail,
          subject: `פנייה חדשה מדף הנחיתה — ${name}`,
          html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #333;">פנייה חדשה מטופס "צרו קשר"</h2>
              <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>שם:</strong> ${safe.name}</p>
                <p><strong>אימייל:</strong> ${safe.email}</p>
                <p><strong>טלפון:</strong> ${safe.phone}</p>
                <p><strong>ארגון:</strong> ${safe.organization}</p>
                <p><strong>הודעה:</strong></p>
                <p style="white-space: pre-wrap;">${safe.message}</p>
              </div>
              <p style="color: #666; font-size: 13px;">מזהה פנייה: ${lead.id}</p>
            </div>
          `,
        });
      } else {
        logger.warn("[contact] no admin email configured — lead saved, email skipped", {
          leadId: lead.id,
        });
      }
    } catch (mailErr) {
      logger.error("[contact] email send failed (lead saved)", {
        leadId: lead.id,
        error: mailErr instanceof Error ? mailErr.message : String(mailErr),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[contact] POST error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה בשליחת הפנייה" }, { status: 500 });
  }
}
