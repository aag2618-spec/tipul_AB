// ============================================================================
// Dunning Emails — תזכורות חיוב כושל
// ============================================================================
// 4 תבניות מייל לחיוב חודשי שנכשל ב-Cardcom recurring charge:
//   1. attempt 1 כושל — "ננסה שוב בעוד יומיים"
//   2. attempt 2 כושל — "עדכני כרטיס, ניסיון אחרון בעוד 4 ימים"
//   3. attempt 3 כושל — "כל הניסיונות נכשלו, יש 7 ימי grace"
//   4. blocked — "החשבון נחסם, עדכני תשלום"
//
// כל הטקסטים בעברית RTL, מנותקים מטקסטים אחרים כדי שיהיה אפשר לערוך
// בלי לפגוע במיילים אחרים. sendEmail כבר מטפל בחסימת שבת/חג.
// ============================================================================

import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-utils";
import { PLAN_NAMES } from "@/lib/pricing";
import { logger } from "@/lib/logger";

const SYSTEM_URL =
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  "https://mytipul.co.il";

interface DunningRecipient {
  email: string;
  name: string | null;
  planTier: string;
  amount: number;
}

function billingUrl(): string {
  return `${SYSTEM_URL}/dashboard/settings/billing`;
}

function planLabel(tier: string): string {
  return PLAN_NAMES[tier] ?? tier;
}

function header(title: string, bgColor: string): string {
  return `
    <div style="text-align: center; padding: 20px; background: ${bgColor}; border-radius: 12px 12px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 22px;">${escapeHtml(title)}</h1>
    </div>`;
}

function footer(): string {
  return `
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
    <p style="color: #9ca3af; font-size: 12px; text-align: center;">
      מייל אוטומטי מ-MyTipul. לפניות: support@mytipul.co.il
    </p>`;
}

// ============================================================================
// תבנית 1 — ניסיון 1 נכשל
// ============================================================================

