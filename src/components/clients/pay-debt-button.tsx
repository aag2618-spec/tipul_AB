"use client";

// קומפוננטת wrapper פשוטה ל-PayClientDebts. במקור עטפנו אותה ב-Dialog
// חיצוני, אבל זה גרם להתנגשות עם ChargeCardcomDialog (שני dialogs פתוחים
// בו-זמנית — z-index לא ברור). PayClientDebts כבר מנהל את ה-Dialog שלו
// (ואת המעבר ל-ChargeCardcomDialog בעת אשראי), כך שאין צורך בעטיפה.

import { PayClientDebts } from "@/components/payments/pay-client-debts";

interface PayDebtButtonProps {
  clientId: string;
  clientName: string;
  totalDebt: number;
  creditBalance: number;
  unpaidPayments: Array<{
    paymentId: string;
    amount: number;
  }>;
}

export function PayDebtButton({
  clientId,
  clientName,
  totalDebt,
  creditBalance,
  unpaidPayments,
}: PayDebtButtonProps) {
  return (
    <PayClientDebts
      clientId={clientId}
      clientName={clientName}
      totalDebt={totalDebt}
      creditBalance={creditBalance}
      unpaidPayments={unpaidPayments}
    />
  );
}
