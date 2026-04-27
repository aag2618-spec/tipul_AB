// src/app/p/thanks/page.tsx
// Public landing after a successful Cardcom payment. NO auth.
// SECURITY: we do NOT show amount or approval-number here. The URL is
// guessable (cuid is 24 chars but URLs leak via referrers, screenshots,
// browser history) and we don't want financial details visible to whoever
// holds the link. The customer gets the receipt by email separately.
//
// UX: polls every 3s while transaction.status is still PENDING, because the
// webhook may arrive 1-30s after the user lands here.

import { ThanksClient } from "./thanks-client";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ t?: string }>;
}

export default async function PaymentThanksPage({ searchParams }: Props) {
  const { t } = await searchParams;
  return <ThanksClient transactionId={t ?? null} />;
}
