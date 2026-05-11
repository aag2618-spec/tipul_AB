// Restore role=ADMIN for aag2618@gmail.com.
// Safe because scope.ts no longer treats ADMIN as bypass — admin will only
// see their own clinic data via UI, and full system access goes through
// /api/admin/* endpoints that fetch data directly.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const before = await prisma.user.findUnique({
    where: { email: "aag2618@gmail.com" },
    select: { id: true, email: true, role: true, clinicRole: true, organizationId: true },
  });
  if (!before) {
    console.error("User not found.");
    process.exit(1);
  }
  console.log("BEFORE:");
  console.table([before]);

  const after = await prisma.user.update({
    where: { id: before.id },
    data: { role: "ADMIN" },
    select: { id: true, email: true, role: true, clinicRole: true, organizationId: true },
  });
  console.log("\nAFTER:");
  console.table([after]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
