import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AdminAlertType, AlertPriority, Prisma } from "@prisma/client";

// API Route for generating automatic admin alerts
// This can be called by a cron job (e.g., daily at 8:00 AM)

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret (for security)
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const now = new Date();
    const alerts: Prisma.AdminAlertCreateManyInput[] = [];

    // 1. Check for overdue payments
    const overduePayments = await prisma.subscriptionPayment.findMany({
      where: {
        status: "PENDING",
        createdAt: {
          lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // More than 7 days old
        },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    for (const payment of overduePayments) {
      // Check if alert already exists
      const existingAlert = await prisma.adminAlert.findFirst({
        where: {
          type: "PAYMENT_OVERDUE",
          userId: payment.userId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
      });

      if (!existingAlert) {
        alerts.push({
          type: AdminAlertType.PAYMENT_OVERDUE,
          priority: AlertPriority.HIGH,
          title: `תשלום באיחור - ${payment.user.name || payment.user.email}`,
          message: `תשלום בסכום ₪${payment.amount} ממתין יותר מ-7 ימים.`,
          userId: payment.userId,
          actionRequired: "לשלוח תזכורת תשלום או ליצור קשר עם המשתמש",
          metadata: {
            paymentId: payment.id,
            amount: Number(payment.amount),
            daysOverdue: Math.floor((now.getTime() - payment.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
          },
        });
      }
    }

    // 2. Check for expiring subscriptions (within 7 days)
    // כולל גם מנויים שביטלו אבל עדיין בתקופה ששילמו
    const expiringUsers = await prisma.user.findMany({
      where: {
        subscriptionEndsAt: {
          gte: now,
          lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
        subscriptionStatus: { in: ["ACTIVE", "CANCELLED"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        aiTier: true,
        subscriptionEndsAt: true,
      },
    });

    for (const user of expiringUsers) {
      const existingAlert = await prisma.adminAlert.findFirst({
        where: {
          type: "SUBSCRIPTION_EXPIRING",
          userId: user.id,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
      });

      if (!existingAlert) {
        const daysLeft = Math.ceil(
          (user.subscriptionEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );
        
        alerts.push({
          type: AdminAlertType.SUBSCRIPTION_EXPIRING,
          priority: daysLeft <= 3 ? AlertPriority.HIGH : AlertPriority.MEDIUM,
          title: `מנוי עומד לפוג - ${user.name || user.email}`,
          message: `למשתמש נותרו ${daysLeft} ימים עד לפקיעת המנוי (${user.aiTier}).`,
          userId: user.id,
          actionRequired: "לשלוח תזכורת חידוש מנוי",
          metadata: {
            tier: user.aiTier,
            daysLeft,
            expiresAt: user.subscriptionEndsAt?.toISOString(),
          },
        });
      }
    }

    // 3. Check for expired subscriptions
    // כולל גם מנויים שביטלו ועכשיו התקופה שלהם נגמרה
    const expiredUsers = await prisma.user.findMany({
      where: {
        subscriptionEndsAt: {
          lt: now,
        },
        subscriptionStatus: { in: ["ACTIVE", "CANCELLED"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        aiTier: true,
        subscriptionEndsAt: true,
      },
    });

    for (const user of expiredUsers) {
      const existingAlert = await prisma.adminAlert.findFirst({
        where: {
          type: "SUBSCRIPTION_EXPIRED",
          userId: user.id,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
      });

      if (!existingAlert) {
        alerts.push({
          type: AdminAlertType.SUBSCRIPTION_EXPIRED,
          priority: AlertPriority.URGENT,
          title: `מנוי פג תוקף - ${user.name || user.email}`,
          message: `המנוי של המשתמש פג ב-${user.subscriptionEndsAt?.toLocaleDateString("he-IL")}. יש לטפל מיידית.`,
          userId: user.id,
          actionRequired: "ליצור קשר עם המשתמש לחידוש או לשנות סטטוס",
          metadata: {
            tier: user.aiTier,
            expiredAt: user.subscriptionEndsAt?.toISOString(),
          },
        });
      }
    }

    // 4. Check for high AI usage (over 80% of limit)
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const highUsageUsers = await prisma.monthlyUsage.findMany({
      where: {
        month: currentMonth,
        year: currentYear,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, aiTier: true },
        },
      },
    });

    // Check against tier limits
    const tierLimits = await prisma.tierLimits.findMany();
    const limitsMap = Object.fromEntries(tierLimits.map((l) => [l.tier, l]));

    for (const usage of highUsageUsers) {
      const limits = limitsMap[usage.user.aiTier];
      if (!limits) continue;

      // Check each feature for high usage
      const features = [
        { name: "sessionPrep", used: usage.sessionPrepCount, limit: limits.sessionPrepLimit },
        { name: "conciseAnalysis", used: usage.conciseAnalysisCount, limit: limits.conciseAnalysisLimit },
        { name: "detailedAnalysis", used: usage.detailedAnalysisCount, limit: limits.detailedAnalysisLimit },
      ];

      for (const feature of features) {
        if (feature.limit <= 0) continue; // Skip blocked or unlimited

        const percentage = (feature.used / feature.limit) * 100;
        
        if (percentage >= 80) {
          const existingAlert = await prisma.adminAlert.findFirst({
            where: {
              type: "HIGH_AI_USAGE",
              userId: usage.userId,
              status: { in: ["PENDING", "IN_PROGRESS"] },
              metadata: {
                path: ["feature"],
                equals: feature.name,
              },
            },
          });

          if (!existingAlert) {
            alerts.push({
              type: AdminAlertType.HIGH_AI_USAGE,
              priority: percentage >= 95 ? AlertPriority.HIGH : AlertPriority.MEDIUM,
              title: `שימוש גבוה ב-AI - ${usage.user.name || usage.user.email}`,
              message: `המשתמש הגיע ל-${Math.round(percentage)}% מהמכסה החודשית (${feature.name}).`,
              userId: usage.userId,
              actionRequired: percentage >= 95 ? "לשקול שדרוג תוכנית" : undefined,
              metadata: {
                feature: feature.name,
                used: feature.used,
                limit: feature.limit,
                percentage: Math.round(percentage),
              },
            });
          }
        }
      }
    }

    // 5. Check for new users in last 24 hours
    const newUsers = await prisma.user.findMany({
      where: {
        createdAt: {
          gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        aiTier: true,
        createdAt: true,
      },
    });

    for (const user of newUsers) {
      const existingAlert = await prisma.adminAlert.findFirst({
        where: {
          type: "NEW_USER",
          userId: user.id,
        },
      });

      if (!existingAlert) {
        alerts.push({
          type: AdminAlertType.NEW_USER,
          priority: AlertPriority.LOW,
          title: `משתמש חדש נרשם - ${user.name || user.email}`,
          message: `משתמש חדש נרשם למערכת בתוכנית ${user.aiTier}.`,
          userId: user.id,
          metadata: {
            tier: user.aiTier,
            registeredAt: user.createdAt.toISOString(),
          },
        });
      }
    }

    // Create all alerts
    if (alerts.length > 0) {
      await prisma.adminAlert.createMany({
        data: alerts,
      });
    }

    return NextResponse.json({
      success: true,
      alertsCreated: alerts.length,
      details: {
        overduePayments: overduePayments.length,
        expiringSubscriptions: expiringUsers.length,
        expiredSubscriptions: expiredUsers.length,
        highUsage: alerts.filter((a) => a.type === "HIGH_AI_USAGE").length,
        newUsers: newUsers.length,
      },
    });
  } catch (error) {
    console.error("Generate alerts error:", error);
    return NextResponse.json(
      { message: "שגיאה ביצירת ההתראות", error: String(error) },
      { status: 500 }
    );
  }
}

// Manual trigger for testing
export async function POST(req: NextRequest) {
  return GET(req);
}
