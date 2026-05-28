// src/app/api/cron/custom-contract-renewals/route.ts
//
// M11.E2: cron יומי לניהול CustomContract.
//
// אחריות:
//   1. EXPIRED_NEEDS_RENEW (endDate<=now + autoRenew=true) → מחדשים: extending
//      endDate ב-renewalMonths, ומעלים מחיר ב-annualIncreasePct (אם הוגדר).
//      AdminAlert MEDIUM נשלח לבעלים + לאדמין על השינוי.
//   2. EXPIRED_NO_RENEW (endDate<=now + autoRenew=false) → לא מבצעים כלום
//      ל-contract (הוא נשאר בסכמה אבל ה-helpers ב-effective-price ובירושת
//      aiTier כבר מתעלמים ממנו). שולחים AdminAlert URGENT לאדמין.
//   3. EXPIRING_30D / 14D / 7D → AdminAlert MEDIUM ל-OWNER (תזכורת).
//
// Idempotency: ל-AdminAlert חדש אנו בודקים שאין PENDING/IN_PROGRESS עם אותה
// metadata.phase + contractId. כך הקרון יכול לרוץ פעמים ביום בלי לשלוח כפול.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkCronAuth } from "@/lib/cron-auth";
import { withAudit } from "@/lib/audit";
import {
  classifyContractPhase,
  computeContractRenewal,
  buildContractAlertMetadata,
  type ContractPhase,
} from "@/lib/clinic/custom-contract";

export const dynamic = "force-dynamic";

async function alertExistsForPhase(
  contractId: string,
  phase: ContractPhase
): Promise<boolean> {
  // Idempotency: בודקים שכבר קיים alert PENDING/IN_PROGRESS עם אותו contractId
  // ואותה phase. סוכן UX מצא bug: בעבר ה-filter על phase היה ב-JS אחרי findFirst,
  // מה שגרם ל-cron ליצור alert 14D נוסף ביום שאחרי, כש-findFirst החזיר ראשון את
  // alert ה-30D הקיים (md.phase !== "EXPIRING_14D" → לא משכח שיש 14D PENDING).
  // התיקון: AND על שני ה-paths ב-metadata.
  const existing = await prisma.adminAlert.findFirst({
    where: {
      type:
        phase === "EXPIRED_NO_RENEW"
          ? "SUBSCRIPTION_EXPIRED"
          : "SUBSCRIPTION_EXPIRING",
      status: { in: ["PENDING", "IN_PROGRESS"] },
      AND: [
        { metadata: { path: ["contractId"], equals: contractId } },
        { metadata: { path: ["phase"], equals: phase } },
      ],
    },
    select: { id: true },
  });
  return existing !== null;
}

