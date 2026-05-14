// src/app/(dashboard)/dashboard/settings/subscription/page.tsx
// Stage 4 — דף ניהול מנוי למשתמש.
//
// Server Component שטוען:
//   - User (מצב מנוי, billingPaidByClinic)
//   - SavedCardToken פעיל (4 ספרות, brand, expiry)
//   - 10 SubscriptionPayments אחרונים + CardcomInvoice.pdfUrl
//
// העברה מסוריאליזת ל-SubscriptionClient (Client Component) שמטפל בכל
// הדיאלוגים / כפתורים / fetch ל-API.
//
// אבטחה: getServerSession + originalUserId (לא target אם impersonation —
// העמוד מראה את המנוי האישי של המשתמש האמיתי).

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  buildPaymentHistoryView,
  formatSubscriptionStatusHe,
  formatCardExpiry,
  isCardExpiringWithin,
  validateCanDisableAutoRenew,
  validateCanEnableAutoRenew,
  validateCanUpdateCard,
} from "@/lib/payments/subscription-settings";
import { PLAN_NAMES } from "@/lib/pricing";
import SubscriptionClient from "./SubscriptionClient";

export const dynamic = "force-dynamic";

export default async function SubscriptionSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  // משתמשים ב-originalUserId כדי שהעמוד יראה תמיד את המנוי של המשתמש האמיתי
  // גם במצב impersonation (OWNER לא צריך לראות את המנוי של ה-target דרך הדף שלו).
  const userId = session.user.originalUserId ?? session.user.id;

  let user: Awaited<ReturnType<typeof loadUser>>;
  let savedCardToken: Awaited<ReturnType<typeof loadSavedCardToken>>;
  let payments: Awaited<ReturnType<typeof loadPayments>>;
  try {
    [user, savedCardToken, payments] = await Promise.all([
      loadUser(userId),
      loadSavedCardToken(userId),
      loadPayments(userId),
    ]);
  } catch (error) {
    logger.error("[settings/subscription] failed to load page data", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return (
      <div className="max-w-3xl mx-auto p-6" dir="rtl">
        <p className="text-destructive">
          שגיאה בטעינת פרטי המנוי. נסה/י לרענן את הדף.
        </p>
      </div>
    );
  }

  if (!user) {
    redirect("/login");
  }

  // ── עיבוד נתונים ל-Client ──
  const now = new Date();
  const anyActiveAutoCharge = payments.some(
    (p) =>
      p.autoChargeEnabled &&
      p.status === "PAID" &&
      p.periodEnd &&
      p.periodEnd.getTime() > now.getTime()
  );
  const hasActiveSubscriptionPayment = payments.some(
    (p) =>
      (p.status === "PAID" || p.status === "PENDING") &&
      (p.periodEnd ? p.periodEnd.getTime() > now.getTime() : true)
  );

  const canDisableAutoRenew = validateCanDisableAutoRenew({
    subscriptionStatus: user.subscriptionStatus,
    billingPaidByClinic: user.billingPaidByClinic,
    hasActiveSubscriptionPayment,
    anyAutoChargeEnabled: anyActiveAutoCharge,
  });
  const canEnableAutoRenew = validateCanEnableAutoRenew({
    subscriptionStatus: user.subscriptionStatus,
    billingPaidByClinic: user.billingPaidByClinic,
    isBlocked: user.isBlocked,
    hasActiveSavedCardToken: savedCardToken !== null,
    hasActiveSubscriptionPayment,
  });
  const canUpdateCard = validateCanUpdateCard({
    subscriptionStatus: user.subscriptionStatus,
    billingPaidByClinic: user.billingPaidByClinic,
    isBlocked: user.isBlocked,
  });

  const expiringSoon = isCardExpiringWithin(
    savedCardToken
      ? {
          expiryMonth: savedCardToken.expiryMonth,
          expiryYear: savedCardToken.expiryYear,
        }
      : null,
    30,
    now
  );

  const view = {
    user: {
      name: user.name ?? "",
      email: user.email ?? "",
      subscriptionStatus: user.subscriptionStatus,
      subscriptionStatusHe: formatSubscriptionStatusHe(user.subscriptionStatus),
      subscriptionStartedAtIso: user.subscriptionStartedAt?.toISOString() ?? null,
      subscriptionEndsAtIso: user.subscriptionEndsAt?.toISOString() ?? null,
      trialEndsAtIso: user.trialEndsAt?.toISOString() ?? null,
      aiTier: user.aiTier,
      aiTierLabelHe: PLAN_NAMES[user.aiTier] ?? user.aiTier,
      pendingTier: user.pendingTier,
      pendingTierLabelHe: user.pendingTier
        ? (PLAN_NAMES[user.pendingTier] ?? user.pendingTier)
        : null,
      pendingTierEffectiveAtIso: user.pendingTierEffectiveAt?.toISOString() ?? null,
      billingPaidByClinic: user.billingPaidByClinic,
      isBlocked: user.isBlocked,
    },
    card: savedCardToken
      ? {
          cardLast4: savedCardToken.cardLast4,
          cardHolder: savedCardToken.cardHolder,
          cardBrand: savedCardToken.cardBrand,
          expiryLabel: formatCardExpiry(
            savedCardToken.expiryMonth,
            savedCardToken.expiryYear
          ),
          expiringSoon,
        }
      : null,
    payments: buildPaymentHistoryView(payments),
    actions: {
      canDisableAutoRenew: canDisableAutoRenew.allowed,
      disableAutoRenewReason: canDisableAutoRenew.allowed
        ? null
        : canDisableAutoRenew.reason,
      canEnableAutoRenew: canEnableAutoRenew.allowed,
      enableAutoRenewReason: canEnableAutoRenew.allowed
        ? null
        : canEnableAutoRenew.reason,
      canUpdateCard: canUpdateCard.allowed,
      updateCardReason: canUpdateCard.allowed ? null : canUpdateCard.reason,
      autoChargeCurrentlyEnabled: anyActiveAutoCharge,
    },
  };

  return <SubscriptionClient view={view} />;
}

// ── DB helpers ──

async function loadUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      subscriptionStatus: true,
      subscriptionStartedAt: true,
      subscriptionEndsAt: true,
      trialEndsAt: true,
      aiTier: true,
      pendingTier: true,
      pendingTierEffectiveAt: true,
      billingPaidByClinic: true,
      isBlocked: true,
    },
  });
}

async function loadSavedCardToken(userId: string) {
  return prisma.savedCardToken.findFirst({
    where: {
      tenant: "ADMIN",
      subscriberId: userId,
      isActive: true,
      deletedAt: null,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      cardLast4: true,
      cardHolder: true,
      cardBrand: true,
      expiryMonth: true,
      expiryYear: true,
    },
  });
}

async function loadPayments(userId: string) {
  const raw = await prisma.subscriptionPayment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      description: true,
      periodStart: true,
      periodEnd: true,
      paidAt: true,
      invoiceUrl: true,
      autoChargeEnabled: true,
      cardcomInvoices: {
        where: { tenant: "ADMIN" },
        orderBy: { issuedAt: "desc" },
        take: 1,
        select: { pdfUrl: true },
      },
    },
  });
  // המרת Prisma Decimal ל-number (חיוני לפני JSON.parse(JSON.stringify())).
  return raw.map((p) => ({
    ...p,
    amount: Number(p.amount) || 0,
  }));
}
