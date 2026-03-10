// src/lib/icount/types.ts
// טיפוסים עבור iCount API

/**
 * תגובה בסיסית מ-iCount
 */
export interface ICountResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * פרטי לקוח
 */
export interface ICountCustomer {
  client_name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  vat_id?: string; // מספר עוסק
}

/**
 * פריט במסמך
 */
export interface ICountDocumentItem {
  description: string;
  quantity: number;
  unit_price: number;
  vat_type?: 'include' | 'exclude' | 'exempt';
}

/**
 * סוגי מסמכים ב-iCount
 */
export type ICountDocumentType = 
  | 'receipt'       // קבלה
  | 'tax_invoice'   // חשבונית מס
  | 'invoice_receipt' // חשבונית מס קבלה
  | 'credit_invoice'  // חשבונית זיכוי
  | 'price_quote';    // הצעת מחיר

/**
 * בקשה ליצירת מסמך
 */
export interface CreateDocumentRequest {
  doctype: ICountDocumentType;
  client: ICountCustomer;
  items: ICountDocumentItem[];
  description?: string;
  payment_type?: 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'other';
  send_email?: boolean;
  lang?: 'he' | 'en';
  currency?: 'ILS' | 'USD' | 'EUR';
  notes?: string;
}

/**
 * תגובה ליצירת מסמך (normalized from iCount's raw response)
 */
export interface CreateDocumentResponse {
  doc_id: string;
  doc_number: string;
  doc_url: string;
  pdf_url: string;
  total_amount: number;
}

/**
 * Raw iCount API response for doc/create - field names vary
 */
export interface ICountRawDocResponse {
  status: boolean;
  docnum?: string;
  doc_number?: string;
  docid?: string | number;
  doc_id?: string | number;
  doc_url?: string;
  doc_link?: string;
  pdf_link?: string;
  pdf_url?: string;
  total?: number;
  total_amount?: number;
  totalwithvat?: number;
  [key: string]: unknown;
}

/**
 * הגדרות ספציפיות ל-iCount
 */
export interface ICountSettings {
  company_id: string;
  vat_exempt?: boolean;
  default_lang?: 'he' | 'en';
  auto_send_email?: boolean;
}