async function handleRenewal(
  contract: {
    id: string;
    organizationId: string;
    endDate: Date;
    monthlyEquivPriceIls: Prisma.Decimal;
    renewalMonths: number;
    annualIncreasePct: Prisma.Decimal | null;
    autoRenew: boolean;
    organization: { ownerUserId: string; name: string };
  }
): Promise<{ ok: boolean; reason?: string }> {
  const renewal = computeContractRenewal({
    endDate: contract.endDate,
    monthlyEquivPriceIls: contract.monthlyEquivPriceIls.toString(),
    renewalMonths: contract.renewalMonths,
    annualIncreasePct:
      contract.annualIncreasePct != null
        ? contract.annualIncreasePct.toString()
        : null,
  });

  try {
    await withAudit(
      { kind: "system", source: "CRON", externalRef: "custom-contract-renewals" },
      {
        action: "auto_renew_custom_contract",
        targetType: "CustomContract",
        targetId: contract.id,
        details: {
          organizationId: contract.organizationId,
          oldEndDate: contract.endDate.toISOString(),
          newEndDate: renewal.newEndDate.toISOString(),
          oldPriceIls: Number(contract.monthlyEquivPriceIls),
          newPriceIls: renewal.newMonthlyEquivPriceIls,
          priceIncreasedBy: renewal.priceIncreasedBy,
          renewalMonths: contract.renewalMonths,
          annualIncreasePct:
            contract.annualIncreasePct != null
              ? Number(contract.annualIncreasePct)
              : null,
        },
      },
      async (tx) => {
        // race-safe: רק אם החוזה עדיין עם אותו endDate ו-autoRenew=true (defense-
        // in-depth: אם admin כיבה autoRenew אחרי ה-fetch, לא נחדש בכל זאת).
        const result = await tx.customContract.updateMany({
          where: {
            id: contract.id,
            endDate: contract.endDate,
            autoRenew: true,
          },
          data: {
            endDate: renewal.newEndDate,
            monthlyEquivPriceIls: new Prisma.Decimal(
              renewal.newMonthlyEquivPriceIls
            ),
          },
        });
        if (result.count === 0) {
          throw new Error("CONTRACT_MODIFIED_CONCURRENTLY");
        }
        return result;
      }
    );

    // AdminAlert: התראה לאחר חידוש (לא חוסם — לוג fallback).
    const dateLabel = renewal.newEndDate.toLocaleDateString("he-IL", {
      timeZone: "Asia/Jerusalem",
    });
    const oldPrice = Number(contract.monthlyEquivPriceIls).toLocaleString("he-IL");
    const newPrice = renewal.newMonthlyEquivPriceIls.toLocaleString("he-IL");
    const increaseLabel =
      renewal.priceIncreasedBy > 0
        ? ` (עלייה של ₪${renewal.priceIncreasedBy.toLocaleString("he-IL")})`
        : "";
    await prisma.adminAlert
      .create({
        data: {
          type: "SUBSCRIPTION_EXPIRING", // משתמשים בקיים — המידע ב-metadata
          priority: "MEDIUM",
          title: `החוזה של ${contract.organization.name} חודש אוטומטית`,
          message: `החוזה המותאם של ${contract.organization.name} הוארך ב-${contract.renewalMonths} חודשים. תוקף חדש: ${dateLabel}. מחיר: ₪${oldPrice} → ₪${newPrice}${increaseLabel}.`,
          userId: contract.organization.ownerUserId,
          metadata: buildContractAlertMetadata({
            contractId: contract.id,
            organizationId: contract.organizationId,
            phase: "EXPIRED_NEEDS_RENEW",
            endDate: contract.endDate,
            monthlyEquivPriceIls: Number(contract.monthlyEquivPriceIls),
            autoRenew: contract.autoRenew,
            renewalApplied: renewal,
          }),
        },
      })
      .catch((alertErr) => {
        logger.warn("[cron custom-contract-renewals] failed to create alert", {
          contractId: contract.id,
          error:
            alertErr instanceof Error ? alertErr.message : String(alertErr),
        });
      });

    return { ok: true };
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === "CONTRACT_MODIFIED_CONCURRENTLY"
    ) {
      return { ok: false, reason: "modified_concurrently" };
    }
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleExpiredNoRenew(contract: {
  id: string;
  organizationId: string;
  endDate: Date;
  monthlyEquivPriceIls: Prisma.Decimal;
  autoRenew: boolean;
  organization: { ownerUserId: string; name: string };
}): Promise<{ ok: boolean }> {
  // idempotent — לא ניצור AdminAlert כפול.
  const exists = await alertExistsForPhase(contract.id, "EXPIRED_NO_RENEW");
  if (exists) return { ok: true };

  const endLabel = contract.endDate.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
  });
  await prisma.adminAlert.create({
    data: {
      type: "SUBSCRIPTION_EXPIRED",
      priority: "URGENT",
      title: `החוזה המותאם של ${contract.organization.name} פג`,
      message: `החוזה המותאם של ${contract.organization.name} פג ב-${endLabel}. חידוש אוטומטי: לא — הקליניקה תחויב לפי תוכנית התמחור הרגילה. נדרשת פניה לבעלים כדי לחדש או לנהל הסכם חדש.`,
      userId: contract.organization.ownerUserId,
      actionRequired:
        "ליצור קשר עם בעל/ת הקליניקה לחידוש החוזה או לאישור מעבר לתוכנית התמחור הרגילה",
      metadata: buildContractAlertMetadata({
        contractId: contract.id,
        organizationId: contract.organizationId,
        phase: "EXPIRED_NO_RENEW",
        endDate: contract.endDate,
        monthlyEquivPriceIls: Number(contract.monthlyEquivPriceIls),
        autoRenew: contract.autoRenew,
      }),
    },
  });

  return { ok: true };
}

