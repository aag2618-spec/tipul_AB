// src/lib/cardcom/client.ts
// Cardcom LowProfile v11 client
// Endpoints:
//   Create payment page:  POST https://secure.cardcom.solutions/api/v11/LowProfile/Create
//   Charge token:         POST https://secure.cardcom.solutions/api/v11/Transactions/Transaction
//   Get LP result:        POST https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult
//   Refund:               POST https://secure.cardcom.solutions/api/v11/Transactions/RefundByTransactionId

import { logger } from '@/lib/logger';
import type {
  CardcomConfig,
  CreatePaymentPageOptions,
  CreatePaymentPageResult,
  ChargeTokenOptions,
  ChargeTokenResult,
  RefundOptions,
  RefundResult,
} from './types';

const CARDCOM_BASE_URL = 'https://secure.cardcom.solutions/api/v11';
const CARDCOM_REQUEST_TIMEOUT_MS = 15_000;

/** Cardcom sandbox terminal — public, documented credentials. */
export const CARDCOM_SANDBOX_TERMINAL = '1000';
export const CARDCOM_SANDBOX_API_NAME = 'gozwwBBhLhgepE4BDIxe';

/**
 * Strip credentials from a Cardcom request body before logging. Defense in depth:
 * if a logger middleware (Sentry, Datadog, CloudWatch) captures fetch bodies,
 * passwords/tokens never appear in third-party log stores.
 */
export function sanitizeCardcomBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const SENSITIVE_KEYS = ['ApiPassword', 'ApiName', 'ApiKey', 'Password', 'Token'];
  const cloned: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of SENSITIVE_KEYS) {
    if (key in cloned) cloned[key] = '[REDACTED]';
  }
  return cloned;
}

export class CardcomClient {
  constructor(private config: CardcomConfig) {
    if (!config.terminalNumber) throw new Error('CARDCOM_MISSING_TERMINAL');
    if (!config.apiName) throw new Error('CARDCOM_MISSING_API_NAME');
    // Refuse to run with sandbox credentials in production — silent fall-through
    // would mean real customers see "PAID" while no actual money moves.
    if (
      process.env.NODE_ENV === 'production' &&
      (config.terminalNumber === CARDCOM_SANDBOX_TERMINAL ||
        config.apiName === CARDCOM_SANDBOX_API_NAME)
    ) {
      throw new Error('CARDCOM_REFUSE_SANDBOX_IN_PRODUCTION');
    }
  }

  /**
   * Step 1+2 — Create a hosted payment page (iframe/redirect URL).
   * Returns a URL to send the customer to. The actual transaction status
   * arrives later via webhook to `webhookUrl`.
   */
  async createPaymentPage(opts: CreatePaymentPageOptions): Promise<CreatePaymentPageResult> {
    const operation = opts.createToken ? 'ChargeAndCreateToken' : 'ChargeOnly';

    const body = {
      TerminalNumber: this.config.terminalNumber,
      ApiName: this.config.apiName,
      Operation: operation,
      ReturnValue: opts.returnValue,
      Amount: opts.amount,
      SuccessRedirectUrl: opts.successRedirectUrl,
      FailedRedirectUrl: opts.failedRedirectUrl,
      WebHookUrl: opts.webhookUrl,
      ProductName: opts.description,
      Language: opts.language ?? 'he',
      ISOCoinId: 1, // ILS — see Multi-currency guard in callers
      // Cardcom-side idempotency: prevents creating a second LowProfile if our
      // HTTP retries after Cardcom already accepted the first request.
      ...(opts.uniqueAsmachta ? { UniqueAsmachta: opts.uniqueAsmachta } : {}),
      Document: {
        DocumentTypeToCreate: opts.documentType,
        Name: opts.customer.name,
        TaxId: opts.customer.taxId,
        Email: opts.customer.email,
        IsSendByEmail: !!opts.customer.email,
        Products: opts.products.map((p) => ({
          Description: p.description,
          UnitCost: p.unitCost,
          Quantity: p.quantity,
        })),
      },
      ...(opts.numOfPayments && opts.numOfPayments > 1
        ? {
            UIDefinition: {
              IsHideCardOwnerName: false,
              IsHideCardOwnerPhone: false,
              IsHideCardOwnerEmail: false,
            },
            ChargeType: 8, // installments
            NumOfPayments: opts.numOfPayments,
          }
        : {}),
    };

    const response = await this.post<{
      ResponseCode: number;
      Description?: string;
      LowProfileId?: string;
      Url?: string;
    }>('/LowProfile/Create', body);

    if (response.ResponseCode !== 0 || !response.LowProfileId || !response.Url) {
      logger.error('[Cardcom] createPaymentPage failed', {
        responseCode: response.ResponseCode,
        description: response.Description,
        terminal: this.config.terminalNumber,
      });
      throw new Error(`CARDCOM_CREATE_PAYMENT_PAGE_FAILED:${response.ResponseCode}:${response.Description ?? ''}`);
    }

    return {
      lowProfileId: response.LowProfileId,
      url: response.Url,
      responseCode: String(response.ResponseCode),
    };
  }

