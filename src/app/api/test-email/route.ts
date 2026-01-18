import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/resend';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const result = await sendEmail({
      to: email,
      subject: '🎉 בדיקת מייל - המערכת עובדת!',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #10b981;">✅ המייל הגיע בהצלחה!</h1>
          <p style="font-size: 16px; color: #374151;">
            אם אתה רואה את ההודעה הזו, מערכת המיילים עובדת כמו שצריך.
          </p>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="font-size: 14px; color: #6b7280;">
            נשלח מ-Tipul App באמצעות Resend
          </p>
        </div>
      `,
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Email sent successfully',
      result 
    });
  } catch (error) {
    console.error('Test email error:', error);
    return NextResponse.json(
      { error: 'Failed to send email', details: String(error) },
      { status: 500 }
    );
  }
}
