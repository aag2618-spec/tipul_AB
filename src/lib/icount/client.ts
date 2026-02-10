// src/lib/icount/client.ts
// iCount API Client

import {
  ICountResponse,
  CreateDocumentRequest,
  CreateDocumentResponse,
  ICountSettings,
} from './types';

const ICOUNT_API_BASE = 'https://api.icount.co.il/api/v3.php';

export class ICountClient {
  private companyId: string;
  private apiKey: string;
  private settings: ICountSettings;

  constructor(companyId: string, apiKey: string, settings?: Partial<ICountSettings>) {
    this.companyId = companyId;
    this.apiKey = apiKey;
    this.settings = {
      company_id: companyId,
      vat_exempt: false,
      default_lang: 'he',
      auto_send_email: true,
      ...settings,
    };
  }

  /**
   * שליחת בקשה ל-iCount API
   */
  private async request<T>(
    endpoint: string,
    data: Record<string, unknown>
  ): Promise<ICountResponse<T>> {
    try {
      const requestData = {
        ...data,
        cid: this.companyId,
        user: this.apiKey,
      };

      const response = await fetch(`${ICOUNT_API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();

      if (!result.success && result.status !== 'ok') {
        console.error('iCount API Error:', result);
        return {
          success: false,
          message: result.reason || result.message || 'שגיאה בתקשורת עם iCount',
          error: {
            code: result.errorcode || 'UNKNOWN',
            message: result.reason || 'שגיאה לא ידועה',
          },
        };
      }

      return {
        success: true,
        message: 'הצלחה',
        data: result as T,
      };
    } catch (error) {
      console.error('iCount request error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'שגיאה לא ידועה',
      };
    }
  }

  /**
   * בדיקת תקינות החיבור
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.request('get_company_details', {});
      return response.success;
    } catch {
      return false;
    }
  }

  /**
   * יצירת קבלה
   */
  async createReceipt(
    request: CreateDocumentRequest
  ): Promise<ICountResponse<CreateDocumentResponse>> {
    const data = this.buildDocumentData(request);
    return this.request<CreateDocumentResponse>('create_doc', data);
  }

  /**
   * יצירת חשבונית מס
   */
  async createInvoice(
    request: CreateDocumentRequest
  ): Promise<ICountResponse<CreateDocumentResponse>> {
    const data = this.buildDocumentData({
      ...request,
      doctype: 'tax_invoice',
    });
    return this.request<CreateDocumentResponse>('create_doc', data);
  }

  /**
   * יצירת חשבונית מס קבלה
   */
  async createInvoiceReceipt(
    request: CreateDocumentRequest
  ): Promise<ICountResponse<CreateDocumentResponse>> {
    const data = this.buildDocumentData({
      ...request,
      doctype: 'invoice_receipt',
    });
    return this.request<CreateDocumentResponse>('create_doc', data);
  }

  /**
   * קבלת קישור למסמך
   */
  async getDocumentUrl(docId: string): Promise<ICountResponse<{ url: string; pdf_url: string }>> {
    return this.request<{ url: string; pdf_url: string }>('get_doc_url', {
      doc_id: docId,
    });
  }

  /**
   * בניית נתוני מסמך
   */
  private buildDocumentData(request: CreateDocumentRequest): Record<string, unknown> {
    const items = request.items.map((item, index) => ({
      description: item.description,
      quantity: item.quantity,
      unitprice: item.unit_price,
      vat_type: item.vat_type || (this.settings.vat_exempt ? 'exempt' : 'include'),
    }));

    return {
      doctype: this.mapDocType(request.doctype),
      client_name: request.client.client_name,
      email: request.client.email,
      phone: request.client.phone,
      address: request.client.address,
      city: request.client.city,
      vat_id: request.client.vat_id,
      items,
      description: request.description,
      paytype: this.mapPaymentType(request.payment_type),
      send_email: request.send_email !== false ? 1 : 0,
      lang: request.lang || this.settings.default_lang,
      currency_code: request.currency || 'ILS',
      remarks: request.notes,
    };
  }

  /**
   * המרת סוג מסמך
   */
  private mapDocType(type: string): number {
    const mapping: Record<string, number> = {
      receipt: 400,
      tax_invoice: 305,
      invoice_receipt: 320,
      credit_invoice: 330,
      price_quote: 100,
    };
    return mapping[type] || 400;
  }

  /**
   * המרת סוג תשלום
   */
  private mapPaymentType(type?: string): number {
    const mapping: Record<string, number> = {
      cash: 1,
      check: 2,
      bank_transfer: 3,
      credit_card: 4,
      other: 10,
    };
    return mapping[type || 'other'] || 10;
  }
}

/**
 * יצירת instance של iCount client
 */
export function createICountClient(
  companyId: string,
  apiKey: string,
  settings?: Partial<ICountSettings>
): ICountClient {
  return new ICountClient(companyId, apiKey, settings);
}
