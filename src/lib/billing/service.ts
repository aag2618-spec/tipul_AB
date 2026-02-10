// src/lib/billing/service.ts
// Unified Billing Service - מנהל את כל ספקי החיוב

import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { MeshulamClient } from '@/lib/meshulam';
import { ICountClient } from '@/lib/icount';
import { GreenInvoiceClient } from '@/lib/green-invoice';
import { SumitClient } from '@/lib/sumit';

export type BillingProviderType = 'MESHULAM' | 'ICOUNT' | 'GREEN_INVOICE' | 'SUMIT';

interface ReceiptRequest {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  amount: number;
  description: string;
  paymentMethod?: 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'other';
  sendEmail?: boolean;
  notes?: string;
}

interface ReceiptResult {
  success: boolean;
  receiptId?: string;
  receiptNumber?: string;
  receiptUrl?: string;
  pdfUrl?: string;
  error?: string;
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
    const provider = await prisma.billingProvider.findFirst({
      where: {
        userId: this.userId,
        isActive: true,
        isPrimary: true,
      },
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
      sendEmail: request.sendEmail,
      notes: request.notes,
    });

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
      send_email: request.sendEmail,
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

  // --- Green Invoice ---
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
      sendEmail: request.sendEmail,
    });

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.errorMessage,
      };
    }

    return {
      success: true,
      receiptId: response.data.id,
      receiptNumber: response.data.number.toString(),
      receiptUrl: response.data.url,
      pdfUrl: response.data.pdfUrl,
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
      SendEmail: request.sendEmail,
      Comments: request.notes,
    });

    if (!response.Success || !response.Data) {
      return {
        success: false,
        error: response.ErrorMessage,
      };
    }

    return {
      success: true,
      receiptId: response.Data.DocumentID,
      receiptNumber: response.Data.DocumentNumber.toString(),
      receiptUrl: response.Data.DocumentURL,
      pdfUrl: response.Data.DocumentPDF,
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
