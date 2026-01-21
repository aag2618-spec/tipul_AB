import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "נא להזין כתובת אימייל" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({
        message: "אם האימייל קיים במערכת, נשלח אליך קישור לאיפוס סיסמה",
      });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing reset tokens for this user
    await prisma.passwordReset.deleteMany({
      where: { userId: user.id },
    });

    // Create new reset token
    await prisma.passwordReset.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Send email
    const baseUrl = process.env.NEXTAUTH_URL || "https://tipul-mh2t.onrender.com";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    await resend.emails.send({
      from: process.env.EMAIL_FROM || "tipul@resend.dev",
      to: user.email!,
      subject: "איפוס סיסמה - טיפול",
      html: `
        <!DOCTYPE html>
        <html dir="rtl" lang="he">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px; direction: rtl;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h1 style="color: #1e293b; text-align: center; margin-bottom: 30px;">🔐 איפוס סיסמה</h1>
            
            <p style="color: #475569; font-size: 16px; line-height: 1.6;">
              שלום ${user.name || ""},
            </p>
            
            <p style="color: #475569; font-size: 16px; line-height: 1.6;">
              קיבלנו בקשה לאיפוס הסיסמה שלך במערכת טיפול.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background-color: #f59e0b; color: white; padding: 15px 40px; 
                        text-decoration: none; border-radius: 8px; font-size: 18px;
                        display: inline-block; font-weight: bold;">
                לחץ כאן לאיפוס הסיסמה
              </a>
            </div>
            
            <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
              הקישור תקף לשעה אחת בלבד.
            </p>
            
            <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
              אם לא ביקשת לאפס את הסיסמה, התעלם מאימייל זה.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
            
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">
              אימייל זה נשלח ממערכת ניהול הקליניקה - טיפול
            </p>
          </div>
        </body>
        </html>
      `,
    });

    return NextResponse.json({
      message: "אם האימייל קיים במערכת, נשלח אליך קישור לאיפוס סיסמה",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "שגיאה בשליחת האימייל" },
      { status: 500 }
    );
  }
}
