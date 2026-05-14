// src/app/(dashboard)/dashboard/settings/packages/page.tsx
// Stage 5 — דף קניית חבילות SMS/AI חד-פעמיות.
//
// Server Component שטוען:
//   - Package[] עם isActive=true
//   - resolved price per package (PricingPolicy override) — Promise.all מסונן
//   - UserPackagePurchase של המשתמש (לחישוב יתרה)
//
// העברה מסוריאליזת ל-PackagesClient.

import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { fetchAndResolvePackagePrice } from "@/lib/pricing/resolve";
import { buildPackagesView } from "@/lib/payments/package-purchase";
import PackagesClient from "./PackagesClient";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.originalUserId ?? session.user.id;

  let user: Awaited<ReturnType<typeof loadUser>>;
  let packages: Awaited<ReturnType<typeof loadPackages>>;
  let purchases: Awaited<ReturnType<typeof loadPurchases>>;
  try {
    [user, packages, purchases] = await Promise.all([
      loadUser(userId),
      loadPackages(),
      loadPurchases(userId),
    ]);
  } catch (error) {
    logger.error("[settings/packages] failed to load page data", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return (
      <div className="max-w-3xl mx-auto p-6" dir="rtl">
        <p className="text-destructive">
          שגיאה בטעינת חבילות. נסה/י לרענן את הדף.
        </p>
      </div>
    );
  }

  if (!user) redirect("/login");

  // resolve מחירים מותאמים אישית פר חבילה (אם יש PricingPolicy)
  const now = new Date();
  const resolvedPrices = new Map<string, number>();
  await Promise.all(
    packages.map(async (pkg) => {
      try {
        const r = await fetchAndResolvePackagePrice({
          userId: user!.id,
          organizationId: user!.organizationId,
          packageType: pkg.type,
          credits: pkg.credits,
          now,
        });
        if (r.priceIls !== null) {
          resolvedPrices.set(pkg.id, r.priceIls);
        }
      } catch (err) {
        logger.warn("[settings/packages] price resolve failed (using catalog)", {
          packageId: pkg.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })
  );

  const view = buildPackagesView({
    packages: packages.map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      credits: p.credits,
      priceIls: Number(p.priceIls) || 0,
      isActive: p.isActive,
    })),
    resolvedPrices,
    userPurchases: purchases,
  });

  // Suspense — Next.js 14+ דורש סביב Client שמשתמש ב-useSearchParams.
  return (
    <Suspense fallback={null}>
      <PackagesClient view={view} isBlocked={user.isBlocked} />
    </Suspense>
  );
}

async function loadUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      organizationId: true,
      isBlocked: true,
    },
  });
}

async function loadPackages() {
  return prisma.package.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { credits: "asc" }],
    select: {
      id: true,
      type: true,
      name: true,
      credits: true,
      priceIls: true,
      isActive: true,
    },
  });
}

async function loadPurchases(userId: string) {
  // take: 200 — לחישוב יתרה אנחנו לא צריכים את כל ההיסטוריה (משתמש ותיק עם
  // הרבה רכישות). 200 רשומות פעילות זה גג סביר. סוכן 5 ממצא #3.
  return prisma.userPackagePurchase.findMany({
    where: { userId, reverted: false },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      type: true,
      credits: true,
      creditsUsed: true,
      reverted: true,
    },
  });
}
