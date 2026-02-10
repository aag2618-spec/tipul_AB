// src/lib/sumit/types.ts
// טיפוסים עבור Sumit API

/**
 * תגובה בסיסית מ-Sumit
 */
export interface SumitResponse<T = unknown> {
  Success: boolean;
  ErrorMessage?: string;
  ErrorCode?: number;
  Data?: T;
}

/**
 * פרטי לקוח
 */
export interface SumitCustomer {
  Name: string;
  Email?: string;
  Phone?: string;
  Address?: string;
  City?: string;
  CompanyNumber?: string; // ח.פ./עוסק מורשה
}

/**
 * פריט במסמך
 */
export interface SumitItem {
  Item: string;
  Description?: string;
  Quantity: number;
  Price: number;
  Currency?: 'ILS' | 'USD' | 'EUR';
  IsPriceIncludingVAT?: boolean;
}

/**
 * סוגי מסמכים
 */
export type SumitDocumentType = 
  | 1   // חשבונית מס
  | 2   // קבלה
  | 3   // חשבונית מס קבלה
  | 4   // חשבונית זיכוי
  | 5   // הצעת מחיר
  | 6;  // הזמנה

/**
 * סוגי תשלום
 */
export type SumitPaymentMethod = 
  | 0   // ללא תשלום
  | 1   // מזומן
  | 2   // צ'ק
  | 3   // כרטיס אשראי
  | 4   // העברה בנקאית
  | 5   // ביט
  | 6   // PayBox
  | 7;  // אחר

/**
 * בקשה ליצירת מסמך
 */
export interface CreateDocumentRequest {
  DocumentType: SumitDocumentType;
  Customer: SumitCustomer;
  Items: SumitItem[];
  Description?: string;
  Comments?: string;
  PaymentMethod?: SumitPaymentMethod;
  SendEmail?: boolean;
  Language?: 1 | 2; // 1 = עברית, 2 = אנגלית
}

/**
 * תגובה ליצירת מסמך
 */
export interface CreateDocumentResponse {
  DocumentID: string;
  DocumentNumber: number;
  DocumentURL: string;
  DocumentPDF: string;
  Total: number;
  TotalVAT: number;
  TotalWithVAT: number;
  Status: string;
}

/**
 * בקשה ליצירת קישור תשלום
 */
export interface CreatePaymentLinkRequest {
  Customer: SumitCustomer;
  Amount: number;
  Description: string;
  RedirectURL?: string;
  WebhookURL?: string;
  ExpirationMinutes?: number;
  MaxPayments?: number;
  CreateDocument?: boolean;
  SendEmail?: boolean;
}

/**
 * תגובה ליצירת קישור תשלום
 */
export interface CreatePaymentLinkResponse {
  PaymentID: string;
  PaymentURL: string;
  ShortURL?: string;
  ExpiresAt?: string;
}

/**
 * נתוני Webhook מ-Sumit
 */
export interface SumitWebhookPayload {
  Event: 'payment.success' | 'payment.failed' | 'document.created';
  PaymentID?: string;
  Amount?: number;
  Currency?: string;
  Customer?: SumitCustomer;
  DocumentID?: string;
  DocumentURL?: string;
  Status?: string;
  ErrorMessage?: string;
  Timestamp?: string;
}

/**
 * הגדרות ספציפיות ל-Sumit
 */
export interface SumitSettings {
  CompanyID: string;
  VATExempt?: boolean;
  DefaultLanguage?: 1 | 2;
  AutoSendEmail?: boolean;
  AutoCreateDocument?: boolean;
}