export async function sendChargeFailedAttempt1Email(
  recipient: DunningRecipient
): Promise<void> {
  if (!recipient.email) return;
  try {
    await sendEmail({
      to: recipient.email,
      subject: "חיוב המנוי נכשל - ננסה שוב בעוד יומיים",
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${header("חיוב המנוי לא הצליח", "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)")}
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1e293b; margin-top: 0;">שלום ${escapeHtml(recipient.name || "")},</h2>
            <p style="color: #475569; font-size: 15px; line-height: 1.7;">
              ניסינו לחייב את הכרטיס השמור עבור חידוש מנוי
              <strong>${escapeHtml(planLabel(recipient.planTier))}</strong>
              בסכום של <strong>₪${recipient.amount}</strong> — והחיוב לא עבר.
            </p>
            <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 14px; margin: 18px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>לא נדרשת פעולה כעת</strong> — ננסה שוב אוטומטית בעוד יומיים.
              </p>
            </div>
            <p style="color: #475569; font-size: 14px;">
              אם ברצונכם להחליף את הכרטיס לפני הניסיון הבא, אפשר לעדכן כאן:
            </p>
            <div style="text-align: center; margin: 22px 0;">
              <a href="${billingUrl()}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                עדכון פרטי תשלום
              </a>
            </div>
            ${footer()}
          </div>
        </div>`,
    });
  } catch (err) {
    logger.error("[dunning] sendChargeFailedAttempt1Email failed", {
      email: recipient.email,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================================================================
// תבנית 2 — ניסיון 2 נכשל
// ============================================================================

export async function sendChargeFailedAttempt2Email(
  recipient: DunningRecipient
): Promise<void> {
  if (!recipient.email) return;
  try {
    await sendEmail({
      to: recipient.email,
      subject: "חיוב המנוי נכשל שוב - עדכן/י כרטיס בהקדם",
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${header("ניסיון 2 — החיוב שוב לא עבר", "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)")}
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1e293b; margin-top: 0;">שלום ${escapeHtml(recipient.name || "")},</h2>
            <p style="color: #475569; font-size: 15px; line-height: 1.7;">
              גם הניסיון השני לחייב את הכרטיס עבור מנוי
              <strong>${escapeHtml(planLabel(recipient.planTier))}</strong>
              (<strong>₪${recipient.amount}</strong>) נכשל.
            </p>
            <div style="background: #fed7aa; border: 1px solid #fb923c; border-radius: 8px; padding: 14px; margin: 18px 0;">
              <p style="margin: 0; color: #9a3412; font-size: 14px;">
                <strong>ניסיון נוסף ואחרון</strong> יבוצע בעוד 4 ימים.
                אם הוא ייכשל — החשבון ייחסם לאחר 7 ימי חסד.
              </p>
            </div>
            <p style="color: #475569; font-size: 14px;">
              כדי למנוע הפסקה בשירות, נא לעדכן את פרטי האשראי:
            </p>
            <div style="text-align: center; margin: 22px 0;">
              <a href="${billingUrl()}" style="display: inline-block; background: #ea580c; color: white; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                עדכון פרטי תשלום
              </a>
            </div>
            ${footer()}
          </div>
        </div>`,
    });
  } catch (err) {
    logger.error("[dunning] sendChargeFailedAttempt2Email failed", {
      email: recipient.email,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================================================================
// תבנית 3 — ניסיון 3 (אחרון) נכשל
// ============================================================================

export async function sendChargeFailedFinalEmail(
  recipient: DunningRecipient & { gracePeriodDays: number }
): Promise<void> {
  if (!recipient.email) return;
  try {
    await sendEmail({
      to: recipient.email,
      subject: "חיוב המנוי נכשל - החשבון ייחסם בעוד שבוע",
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${header("כל הניסיונות לחיוב נכשלו", "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)")}
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1e293b; margin-top: 0;">שלום ${escapeHtml(recipient.name || "")},</h2>
            <p style="color: #475569; font-size: 15px; line-height: 1.7;">
              ניסינו לחייב את הכרטיס עבור מנוי
              <strong>${escapeHtml(planLabel(recipient.planTier))}</strong>
              (<strong>₪${recipient.amount}</strong>) שלוש פעמים — וכל הניסיונות נכשלו.
            </p>
            <div style="background: #fee2e2; border: 2px solid #ef4444; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0 0 8px; color: #991b1b; font-weight: bold; font-size: 15px;">
                נותרו ${recipient.gracePeriodDays} ימי חסד.
              </p>
              <p style="margin: 0; color: #991b1b; font-size: 14px;">
                בסיום התקופה הזו, הגישה למערכת תיחסם עד לעדכון הכרטיס.
                <strong>כל הנתונים שמורים</strong> — ברגע שהכרטיס יתעדכן, הכל יחזור לעבוד.
              </p>
            </div>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${billingUrl()}" style="display: inline-block; background: #dc2626; color: white; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                עדכון כרטיס וחידוש מנוי
              </a>
            </div>
            ${footer()}
          </div>
        </div>`,
    });
  } catch (err) {
    logger.error("[dunning] sendChargeFailedFinalEmail failed", {
      email: recipient.email,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================================================================
// תבנית 4 — חשבון נחסם
// ============================================================================

export async function sendAccountBlockedEmail(
  recipient: DunningRecipient
): Promise<void> {
  if (!recipient.email) return;
  try {
    await sendEmail({
      to: recipient.email,
      subject: "החשבון שלך ב-MyTipul נחסם עקב אי-תשלום",
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${header("החשבון נחסם", "linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)")}
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1e293b; margin-top: 0;">שלום ${escapeHtml(recipient.name || "")},</h2>
            <p style="color: #475569; font-size: 15px; line-height: 1.7;">
              לאחר שלושה ניסיונות חיוב שנכשלו, החשבון ב-MyTipul נחסם.
            </p>
            <div style="background: #f3f4f6; border-right: 4px solid #6b7280; padding: 14px 16px; margin: 18px 0; border-radius: 4px;">
              <p style="margin: 0; color: #1e293b; font-size: 14px; line-height: 1.7;">
                <strong>הנתונים — תיקי המטופלים, פגישות, חשבוניות והגדרות — שמורים במלואם.</strong>
                ברגע שיתעדכן כרטיס תקין ויחודש המנוי, הגישה תחזור מיד.
              </p>
            </div>
            <p style="color: #475569; font-size: 14px;">
              לחידוש המנוי:
            </p>
            <div style="text-align: center; margin: 22px 0;">
              <a href="${billingUrl()}" style="display: inline-block; background: #4f46e5; color: white; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                חידוש המנוי
              </a>
            </div>
            <p style="color: #475569; font-size: 13px; line-height: 1.7;">
              לכל עזרה או שאלה — נשמח לעמוד לרשותכם:<br/>
              <a href="mailto:support@mytipul.co.il" style="color: #4f46e5; text-decoration: none;">support@mytipul.co.il</a>
            </p>
            ${footer()}
          </div>
        </div>`,
    });
  } catch (err) {
    logger.error("[dunning] sendAccountBlockedEmail failed", {
      email: recipient.email,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
