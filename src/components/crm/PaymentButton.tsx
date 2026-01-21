'use client';

/**
 * Payment Button Component
 *
 * Copy this file to your project: components/PaymentButton.tsx
 *
 * Usage:
 * import { PaymentButton } from '@/components/PaymentButton';
 *
 * <PaymentButton invoiceId="inv_123" amount={100} currency="ILS" />
 */

import { useState } from 'react';
import { clientHub } from '@/lib/client-hub';

interface PaymentButtonProps {
  invoiceId: string;
  amount?: number;
  currency?: string;
  label?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  onBeforePayment?: () => Promise<boolean> | boolean;
  onError?: (error: Error) => void;
}

export function PaymentButton({
  invoiceId,
  amount,
  currency = 'ILS',
  label,
  className = '',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  onBeforePayment,
  onError,
}: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);

  const formatCurrency = (value: number, curr: string) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: curr,
    }).format(value);
  };

  const handleClick = async () => {
    try {
      setLoading(true);

      // Call beforePayment hook if provided
      if (onBeforePayment) {
        const shouldProceed = await onBeforePayment();
        if (!shouldProceed) {
          setLoading(false);
          return;
        }
      }

      // Redirect to payment URL
      window.location.href = clientHub.getPaymentUrl(invoiceId);
    } catch (error) {
      setLoading(false);
      if (onError && error instanceof Error) {
        onError(error);
      } else {
        console.error('Payment error:', error);
      }
    }
  };

  const variantClasses = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
    outline:
      'bg-transparent border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 focus:ring-indigo-500',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const buttonLabel =
    label || (amount ? `שלם ${formatCurrency(amount, currency)}` : 'שלם עכשיו');

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`
        inline-flex items-center justify-center font-medium rounded-lg
        transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      dir="rtl"
    >
      {loading ? (
        <>
          <svg
            className="animate-spin -mr-1 ml-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          מעבד...
        </>
      ) : (
        <>
          <svg
            className="h-5 w-5 ml-2"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
          {buttonLabel}
        </>
      )}
    </button>
  );
}

// Quick Pay Link - for email/SMS links
export function getPaymentLink(invoiceId: string): string {
  return clientHub.getPaymentUrl(invoiceId);
}

export default PaymentButton;
