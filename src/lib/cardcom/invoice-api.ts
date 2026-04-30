// src/lib/cardcom/invoice-api.ts
// Document operations: void/resend/search.
// Used by /admin/receipts UI and the daily sync cron.

import { logger } from '@/lib/logger';
import type { CardcomConfig } from './types';

const CARDCOM_BASE_URL = 'https://secure.cardcom.solutions/api/v11';
const CARDCOM_REQUEST_TIMEOUT_MS = 15_000;

async function postCardcom<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CARDCOM_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${CARDCOM_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.error('[Cardcom Invoice] HTTP error', { path, status: res.status });
      throw new Error(`CARDCOM_HTTP_${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    if (isAbort) {
      logger.error('[Cardcom Invoice] timeout', { path, timeoutMs: CARDCOM_REQUEST_TIMEOUT_MS });
      throw new Error(`CARDCOM_TIMEOUT_${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export interface VoidDocumentResult {
  success: boolean;
  refundDocumentNumber?: string;
  error?: string;
}

/** Void a previously issued document. Cardcom typically issues a refund document linked to the original. */
export async function voidCardcomDocument(
  config: CardcomConfig,
  documentNumber: string,
  reason: string,
): Promise<VoidDocumentResult> {
  if (!config.apiPassword) {
    return { success: false, error: 'API password required for void' };
  }
  const body = {
    TerminalNumber: config.terminalNumber,
    ApiName: config.apiName,
    ApiPassword: config.apiPassword,
    DocumentNumber: documentNumber,
    Comments: reason,
  };
  const response = await postCardcom<{
    ResponseCode: number;
    Description?: string;
    DocumentNumber?: string;
  }>('/Documents/Void', body);

  if (response.ResponseCode !== 0) {
    return { success: false, error: response.Description };
  }
  return { success: true, refundDocumentNumber: response.DocumentNumber };
}

export interface ResendDocumentResult {
  success: boolean;
  error?: string;
}

/** Resend a document to a different (or same) email address. */
export async function resendCardcomDocument(
  config: CardcomConfig,
  documentNumber: string,
  email: string,
): Promise<ResendDocumentResult> {
  if (!config.apiPassword) {
    return { success: false, error: 'API password required for resend' };
  }
  const body = {
    TerminalNumber: config.terminalNumber,
    ApiName: config.apiName,
    ApiPassword: config.apiPassword,
    DocumentNumber: documentNumber,
    Email: email,
  };
  const response = await postCardcom<{ ResponseCode: number; Description?: string }>('/Documents/Send', body);
  if (response.ResponseCode !== 0) {
    return { success: false, error: response.Description };
  }
  return { success: true };
}

export interface CreateCardcomDocumentParams {
  /** "Receipt" — קבלה (פטור), "TaxInvoiceAndReceipt" — חשבונית מס-קבלה (מורשה) */
  documentType: 'Receipt' | 'TaxInvoiceAndReceipt' | 'TaxInvoice';
  customerName: string;
  customerEmail?: string;
  customerTaxId?: string;
  amount: number;
  description: string;
  /**
   * Cardcom payment-method codes for receipts that are NOT credit-card-charged
   * via Cardcom. Used when the therapist already collected the money (cash,
   * cheque, bank transfer) and now needs Cardcom to issue an official receipt.
   *   1 = cash (מזומן)
   *   2 = cheque (צ'ק)
   *   3 = credit card already processed externally (אשראי שכבר נסלק)
   *   4 = bank transfer (העברה בנקאית)
   */
  paymentType: 1 | 2 | 3 | 4;
  /** Send the receipt PDF to the customer email automatically. */
  sendByEmail?: boolean;
}

export interface CreateCardcomDocumentResult {
  success: boolean;
  documentNumber?: string;
  documentLink?: string;
  allocationNumber?: string;
  error?: string;
}

/**
 * Issue a standalone Cardcom document — used for cash/cheque/bank-transfer
 * receipts where the money didn't flow through Cardcom's gateway. Returns the
 * official document number that Cardcom assigned (registered with מערך
 * חשבוניות ישראל).
 */
export async function createCardcomDocument(
  config: CardcomConfig,
  params: CreateCardcomDocumentParams,
): Promise<CreateCardcomDocumentResult> {
  if (!config.apiPassword) {
    return { success: false, error: 'נדרשת סיסמת API להפקת מסמך Cardcom' };
  }
  const body = {
    TerminalNumber: config.terminalNumber,
    ApiName: config.apiName,
    ApiPassword: config.apiPassword,
    ISOCoinId: 1, // ILS
    Document: {
      DocumentTypeToCreate: params.documentType,
      Name: params.customerName,
      TaxId: params.customerTaxId ?? '',
      Email: params.customerEmail ?? '',
      IsSendByEmail: !!params.sendByEmail && !!params.customerEmail,
      Products: [
        {
          Description: params.description,
          UnitCost: params.amount,
          Quantity: 1,
        },
      ],
      AdvancedDefinition: {
        IsLoadInfoFromAccountID: false,
      },
    },
    Payments: [
      {
        Payment_Type: params.paymentType,
        Amount: params.amount,
      },
    ],
  };

  let response;
  try {
    response = await postCardcom<{
      ResponseCode: number;
      Description?: string;
      DocumentInfo?: {
        DocumentNumber?: number | string;
        DocumentLink?: string;
        AllocationNumber?: string | number;
      };
    }>('/Documents/Create', body);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Cardcom request failed',
    };
  }

  if (response.ResponseCode !== 0) {
    return { success: false, error: response.Description ?? `Cardcom ${response.ResponseCode}` };
  }

  const docNum = response.DocumentInfo?.DocumentNumber;
  const alloc = response.DocumentInfo?.AllocationNumber;
  return {
    success: true,
    documentNumber:
      docNum !== undefined && docNum !== null ? String(docNum) : undefined,
    documentLink: response.DocumentInfo?.DocumentLink,
    allocationNumber:
      alloc !== undefined && alloc !== null ? String(alloc) : undefined,
  };
}

export interface CardcomDocumentSummary {
  documentNumber: string;
  documentType: string;
  amount: number;
  issuedAt: string;
  customerName?: string;
  customerEmail?: string;
  pdfUrl?: string;
  allocationNumber?: string;
}

/** Search documents in a date range — used by the daily sync cron. */
export async function searchCardcomDocuments(
  config: CardcomConfig,
  fromDate: string,
  toDate: string,
): Promise<CardcomDocumentSummary[]> {
  if (!config.apiPassword) return [];
  const body = {
    TerminalNumber: config.terminalNumber,
    ApiName: config.apiName,
    ApiPassword: config.apiPassword,
    FromDate: fromDate,
    ToDate: toDate,
  };
  const response = await postCardcom<{
    ResponseCode: number;
    Description?: string;
    Documents?: Array<{
      DocumentNumber: number;
      DocumentType: string;
      Amount: number;
      DocumentDate: string;
      CustomerName?: string;
      CustomerEmail?: string;
      DocumentLink?: string;
      AllocationNumber?: string;
    }>;
  }>('/Documents/Search', body);

  if (response.ResponseCode !== 0) {
    logger.warn('[Cardcom Invoice] search failed', { description: response.Description });
    return [];
  }

  return (response.Documents ?? []).map((d) => ({
    documentNumber: String(d.DocumentNumber),
    documentType: d.DocumentType,
    amount: d.Amount,
    issuedAt: d.DocumentDate,
    customerName: d.CustomerName,
    customerEmail: d.CustomerEmail,
    pdfUrl: d.DocumentLink,
    allocationNumber: d.AllocationNumber,
  }));
}
