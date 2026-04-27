// src/lib/billing/types.ts
// Single source of truth for the BillingProviderType TS union.
// Must stay in sync with the Prisma enum `BillingProviderType` in prisma/schema.prisma.

export type BillingProviderType =
  | 'MESHULAM'
  | 'ICOUNT'
  | 'GREEN_INVOICE'
  | 'SUMIT'
  | 'PAYPLUS'
  | 'CARDCOM'
  | 'TRANZILA';
