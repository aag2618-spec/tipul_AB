import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_FLAGS = [
  {
    key: "ai_session_prep",
    name: "הכנה לפגישה עם AI",
    description: "הכנה אוטומטית לפגישות באמצעות AI",
    tiers: ["PRO", "ENTERPRISE"],
  },
  {
    key: "ai_detailed_analysis",
    name: "ניתוח מפורט AI",
    description: "ניתוח מפורט של פגישות באמצעות AI",
    tiers: ["ENTERPRISE"],
  },
  {
    key: "ai_questionnaire",
    name: "ניתוח שאלונים AI",
    description: "ניתוח שאלונים אוטומטי באמצעות AI",
    tiers: ["PRO", "ENTERPRISE"],
  },
  {
    key: "email_threads",
    name: "שרשורי מייל",
    description: "ניהול שרשורי אימייל עם מטופלים",
    tiers: ["PRO", "ENTERPRISE"],
  },
  {
    key: "file_attachments",
    name: "קבצים מצורפים",
    description: "צירוף קבצים להודעות ולפגישות",
    tiers: ["PRO", "ENTERPRISE"],
  },
  {
    key: "advanced_reports",
    name: "דוחות מתקדמים",
    description: "גישה לדוחות ואנליטיקה מתקדמים",
    tiers: ["ENTERPRISE"],
  },
];

async function seedDefaultFlags() {
  for (const flag of DEFAULT_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: {},
      create: {
        key: flag.key,
        name: flag.name,
        description: flag.description,
        isEnabled: true,
        tiers: flag.tiers,
      },
    });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (adminUser?.role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const count = await prisma.featureFlag.count();
    if (count === 0) {
      await seedDefaultFlags();
    }

    const flags = await prisma.featureFlag.findMany({
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ flags });
  } catch (error) {
    console.error("Error fetching feature flags:", error);
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

    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (adminUser?.role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { key, name, description, tiers } = body;

    if (!key || !name) {
      return NextResponse.json(
        { message: "key and name are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.featureFlag.findUnique({ where: { key } });
    if (existing) {
      return NextResponse.json(
        { message: "Feature flag with this key already exists" },
        { status: 400 }
      );
    }

    const flag = await prisma.featureFlag.create({
      data: {
        key,
        name,
        description: description || null,
        isEnabled: true,
        tiers: tiers || [],
      },
    });

    return NextResponse.json({ flag });
  } catch (error) {
    console.error("Error creating feature flag:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
