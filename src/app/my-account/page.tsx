'use client';

import { useState } from 'react';
import { ClientPortal } from '@/components/crm';
import { ContactForm } from '@/components/crm';

export default function MyAccountPage() {
  const [email, setEmail] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setIsLoggedIn(true);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-center mb-6">כניסה לאזור האישי</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                אימייל
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="your@email.com"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700"
            >
              כניסה
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">האזור האישי שלי</h1>
          <button
            onClick={() => setIsLoggedIn(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            התנתק
          </button>
        </div>

        <ClientPortal email={email} />

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">פתח פנייה חדשה</h2>
          <ContactForm
            title=""
            showCategory
            categories={['תיאום טיפול', 'שאלה על טיפול', 'חיוב', 'אחר']}
            onSuccess={(ticketNo) => {
              alert('הפנייה נפתחה בהצלחה! מספר: ' + ticketNo);
            }}
          />
        </div>
      </div>
    </div>
  );
}
