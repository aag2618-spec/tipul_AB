import { format } from "date-fns";
import { he } from "date-fns/locale";

interface PaymentReceiptEmailProps {
  clientName: string;
  therapistName: string;
  payment: {
    amount: number;
    expectedAmount: number;
    method: string;
    paidAt: Date;
    session?: {
      startTime: Date;
      type: string;
    };
    receiptUrl?: string;
    receiptNumber?: string;
  };
  clientBalance: {
    remainingDebt: number;
    credit: number;
  };
  customization?: {
    paymentInstructions?: string | null;
    paymentLink?: string | null;
    emailSignature?: string | null;
    customGreeting?: string | null;
    customClosing?: string | null;
    businessHours?: string | null;
  };
}

export function createPaymentReceiptEmail({
  clientName,
  therapistName,
  payment,
  clientBalance,
  customization,
}: PaymentReceiptEmailProps) {
  // Use custom greeting or default
  const greeting = customization?.customGreeting
    ? customization.customGreeting.replace(/{שם}/g, clientName)
    : `שלום ${clientName}`;

  // Use custom closing or default
  const closing = customization?.customClosing || "בברכה";

  // Use custom signature or default
  const signature = customization?.emailSignature || therapistName;
  const paymentDate = format(new Date(payment.paidAt), "d בMMMM yyyy • HH:mm", {
    locale: he,
  });

  const methodLabel =
    payment.method === "CASH"
      ? "מזומן"
      : payment.method === "CREDIT_CARD"
      ? "אשראי"
      : payment.method === "BANK_TRANSFER"
      ? "העברה בנקאית"
      : payment.method === "CHECK"
      ? "צ'ק"
      : "אחר";

  const isPartial = payment.amount < payment.expectedAmount;
  const remaining = payment.expectedAmount - payment.amount;

  let sessionHtml = "";
  if (payment.session) {
    const sessionDate = format(
      new Date(payment.session.startTime),
      "EEEE, d בMMMM yyyy • HH:mm",
      { locale: he }
    );

    const typeLabel =
      payment.session.type === "ONLINE"
        ? "אונליין"
        : payment.session.type === "PHONE"
        ? "טלפון"
        : "פרונטלי";

    sessionHtml = `
      <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">פרטי הפגישה</p>
        <p style="margin: 8px 0 0 0; color: #111827; font-size: 15px; font-weight: 500;">${sessionDate}</p>
        <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">סוג: ${typeLabel}</p>
      </div>
    `;
  }

  return {
    subject: `קבלה על תשלום - ₪${payment.amount}`,
    html: `
      <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; background: #f9fafb;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 10px;">✓</div>
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700;">תשלום התקבל בהצלחה</h1>
        </div>
        
        <!-- Content -->
        <div style="background: #ffffff; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #111827; margin-top: 0; font-size: 20px;">${greeting},</h2>
          
          <p style="color: #4b5563; line-height: 1.6; font-size: 15px;">
            תודה על התשלום! להלן פרטי הקבלה:
          </p>

          <!-- Payment Amount -->
          <div style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border: 2px solid #10b981; border-radius: 10px; padding: 20px; margin: 25px 0; text-align: center;">
            <p style="margin: 0; color: #065f46; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">סכום ששולם</p>
            <p style="margin: 8px 0 0 0; color: #047857; font-size: 36px; font-weight: 800;">₪${payment.amount}</p>
          </div>

          <!-- Payment Details -->
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">תאריך תשלום:</span>
              <span style="color: #111827; font-size: 14px; font-weight: 600;">${paymentDate}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">אמצעי תשלום:</span>
              <span style="color: #111827; font-size: 14px; font-weight: 600;">${methodLabel}</span>
            </div>
            ${
              isPartial
                ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #6b7280; font-size: 14px;">סכום מלא:</span>
              <span style="color: #111827; font-size: 14px; font-weight: 600;">₪${payment.expectedAmount}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #6b7280; font-size: 14px;">נותר לתשלום:</span>
              <span style="color: #dc2626; font-size: 14px; font-weight: 700;">₪${remaining}</span>
            </div>
            `
                : ""
            }
          </div>

          ${sessionHtml}

          ${
            isPartial
              ? `
          <!-- Partial Payment Notice -->
          <div style="background: #fef3c7; border-right: 4px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
              <strong>💡 שים לב:</strong> זהו תשלום חלקי. נותרו ₪${remaining} לתשלום עבור פגישה זו.
            </p>
          </div>
          `
              : ""
          }

          <!-- Account Balance -->
          ${
            clientBalance.remainingDebt > 0 || clientBalance.credit > 0
              ? `
          <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 12px 0; color: #075985; font-weight: 600; font-size: 15px;">💼 מצב חשבון</p>
            ${
              clientBalance.remainingDebt > 0
                ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #0369a1; font-size: 14px;">יתרת חוב:</span>
              <span style="color: #dc2626; font-size: 14px; font-weight: 700;">₪${clientBalance.remainingDebt}</span>
            </div>
            `
                : ""
            }
            ${
              clientBalance.credit > 0
                ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #0369a1; font-size: 14px;">קרדיט זמין:</span>
              <span style="color: #10b981; font-size: 14px; font-weight: 700;">₪${clientBalance.credit}</span>
            </div>
            `
                : ""
            }
          </div>
          `
              : `
          <div style="background: #d1fae5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; color: #065f46; font-size: 15px; font-weight: 600;">
              🎉 אין יתרת חוב! החשבון מאוזן.
            </p>
          </div>
          `
          }

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
              קבלה זו נשלחה אוטומטית. במידה ויש שאלות או בעיות, אנא פנה אליי ישירות.
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
