// src/lib/sumit/client.ts
// Sumit API Client

import {
  SumitResponse,
  CreateDocumentRequest,
  CreateDocumentResponse,
  CreatePaymentLinkRequest,
  CreatePaymentLinkResponse,
  SumitSettings,
  SumitDocumentType,
  SumitPaymentMethod,
} from './types';

const SUMIT_API_BASE = 'https://api.sumit.co.il/v1';

export class SumitClient {
  private apiKey: string;
  private companyId: string;
  private settings: SumitSettings;

  constructor(apiKey: string, companyId: string, settings?: Partial<SumitSettings>) {
    this.apiKey = apiKey;
    this.companyId = companyId;
    this.settings = {
      CompanyID: companyId,
      VATExempt: false,
      DefaultLanguage: 1,
      AutoSendEmail: true,
      AutoCreateDocument: true,
      ...settings,
    };
  }

  /**
   * שליחת בקשה ל-Sumit API
   */
  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' = 'POST',
    data?: Record<string, unknown>
  ): Promise<SumitResponse<T>> {
    try {
      const requestData = {
        ...data,
        Credentials: {
          CompanyID: this.companyId,
          APIKey: this.apiKey,
        },
      };

      const response = await fetch(`${SUMIT_API_BASE}/${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();

      if (!result.Success) {
        console.error('Sumit API Error:', result);
        return {
          Success: false,
          ErrorMessage: result.ErrorMessage || 'שגיאה בתקשורת עם Sumit',
          ErrorCode: result.ErrorCode,
        };
      }

      return {
        Success: true,
        Data: result.Data as T,
      };
    } catch (error) {
      console.error('Sumit request error:', error);
      return {
        Success: false,
        ErrorMessage: error instanceof Error ? error.message : 'שגיאה לא ידועה',
      };
    }
  }

  /**
   * בדיקת תקינות החיבור
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.request('Company/GetDetails', 'POST', {});
      return response.Success;
    } catch {
      return false;
    }
  }

  /**
   * יצירת קבלה
   */
  async createReceipt(
    request: Omit<CreateDocumentRequest, 'DocumentType'>
  ): Promise<SumitResponse<CreateDocumentResponse>> {
    return this.createDocument({ ...request, DocumentType: 2 });
  }

  /**
   * יצירת חשבונית מס
   */
  async createInvoice(
    request: Omit<CreateDocumentRequest, 'DocumentType'>
  ): Promise<SumitResponse<CreateDocumentResponse>> {
    return this.createDocument({ ...request, DocumentType: 1 });
  }

  /**
   * יצירת חשבונית מס קבלה
   */
  async createInvoiceReceipt(
    request: Omit<CreateDocumentRequest, 'DocumentType'>
  ): Promise<SumitResponse<CreateDocumentResponse>> {
    return this.createDocument({ ...request, DocumentType: 3 });
  }

  /**
   * יצירת מסמך
   */
  async createDocument(
    request: CreateDocumentRequest
  ): Promise<SumitResponse<CreateDocumentResponse>> {
    const payload = {
      Document: {
        Type: request.DocumentType,
        Customer: request.Customer,
        Items: request.Items.map(item => ({
          ...item,
          IsPriceIncludingVAT: item.IsPriceIncludingVAT !== false,
          Currency: item.Currency || 'ILS',
        })),
        Description: request.Description,
        Comments: request.Comments,
        Language: request.Language || this.settings.DefaultLanguage,
        SendByEmail: request.SendEmail !== false,
        VATExempt: this.settings.VATExempt,
      },
      Payment: request.PaymentMethod ? {
        Method: request.PaymentMethod,
      } : undefined,
    };

    return this.request<CreateDocumentResponse>('Document/Create', 'POST', payload);
  }

  /**
   * יצירת קישור תשלום
   */
  async createPaymentLink(
    request: CreatePaymentLinkRequest
  ): Promise<SumitResponse<CreatePaymentLinkResponse>> {
    const payload = {
      Payment: {
        Customer: request.Customer,
        Amount: request.Amount,
        Description: request.Description,
        RedirectURL: request.RedirectURL,
        WebhookURL: request.WebhookURL,
        ExpirationMinutes: request.ExpirationMinutes || 60 * 24, // ברירת מחדל: יום
        MaxPayments: request.MaxPayments || 1,
        CreateDocument: request.CreateDocument !== false,
        DocumentType: 3 as SumitDocumentType, // חשבונית מס קבלה
        SendEmail: request.SendEmail !== false,
      },
    };

    return this.request<CreatePaymentLinkResponse>('Payment/CreateLink', 'POST', payload);
  }

  /**
   * קבלת פרטי עסקה
   */
  async getPayment(paymentId: string): Promise<SumitResponse<CreatePaymentLinkResponse>> {
    return this.request<CreatePaymentLinkResponse>('Payment/GetDetails', 'POST', {
      PaymentID: paymentId,
    });
  }

  /**
   * קבלת קישור למסמך
   */
  async getDocumentUrl(documentId: string): Promise<SumitResponse<{ URL: string; PDF: string }>> {
    return this.request<{ URL: string; PDF: string }>('Document/GetURL', 'POST', {
      DocumentID: documentId,
    });
  }

  /**
   * המרת שיטת תשלום
   */
  static mapPaymentMethod(type?: string): SumitPaymentMethod {
    const mapping: Record<string, SumitPaymentMethod> = {
      cash: 1,
      check: 2,
      credit_card: 3,
      bank_transfer: 4,
      bit: 5,
      paybox: 6,
      other: 7,
    };
    return mapping[type || 'other'] || 7;
  }
}

/**
 * יצירת instance של Sumit client
 */
export function createSumitClient(
  apiKey: string,
  companyId: string,
  settings?: Partial<SumitSettings>
): SumitClient {
  return new SumitClient(apiKey, companyId, settings);
}

/**
 * אימות webhook מ-Sumit
 */
export function verifySumitWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const { createHmac, timingSafeEqual } = require('node:crypto');
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  // השוואה בטוחה נגד timing attacks
  if (signature.length !== expectedSignature.length) return false;
  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
