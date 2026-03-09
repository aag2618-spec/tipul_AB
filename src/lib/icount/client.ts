// src/lib/icount/client.ts
// iCount API Client

import {
  ICountResponse,
  CreateDocumentRequest,
  CreateDocumentResponse,
  ICountSettings,
  ICountRawDocResponse,
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
      if (result.status && result.sid) {
        this.sid = result.sid;
        return true;
      }
      console.error('iCount login failed:', result.error_description || result.reason || JSON.stringify(result));
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
      params.append('sid', this.sid!);
      
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          value.forEach((item, idx) => {
            if (typeof item === 'object' && item !== null) {
              for (const [k, v] of Object.entries(item)) {
                if (v !== undefined && v !== null) {
                  params.append(`${key}[${idx}][${k}]`, String(v));
                }
              }
            } else {
              params.append(`${key}[${idx}]`, String(item));
            }
          });
        } else if (typeof value === 'object') {
          for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (v !== undefined && v !== null) {
              params.append(`${key}[${k}]`, String(v));
            }
          }
        } else {
          params.append(key, String(value));
        }
      }

      const response = await fetch(`${ICOUNT_API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const result = await response.json();

      // iCount API returns { status: true/false } not { success: true }
      if (!result.status) {
        console.error('iCount API Error:', result);
        return {
          success: false,
          message: result.error_description || result.reason || result.message || 'שגיאה בתקשורת עם iCount',
          error: {
            code: result.errorcode || 'UNKNOWN',
            message: result.error_description || result.reason || 'שגיאה לא ידועה',
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

  async getAvailableDocTypes(): Promise<Record<string, string>> {
    const response = await this.request<{ doctypes?: Record<string, string> }>('doc/types', {});
    if (response.success && response.data) {
      const raw = response.data as Record<string, unknown>;
      return (raw.doctypes ?? raw) as Record<string, string>;
    }
    return {};
  }

  private normalizeDocResponse(raw: ICountRawDocResponse): CreateDocumentResponse {
    return {
      doc_id: String(raw.docid ?? raw.doc_id ?? ''),
      doc_number: String(raw.docnum ?? raw.doc_number ?? ''),
      doc_url: raw.doc_url ?? '',
      pdf_url: raw.pdf_link ?? raw.pdf_url ?? '',
      total_amount: Number(raw.total ?? raw.total_amount ?? 0),
    };
  }

  /**
   * יצירת קבלה - מנסה סוגי מסמכים שונים עד שמצליח
   */
  async createReceipt(
    request: CreateDocumentRequest
  ): Promise<ICountResponse<CreateDocumentResponse>> {
    let availableTypes: Record<string, string> = {};
    try {
      availableTypes = await this.getAvailableDocTypes();
      console.log('iCount available doc types:', JSON.stringify(availableTypes));
    } catch (e) {
      console.error('Failed to fetch doc types:', e);
    }

    const typesToTry = [320, 305, 400, 100];
    const errors: string[] = [];

    for (const docType of typesToTry) {
      console.log('iCount trying doctype:', docType);
      const data = this.buildDocumentData(request, docType);
      const raw = await this.request<ICountRawDocResponse>('doc/create', data);

      if (raw.success && raw.data) {
        console.log('iCount doc/create SUCCESS with doctype', docType, ':', JSON.stringify(raw.data));
        return { ...raw, data: this.normalizeDocResponse(raw.data) };
      }

      const errMsg = raw.message || 'unknown error';
      console.log('iCount doctype', docType, 'failed:', errMsg);
      errors.push(`${docType}: ${errMsg}`);

      if (!errMsg.includes('מסמך') && !errMsg.includes('doctype') && !errMsg.includes('type')) {
        return raw as ICountResponse<CreateDocumentResponse>;
      }
    }

    return {
      success: false,
      message: `כל סוגי המסמכים נכשלו: ${errors.join(' | ')}`,
    };
  }

  async createInvoice(
    request: CreateDocumentRequest
  ): Promise<ICountResponse<CreateDocumentResponse>> {
    const data = this.buildDocumentData({
      ...request,
      doctype: 'tax_invoice',
    });
    const raw = await this.request<ICountRawDocResponse>('doc/create', data);
    if (!raw.success || !raw.data) return raw as ICountResponse<CreateDocumentResponse>;
    return { ...raw, data: this.normalizeDocResponse(raw.data) };
  }

  async createInvoiceReceipt(
    request: CreateDocumentRequest
  ): Promise<ICountResponse<CreateDocumentResponse>> {
    const data = this.buildDocumentData({
      ...request,
      doctype: 'invoice_receipt',
    });
    const raw = await this.request<ICountRawDocResponse>('doc/create', data);
    if (!raw.success || !raw.data) return raw as ICountResponse<CreateDocumentResponse>;
    return { ...raw, data: this.normalizeDocResponse(raw.data) };
  }

  async getDocumentUrl(docId: string): Promise<ICountResponse<{ url: string; pdf_url: string }>> {
    return this.request<{ url: string; pdf_url: string }>('doc/get_url', {
      doc_id: docId,
    });
  }

  /**
   * בניית נתוני מסמך
   */
  private buildDocumentData(request: CreateDocumentRequest, resolvedDocType?: number): Record<string, unknown> {
    const items = request.items.map((item, index) => ({
      description: item.description,
      quantity: item.quantity,
      unitprice: item.unit_price,
      vat_type: item.vat_type || (this.settings.vat_exempt ? 'exempt' : 'include'),
    }));

    return {
      doctype: resolvedDocType ?? this.mapDocType(request.doctype),
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
