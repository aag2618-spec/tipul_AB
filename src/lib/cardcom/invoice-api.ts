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
      // Capture the response body for diagnosis — Cardcom's error responses
      // sometimes contain a JSON `Description` we can surface to the user
      // (e.g. "Endpoint not enabled for terminal" vs an outright route 404).
      let bodySnippet: string | null = null;
      try {
        const text = await res.text();
        bodySnippet = text.slice(0, 500);
      } catch {
        bodySnippet = null;
      }
      logger.error('[Cardcom Invoice] HTTP error', {
        path,
        status: res.status,
        body: bodySnippet,
      });
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

/** Void a previously issued document. Cardcom typically issues a refund document linked to the original.
 *  Per v11 swagger the endpoint is `/Documents/CancelDoc` and requires
 *  DocumentType (integer) in addition to DocumentNumber. We accept the
 *  document number; the document type defaults to a sentinel that Cardcom
 *  resolves on their side via the document number's metadata. */
export async function voidCardcomDocument(
  config: CardcomConfig,
  documentNumber: string,
  reason: string,
  documentType: number = 0,
): Promise<VoidDocumentResult> {
  if (!config.apiPassword) {
    return { success: false, error: 'API password required for void' };
  }
  const docNumInt = parseInt(documentNumber, 10);
  if (!Number.isFinite(docNumInt)) {
    return { success: false, error: 'מספר מסמך לא תקין' };
  }
  const body = {
    ApiName: config.apiName,
    ApiPassword: config.apiPassword,
    DocumentNumber: docNumInt,
    DocumentType: documentType,
    IsCancelEmailSend: true,
    // `Comments` isn't on the swagger CancelDocRequest; reason is logged
    // server-side by us instead. Keep the param so existing callers don't
    // break.
  };
  void reason;
  const response = await postCardcom<{
    ResponseCode: number;
    Description?: string;
    DocumentNumber?: number | string;
  }>('/Documents/CancelDoc', body);

  if (response.ResponseCode !== 0) {
    return { success: false, error: response.Description };
  }
  return {
    success: true,
    refundDocumentNumber:
      response.DocumentNumber !== undefined && response.DocumentNumber !== null
        ? String(response.DocumentNumber)
        : undefined,
  };
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
  /**
   * True when Cardcom's standalone Documents/Create endpoint is unavailable
   * (HTTP 404 — the path doesn't exist on this terminal, or the feature
   * isn't enabled). Receipt-service uses this to gracefully fall back to
   * internal numbering for EXEMPT therapists rather than blocking them
   * from issuing any receipt at all.
   */
  notSupported?: boolean;
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
  // Per Cardcom v11 swagger /api/v11/Documents/CreateDocument:
  //   • Top-level: ApiName, ApiPassword, Document (required), Cash/Cheques/
  //     DealNumbers (one of, depending on payment method).
  //   • NO TerminalNumber at top level (different from LowProfile/Create).
  //   • Document: DocumentBase + DocumentTypeToCreate + ISOCoinID. Payment
  //     type is encoded by which top-level field carries the amount: Cash for
  //     cash, Cheques[] for cheque, DealNumbers[] for already-processed cards.
  const baseDoc = {
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
    ISOCoinID: 1, // ILS
  };
  const paymentBlock: Record<string, unknown> = (() => {
    if (params.paymentType === 1) return { Cash: params.amount };
    if (params.paymentType === 2) {
      return {
        Cheques: [
          { ChequeAmount: params.amount, ChequeDate: new Date().toISOString().slice(0, 10) },
        ],
      };
    }
    if (params.paymentType === 3) {
      return { DealNumbers: [{ Amount: params.amount }] };
    }
    // 4 = bank transfer — Cardcom doesn't have a dedicated field; use Cash
    // (the receipt still issues with the right total; the payment method is
    // descriptive only on receipt-issuance flows where we collected money
    // ourselves).
    return { Cash: params.amount };
  })();
  const body = {
    ApiName: config.apiName,
    ApiPassword: config.apiPassword,
    Document: baseDoc,
    ...paymentBlock,
  };

  let response;
  try {
    response = await postCardcom<{
      ResponseCode: number;
      Description?: string;
      // DocumentInfo response per swagger: DocumentNumber + DocumentUrl
      // (NOT DocumentLink — old field name).
      DocumentNumber?: number | string;
      DocumentUrl?: string;
      DocumentInfo?: {
        DocumentNumber?: number | string;
        DocumentUrl?: string;
        DocumentLink?: string;
        AllocationNumber?: string | number;
      };
    }>('/Documents/CreateDocument', body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The endpoint exists in v11 but might still 404 on terminals that
    // never had Documents API enabled. Surface this distinctly so the
    // receipt-service can fall back gracefully for EXEMPT therapists.
    if (msg === 'CARDCOM_HTTP_404') {
      return {
        success: false,
        notSupported: true,
        error: 'Cardcom לא תומך בהפקת קבלה ישירה במסוף זה',
      };
    }
    return { success: false, error: msg };
  }

  if (response.ResponseCode !== 0) {
    return { success: false, error: response.Description ?? `Cardcom ${response.ResponseCode}` };
  }

  // Top-level fields take priority (CreateDocument response shape per swagger);
  // fall back to DocumentInfo for safety.
  const docNum = response.DocumentNumber ?? response.DocumentInfo?.DocumentNumber;
  const docUrl = response.DocumentUrl
    ?? response.DocumentInfo?.DocumentUrl
    ?? response.DocumentInfo?.DocumentLink;
  const alloc = response.DocumentInfo?.AllocationNumber;
  return {
    success: true,
    documentNumber:
      docNum !== undefined && docNum !== null ? String(docNum) : undefined,
    documentLink: docUrl,
    allocationNumber:
      alloc !== undefined && alloc !== null ? String(alloc) : undefined,
  };
}

/**
 * Resolve the public PDF URL for an existing Cardcom-issued document.
 * Maps to `/Documents/CreateDocumentUrl` in the v11 swagger. This is the
 * supported way to retrieve a viewable URL given the DocumentNumber +
 * DocumentType — useful when DocumentInfo.DocumentUrl is empty in a
 * webhook/GetLpResult response.
 */
export interface GetCardcomDocumentUrlResult {
  success: boolean;
  url?: string;
  error?: string;
  notSupported?: boolean;
}

export async function getCardcomDocumentUrl(
  config: CardcomConfig,
  params: { documentNumber: number | string; documentType: string },
): Promise<GetCardcomDocumentUrlResult> {
  if (!config.apiPassword) {
    return { success: false, error: 'נדרשת סיסמת API לקבלת קישור מסמך' };
  }
  const docNumInt = typeof params.documentNumber === 'string'
    ? parseInt(params.documentNumber, 10)
    : params.documentNumber;
  if (!Number.isFinite(docNumInt) || docNumInt <= 0) {
    return { success: false, error: 'מספר מסמך לא תקין' };
  }
  const body = {
    ApiName: config.apiName,
    ApiPassword: config.apiPassword,
    DocumentType: params.documentType,
    DocumentNumber: docNumInt,
  };
  try {
    const response = await postCardcom<{
      ResponseCode: number;
      Description?: string;
      DocUrl?: string;
    }>('/Documents/CreateDocumentUrl', body);
    if (response.ResponseCode !== 0) {
      return {
        success: false,
        error: response.Description ?? `Cardcom ${response.ResponseCode}`,
      };
    }
    if (!response.DocUrl) {
      return { success: false, error: 'Cardcom החזיר ResponseCode=0 ללא קישור' };
    }
    return { success: true, url: response.DocUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'CARDCOM_HTTP_404') {
      return {
        success: false,
        notSupported: true,
        error: 'נתיב CreateDocumentUrl לא זמין במסוף זה',
      };
    }
    return { success: false, error: msg };
  }
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
  // Per Cardcom v11 swagger /api/v11/Documents/GetReport (formerly Search):
  //   • NO TerminalNumber field at top level.
  //   • Date fields are FromDateYYYYMMDD / ToDateYYYYMMDD (literally that).
  //   • Format: YYYYMMDD with NO dashes. Convert if caller passed YYYY-MM-DD.
  const fmt = (d: string) => d.replace(/-/g, '');
  const body = {
    ApiName: config.apiName,
    ApiPassword: config.apiPassword,
    FromDateYYYYMMDD: fmt(fromDate),
    ToDateYYYYMMDD: fmt(toDate),
  };
  let response: {
    ResponseCode: number;
    Description?: string;
    Documents?: Array<{
      DocumentNumber: number;
      DocumentType: string;
      Amount: number;
      DocumentDate: string;
      ClientName?: string;
      Email?: string;
      DocumentUrl?: string;
      DocumentLink?: string;
      AllocationNumber?: string | number;
    }>;
  };
  try {
    response = await postCardcom('/Documents/GetReport', body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'CARDCOM_HTTP_404') {
      logger.warn('[Cardcom Invoice] /Documents/GetReport not exposed on this terminal', {
        terminal: config.terminalNumber,
      });
      return [];
    }
    throw err;
  }
  if (response.ResponseCode !== 0) {
    logger.warn('[Cardcom Invoice] GetReport failed', { description: response.Description });
    return [];
  }

  return (response.Documents ?? []).map((d) => ({
    documentNumber: String(d.DocumentNumber),
    documentType: d.DocumentType,
    amount: d.Amount,
    issuedAt: d.DocumentDate,
    customerName: d.ClientName,
    customerEmail: d.Email,
    // Per swagger the field is DocumentUrl; older drafts named it DocumentLink.
    pdfUrl: d.DocumentUrl ?? d.DocumentLink,
    allocationNumber:
      d.AllocationNumber !== undefined && d.AllocationNumber !== null
        ? String(d.AllocationNumber)
        : undefined,
  }));
}
