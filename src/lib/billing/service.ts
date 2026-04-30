// src/lib/billing/service.ts
// Unified Billing Service - מנהל את כל ספקי החיוב

import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { MeshulamClient } from '@/lib/meshulam';
import { ICountClient } from '@/lib/icount';
import { GreenInvoiceClient } from '@/lib/green-invoice';
import { SumitClient } from '@/lib/sumit';

export type { BillingProviderType } from './types';
import type { BillingProviderType } from './types';

interface ReceiptRequest {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  amount: number;
  description: string;
  paymentMethod?: 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'other';
  sendEmail?: boolean;
  notes?: string;
  /** Optional — when present, providers that support a CardcomInvoice
   *  mirror (currently only Cardcom) link the issued document back to this
   *  Payment row. Without this the receipt page can't tell that the receipt
   *  came from Cardcom (and would show the misleading internal "הורד PDF"
   *  button alongside it).
   */
  paymentId?: string;
}

interface ReceiptResult {
  success: boolean;
  receiptId?: string;
  receiptNumber?: string;
  receiptUrl?: string;
  pdfUrl?: string;
  error?: string;
  /** True if the provider doesn't support standalone receipt creation on
   *  this terminal/account (e.g. Cardcom's Documents/Create endpoint isn't
   *  enabled). Receipt-service uses this to gracefully fall back to internal
   *  numbering rather than blocking the therapist from any receipt at all. */
  notSupported?: boolean;
}

interface PaymentLinkRequest {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  amount: number;
  description: string;
  successUrl?: string;
  webhookUrl?: string;
  paymentId?: string; // מזהה פנימי לקישור חזרה
  clientId?: string;
}

interface PaymentLinkResult {
  success: boolean;
  paymentUrl?: string;
  paymentId?: string;
  error?: string;
}

/**
 * שירות מאוחד לניהול ספקי חיוב
 */
