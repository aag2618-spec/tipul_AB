import { type PaymentStatus } from "@prisma/client";

// ================================================================
// Types
// ================================================================

export type PaymentMethod =
  | "CASH"
  | "CREDIT_CARD"
  | "BANK_TRANSFER"
  | "CHECK"
  | "CREDIT"
  | "OTHER";

export type PaymentType = "FULL" | "PARTIAL" | "ADVANCE";

export interface PaymentResult {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma model with many fields
  payment?: any;
  childPayment?: any;
  receiptNumber?: string | null;
  receiptUrl?: string | null;
  receiptError?: string;
  error?: string;
}

export interface BulkPaymentResult {
  success: boolean;
  updatedPayments: number;
  totalPaid: number;
  remainingAmount: number;
  message: string;
  error?: string;
}

export interface ReceiptResult {
  receiptNumber: string | null;
  receiptUrl: string | null;
  hasReceipt: boolean;
  error?: string;
}

export interface ClientDebtSummary {
  id: string;
  name: string;
  email?: string | null;
  creditBalance: number;
  totalDebt: number;
  unpaidSessions: Array<{
    paymentId: string;
    sessionId: string | null;
    date: Date;
    amount: number;
    expectedAmount: number;
    paidAmount: number;
    status: string;
    partialPaymentDate?: Date | null;
  }>;
}

export interface AllClientsDebtItem {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  totalDebt: number;
  creditBalance: number;
  unpaidSessionsCount: number;
  unpaidSessions: Array<{
    paymentId: string;
    amount: number;
    paidAmount: number;
    date: Date;
    sessionId: string | null;
    partialPaymentDate: Date | null;
  }>;
}

// Re-used in createPaymentForSession params
export type { PaymentStatus };
