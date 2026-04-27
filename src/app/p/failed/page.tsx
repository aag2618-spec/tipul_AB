// src/app/p/failed/page.tsx
// Public landing after a failed Cardcom payment. NO auth.
// SECURITY: we do NOT echo Cardcom's errorMessage here — Cardcom sometimes
// returns sensitive details ("card flagged as stolen", "credit limit exceeded")
// that should not appear in a URL-accessible page. Customers already saw the
// reason on Cardcom's own page; we only confirm the cancellation.

export const dynamic = "force-dynamic";

export default function PaymentFailedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
      <div className="max-w-md w-full bg-white shadow rounded-lg p-8 text-center">
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-2xl font-bold mb-2">התשלום לא הושלם</h1>
        <p className="text-gray-600">לא נחייב את הכרטיס שלך.</p>
        <p className="mt-6 text-sm text-gray-500">
          לפרטים נוספים פנה למטפל שלך לקבלת קישור חדש.
        </p>
      </div>
    </div>
  );
}
