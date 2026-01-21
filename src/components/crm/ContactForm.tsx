'use client';

/**
 * Contact Form Component
 *
 * Copy this file to your project: components/ContactForm.tsx
 *
 * Usage:
 * import { ContactForm } from '@/components/ContactForm';
 *
 * <ContactForm
 *   onSuccess={(ticketNo) => console.log('Ticket created:', ticketNo)}
 * />
 */

import { useState, FormEvent } from 'react';
import { clientHub } from '@/lib/client-hub';

interface ContactFormProps {
  className?: string;
  title?: string;
  description?: string;
  submitLabel?: string;
  showPriority?: boolean;
  showCategory?: boolean;
  categories?: string[];
  defaultCategory?: string;
  onSuccess?: (ticketNo: string, ticketId: string) => void;
  onError?: (error: Error) => void;
}

export function ContactForm({
  className = '',
  title = 'צור קשר',
  description = 'נשמח לעזור לך! מלא את הטופס ונחזור אליך בהקדם.',
  submitLabel = 'שלח',
  showPriority = false,
  showCategory = false,
  categories = ['כללי', 'תמיכה טכנית', 'חיוב', 'אחר'],
  defaultCategory,
  onSuccess,
  onError,
}: ContactFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    priority: 'MEDIUM' as const,
    category: defaultCategory || categories[0] || '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketNo, setTicketNo] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // First register/update client
      if (formData.name && formData.email) {
        await clientHub.registerClient({
          name: formData.name,
          email: formData.email,
          phone: formData.phone || undefined,
        });
      }

      // Create ticket
      const result = await clientHub.createTicket({
        email: formData.email,
        subject: formData.subject,
        message: formData.message,
        priority: formData.priority,
        category: showCategory ? formData.category : undefined,
      });

      setTicketNo(result.ticketNo);
      setSuccess(true);

      if (onSuccess) {
        onSuccess(result.ticketNo, result.ticketId);
      }

      // Reset form
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: '',
        message: '',
        priority: 'MEDIUM',
        category: defaultCategory || categories[0] || '',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'שגיאה בשליחת הטופס';
      setError(errorMessage);
      if (onError && err instanceof Error) {
        onError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (success) {
    return (
      <div className={`p-8 bg-green-50 rounded-lg text-center ${className}`} dir="rtl">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-green-800 mb-2">הפנייה נשלחה בהצלחה!</h3>
        <p className="text-green-700 mb-4">
          מספר הפנייה שלך: <span className="font-bold">{ticketNo}</span>
        </p>
        <p className="text-green-600 text-sm">נחזור אליך בהקדם האפשרי</p>
        <button
          onClick={() => setSuccess(false)}
          className="mt-6 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          שלח פנייה נוספת
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-lg p-6 ${className}`} dir="rtl">
      {title && <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>}
      {description && <p className="text-gray-600 mb-6">{description}</p>}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              שם מלא *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="הכנס את שמך"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              אימייל *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="example@email.com"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              טלפון
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="050-1234567"
            />
          </div>

          {showCategory && (
            <div>
              <label
                htmlFor="category"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                קטגוריה
              </label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
            נושא *
          </label>
          <input
            type="text"
            id="subject"
            name="subject"
            required
            value={formData.subject}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="מה הנושא?"
          />
        </div>

        {showPriority && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">דחיפות</label>
            <div className="flex gap-4">
              {[
                { value: 'LOW', label: 'נמוכה' },
                { value: 'MEDIUM', label: 'בינונית' },
                { value: 'HIGH', label: 'גבוהה' },
                { value: 'URGENT', label: 'דחוף' },
              ].map((option) => (
                <label key={option.value} className="flex items-center">
                  <input
                    type="radio"
                    name="priority"
                    value={option.value}
                    checked={formData.priority === option.value}
                    onChange={handleChange}
                    className="ml-2 text-indigo-600 focus:ring-indigo-500"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
            הודעה *
          </label>
          <textarea
            id="message"
            name="message"
            required
            rows={5}
            value={formData.message}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            placeholder="תאר את הפנייה שלך..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-6 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg
                className="animate-spin -mr-1 ml-2 h-5 w-5"
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
              שולח...
            </span>
          ) : (
            submitLabel
          )}
        </button>
      </form>
    </div>
  );
}

export default ContactForm;
