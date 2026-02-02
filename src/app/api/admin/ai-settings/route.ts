import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // Get or create global settings
    let settings = await prisma.globalAISettings.findFirst();
    
    if (!settings) {
      // Create default settings
      settings = await prisma.globalAISettings.create({
        data: {
          dailyLimitPro: 30,
          dailyLimitEnterprise: 100,
          monthlyLimitPro: 600,
          monthlyLimitEnterprise: 2000,
          maxMonthlyCostBudget: 5000,
          alertThreshold: 4000,
          blockOnExceed: false,
          alertAdminOnExceed: true,
          enableCache: true,
          compressPrompts: true,
        }
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching AI settings:', error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    // Update or create settings
    const settings = await prisma.globalAISettings.upsert({
      where: { id: body.id || 'default' },
      create: {
        id: 'default',
        ...body
      },
      update: body
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error saving AI settings:', error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
