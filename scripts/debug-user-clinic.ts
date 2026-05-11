// Read-only diagnostic script for cross-user data leak investigation.
// Usage: npx tsx scripts/debug-user-clinic.ts
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

async function main() {
  console.log("\n=== Search for 'פנט' or 'צבי' or 'PP423' anywhere ===");
  const matches = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: "פנט", mode: "insensitive" } },
        { name: { contains: "צבי", mode: "insensitive" } },
        { email: { contains: "PP423", mode: "insensitive" } },
        { email: { contains: "pp423", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      clinicRole: true,
      organizationId: true,
      createdAt: true,
    },
  });
  console.table(matches);

  console.log("\n=== ALL ADMINs in the system ===");
  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER"] } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      clinicRole: true,
      organizationId: true,
    },
  });
  console.table(admins);

  console.log("\n=== Total counts in DB (system-wide) ===");
  const totals = {
    users: await prisma.user.count(),
    clients: await prisma.client.count(),
    sessions: await prisma.therapySession.count(),
    organizations: await prisma.organization.count(),
  };
  console.table(totals);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
