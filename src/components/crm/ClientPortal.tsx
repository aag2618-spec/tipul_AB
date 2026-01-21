'use client';

/**
 * Client Portal Component
 *
 * Copy this file to your project: components/ClientPortal.tsx
 *
 * Usage:
 * import { ClientPortal } from '@/components/ClientPortal';
 *
 * <ClientPortal email={userEmail} />
 */

import { useState, useEffect } from 'react';
import { clientHub } from '@/lib/client-hub';

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

interface ClientPortalProps {
  email: string;
  className?: string;
  showInvoices?: boolean;
  showSubscriptions?: boolean;
  showTickets?: boolean;
  onPayInvoice?: (invoiceId: string) => void;
}

export function ClientPortal({
  email,
  className = '',
  showInvoices = true,
  showSubscriptions = true,
  showTickets = true,
  onPayInvoice,
}: ClientPortalProps) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'invoices' | 'subscriptions' | 'tickets'>('invoices');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const portalData = await clientHub.getPortalData(email);
        setData(portalData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    if (email) {
      fetchData();
    }
  }, [email]);

  const handlePayInvoice = (invoiceId: string) => {
    if (onPayInvoice) {
      onPayInvoice(invoiceId);
    } else {
      window.location.href = clientHub.getPaymentUrl(invoiceId);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: currency || 'ILS',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('he-IL');
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PAID: 'bg-green-100 text-green-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
      OVERDUE: 'bg-red-100 text-red-800',
      CANCELLED: 'bg-gray-100 text-gray-800',
      ACTIVE: 'bg-green-100 text-green-800',
      INACTIVE: 'bg-gray-100 text-gray-800',
      OPEN: 'bg-blue-100 text-blue-800',
      IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
      RESOLVED: 'bg-green-100 text-green-800',
      CLOSED: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const translateStatus = (status: string) => {
    const translations: Record<string, string> = {
      PAID: 'שולם',
      PENDING: 'ממתין לתשלום',
      OVERDUE: 'באיחור',
      CANCELLED: 'בוטל',
      ACTIVE: 'פעיל',
      INACTIVE: 'לא פעיל',
      OPEN: 'פתוח',
      IN_PROGRESS: 'בטיפול',
      RESOLVED: 'נפתר',
      CLOSED: 'סגור',
      LOW: 'נמוכה',
      MEDIUM: 'בינונית',
      HIGH: 'גבוהה',
      URGENT: 'דחוף',
    };
    return translations[status] || status;
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="mr-3 text-gray-600">טוען...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`p-4 bg-gray-50 border border-gray-200 rounded-lg ${className}`}>
        <p className="text-gray-600">לא נמצאו נתונים</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow ${className}`} dir="rtl">
      {/* Header with summary */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          שלום, {data.client.name}
        </h2>
        <p className="text-gray-600">{data.client.email}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">סה"כ שולם</p>
            <p className="text-lg font-bold text-green-600">
              {formatCurrency(data.summary.totalPaid, 'ILS')}
            </p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">ממתין לתשלום</p>
            <p className="text-lg font-bold text-yellow-600">
              {formatCurrency(data.summary.pendingAmount, 'ILS')}
              {data.summary.pendingCount > 0 && (
                <span className="text-sm font-normal text-gray-500 mr-1">
                  ({data.summary.pendingCount})
                </span>
              )}
            </p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">מנויים פעילים</p>
            <p className="text-lg font-bold text-indigo-600">
              {data.summary.activeSubscriptions}
            </p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-500">פניות פתוחות</p>
            <p className="text-lg font-bold text-blue-600">
              {data.summary.openTickets}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          {showInvoices && (
            <button
              onClick={() => setActiveTab('invoices')}
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'invoices'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              חשבוניות ({data.invoices.length})
            </button>
          )}
          {showSubscriptions && (
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'subscriptions'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              מנויים ({data.subscriptions.length})
            </button>
          )}
          {showTickets && (
            <button
              onClick={() => setActiveTab('tickets')}
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'tickets'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              פניות ({data.tickets.length})
            </button>
          )}
        </nav>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {/* Invoices */}
        {activeTab === 'invoices' && showInvoices && (
          <div className="space-y-4">
            {data.invoices.length === 0 ? (
              <p className="text-gray-500 text-center py-8">אין חשבוניות</p>
            ) : (
              data.invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">
                        {invoice.invoiceNo}
                      </span>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${getStatusColor(
                          invoice.status
                        )}`}
                      >
                        {translateStatus(invoice.status)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      תאריך: {formatDate(invoice.createdAt)}
                      {invoice.dueDate && ` | לתשלום עד: ${formatDate(invoice.dueDate)}`}
                    </p>
                  </div>
                  <div className="text-left mr-4">
                    <p className="font-bold text-gray-900">
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </p>
                    {invoice.status === 'PENDING' && (
                      <button
                        onClick={() => handlePayInvoice(invoice.id)}
                        className="mt-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        שלם עכשיו
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Subscriptions */}
        {activeTab === 'subscriptions' && showSubscriptions && (
          <div className="space-y-4">
            {data.subscriptions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">אין מנויים</p>
            ) : (
              data.subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">{sub.planName}</span>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${getStatusColor(
                          sub.status
                        )}`}
                      >
                        {translateStatus(sub.status)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      חיוב הבא: {formatDate(sub.nextBilling)}
                    </p>
                  </div>
                  <div className="text-left mr-4">
                    <p className="font-bold text-gray-900">
                      {formatCurrency(sub.amount, sub.currency)} /{' '}
                      {sub.interval === 'MONTHLY' ? 'חודש' : 'שנה'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tickets */}
        {activeTab === 'tickets' && showTickets && (
          <div className="space-y-4">
            {data.tickets.length === 0 ? (
              <p className="text-gray-500 text-center py-8">אין פניות</p>
            ) : (
              data.tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">#{ticket.ticketNo}</span>
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${getStatusColor(
                            ticket.status
                          )}`}
                        >
                          {translateStatus(ticket.status)}
                        </span>
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${getStatusColor(
                            ticket.priority
                          )}`}
                        >
                          {translateStatus(ticket.priority)}
                        </span>
                      </div>
                      <p className="font-medium text-gray-900 mt-1">{ticket.subject}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {formatDate(ticket.createdAt)} | {ticket._count.messages} הודעות
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ClientPortal;
