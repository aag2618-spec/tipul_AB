// src/lib/green-invoice/types.ts
// טיפוסים עבור חשבונית ירוקה (Green Invoice) API

/**
 * תגובה בסיסית מ-Green Invoice
 */
export interface GreenInvoiceResponse<T = unknown> {
  success: boolean;
  errorMessage?: string;
  errorCode?: number;
  data?: T;
}

/**
 * פרטי לקוח
 */
export interface GreenInvoiceClient {
  name: string;
  emails?: string[];
  phone?: string;
  address?: string;
  city?: string;
  taxId?: string; // מספר עוסק/ח.פ.
  country?: string;
}

/**
 * פריט במסמך
 */
export interface GreenInvoiceItem {
  description: string;
  quantity: number;
  price: number;
  vatType?: 0 | 1 | 2; // 0 = כולל, 1 = לא כולל, 2 = פטור
  currency?: 'ILS' | 'USD' | 'EUR';
}

/**
 * סוגי מסמכים
 */
export type GreenInvoiceDocType = 
  | 400  // קבלה
  | 305  // חשבונית מס
  | 320  // חשבונית מס קבלה
  | 330  // חשבונית זיכוי
  | 100; // הצעת מחיר

/**
 * סוגי תשלום
 */
export type GreenInvoicePaymentType = 
  | 0   // לא צוין
  | 1   // מזומן
  | 2   // צ'ק
  | 3   // כרטיס אשראי
  | 4   // העברה בנקאית
  | 5   // PayPal
  | 10  // אחר
  | 11; // תשלום אפליקציה

/**
 * בקשה ליצירת מסמך
 */
export interface CreateDocumentRequest {
  type: GreenInvoiceDocType;
  client: GreenInvoiceClient;
  income: GreenInvoiceItem[];
  description?: string;
  remarks?: string;
  payment?: {
    type: GreenInvoicePaymentType;
    date?: string;
    price?: number;
  }[];
  currency?: 'ILS' | 'USD' | 'EUR';
  lang?: 'he' | 'en';
  sendEmail?: boolean;
}

/**
 * תגובה ליצירת מסמך
 */
export interface CreateDocumentResponse {
  id: string;
  number: number;
  url: string;
  pdfUrl: string;
  total: {
    amount: number;
    vat: number;
    amountWithVat: number;
  };
  status: 'draft' | 'open' | 'closed' | 'cancelled';
}

/**
 * הגדרות ספציפיות ל-Green Invoice
 */
export interface GreenInvoiceSettings {
  vatType?: 0 | 1 | 2;
  defaultLang?: 'he' | 'en';
  autoSendEmail?: boolean;
}