  /**
   * Step 3 — Charge an existing Low-Profile token (recurring billing).
   * Requires apiPassword in config.
   *
   * אם מועבר `opts.document` — נשלח בלוק Document שמורה ל-Cardcom להפיק קבלה
   * סינכרונית (אותו תוקף שיטה כמו LowProfile/Create). בלי זה החיוב יבוצע אבל
   * הלקוח/המטפל לא יקבלו תיעוד חשבונאי, וזה הפרת חוק חשבוניות ישראל 2024.
   */
  async chargeToken(opts: ChargeTokenOptions): Promise<ChargeTokenResult> {
    if (!this.config.apiPassword) {
      throw new Error('CARDCOM_MISSING_API_PASSWORD');
    }

    const body = {
      TerminalNumber: this.config.terminalNumber,
      ApiName: this.config.apiName,
      ApiPassword: this.config.apiPassword,
      ISOCoinId: 1,
      Token: opts.token,
      Amount: opts.amount,
      CardExpirationMMYY: `${String(opts.cardExpiration.month).padStart(2, '0')}${String(opts.cardExpiration.year).slice(-2)}`,
      // Cardcom-side idempotency: prevents double-charge if our HTTP retries
      // after Cardcom already accepted the first request.
      ...(opts.uniqueAsmachta ? { UniqueAsmachta: opts.uniqueAsmachta } : {}),
      ...(opts.numOfPayments && opts.numOfPayments > 1
        ? { NumOfPayments: opts.numOfPayments, ChargeType: 8 }
        : {}),
      ...(opts.description ? { ProductName: opts.description } : {}),
      ...(opts.document
        ? {
            Document: {
              DocumentTypeToCreate: opts.document.documentType,
              Name: opts.document.customer.name,
              TaxId: opts.document.customer.taxId,
              Email: opts.document.customer.email,
              IsSendByEmail: !!opts.document.customer.email,
              Products: opts.document.products.map((p) => ({
                Description: p.description,
                UnitCost: p.unitCost,
                Quantity: p.quantity,
              })),
            },
          }
        : {}),
    };

    const response = await this.post<{
      ResponseCode: number;
      Description?: string;
      ApprovalNumber?: string;
      TranzactionId?: number;
      DocumentInfo?: {
        DocumentNumber?: string;
        DocumentType?: string;
        DocumentLink?: string;
      };
    }>('/Transactions/Transaction', body);

    if (response.ResponseCode !== 0) {
      return {
        responseCode: String(response.ResponseCode),
        errorMessage: response.Description,
      };
    }

    return {
      responseCode: '0',
      approvalNumber: response.ApprovalNumber,
      transactionId: response.TranzactionId ? String(response.TranzactionId) : undefined,
      documentNumber: response.DocumentInfo?.DocumentNumber,
      documentType: response.DocumentInfo?.DocumentType,
      documentLink: response.DocumentInfo?.DocumentLink,
    };
  }

  /**
   * Refund a previous transaction. Partial refund supported via `amount`.
   */
  async refundTransaction(opts: RefundOptions): Promise<RefundResult> {
    if (!this.config.apiPassword) {
      throw new Error('CARDCOM_MISSING_API_PASSWORD');
    }

    const body = {
      TerminalNumber: this.config.terminalNumber,
      ApiName: this.config.apiName,
      ApiPassword: this.config.apiPassword,
      TranzactionId: Number(opts.transactionId),
      ...(opts.amount ? { PartialSum: opts.amount } : {}),
      ...(opts.uniqueAsmachta ? { UniqueAsmachta: opts.uniqueAsmachta } : {}),
    };

    const response = await this.post<{
      ResponseCode: number;
      Description?: string;
      RefundResponse?: { TranzactionId?: number; AllocationNumber?: string };
    }>('/Transactions/RefundByTransactionId', body);

    if (response.ResponseCode !== 0) {
      return {
        refundId: '',
        responseCode: String(response.ResponseCode),
        errorMessage: response.Description,
      };
    }

    return {
      refundId: String(response.RefundResponse?.TranzactionId ?? ''),
      allocationNumber: response.RefundResponse?.AllocationNumber,
      responseCode: '0',
    };
  }

  /**
   * Look up a Low-Profile result (used by sync cron when webhook missed).
   */
  async getLpResult(lowProfileId: string): Promise<unknown> {
    const body = {
      TerminalNumber: this.config.terminalNumber,
      ApiName: this.config.apiName,
      LowProfileId: lowProfileId,
    };
    return this.post('/LowProfile/GetLpResult', body);
  }

  /**
   * Search documents (cron sync — to catch missed webhooks).
   */
  async searchDocuments(opts: { fromDate: string; toDate: string }): Promise<unknown> {
    if (!this.config.apiPassword) {
      throw new Error('CARDCOM_MISSING_API_PASSWORD');
    }
    const body = {
      TerminalNumber: this.config.terminalNumber,
      ApiName: this.config.apiName,
      ApiPassword: this.config.apiPassword,
      FromDate: opts.fromDate,
      ToDate: opts.toDate,
    };
    return this.post('/Documents/Search', body);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${CARDCOM_BASE_URL}${path}`;
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CARDCOM_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const duration = Date.now() - start;
      if (!res.ok) {
        logger.error('[Cardcom] HTTP error', { path, status: res.status, durationMs: duration });
        throw new Error(`CARDCOM_HTTP_${res.status}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      logger.error('[Cardcom] request failed', {
        path,
        error: err instanceof Error ? err.message : String(err),
        timedOut: isAbort,
      });
      throw isAbort ? new Error(`CARDCOM_TIMEOUT_${path}`) : err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
