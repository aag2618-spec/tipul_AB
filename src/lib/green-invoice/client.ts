// src/lib/green-invoice/client.ts
// Green Invoice (חשבונית ירוקה) API Client

import {
  GreenInvoiceResponse,
  CreateDocumentRequest,
  CreateDocumentResponse,
  GreenInvoiceSettings,
  GreenInvoiceDocType,
  GreenInvoicePaymentType,
} from './types';

const GREEN_INVOICE_API_BASE = 'https://api.greeninvoice.co.il/api/v1';

export class GreenInvoiceClient {
  private apiKey: string;
  private apiSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private settings: GreenInvoiceSettings;

  constructor(apiKey: string, apiSecret: string, settings?: Partial<GreenInvoiceSettings>) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.settings = {
      vatType: 0,
      defaultLang: 'he',
      autoSendEmail: true,
      ...settings,
    };
  }

  /**
   * קבלת Access Token
   */
  private async getAccessToken(): Promise<string | null> {
    // בדיקה אם יש token תקף
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch(`${GREEN_INVOICE_API_BASE}/account/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: this.apiKey,
          secret: this.apiSecret,
        }),
      });

      const result = await response.json();

      if (result.token) {
        this.accessToken = result.token;
        // Token תקף ל-1 שעה
        this.tokenExpiry = new Date(Date.now() + 55 * 60 * 1000);
        return this.accessToken;
      }

      console.error('Failed to get Green Invoice token:', result);
      return null;
    } catch (error) {
      console.error('Green Invoice token error:', error);
      return null;
    }
  }

  /**
   * שליחת בקשה ל-API
   */
  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
    data?: Record<string, unknown>
  ): Promise<GreenInvoiceResponse<T>> {
    try {
      const token = await this.getAccessToken();
      if (!token) {
        return {
          success: false,
          errorMessage: 'נכשל בקבלת token',
        };
      }

      const response = await fetch(`${GREEN_INVOICE_API_BASE}/${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: data ? JSON.stringify(data) : undefined,
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          errorMessage: result.errorMessage || result.message || 'שגיאה לא ידועה',
          errorCode: result.errorCode,
        };
      }

      return {
        success: true,
        data: result as T,
      };
    } catch (error) {
      console.error('Green Invoice request error:', error);
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'שגיאה לא ידועה',
      };
    }
  }

  /**
   * בדיקת תקינות החיבור
   */
  async testConnection(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== null;
  }

  /**
   * יצירת קבלה
   */
  async createReceipt(
    request: Omit<CreateDocumentRequest, 'type'>
  ): Promise<GreenInvoiceResponse<CreateDocumentResponse>> {
    return this.createDocument({ ...request, type: 400 });
  }

  /**
   * יצירת חשבונית מס
   */
  async createInvoice(
    request: Omit<CreateDocumentRequest, 'type'>
  ): Promise<GreenInvoiceResponse<CreateDocumentResponse>> {
    return this.createDocument({ ...request, type: 305 });
  }

  /**
   * יצירת חשבונית מס קבלה
   */
  async createInvoiceReceipt(
    request: Omit<CreateDocumentRequest, 'type'>
  ): Promise<GreenInvoiceResponse<CreateDocumentResponse>> {
    return this.createDocument({ ...request, type: 320 });
  }

  /**
   * יצירת מסמך כללי
   */
  async createDocument(
    request: CreateDocumentRequest
  ): Promise<GreenInvoiceResponse<CreateDocumentResponse>> {
    const payload = {
      type: request.type,
      client: {
        name: request.client.name,
        emails: request.client.emails || (request.client.name ? [] : undefined),
        phone: request.client.phone,
        add: false, // לא לשמור כלקוח קבוע
      },
      income: request.income.map(item => ({
        description: item.description,
        quantity: item.quantity,
        price: item.price,
        vatType: item.vatType ?? this.settings.vatType,
        currency: item.currency || 'ILS',
      })),
      payment: request.payment || [{
        type: 0 as GreenInvoicePaymentType,
        date: new Date().toISOString().split('T')[0],
      }],
      description: request.description,
      remarks: request.remarks,
      currency: request.currency || 'ILS',
      lang: request.lang || this.settings.defaultLang,
    };

    return this.request<CreateDocumentResponse>('documents', 'POST', payload);
  }

  /**
   * קבלת פרטי מסמך
   */
  async getDocument(documentId: string): Promise<GreenInvoiceResponse<CreateDocumentResponse>> {
    return this.request<CreateDocumentResponse>(`documents/${documentId}`, 'GET');
  }

  /**
   * קבלת URL של מסמך
   */
  async getDocumentUrl(documentId: string): Promise<GreenInvoiceResponse<{ url: string; pdfUrl: string }>> {
    const response = await this.getDocument(documentId);
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          url: response.data.url,
          pdfUrl: response.data.pdfUrl,
        },
      };
    }
    return {
      success: false,
      errorMessage: response.errorMessage,
    };
  }

  /**
   * המרת שיטת תשלום
   */
  static mapPaymentType(type?: string): GreenInvoicePaymentType {
    const mapping: Record<string, GreenInvoicePaymentType> = {
      cash: 1,
      check: 2,
      credit_card: 3,
      bank_transfer: 4,
      paypal: 5,
      other: 10,
    };
    return mapping[type || 'other'] || 10;
  }
}

/**
 * יצירת instance של Green Invoice client
 */
export function createGreenInvoiceClient(
  apiKey: string,
  apiSecret: string,
  settings?: Partial<GreenInvoiceSettings>
): GreenInvoiceClient {
  return new GreenInvoiceClient(apiKey, apiSecret, settings);
}
