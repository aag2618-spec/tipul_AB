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
  private username: string;
  private password: string;
  private sid: string | null = null;
  private settings: ICountSettings;

  constructor(companyId: string, credentials: string, settings?: Partial<ICountSettings>) {
    this.companyId = companyId;
    const parts = credentials.split('|||');
    this.username = parts[0] || '';
    this.password = parts[1] || '';
    this.settings = {
      company_id: companyId,
      vat_exempt: false,
      default_lang: 'he',
      auto_send_email: true,
      ...settings,
    };
  }

  private async login(): Promise<boolean> {
    try {
      const params = new URLSearchParams();
      params.append('cid', this.companyId);
      params.append('user', this.username);
      params.append('pass', this.password);

      const response = await fetch(`${ICOUNT_API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const result = await response.json();
      if (result.sid) {
        this.sid = result.sid;
        return true;
      }
      console.error('iCount login failed:', result);
      return false;
    } catch (err) {
      console.error('iCount login error:', err);
      return false;
    }
  }

  private async request<T>(
    endpoint: string,
    data: Record<string, unknown>
  ): Promise<ICountResponse<T>> {
    try {
      if (!this.sid) {
        const loggedIn = await this.login();
        if (!loggedIn) {
          return {
            success: false,
            message: 'שגיאת התחברות ל-iCount - בדוק מזהה חברה, מייל וסיסמה',
          };
        }
      }

      const params = new URLSearchParams();
      params.append('cid', this.companyId);
      params.append('sid', this.sid);
      
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null) {
          if (typeof value === 'object') {
            params.append(key, JSON.stringify(value));
          } else {
            params.append(key, String(value));
          }
        }
      }

      const response = await fetch(`${ICOUNT_API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
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
      this.sid = null;
      const loggedIn = await this.login();
      if (!loggedIn) return false;
      
      const response = await this.request('doc/types', {});
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
    return this.request<CreateDocumentResponse>('doc/create', data);
  }

  async createInvoice(
    request: CreateDocumentRequest
  ): Promise<ICountResponse<CreateDocumentResponse>> {
    const data = this.buildDocumentData({
      ...request,
      doctype: 'tax_invoice',
    });
    return this.request<CreateDocumentResponse>('doc/create', data);
  }

  async createInvoiceReceipt(
    request: CreateDocumentRequest
  ): Promise<ICountResponse<CreateDocumentResponse>> {
    const data = this.buildDocumentData({
      ...request,
      doctype: 'invoice_receipt',
    });
    return this.request<CreateDocumentResponse>('doc/create', data);
  }

  async getDocumentUrl(docId: string): Promise<ICountResponse<{ url: string; pdf_url: string }>> {
    return this.request<{ url: string; pdf_url: string }>('doc/get_url', {
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
  credentials: string,
  settings?: Partial<ICountSettings>
): ICountClient {
  return new ICountClient(companyId, credentials, settings);
}
