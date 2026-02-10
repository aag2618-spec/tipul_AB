// src/lib/meshulam/types.ts
// טיפוסים עבור Meshulam API

/**
 * תגובה בסיסית מ-Meshulam
 */
export interface MeshulamResponse<T = unknown> {
  status: number;
  message: string;
  data?: T;
  err?: {
    code: number;
    message: string;
  };
}

/**
 * פרטי לקוח
 */
export interface MeshulamCustomer {
  customerId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerCity?: string;
}

/**
 * פריט בחשבונית
 */
export interface MeshulamInvoiceItem {
  description: string;
  quantity: number;
  price: number;
  vatIncluded?: boolean;
}

/**
 * בקשה ליצירת קבלה/חשבונית
 */
export interface CreateInvoiceRequest {
  customer: MeshulamCustomer;
  items: MeshulamInvoiceItem[];
  description?: string;
  paymentType?: 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'other';
  documentType?: 'receipt' | 'invoice' | 'invoice_receipt';
  sendEmail?: boolean;
  notes?: string;
}

/**
 * תגובה ליצירת קבלה
 */
export interface CreateInvoiceResponse {
  documentId: string;
  documentNumber: string;
  documentUrl: string;
  pdfUrl: string;
}

/**
 * בקשה ליצירת קישור תשלום
 */
export interface CreatePaymentLinkRequest {
  customer: MeshulamCustomer;
  amount: number;
  description: string;
  successUrl?: string;
  cancelUrl?: string;
  webhookUrl?: string;
  expirationMinutes?: number;
  maxPayments?: number;
  createInvoice?: boolean;
  customFields?: Record<string, string>;
}

/**
 * תגובה ליצירת קישור תשלום
 */
export interface CreatePaymentLinkResponse {
  paymentId: string;
  paymentUrl: string;
  shortUrl?: string;
  expiresAt?: string;
}

/**
 * נתוני Webhook מ-Meshulam
 */
export interface MeshulamWebhookPayload {
  type: 'payment.success' | 'payment.failed' | 'payment.pending' | 'subscription.created' | 'subscription.cancelled' | 'subscription.renewed';
  paymentId?: string;
  transactionId?: string;
  amount?: number;
  currency?: string;
  customerId?: string;
  customerEmail?: string;
  customerName?: string;
  documentId?: string;
  documentUrl?: string;
  status?: string;
  errorMessage?: string;
  customFields?: Record<string, string>;
  timestamp?: string;
}

/**
 * בקשה ליצירת מנוי חוזר
 */
export interface CreateSubscriptionRequest {
  customer: MeshulamCustomer;
  amount: number;
  description: string;
  intervalDays: number; // 30 = חודשי
  startDate?: string;
  endDate?: string;
  maxPayments?: number;
  successUrl?: string;
  webhookUrl?: string;
}

/**
 * תגובה ליצירת מנוי
 */
export interface CreateSubscriptionResponse {
  subscriptionId: string;
  paymentUrl: string;
  nextPaymentDate: string;
}

/**
 * פרטי עסקה
 */
export interface MeshulamTransaction {
  transactionId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: 'success' | 'failed' | 'pending';
  createdAt: string;
  customer: MeshulamCustomer;
  documentId?: string;
  documentUrl?: string;
}

/**
 * הגדרות ספציפיות ל-Meshulam
 */
export interface MeshulamSettings {
  businessName?: string;
  businessNumber?: string;
  vatExempt?: boolean;
  defaultCurrency?: string;
  autoCreateReceipt?: boolean;
}
