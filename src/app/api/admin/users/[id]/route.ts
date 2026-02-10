import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendEmail } from "@/lib/resend";
import { PLAN_NAMES } from "@/lib/pricing";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if admin
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (adminUser?.role !== 'ADMIN') {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, email, password, phone, role, aiTier } = body;

    // Build update data
    const updateData: any = {
      name,
      email,
      phone,
      role,
    };

    // Add aiTier if provided
    if (aiTier !== undefined) {
      updateData.aiTier = aiTier;
    }

    // Only update password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      message: "User updated successfully",
      user: { ...updatedUser, password: undefined }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if admin
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (adminUser?.role !== 'ADMIN') {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Prevent deleting self
    if (id === session.user.id) {
      return NextResponse.json(
        { message: "אי אפשר למחוק את עצמך" },
        { status: 400 }
      );
    }

    // Delete user
    await prisma.user.delete({
      where: { id }
    });

    return NextResponse.json({
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if admin
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (adminUser?.role !== 'ADMIN') {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { 
      isBlocked, aiTier, subscriptionStatus, subscriptionEndsAt, extendDays,
      grantFree, revokeFree, freeNote 
    } = body;

    const updateData: any = {};
    if (isBlocked !== undefined) updateData.isBlocked = isBlocked;
    if (aiTier !== undefined) updateData.aiTier = aiTier;
    if (subscriptionStatus !== undefined) updateData.subscriptionStatus = subscriptionStatus;
    
    // ========================================
    // מנוי חינם - הענקה
    // ========================================
    if (grantFree) {
      updateData.isFreeSubscription = true;
      updateData.freeSubscriptionNote = freeNote || null;
      updateData.freeSubscriptionGrantedAt = new Date();
      updateData.subscriptionStatus = "ACTIVE";
      updateData.subscriptionStartedAt = new Date();
    }
    
    // ========================================
    // מנוי חינם - ביטול (מעבר לתשלום)
    // ========================================
    if (revokeFree) {
      updateData.isFreeSubscription = false;
      updateData.freeSubscriptionNote = null;
      updateData.subscriptionStatus = "CANCELLED";
      // נותנים 7 ימים לשלם (תקופת חסד) - לא משאירים את כל התקופה החינמית!
      updateData.subscriptionEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
    
    // הארכת מנוי בימים
    if (extendDays && typeof extendDays === "number" && extendDays > 0) {
      const currentUser = await prisma.user.findUnique({
        where: { id },
        select: { subscriptionEndsAt: true },
      });
      const baseDate = currentUser?.subscriptionEndsAt && new Date(currentUser.subscriptionEndsAt) > new Date()
        ? new Date(currentUser.subscriptionEndsAt)
        : new Date();
      updateData.subscriptionEndsAt = new Date(baseDate.getTime() + extendDays * 24 * 60 * 60 * 1000);
    }
    
    // תאריך תפוגה ספציפי
    if (subscriptionEndsAt !== undefined) {
      updateData.subscriptionEndsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    const SYSTEM_URL = process.env.NEXTAUTH_URL || "";

    // ========================================
    // מייל כשנותנים מנוי חינם
    // ========================================
    if (grantFree && updatedUser.email) {
      const tierName = PLAN_NAMES[updatedUser.aiTier] || updatedUser.aiTier;
      await sendEmail({
        to: updatedUser.email,
        subject: `מנוי ${tierName} הופעל עבורך!`,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0;">🎉 המנוי שלך הופעל!</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <h2 style="color: #333; margin-top: 0;">שלום ${updatedUser.name || ""},</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                קיבלת גישה למסלול <strong>${tierName}</strong> ללא חיוב.
              </p>
              <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #166534;">✅ המנוי פעיל - תהנה מכל היכולות!</p>
              </div>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${SYSTEM_URL}/dashboard" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  כניסה למערכת
                </a>
              </div>
            </div>
          </div>
        `,
      }).catch(err => console.error("Grant free email failed:", err));
    }

    // ========================================
    // מייל כשמבטלים מנוי חינם (עם קישור לתשלום)
    // ========================================
    if (revokeFree && updatedUser.email) {
      const tierName = PLAN_NAMES[updatedUser.aiTier] || updatedUser.aiTier;
      const billingUrl = `${SYSTEM_URL}/dashboard/settings/billing`;
      await sendEmail({
        to: updatedUser.email,
        subject: "המנוי החינמי שלך הסתיים - המשך עם מנוי בתשלום",
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px; background: #f59e0b; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0;">תקופת המנוי החינמי הסתיימה</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <h2 style="color: #333; margin-top: 0;">שלום ${updatedUser.name || ""},</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                תקופת המנוי החינמי שלך במסלול <strong>${tierName}</strong> הסתיימה.
              </p>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                כדי להמשיך להשתמש בכל היכולות, בחר מסלול מנוי מתאים:
              </p>
              <div style="background: #eff6ff; border: 1px solid #93c5fd; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px; color: #1e40af; font-weight: bold;">מה כלול?</p>
                <p style="margin: 0; color: #1e40af;">✅ ניהול מטופלים ויומן</p>
                <p style="margin: 0; color: #1e40af;">✅ תשלומים וקבלות</p>
                <p style="margin: 0; color: #1e40af;">✅ AI עוזר חכם</p>
                <p style="margin: 0; color: #1e40af;">✅ כל הנתונים שלך שמורים!</p>
              </div>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${billingUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                  בחר מסלול והמשך ▸
                </a>
              </div>
              <p style="color: #999; font-size: 13px; text-align: center;">
                הנתונים שלך שמורים ומאובטחים. תוכל לגשת אליהם מחדש מיד אחרי הרכישה.
              </p>
            </div>
          </div>
        `,
      }).catch(err => console.error("Revoke free email failed:", err));
    }

    return NextResponse.json({
      message: "עודכן בהצלחה",
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
