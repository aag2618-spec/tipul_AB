// Email templates for cancellation requests and session communications

export interface EmailTemplateData {
  clientName: string;
  therapistName: string;
  date: string;
  time: string;
  reason?: string;
  rejectionReason?: string;
  dashboardLink?: string;
  address?: string;
}

function formatEmailDate(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatEmailTime(date: Date): string {
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSessionDateTime(date: Date): { date: string; time: string } {
  return {
    date: formatEmailDate(date),
    time: formatEmailTime(date),
  };
}

// Base email template wrapper
function wrapInEmailTemplate(content: string): string {
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
      ${content}
    </div>
  `;
}

// ==================== Session Confirmation ====================
export function createSessionConfirmationEmail(data: EmailTemplateData) {
  return {
    subject: `אישור תור - ${data.therapistName}`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">שלום ${data.clientName},</h2>
      <p>תורך אושר בהצלחה!</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 8px 0;"><strong>📅 תאריך:</strong> ${data.date}</p>
        <p style="margin: 8px 0;"><strong>🕐 שעה:</strong> ${data.time}</p>
        <p style="margin: 8px 0;"><strong>👤 מטפל/ת:</strong> ${data.therapistName}</p>
        ${data.address ? `<p style="margin: 8px 0;"><strong>📍 כתובת:</strong> ${data.address}</p>` : ''}
      </div>
      <p>לביטול או שינוי תור, נא ליצור קשר לפחות 24 שעות מראש.</p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        בברכה,<br/>
        ${data.therapistName}
      </p>
    `),
  };
}

// ==================== 24 Hour Reminder ====================
export function create24HourReminderEmail(data: EmailTemplateData) {
  return {
    subject: `תזכורת: תור מחר ב-${data.time}`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">שלום ${data.clientName},</h2>
      <p>מזכירים לך שיש לך תור מחר:</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 8px 0;"><strong>📅 מחר,</strong> ${data.date}</p>
        <p style="margin: 8px 0;"><strong>🕐 שעה:</strong> ${data.time}</p>
      </div>
      <p>נשמח לראותך!</p>
      <p>לביטול, נא ליצור קשר בהקדם.</p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        בברכה,<br/>
        ${data.therapistName}
      </p>
    `),
  };
}

// ==================== 2 Hour Reminder ====================
export function create2HourReminderEmail(data: EmailTemplateData) {
  return {
    subject: `תזכורת: תור בעוד שעתיים`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">שלום ${data.clientName},</h2>
      <p>תור בעוד שעתיים!</p>
      <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 8px 0;"><strong>🕐 היום בשעה:</strong> ${data.time}</p>
        ${data.address ? `<p style="margin: 8px 0;"><strong>📍 כתובת:</strong> ${data.address}</p>` : ''}
      </div>
      <p>נתראה בקרוב!</p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        בברכה,<br/>
        ${data.therapistName}
      </p>
    `),
  };
}

// ==================== Cancellation Request - To Client ====================
export function createCancellationRequestToClientEmail(data: EmailTemplateData) {
  return {
    subject: `בקשת ביטול התקבלה`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">שלום ${data.clientName},</h2>
      <p>בקשתך לביטול התור התקבלה.</p>
      <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #ff9800;">
        <p style="margin: 8px 0;"><strong>📅 תור:</strong> ${data.date} בשעה ${data.time}</p>
      </div>
      <p>המטפל/ת יבדוק את הבקשה ויעדכן אותך בהקדם.</p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        בברכה,<br/>
        ${data.therapistName}
      </p>
    `),
  };
}

// ==================== Cancellation Request - To Therapist ====================
export function createCancellationRequestToTherapistEmail(data: EmailTemplateData) {
  return {
    subject: `🔔 בקשת ביטול חדשה - ${data.clientName}`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">יש לך בקשת ביטול חדשה ממתינה לאישור</h2>
      <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #ff9800;">
        <p style="margin: 8px 0;"><strong>👤 מטופל/ת:</strong> ${data.clientName}</p>
        <p style="margin: 8px 0;"><strong>📅 תור:</strong> ${data.date} בשעה ${data.time}</p>
        ${data.reason ? `<p style="margin: 8px 0;"><strong>💬 סיבה:</strong> ${data.reason}</p>` : ''}
      </div>
      <p>היכנס/י למערכת לאישור או דחייה.</p>
      ${data.dashboardLink ? `
        <p style="margin-top: 20px;">
          <a href="${data.dashboardLink}" style="display: inline-block; background: #2196f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            צפייה בבקשה
          </a>
        </p>
      ` : ''}
    `),
  };
}

// ==================== Cancellation Approved ====================
export function createCancellationApprovedEmail(data: EmailTemplateData) {
  return {
    subject: `ביטול התור אושר`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">שלום ${data.clientName},</h2>
      <p>ביטול התור אושר.</p>
      <div style="background: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #f44336;">
        <p style="margin: 8px 0;"><strong>❌ תור מבוטל:</strong> ${data.date} בשעה ${data.time}</p>
      </div>
      <p>לקביעת תור חדש, ניתן ליצור קשר או להיכנס למערכת.</p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        בברכה,<br/>
        ${data.therapistName}
      </p>
    `),
  };
}

// ==================== Cancellation Rejected ====================
export function createCancellationRejectedEmail(data: EmailTemplateData) {
  return {
    subject: `בקשת ביטול נדחתה`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">שלום ${data.clientName},</h2>
      <p>בקשתך לביטול התור נדחתה.</p>
      <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #4caf50;">
        <p style="margin: 8px 0;"><strong>📅 התור נשאר על כנו:</strong> ${data.date} בשעה ${data.time}</p>
      </div>
      ${data.rejectionReason ? `
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>💬 סיבה:</strong> ${data.rejectionReason}</p>
        </div>
      ` : ''}
      <p>לשאלות נוספות, ניתן ליצור קשר.</p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        בברכה,<br/>
        ${data.therapistName}
      </p>
    `),
  };
}
