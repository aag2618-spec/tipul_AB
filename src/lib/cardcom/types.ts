// src/lib/cardcom/types.ts
// TypeScript types for Cardcom LowProfile API v11
// Reference: https://secure.cardcom.solutions/api/v11

export type CardcomMode = 'sandbox' | 'production';

export type CardcomDocumentType =
  | 'Receipt' // קבלה (עוסק פטור)
  | 'TaxInvoiceAndReceipt' // חשבונית מס-קבלה (עוסק מורשה)
  | 'TaxInvoice' // חשבונית מס בלבד
  | 'Refund'; // זיכוי

export interface CardcomConfig {
  terminalNumber: string;
  apiName: string;
  apiPassword?: string; // חובה ל-DoTransaction (חיוב טוקן). לא חובה ל-LowProfile/Create.
  mode: CardcomMode;
}

export interface CardcomCustomer {
  name: string;
  taxId?: string;
  email?: string;
}

export interface CardcomProduct {
  description: string;
  unitCost: number;
  quantity: number;
}

export interface CreatePaymentPageOptions {
  amount: number;
  description: string;
  /** Internal reference — typically the CardcomTransaction.id. Returned back in webhook. */
  returnValue: string;
  successRedirectUrl: string;
  failedRedirectUrl: string;
  webhookUrl: string;
  /** Should Cardcom save a token (Low-Profile token) for recurring billing? */
  createToken?: boolean;
  /** 1 = single payment (default for ADMIN). 2-36 allowed for USER flow. */
  numOfPayments?: number;
  language?: 'he' | 'en';
  documentType: CardcomDocumentType;
  customer: CardcomCustomer;
  products: CardcomProduct[];
  /**
   * Idempotency key sent to Cardcom as `UniqueAsmachta` — a retry of the same
   * call (e.g. our HTTP timeout) does NOT create a second LowProfile.
   * Cardcom rejects duplicate keys.
   */
  uniqueAsmachta?: string;
}

export interface CreatePaymentPageResult {
  lowProfileId: string;
  url: string;
  responseCode: string;
}

export interface ChargeTokenOptions {
  token: string;
  amount: number;
  numOfPayments?: number;
  cardExpiration: { month: number; year: number };
  description?: string;
  /**
   * Stable client-side idempotency key (e.g. CardcomTransaction.id). Sent to
   * Cardcom as `UniqueAsmachta` so a network timeout retry does NOT charge twice.
   * Cardcom rejects a second call with the same key as a duplicate.
   */
  uniqueAsmachta?: string;
  /**
   * אופציונלי: בלוק מסמך להפקת קבלה/חשבונית סינכרונית בעת חיוב הטוקן.
   * בלי זה — Cardcom מחייב את הכרטיס בהצלחה אבל לא מפיק שום קבלה,
   * ולכן הלקוח לא מקבל אישור והעסק נשאר בלי תיעוד חשבונאי לחיוב הזה.
   * חובה ל-USER tenant (חוק חשבוניות ישראל 2024). ב-ADMIN flow זה אופציונלי.
   */
  document?: {
    documentType: CardcomDocumentType;
    customer: CardcomCustomer;
    products: CardcomProduct[];
  };
}

export interface ChargeTokenResult {
  responseCode: string;
  approvalNumber?: string;
  transactionId?: string;
  errorMessage?: string;
  /**
   * פרטי המסמך שהופק ע״י Cardcom (כש-`document` נשלח). אם Cardcom החזיר
   * ResponseCode=0 אבל לא הפיק מסמך, השדות יהיו undefined — צריך לטפל בזה
   * כסיכון אבטחה (חיוב בלי קבלה) ולא להתעלם.
   */
  documentNumber?: string;
  documentType?: string;
  documentLink?: string;
}

export interface RefundOptions {
  /** Original transaction ID to refund. */
  transactionId: string;
  /** Optional partial amount. If omitted, full refund. */
  amount?: number;
  reason: string;
  /** Stable idempotency key — Cardcom rejects duplicates of the same key. */
  uniqueAsmachta?: string;
}

export interface RefundResult {
  refundId: string;
  allocationNumber?: string;
  responseCode: string;
  errorMessage?: string;
}

/**
 * Webhook payload sent by Cardcom after a payment attempt.
 * Field names match Cardcom's actual response shape (LowProfile v11).
 */
export interface CardcomWebhookPayload {
  ResponseCode: string;
  Description?: string;
  LowProfileId: string;
  TranzactionId?: string;
  ReturnValue?: string;
  Operation?: string;
  // Card info (only when transaction succeeded)
  TranzactionInfo?: {
    ApprovalNumber?: string;
    Last4CardDigits?: string;
    CardOwnerName?: string;
    CardOwnerPhone?: string;
    CardOwnerEmail?: string;
    CardName?: string;
    CardExpirationMM?: string;
    CardExpirationYY?: string;
    Amount?: number;
    NumberOfPayments?: number;
    Token?: string;
  };
  // Document info (only if a Receipt/Invoice was created)
  DocumentInfo?: {
    DocumentNumber?: string;
    DocumentType?: string;
    DocumentLink?: string;
    AllocationNumber?: string;
  };
  // Anti-replay
  Timestamp?: string;
}

/**
 * Whitelist of keys allowed in the SiteSetting key-value store.
 * Adding/removing items here is a deliberate, audited change.
 */
export type SiteSettingKey =
  | 'admin_business_type'
  | 'admin_business_name'
  | 'admin_business_id_number'
  | 'admin_business_address'
  | 'admin_business_phone'
  | 'admin_business_email'
  | 'admin_business_vat_rate'
  | 'admin_business_logo_url'
  | 'admin_business_footer_text'
  | 'admin_cardcom_mode'
  | 'admin_cardcom_backup_pdf'
  | 'admin_series_receipts'
  | 'admin_series_tax_invoices'
  // Accounting method for MyTipul itself ("CASH" | "ACCRUAL"). Same semantics
  // as User.accountingMethod but stored centrally for the ADMIN tenant.
  // Stored as a Json string so the SiteSetting key-value store stays uniform.
  | 'admin_accounting_method'
  // Country-wide VAT rate (Israel). Used for USER-tenant tax invoices and
  // ADMIN-tenant receipts when the issuer is LICENSED. Stored centrally so a
  // legislated rate change (e.g. 18→17) becomes a single DB update, no deploy.
  | 'country_vat_rate';