async function handleExpiringSoon(
  contract: {
    id: string;
    organizationId: string;
    endDate: Date;
    monthlyEquivPriceIls: Prisma.Decimal;
    autoRenew: boolean;
    organization: { ownerUserId: string; name: string };
  },
  phase: "EXPIRING_30D" | "EXPIRING_14D" | "EXPIRING_7D"
): Promise<{ ok: boolean }> {
  const exists = await alertExistsForPhase(contract.id, phase);
  if (exists) return { ok: true };

  const daysLabel =
    phase === "EXPIRING_30D" ? "30 ימים" : phase === "EXPIRING_14D" ? "14 ימים" : "7 ימים";

  // עדיפות עולה ככל שמתקרבים לתפוגה.
  const priority =
    phase === "EXPIRING_7D"
      ? "HIGH"
      : phase === "EXPIRING_14D"
      ? "MEDIUM"
      : "LOW";

  const endLabel = contract.endDate.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
  });
  await prisma.adminAlert.create({
    data: {
      type: "SUBSCRIPTION_EXPIRING",
      priority,
      title: `החוזה של ${contract.organization.name} נגמר בעוד ${daysLabel}`,
      message: contract.autoRenew
        ? `החוזה המותאם של ${contract.organization.name} נגמר ב-${endLabel}. חידוש אוטומטי: כן — יתחדש לבד, אך כדאי לוודא שתנאי החוזה עדיין רלוונטיים.`
        : `החוזה המותאם של ${contract.organization.name} נגמר ב-${endLabel}. חידוש אוטומטי: לא — נדרש לחדש ידנית או לעבור לתוכנית התמחור הרגילה.`,
      userId: contract.organization.ownerUserId,
      actionRequired: contract.autoRenew
        ? "לוודא שתנאי החוזה רלוונטיים לפני חידוש אוטומטי"
        : "ליצור קשר עם הבעלים לחידוש החוזה",
      metadata: buildContractAlertMetadata({
        contractId: contract.id,
        organizationId: contract.organizationId,
        phase,
        endDate: contract.endDate,
        monthlyEquivPriceIls: Number(contract.monthlyEquivPriceIls),
        autoRenew: contract.autoRenew,
      }),
    },
  });

  return { ok: true };
}

export async function POST(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  const now = new Date();
  const results = {
    examined: 0,
    renewed: 0,
    expiredAlerted: 0,
    expiringAlerted: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    // נטען רק חוזים שעלולים להזדקק לפעולה: endDate בחלון של 90 ימים אחורה
    // ועד 30 ימים קדימה. סוכן אבטחה זיהה bug — בלי גבול תחתון, חוזים פגי-שנים
    // היו תופסים את ה-batch ולא היו מאפשרים ל-expired חדשים לקבל alert.
    // 90 ימים אחורה מספיק כדי לתפוס "פגות מצטברות" כשה-cron לא רץ זמן רב.
    // orderBy endDate asc — קודם הקריטיים (פגו לפני זמן רב).
    const horizonEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const horizonStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const candidates = await prisma.customContract.findMany({
      where: {
        endDate: { gte: horizonStart, lte: horizonEnd },
      },
      orderBy: { endDate: "asc" },
      select: {
        id: true,
        organizationId: true,
        startDate: true,
        endDate: true,
        monthlyEquivPriceIls: true,
        renewalMonths: true,
        annualIncreasePct: true,
        autoRenew: true,
        organization: {
          select: { ownerUserId: true, name: true },
        },
      },
      take: 500, // batch limit defensive
    });

    results.examined = candidates.length;

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, ...results });
    }

    for (const c of candidates) {
      const phase = classifyContractPhase(
        { startDate: c.startDate, endDate: c.endDate, autoRenew: c.autoRenew },
        now
      );

      try {
        if (phase === "EXPIRED_NEEDS_RENEW") {
          const r = await handleRenewal(c);
          if (r.ok) results.renewed++;
          else results.skipped++;
        } else if (phase === "EXPIRED_NO_RENEW") {
          await handleExpiredNoRenew(c);
          results.expiredAlerted++;
        } else if (
          phase === "EXPIRING_30D" ||
          phase === "EXPIRING_14D" ||
          phase === "EXPIRING_7D"
        ) {
          await handleExpiringSoon(c, phase);
          results.expiringAlerted++;
        } else {
          // ACTIVE / FUTURE — שום פעולה.
          results.skipped++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`contract ${c.id}: ${msg}`);
        logger.error("[cron custom-contract-renewals] error", {
          contractId: c.id,
          phase,
          error: msg,
        });
      }
    }

    logger.info("[cron custom-contract-renewals] results", { data: results });

    return NextResponse.json({ ok: true, timestamp: now.toISOString(), ...results });
  } catch (err) {
    logger.error("[cron custom-contract-renewals] fatal", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
