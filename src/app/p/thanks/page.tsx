// src/app/p/thanks/page.tsx
// Public landing after a successful Cardcom payment. NO auth.
//
// PRIVACY / CAPABILITY MODEL:
//   The `t` query param (CardcomTransaction id) is treated as a capability
//   token for the payer. Whoever holds it is allowed to see:
//     - payment status (PENDING / APPROVED / FAILED / etc.)
//     - the receipt itself (rendered inline once issued, or a Cardcom PDF
//       link — both gated to APPROVED/REFUNDED in the API).
//   Identical posture to /receipt/[id]#t=<token> public page. Anyone with
//   the URL gets receipt-equivalent access; rotating receiptTokenVersion on
//   the Payment is the kill-switch for stale leaked URLs.
//
// UX: polls every 3s, up to 30 attempts (~90s). Webhook usually arrives
// 1-30s after the customer lands here; on sandbox/slow webhooks the
// transaction-status endpoint auto-syncs against Cardcom GetLpResult.

import { ThanksClient } from "./thanks-client";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ t?: string }>;
}

export default async function PaymentThanksPage({ searchParams }: Props) {
  const { t } = await searchParams;
  return <ThanksClient transactionId={t ?? null} />;
}
