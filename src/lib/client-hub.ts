/**
 * Client Hub CRM Integration Library
 *
 * Copy this file to your project: lib/client-hub.ts
 *
 * Usage:
 * import { clientHub } from '@/lib/client-hub';
 *
 * await clientHub.registerClient({ name, email, phone });
 * await clientHub.createTicket({ email, subject, message });
 * const portal = await clientHub.getPortalData(email);
 */

// Configuration - Update these values!
const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL || 'https://your-crm-url.com';
const API_KEY = process.env.NEXT_PUBLIC_CRM_API_KEY || '';

interface ClientData {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  metadata?: Record<string, unknown>;
}

interface TicketData {
  email: string;
  subject: string;
  message: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  category?: string;
}

interface PortalData {
  client: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    company?: string;
  };
  summary: {
    totalPaid: number;
    pendingAmount: number;
    pendingCount: number;
    activeSubscriptions: number;
    openTickets: number;
  };
  invoices: Array<{
    id: string;
    invoiceNo: string;
    amount: number;
    currency: string;
    status: string;
    dueDate: string;
    paidAt?: string;
    createdAt: string;
  }>;
  subscriptions: Array<{
    id: string;
    planName: string;
    amount: number;
    currency: string;
    interval: string;
    status: string;
    nextBilling: string;
  }>;
  tickets: Array<{
    id: string;
    ticketNo: string;
    subject: string;
    status: string;
    priority: string;
    createdAt: string;
    _count: { messages: number };
  }>;
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${CRM_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const clientHub = {
  /**
   * Register or update a client in the CRM
   * Called when user registers on your site
   */
  async registerClient(data: ClientData): Promise<{ client: ClientData; isNew: boolean }> {
    return apiRequest('/api/external/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get client data by email
   */
  async getClient(email: string) {
    return apiRequest(`/api/external/clients?email=${encodeURIComponent(email)}`);
  },

  /**
   * Create a support ticket (contact form)
   */
  async createTicket(data: TicketData): Promise<{ ticketId: string; ticketNo: string; status: string }> {
    return apiRequest('/api/external/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get tickets for a client
   */
  async getTickets(email: string) {
    return apiRequest(`/api/external/tickets?email=${encodeURIComponent(email)}`);
  },

  /**
   * Get specific ticket by number
   */
  async getTicket(ticketNo: string) {
    return apiRequest(`/api/external/tickets?ticketNo=${encodeURIComponent(ticketNo)}`);
  },

  /**
   * Get all portal data for a client (invoices, subscriptions, tickets)
   */
  async getPortalData(email: string): Promise<PortalData> {
    return apiRequest(`/api/external/portal?email=${encodeURIComponent(email)}`);
  },

  /**
   * Get payment URL for an invoice
   * Redirects user to PayPal
   */
  getPaymentUrl(invoiceId: string): string {
    return `${CRM_URL}/api/payments/create?invoiceId=${invoiceId}`;
  },

  /**
   * Get widget script URL
   * Use this to dynamically load the chat widget
   */
  getWidgetUrl(): string {
    return `${CRM_URL}/widget.js`;
  },
};

// React hook for using client hub
export function useClientHub() {
  return clientHub;
}

export default clientHub;
