// M11.E2: ניהול CustomContract — auto-renew, alerts לפני expiry, alert ב-expiry.
//
// הקובץ הזה pure (ללא Prisma) — מקבל את כל ה-state כקלט, מחזיר את ההחלטה.
// קל ל-unit testing בלי mocks ל-Prisma. ה-cron שמסביב (custom-contract-renewals/route.ts)
// מבצע את הקריאה ל-DB, עוטף ב-withAudit, ויוצר AdminAlerts לפי הצורך.

import type { Prisma } from "@prisma/client";

/**
 * מצב חוזה ביחס ל-now:
 *   - ACTIVE: startDate <= now < endDate
 *   - EXPIRING_SOON: endDate בתוך 30/14/7 ימים (תזכורת לבעלים)
 *   - EXPIRED_NEEDS_RENEW: endDate <= now ו-autoRenew=true → לחדש
 *   - EXPIRED_NO_RENEW: endDate <= now ו-autoRenew=false → להתריע admin
 *   - FUTURE: startDate > now (טרם החל)
 */
export type ContractPhase =
  | "ACTIVE"
  | "EXPIRING_30D"
  | "EXPIRING_14D"
  | "EXPIRING_7D"
  | "EXPIRED_NEEDS_RENEW"
  | "EXPIRED_NO_RENEW"
  | "FUTURE";

export interface ContractStateInput {
  startDate: Date | string;
  endDate: Date | string;
  autoRenew: boolean;
}

export function classifyContractPhase(
  contract: ContractStateInput,
  now: Date = new Date()
): ContractPhase {
  const start = new Date(contract.startDate);
  const end = new Date(contract.endDate);

  if (start.getTime() > now.getTime()) return "FUTURE";

  if (end.getTime() <= now.getTime()) {
    return contract.autoRenew ? "EXPIRED_NEEDS_RENEW" : "EXPIRED_NO_RENEW";
  }

  const msToEnd = end.getTime() - now.getTime();
  const daysToEnd = Math.floor(msToEnd / (24 * 60 * 60 * 1000));

  // סדר חשוב: אם 7 ימים חלים — לא נשלח גם 14 וגם 30 באותה ריצה (לבחור הקרוב).
  // ה-cron הוא יומי, אז תזכורת 7d תישלח 7 פעמים אם לא ננעל. ה-idempotency
  // בקרון מבוסס על AdminAlert per (contractId, phase) — ראה route.
  if (daysToEnd <= 7) return "EXPIRING_7D";
  if (daysToEnd <= 14) return "EXPIRING_14D";
  if (daysToEnd <= 30) return "EXPIRING_30D";
  return "ACTIVE";
}

/**
 * חישוב חוזה מחודש: extending endDate ב-renewalMonths וחישוב מחיר חדש לפי
 * annualIncreasePct (אם הוגדר).
 *
 * דוגמאות:
 *   renewalMonths=12, current price=1000, annualIncreasePct=5
 *     → new price = 1050, new endDate = endDate + 12 months
 *   annualIncreasePct=null → המחיר לא משתנה
 *
 * תשומת לב: annualIncreasePct מתפרש כ"שינוי לכל מחזור renewalMonths".
 * אם renewalMonths=6 והגדל הוא 5% → 5% כל 6 חודשים (לא 5% שנתי).
 * זה לוקליות פשוטה; ניתן להוסיף scaling per-month בהמשך אם נדרש.
 */
export interface ContractRenewalInput {
  endDate: Date | string;
  monthlyEquivPriceIls: number | string;
  renewalMonths: number;
  annualIncreasePct: number | string | null;
}

export interface ContractRenewalOutput {
  newEndDate: Date;
  newMonthlyEquivPriceIls: number;
  priceIncreasedBy: number;
}

export function computeContractRenewal(
  input: ContractRenewalInput
): ContractRenewalOutput {
  const oldEnd = new Date(input.endDate);
  const newEnd = new Date(oldEnd);
  newEnd.setMonth(newEnd.getMonth() + input.renewalMonths);

  const oldPrice = Number(input.monthlyEquivPriceIls);
  const pct =
    input.annualIncreasePct != null ? Number(input.annualIncreasePct) : 0;

  // ביטחון: אם pct מספר שלילי מוטעה — מעדיפים 0 על "להוריד מחיר".
  // cap עליון של 100% לכל מחזור — הגנה משכבת ה-API (שמאפשרת עד 1000%) ומפני
  // שגיאת הקלדה של admin שיכולה לגרום ל-renewal שמכפיל בעשרות. אם admin רוצה
  // עלייה גדולה יותר, יכול לעדכן את ה-monthlyEquivPriceIls ידנית.
  const RENEWAL_INCREASE_CAP_PCT = 100;
  const safePct = Math.min(RENEWAL_INCREASE_CAP_PCT, Math.max(0, pct));
  const increase = (oldPrice * safePct) / 100;
  const newPrice = Math.round((oldPrice + increase) * 100) / 100;

  return {
    newEndDate: newEnd,
    newMonthlyEquivPriceIls: newPrice,
    priceIncreasedBy: Math.round(increase * 100) / 100,
  };
}

/**
 * Type-safe payload ל-AdminAlert.metadata במקרי E2.
 * מסומן Prisma.JsonValue כדי שהקרון יוכל להעביר ישירות ל-prisma.adminAlert.create.
 */
export function buildContractAlertMetadata(payload: {
  contractId: string;
  organizationId: string;
  phase: ContractPhase;
  endDate: Date;
  monthlyEquivPriceIls: number;
  autoRenew: boolean;
  renewalApplied?: ContractRenewalOutput;
}): Prisma.InputJsonValue {
  return {
    contractId: payload.contractId,
    organizationId: payload.organizationId,
    phase: payload.phase,
    endDate: payload.endDate.toISOString(),
    monthlyEquivPriceIls: payload.monthlyEquivPriceIls,
    autoRenew: payload.autoRenew,
    ...(payload.renewalApplied && {
      renewed: {
        newEndDate: payload.renewalApplied.newEndDate.toISOString(),
        newMonthlyEquivPriceIls:
          payload.renewalApplied.newMonthlyEquivPriceIls,
        priceIncreasedBy: payload.renewalApplied.priceIncreasedBy,
      },
    }),
  };
}
