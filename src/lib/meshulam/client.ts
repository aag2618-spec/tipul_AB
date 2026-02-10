// src/lib/meshulam/client.ts
// Meshulam API Client

import {
  MeshulamResponse,
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  CreatePaymentLinkRequest,
  CreatePaymentLinkResponse,
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
  MeshulamTransaction,
  MeshulamSettings,
} from './types';

const MESHULAM_API_BASE = 'https://secure.meshulam.co.il/api/light/server/1.0';
const MESHULAM_SANDBOX_BASE = 'https://sandbox.meshulam.co.il/api/light/server/1.0';

export class MeshulamClient {
  private pageCode: string;
  private isSandbox: boolean;
  private settings: MeshulamSettings;

  constructor(pageCode: string, settings?: MeshulamSettings, isSandbox = false) {
    this.pageCode = pageCode;
    this.isSandbox = isSandbox;
    this.settings = settings || {};
  }

  private get baseUrl(): string {
    return this.isSandbox ? MESHULAM_SANDBOX_BASE : MESHULAM_API_BASE;
  }

  /**
   * שליחת בקשה ל-Meshulam API
   */
  private async request<T>(
    endpoint: string,
    data: Record<string, unknown>
  ): Promise<MeshulamResponse<T>> {
    try {
      const formData = new FormData();
      formData.append('pageCode', this.pageCode);
      
      // הוספת כל הנתונים ל-FormData
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null) {
          if (typeof value === 'object') {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
        }
      }

      const response = await fetch(`${this.baseUrl}/${endpoint}`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.status !== 1) {
        console.error('Meshulam API Error:', result);
        return {
          status: result.status || 0,
          message: result.err?.message || 'שגיאה בתקשורת עם Meshulam',
          err: result.err,
        };
      }

      return {
        status: 1,
        message: 'הצלחה',
        data: result.data as T,
      };
    } catch (error) {
      console.error('Meshulam request error:', error);
      return {
        status: 0,
        message: error instanceof Error ? error.message : 'שגיאה לא ידועה',
      };
    }
  }

  /**
   * בדיקת תקינות החיבור
   */
  async testConnection(): Promise<boolean> {
    try {
      // ננסה לקבל פרטי החשבון
      const response = await this.request('getBusinessInfo', {});
      return response.status === 1;
    } catch {
      return false;
    }
  }

  /**
   * יצירת קישור תשלום
   */
  async createPaymentLink(
    request: CreatePaymentLinkRequest
  ): Promise<MeshulamResponse<CreatePaymentLinkResponse>> {
    const data: Record<string, unknown> = {
      sum: request.amount,
      description: request.description,
      fullName: request.customer.customerName,
      email: request.customer.customerEmail,
      phone: request.customer.customerPhone,
      successUrl: request.successUrl,
      cancelUrl: request.cancelUrl,
      notifyUrl: request.webhookUrl,
      maxPayments: request.maxPayments || 1,
      createDocument: request.createInvoice ? 1 : 0,
    };

    // הוספת שדות מותאמים אישית (למשל paymentId מהמערכת)
    if (request.customFields) {
      data.cField1 = request.customFields.paymentId || '';
      data.cField2 = request.customFields.clientId || '';
      data.cField3 = request.customFields.therapistId || '';
    }

    return this.request<CreatePaymentLinkResponse>('createPaymentProcess', data);
  }

  /**
   * יצירת קבלה/חשבונית
   */
  async createInvoice(
    request: CreateInvoiceRequest
  ): Promise<MeshulamResponse<CreateInvoiceResponse>> {
    // בניית רשימת פריטים
    const items = request.items.map((item, index) => ({
      [`item${index + 1}_name`]: item.description,
      [`item${index + 1}_quantity`]: item.quantity,
      [`item${index + 1}_price`]: item.price,
    }));

    const flatItems = Object.assign({}, ...items);

    const data: Record<string, unknown> = {
      ...flatItems,
      fullName: request.customer.customerName,
      email: request.customer.customerEmail,
      phone: request.customer.customerPhone,
      address: request.customer.customerAddress,
      city: request.customer.customerCity,
      description: request.description,
      paymentType: this.mapPaymentType(request.paymentType),
      documentType: request.documentType || 'receipt',
      sendEmail: request.sendEmail ? 1 : 0,
      notes: request.notes,
    };

    return this.request<CreateInvoiceResponse>('createDocument', data);
  }

  /**
   * יצירת מנוי חוזר (הוראת קבע)
   */
  async createSubscription(
    request: CreateSubscriptionRequest
  ): Promise<MeshulamResponse<CreateSubscriptionResponse>> {
    const data: Record<string, unknown> = {
      sum: request.amount,
      description: request.description,
      fullName: request.customer.customerName,
      email: request.customer.customerEmail,
      phone: request.customer.customerPhone,
      recurringPayments: 1,
      recurringSum: request.amount,
      recurringInterval: request.intervalDays,
      recurringMaxPayments: request.maxPayments || 0, // 0 = ללא הגבלה
      successUrl: request.successUrl,
      notifyUrl: request.webhookUrl,
    };

    return this.request<CreateSubscriptionResponse>('createPaymentProcess', data);
  }

  /**
   * ביטול מנוי
   */
  async cancelSubscription(subscriptionId: string): Promise<MeshulamResponse<void>> {
    return this.request<void>('cancelRecurring', {
      subscriptionId,
    });
  }

  /**
   * קבלת פרטי עסקה
   */
  async getTransaction(transactionId: string): Promise<MeshulamResponse<MeshulamTransaction>> {
    return this.request<MeshulamTransaction>('getTransaction', {
      transactionId,
    });
  }

  /**
   * קבלת קישור לקבלה/חשבונית
   */
  async getDocumentUrl(documentId: string): Promise<MeshulamResponse<{ url: string; pdfUrl: string }>> {
    return this.request<{ url: string; pdfUrl: string }>('getDocumentUrl', {
      documentId,
    });
  }

  /**
   * המרת סוג תשלום לקוד Meshulam
   */
  private mapPaymentType(type?: string): number {
    const mapping: Record<string, number> = {
      cash: 1,
      check: 2,
      bank_transfer: 3,
      credit_card: 4,
      other: 5,
    };
    return mapping[type || 'other'] || 5;
  }
}

/**
 * יצירת instance של Meshulam client מתוך BillingProvider
 */
export async function createMeshulamClient(
  apiKey: string,
  settings?: MeshulamSettings,
  isSandbox = false
): Promise<MeshulamClient> {
  return new MeshulamClient(apiKey, settings, isSandbox);
}

/**
 * אימות webhook מ-Meshulam
 */
export function verifyMeshulamWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Meshulam משתמש ב-HMAC-SHA256 לאימות
  const { createHmac } = require('node:crypto');
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  // השוואה בטוחה נגד timing attacks
  if (signature.length !== expectedSignature.length) return false;
  const { timingSafeEqual } = require('node:crypto');
  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
