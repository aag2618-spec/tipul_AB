import { format } from "date-fns";
import { he } from "date-fns/locale";

interface PaymentHistoryItem {
  id: string;
  amount: number;
  expectedAmount: number;
  method: string;
  paidAt: Date;
  session?: {
    startTime: Date;
    type: string;
  };
}

interface PaymentHistoryEmailProps {
  clientName: string;
  therapistName: string;
  payments: PaymentHistoryItem[];
  dateRange: {
    from: Date;
    to: Date;
  };
  totalPaid: number;
  customization?: {
    paymentInstructions?: string | null;
    paymentLink?: string | null;
    emailSignature?: string | null;
    customGreeting?: string | null;
    customClosing?: string | null;
    businessHours?: string | null;
    logoUrl?: string | null;
  };
}

export function createPaymentHistoryEmail({
  clientName,
  therapistName,
  payments,
  dateRange,
  totalPaid,
  customization,
}: PaymentHistoryEmailProps) {
  // Use custom greeting or default
  const greeting = customization?.customGreeting
    ? customization.customGreeting.replace(/{שם}/g, clientName)
    : `שלום ${clientName}`;

  // Use custom closing or default
  const closing = customization?.customClosing || "בברכה";

  // Use custom signature or default
  const signature = customization?.emailSignature || therapistName;

  const fromDate = format(dateRange.from, "d בMMMM yyyy", { locale: he });
  const toDate = format(dateRange.to, "d בMMMM yyyy", { locale: he });

  // Generate payment rows
  const paymentRows = payments
    .map((payment) => {
      const paymentDate = format(new Date(payment.paidAt), "dd/MM/yyyy", {
        locale: he,
      });

      const methodLabel =
        payment.method === "CASH"
          ? "מזומן"
          : payment.method === "CREDIT_CARD"
          ? "כרטיס אשראי"
          : payment.method === "BANK_TRANSFER"
          ? "העברה בנקאית"
          : payment.method === "CHECK"
          ? "צ'ק"
          : payment.method === "CREDIT"
          ? "קרדיט"
          : "אחר";

      const isPartial = payment.amount < payment.expectedAmount;
      const statusLabel = isPartial ? "חלקי" : "מלא";
      const statusColor = isPartial ? "#f59e0b" : "#10b981";

      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 8px; color: #374151; font-size: 14px; text-align: center;">${paymentDate}</td>
          <td style="padding: 12px 8px; color: #374151; font-size: 14px; text-align: center; font-weight: 600;">₪${payment.amount}</td>
          <td style="padding: 12px 8px; color: #6b7280; font-size: 13px; text-align: center;">${methodLabel}</td>
          <td style="padding: 12px 8px; text-align: center;">
            <span style="background: ${statusColor}20; color: ${statusColor}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">
              ${statusLabel}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");

  return {
    subject: `סיכום תשלומים - ${fromDate} עד ${toDate}`,
    html: `
      <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background: #f9fafb;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px 20px; border-radius: 12px 12px 0 0; text-align: center;">
          ${
            customization?.logoUrl
              ? `<img src="${customization.logoUrl}" alt="Logo" style="max-width: 120px; max-height: 60px; margin-bottom: 15px;" />`
              : ""
          }
          <div style="font-size: 48px; margin-bottom: 10px;">📊</div>
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700;">סיכום תשלומים</h1>
          <p style="color: #dbeafe; margin: 8px 0 0 0; font-size: 15px;">${fromDate} - ${toDate}</p>
        </div>
        
        <!-- Content -->
        <div style="background: #ffffff; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #111827; margin-top: 0; font-size: 20px;">${greeting},</h2>
          
          <p style="color: #4b5563; line-height: 1.6; font-size: 15px;">
            להלן סיכום התשלומים שביצעת בתקופה שנבחרה:
          </p>

          <!-- Total Paid -->
          <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border: 2px solid #3b82f6; border-radius: 10px; padding: 20px; margin: 25px 0; text-align: center;">
            <p style="margin: 0; color: #1e40af; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">סה"כ שולם</p>
            <p style="margin: 8px 0 0 0; color: #1d4ed8; font-size: 36px; font-weight: 800;">₪${totalPaid}</p>
            <p style="margin: 4px 0 0 0; color: #3b82f6; font-size: 13px;">${payments.length} תשלומים</p>
          </div>

          <!-- Payments Table -->
          <div style="overflow-x: auto; margin: 25px 0;">
            <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="padding: 12px 8px; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; border-bottom: 2px solid #e5e7eb;">תאריך</th>
                  <th style="padding: 12px 8px; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; border-bottom: 2px solid #e5e7eb;">סכום</th>
                  <th style="padding: 12px 8px; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; border-bottom: 2px solid #e5e7eb;">אמצעי תשלום</th>
                  <th style="padding: 12px 8px; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; border-bottom: 2px solid #e5e7eb;">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                ${paymentRows}
              </tbody>
            </table>
          </div>

          ${
            customization?.paymentLink
              ? `
          <!-- Payment Link -->
          <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 12px 0; color: #075985; font-weight: 600; font-size: 15px;">💳 תשלום מהיר</p>
            <a href="${customization.paymentLink}" style="display: inline-block; background: #0ea5e9; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
              שלם עכשיו בקליק
            </a>
          </div>
          `
              : ""
          }

          ${
            customization?.paymentInstructions
              ? `
          <!-- Payment Instructions -->
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; color: #166534; font-weight: 600; font-size: 15px;">💳 אפשרויות תשלום</p>
            <p style="margin: 0; color: #15803d; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${customization.paymentInstructions}</p>
          </div>
          `
              : ""
          }

          ${
            customization?.businessHours
              ? `
          <!-- Business Hours -->
          <div style="background: #fef3c7; border-right: 4px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 4px 0; color: #92400e; font-weight: 600; font-size: 13px;">⏰ שעות פעילות</p>
            <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5; white-space: pre-wrap;">${customization.businessHours}</p>
          </div>
          `
              : ""
          }

          <!-- Footer -->
          <div style="margin-top: 35px; padding-top: 25px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0;">
              סיכום זה נשלח לבקשתך. במידה ויש שאלות או אי התאמות, אנא פנה אליי ישירות.
            </p>
            <p style="color: #374151; font-size: 15px; margin: 20px 0 0 0; white-space: pre-wrap;">
              ${closing},<br/>
              <strong>${signature}</strong>
            </p>
          </div>
        </div>
        
        <!-- Footer Note -->
        <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">מייל זה נשלח אוטומטית ממערכת הניהול שלנו</p>
        </div>
      </div>
    `,
  };
}
