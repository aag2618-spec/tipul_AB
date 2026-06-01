// src/types/calendar-session.ts
//
// Shared shape definition for the calendar API response.
//
// ⚠️ HISTORY: this file exists because of regression a46a514b ("perf(calendar):
// שאילתה רזה — 8 שדות במקום 30+"), where the calendar API was narrowed to
// drop `payment`, `sessionNote`, `topic`, etc., but `SessionDetailDialog`
// continued to read those fields directly from `session.payment`. With
// `payment === undefined`, the dialog fell through every branch in
// `renderPaymentSection()` and silently displayed "פטור מתשלום" for every
// paid session. TypeScript did not catch it because `payment?: ...` was
// optional in the consumer interface.
//
// PURPOSE: a single Prisma payload-derived type that both:
//   - the API route (`/api/sessions/calendar/route.ts`) imports as the
//     authoritative `include` shape, and
//   - the consumer (`useCalendarData` hook + `SessionDetailDialog`)
//     references for state typing.
// If anyone narrows the include later, the consumer types break, and the
// Next.js build fails — replacing a silent UI bug with a loud type error.

import type { Prisma } from "@prisma/client";

/**
 * Canonical Prisma `include` for sessions returned by `/api/sessions/calendar`.
 * Source-of-truth — change here, the API and the dialog stay in sync.
 *
 * Fields and why each is required:
 *   - `payment` + `childPayments` — used by `SessionDetailDialog`
 *     `renderPaymentSection()` to compute `paidAmount` (paid full / partial /
 *     pending / exempt). Without this, the dialog cannot tell paid sessions
 *     from exempt ones.
 *   - `sessionNote` — exempt-reason note shown for sessions without payment.
 *   - `topic`, `skipSummary`, `cancellationReason`, `cancelledBy`, `cancelledAt`
 *     — scalar fields on `TherapySession`; auto-included via `include`.
 *   - `client.creditBalance`, `client.isQuickClient` — required by
 *     `QuickMarkPaid` (credit usage) and "הפוך למטופל קבוע" CTA.
 *
 * NOTE: secretary path strips `sessionNote` (clinical content). That's
 * enforced at the route level, not in this type — see
 * `CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY` in `src/lib/scope.ts`.
 */
export const CALENDAR_SESSION_INCLUDE = {
  client: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      creditBalance: true,
      defaultSessionPrice: true,
      isQuickClient: true,
    },
  },
  // יומן רב-מטפלים: שם המטפל לתצוגה/מסנן בקליניקה. ה-scalar therapistId כבר
  // מוחזר (include מחזיר את כל ה-scalars); כאן מוסיפים רק את השם.
  therapist: {
    select: {
      id: true,
      name: true,
    },
  },
  sessionNote: true,
  payment: {
    include: {
      childPayments: {
        where: { status: "PAID" as const },
        select: { id: true, amount: true, status: true },
      },
    },
  },
} as const satisfies Prisma.TherapySessionInclude;

/**
 * The shape Prisma returns when calendar `findMany` runs with the canonical
 * include above. Use this in tests or anywhere you need exact server shape.
 *
 * NOTE: the network response goes through `serializePrisma()` which converts
 * `Decimal` → `number` and `Date` → ISO string. The frontend type
 * (`CalendarSession` in `src/hooks/use-calendar-data.ts`) reflects the
 * post-serialize shape. Keep both in sync when fields change.
 */
export type CalendarSessionPayload = Prisma.TherapySessionGetPayload<{
  include: typeof CALENDAR_SESSION_INCLUDE;
}>;