export class BillingService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * קבלת ספק פעיל ראשי
   */
  async getPrimaryProvider(): Promise<{
    provider: BillingProviderType;
    id: string;
  } | null> {
    // Prefer rows explicitly flagged isPrimary, but FALL BACK to the first
    // active provider when none is flagged. Many therapists configure
    // exactly one BillingProvider (e.g. Cardcom alone) and never tick the
    // "primary" checkbox in the UI — that's the obvious primary, and
    // refusing to issue a receipt because of a missing flag would be a
    // user-experience trap. Same ordering as receipt-service uses to pick
    // the Cardcom-preferred branch, so the two stay in sync.
    const provider = await prisma.billingProvider.findFirst({
      where: {
        userId: this.userId,
        isActive: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    if (!provider) {
      return null;
    }

    return {
      provider: provider.provider as BillingProviderType,
      id: provider.id,
    };
  }

  /**
   * קבלת כל הספקים הפעילים
   */
  async getActiveProviders(): Promise<Array<{
    provider: BillingProviderType;
    id: string;
    displayName: string;
  }>> {
    const providers = await prisma.billingProvider.findMany({
      where: {
        userId: this.userId,
        isActive: true,
      },
      select: {
        id: true,
        provider: true,
        displayName: true,
      },
    });

    return providers.map(p => ({
      provider: p.provider as BillingProviderType,
      id: p.id,
      displayName: p.displayName,
    }));
  }

  /**
   * יצירת קבלה דרך הספק הפעיל
   */
  async createReceipt(request: ReceiptRequest): Promise<ReceiptResult> {
    const primaryProvider = await this.getPrimaryProvider();

    if (!primaryProvider) {
      return {
        success: false,
        error: 'לא הוגדר ספק קבלות פעיל',
      };
    }

    // קבלת פרטי הספק
    const providerData = await prisma.billingProvider.findUnique({
      where: { id: primaryProvider.id },
    });

    if (!providerData) {
      return {
        success: false,
        error: 'ספק לא נמצא',
      };
    }

    try {
      const apiKey = decrypt(providerData.apiKey);
      const apiSecret = providerData.apiSecret ? decrypt(providerData.apiSecret) : undefined;

      switch (primaryProvider.provider) {
        case 'MESHULAM':
          return await this.createMeshulamReceipt(apiKey, request);
        case 'ICOUNT':
          // iCount: apiKey = Company ID, apiSecret = API Token
          return await this.createICountReceipt(apiKey, apiSecret || '', request);
        case 'GREEN_INVOICE':
          // Green Invoice: apiKey = API ID, apiSecret = API Secret
          return await this.createGreenInvoiceReceipt(apiKey, apiSecret || '', request);
        case 'SUMIT':
          // Sumit: apiKey = API Key, apiSecret = Company ID
          return await this.createSumitReceipt(apiKey, apiSecret || '', request);
        case 'CARDCOM':
          // Cardcom: apiKey = TerminalNumber, apiSecret = `${ApiName}:${ApiPassword}`.
          // For non-credit-card payments the therapist still wants Cardcom to
          // issue the legal receipt (their numbering, registered with מערך
          // חשבוניות ישראל). Cardcom's Documents/Create accepts a payment-type
          // code (1=cash, 2=cheque, 3=credit-card-already-processed,
          // 4=bank-transfer) so the resulting receipt reflects how the money
          // was actually collected. Pass the full providerData so we can read
          // the configured mode (sandbox vs production).
          return await this.createCardcomReceipt(
            apiKey,
            apiSecret || '',
            providerData,
            request,
          );
        default:
          return {
            success: false,
            error: 'ספק לא נתמך',
          };
      }
    } catch (error) {
      console.error('Error creating receipt:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'שגיאה ביצירת קבלה',
      };
    }
  }

  /**
   * יצירת קישור תשלום
   */
  async createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLinkResult> {
    // מחפשים ספק שתומך בתשלומים
    const providers = await prisma.billingProvider.findMany({
      where: {
        userId: this.userId,
        isActive: true,
        provider: {
          in: ['MESHULAM', 'SUMIT'], // רק ספקים שתומכים בסליקה
        },
      },
      orderBy: {
        isPrimary: 'desc',
      },
    });

    if (providers.length === 0) {
      return {
        success: false,
        error: 'לא הוגדר ספק סליקה פעיל',
      };
    }

    const provider = providers[0];

    try {
      const apiKey = decrypt(provider.apiKey);

      switch (provider.provider) {
        case 'MESHULAM':
          return await this.createMeshulamPaymentLink(apiKey, request);
        case 'SUMIT':
          const apiSecret = provider.apiSecret ? decrypt(provider.apiSecret) : '';
          return await this.createSumitPaymentLink(apiKey, apiSecret, request);
        default:
          return {
            success: false,
            error: 'ספק לא תומך בסליקה',
          };
      }
    } catch (error) {
      console.error('Error creating payment link:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'שגיאה ביצירת קישור תשלום',
      };
    }
  }

  // --- Meshulam ---
  private async createMeshulamReceipt(apiKey: string, request: ReceiptRequest): Promise<ReceiptResult> {
    const client = new MeshulamClient(apiKey);
    const response = await client.createInvoice({
      customer: {
        customerName: request.clientName,
        customerEmail: request.clientEmail,
        customerPhone: request.clientPhone,
      },
      items: [{
        description: request.description,
        quantity: 1,
        price: request.amount,
      }],
      paymentType: request.paymentMethod,
      sendEmail: false,
      notes: request.notes,
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('Meshulam createInvoice response:', JSON.stringify(response));
    }
    if (response.status !== 1 || !response.data) {
      return {
        success: false,
        error: response.message,
      };
    }

    return {
      success: true,
      receiptId: response.data.documentId,
      receiptNumber: response.data.documentNumber,
      receiptUrl: response.data.documentUrl,
      pdfUrl: response.data.pdfUrl,
    };
  }

  private async createMeshulamPaymentLink(apiKey: string, request: PaymentLinkRequest): Promise<PaymentLinkResult> {
    const client = new MeshulamClient(apiKey);
    const response = await client.createPaymentLink({
      customer: {
        customerName: request.clientName,
        customerEmail: request.clientEmail,
        customerPhone: request.clientPhone,
      },
      amount: request.amount,
      description: request.description,
      successUrl: request.successUrl,
      webhookUrl: request.webhookUrl,
      customFields: {
        paymentId: request.paymentId || '',
        clientId: request.clientId || '',
      },
    });

    if (response.status !== 1 || !response.data) {
      return {
        success: false,
        error: response.message,
      };
    }

    return {
      success: true,
      paymentUrl: response.data.paymentUrl,
      paymentId: response.data.paymentId,
    };
  }

  // --- iCount ---
  private async createICountReceipt(companyId: string, apiKey: string, request: ReceiptRequest): Promise<ReceiptResult> {
    const client = new ICountClient(companyId, apiKey);
    const response = await client.createReceipt({
      doctype: 'receipt',
      client: {
        client_name: request.clientName,
        email: request.clientEmail,
        phone: request.clientPhone,
      },
      items: [{
        description: request.description,
        quantity: 1,
        unit_price: request.amount,
      }],
      payment_type: request.paymentMethod,
      send_email: false,
      notes: request.notes,
    });

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.message,
      };
    }

    return {
      success: true,
      receiptId: response.data.doc_id,
      receiptNumber: response.data.doc_number,
      receiptUrl: response.data.doc_url,
      pdfUrl: response.data.pdf_url,
    };
  }

  // --- Green Invoice (חשבונית ירוקה) ---
  private async createGreenInvoiceReceipt(apiKey: string, apiSecret: string, request: ReceiptRequest): Promise<ReceiptResult> {
    const client = new GreenInvoiceClient(apiKey, apiSecret);
    const response = await client.createReceipt({
      client: {
        name: request.clientName,
        emails: request.clientEmail ? [request.clientEmail] : undefined,
        phone: request.clientPhone,
      },
      income: [{
        description: request.description,
        quantity: 1,
        price: request.amount,
      }],
      payment: [{
        type: GreenInvoiceClient.mapPaymentType(request.paymentMethod),
        date: new Date().toISOString().split('T')[0],
        price: request.amount,
      }],
      remarks: request.notes,
      sendEmail: false,
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('Green Invoice createReceipt response:', JSON.stringify(response));
    }
    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.errorMessage,
      };
    }

    return {
      success: true,
      receiptId: response.data.id,
      receiptNumber: String(response.data.number || ''),
      receiptUrl: response.data.url || '',
      pdfUrl: response.data.pdfUrl || '',
    };
  }

  // --- Sumit ---
  private async createSumitReceipt(apiKey: string, companyId: string, request: ReceiptRequest): Promise<ReceiptResult> {
    const client = new SumitClient(apiKey, companyId);
    const response = await client.createReceipt({
      Customer: {
        Name: request.clientName,
        Email: request.clientEmail,
        Phone: request.clientPhone,
      },
      Items: [{
        Item: request.description,
        Quantity: 1,
        Price: request.amount,
      }],
      PaymentMethod: SumitClient.mapPaymentMethod(request.paymentMethod),
      SendEmail: false,
      Comments: request.notes,
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('Sumit createReceipt response:', JSON.stringify(response));
    }
    if (!response.Success || !response.Data) {
      return {
        success: false,
        error: response.ErrorMessage,
      };
    }

    return {
      success: true,
      receiptId: String(response.Data.DocumentID || ''),
      receiptNumber: String(response.Data.DocumentNumber || ''),
      receiptUrl: response.Data.DocumentURL || '',
      pdfUrl: response.Data.DocumentPDF || '',
    };
  }

  /**
   * Issue a receipt through Cardcom's Documents/Create API. Used for
   * non-credit-card payments (cash / cheque / bank-transfer) where the
   * therapist still wants the legal document to come from Cardcom (their
   * official numbering, registered with מערך חשבוניות ישראל).
   *
   * For credit-card payments processed via Cardcom's LowProfile flow, the
   * receipt is already issued automatically — that path goes through
   * /api/payments/[id]/charge-cardcom, not through this method.
   */
  private async createCardcomReceipt(
    terminalNumber: string,
    apiSecretCombined: string,
    providerData: { settings: unknown },
    request: ReceiptRequest,
  ): Promise<ReceiptResult> {
    const { createCardcomDocument } = await import('@/lib/cardcom/invoice-api');

    // Split apiSecret on FIRST colon — ApiPassword may itself contain colons.
    const sepIndex = apiSecretCombined.indexOf(':');
    const apiName = sepIndex === -1 ? apiSecretCombined : apiSecretCombined.slice(0, sepIndex);
    const apiPassword = sepIndex === -1 ? '' : apiSecretCombined.slice(sepIndex + 1);
    if (!apiName || !apiPassword) {
      return { success: false, error: 'חסרים פרטי גישה ל-Cardcom (ApiName / ApiPassword)' };
    }

    // Map MyTipul payment method → Cardcom Payment_Type code.
    //   1 = cash, 2 = cheque, 3 = credit-card-already-processed, 4 = bank transfer.
    // For "OTHER" / unknown we default to "cash" — Cardcom requires a code.
    const cardcomPaymentType: 1 | 2 | 3 | 4 = (() => {
      const m = request.paymentMethod?.toLowerCase() ?? '';
      if (m.includes('cash')) return 1;
      if (m.includes('check') || m.includes('cheque')) return 2;
      if (m.includes('bank') || m.includes('transfer')) return 4;
      if (m.includes('card')) return 3;
      return 1;
    })();

    const therapist = await prisma.user.findUnique({
      where: { id: this.userId },
      select: {
        name: true,
        businessType: true,
        businessName: true,
        businessIdNumber: true,
        accountingMethod: true,
      },
    });
    const documentType: 'Receipt' | 'TaxInvoiceAndReceipt' =
      therapist?.businessType === 'LICENSED' ? 'TaxInvoiceAndReceipt' : 'Receipt';

    // Honor the BillingProvider.settings.mode that the therapist configured —
    // hardcoding 'production' would refuse sandbox terminals (CardcomClient
    // throws CARDCOM_REFUSE_SANDBOX_IN_PRODUCTION on prod NODE_ENV).
    const settingsTyped = providerData.settings as { mode?: 'sandbox' | 'production' } | null;
    const mode: 'sandbox' | 'production' =
      settingsTyped?.mode === 'production' ? 'production' : 'sandbox';

    const result = await createCardcomDocument(
      { terminalNumber, apiName, apiPassword, mode },
      {
        documentType,
        customerName: request.clientName,
        customerEmail: request.clientEmail,
        amount: request.amount,
        description: request.description,
        paymentType: cardcomPaymentType,
        sendByEmail: !!request.sendEmail && !!request.clientEmail,
      },
    );

    if (!result.success || !result.documentNumber) {
      return {
        success: false,
        error: result.error ?? 'Cardcom לא החזיר מספר מסמך',
        notSupported: result.notSupported,
      };
    }

    // Mirror as CardcomInvoice so the receipts page knows this came from Cardcom
    // (the page hides the internal "הורד PDF" button when a CardcomInvoice
    // exists for the Payment). Wrapped in try/catch + P2002-tolerant since
    // a webhook on a credit-card flow could race us — for cash flows this
    // is the only place creating the row.
    if (request.paymentId && therapist) {
      const { Prisma } = await import('@prisma/client');
      const isLicensed = therapist.businessType === 'LICENSED';
      const amountTotal = request.amount;
      const vatRate = isLicensed ? 18 : null;
      const amountBeforeVat =
        isLicensed && vatRate ? amountTotal / (1 + vatRate / 100) : null;
      const vatAmount =
        isLicensed && amountBeforeVat !== null ? amountTotal - amountBeforeVat : null;

      // We need the related Client.id and the Payment's session for occurredAt.
      const payment = await prisma.payment.findUnique({
        where: { id: request.paymentId },
        select: {
          clientId: true,
          session: { select: { startTime: true } },
        },
      });

      const now = new Date();
      try {
        await prisma.cardcomInvoice.create({
          data: {
            tenant: 'USER',
            cardcomDocumentNumber: result.documentNumber,
            cardcomDocumentType: documentType,
            pdfUrl: result.documentLink ?? null,
            allocationNumber: result.allocationNumber ?? null,
            issuerUserId: this.userId,
            issuerBusinessType: therapist.businessType ?? 'NONE',
            issuerBusinessName: therapist.businessName ?? therapist.name ?? '',
            issuerIdNumber: therapist.businessIdNumber ?? '',
            vatRateSnapshot: vatRate ? String(vatRate) : null,
            amountBeforeVat: amountBeforeVat !== null ? amountBeforeVat.toFixed(2) : null,
            vatAmount: vatAmount !== null ? vatAmount.toFixed(2) : null,
            subscriberId: this.userId,
            subscriberNameSnapshot: request.clientName,
            subscriberEmailSnapshot: request.clientEmail ?? null,
            recipientClientId: payment?.clientId ?? null,
            paymentId: request.paymentId,
            amount: request.amount,
            currency: 'ILS',
            description: request.description,
            issuedAt: now,
            occurredAt:
              therapist.accountingMethod === 'ACCRUAL'
                ? (payment?.session?.startTime ?? now)
                : now,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // Already mirrored (race with webhook on a CC flow). Fine — receipt
          // still issued by Cardcom; the existing CardcomInvoice row covers UI.
        } else {
          throw err;
        }
      }
    }

    return {
      success: true,
      receiptId: result.documentNumber,
      receiptNumber: result.documentNumber,
      receiptUrl: result.documentLink,
      pdfUrl: result.documentLink,
    };
  }

  private async createSumitPaymentLink(apiKey: string, companyId: string, request: PaymentLinkRequest): Promise<PaymentLinkResult> {
    const client = new SumitClient(apiKey, companyId);
    const response = await client.createPaymentLink({
      Customer: {
        Name: request.clientName,
        Email: request.clientEmail,
        Phone: request.clientPhone,
      },
      Amount: request.amount,
      Description: request.description,
      RedirectURL: request.successUrl,
      WebhookURL: request.webhookUrl,
    });

    if (!response.Success || !response.Data) {
      return {
        success: false,
        error: response.ErrorMessage,
      };
    }

    return {
      success: true,
      paymentUrl: response.Data.PaymentURL,
      paymentId: response.Data.PaymentID,
    };
  }
}

/**
 * Factory function ליצירת BillingService
 */
export function createBillingService(userId: string): BillingService {
  return new BillingService(userId);
}
