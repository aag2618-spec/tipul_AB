// Read-only diagnostic: why did the "שלי / כל הקליניקה" view-toggle disappear?
// Compares the owner user's role/clinicRole/organizationId against what the
// sidebar requires to show the toggle. Touches nothing — SELECTs only.
// Usage: npx tsx scripts/diagnose-clinic-toggle.ts
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Make sure .env.local exists.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const USER_EMAIL = "aag2618@gmail.com";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: USER_EMAIL },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      clinicRole: true,
      organizationId: true,
      updatedAt: true,
    },
  });

  console.log("\n=== USER (owner) ===");
  console.table(user ? [user] : []);

  if (!user) {
    console.error("User not found!");
    return;
  }

  // Sidebar rule (app-sidebar.tsx): showViewToggle =
  //   clinicRole === "OWNER" || role === "CLINIC_OWNER"
  const toggleShouldShow =
    user.clinicRole === "OWNER" || user.role === "CLINIC_OWNER";
  console.log(`\n>>> Toggle should show? ${toggleShouldShow ? "YES ✅" : "NO ❌"}`);
  console.log(`    rule: clinicRole === "OWNER" || role === "CLINIC_OWNER"`);
  console.log(`    actual: clinicRole=${JSON.stringify(user.clinicRole)}, role=${JSON.stringify(user.role)}`);

  // Organization this user OWNS (ownerUserId is @unique)
  const ownedOrg = await prisma.organization.findUnique({
    where: { ownerUserId: user.id },
    select: { id: true, name: true, ownerUserId: true, ownerIsTherapist: true, createdAt: true },
  });
  console.log("\n=== ORGANIZATION owned by this user (ownerUserId) ===");
  console.table(ownedOrg ? [ownedOrg] : []);

  // Organization this user is currently attached to (organizationId)
  if (user.organizationId) {
    const memberOrg = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true, ownerUserId: true, ownerIsTherapist: true },
    });
    console.log("\n=== ORGANIZATION user is attached to (organizationId) ===");
    console.table(memberOrg ? [memberOrg] : []);

    const members = await prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, email: true, name: true, role: true, clinicRole: true },
      orderBy: { clinicRole: "asc" },
    });
    console.log("\n=== ALL MEMBERS of that organization ===");
    console.table(members);
  } else {
    console.log("\n⚠️ user.organizationId is NULL — user is detached from any clinic.");
    console.log("   (per schema: clinicRole must be NULL when organizationId is NULL)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
