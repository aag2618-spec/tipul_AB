// Fix cross-user data leak for aag2618@gmail.com.
// 1) Demote role: ADMIN -> USER (so scope.ts no longer bypasses filtering).
// 2) Backfill organizationId on legacy clients/sessions owned by this user
//    so the OWNER scope (which filters by organizationId) keeps showing them.
//
// Runs inside a single transaction. Prints counts before/after.
// Usage: npx tsx scripts/fix-user-clinic-scope.ts
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

const USER_EMAIL = "aag2618@gmail.com";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: USER_EMAIL },
    select: {
      id: true,
      email: true,
      role: true,
      clinicRole: true,
      organizationId: true,
    },
  });

  if (!user) {
    console.error(`User ${USER_EMAIL} not found.`);
    process.exit(1);
  }
  if (!user.organizationId) {
    console.error(`User ${USER_EMAIL} has no organizationId — aborting.`);
    process.exit(1);
  }

  console.log("BEFORE:");
  console.table([user]);

  const ownClientsTotal = await prisma.client.count({ where: { therapistId: user.id } });
  const ownClientsInOrg = await prisma.client.count({
    where: { therapistId: user.id, organizationId: user.organizationId },
  });
  const ownClientsUnassigned = await prisma.client.count({
    where: { therapistId: user.id, organizationId: null },
  });
  const ownSessionsTotal = await prisma.therapySession.count({ where: { therapistId: user.id } });
  const ownSessionsInOrg = await prisma.therapySession.count({
    where: { therapistId: user.id, organizationId: user.organizationId },
  });
  const ownSessionsUnassigned = await prisma.therapySession.count({
    where: { therapistId: user.id, organizationId: null },
  });

  console.log("Counts before:");
  console.table({
    clientsTotal: ownClientsTotal,
    clientsInOrg: ownClientsInOrg,
    clientsUnassigned: ownClientsUnassigned,
    sessionsTotal: ownSessionsTotal,
    sessionsInOrg: ownSessionsInOrg,
    sessionsUnassigned: ownSessionsUnassigned,
  });

  // Sanity check — we only touch rows owned by this user and currently unassigned.
  // Anything already in another org we leave alone (none expected, but safe).
  const ownClientsInOtherOrg = await prisma.client.count({
    where: {
      therapistId: user.id,
      organizationId: { not: null },
      NOT: { organizationId: user.organizationId },
    },
  });
  const ownSessionsInOtherOrg = await prisma.therapySession.count({
    where: {
      therapistId: user.id,
      organizationId: { not: null },
      NOT: { organizationId: user.organizationId },
    },
  });
  if (ownClientsInOtherOrg > 0 || ownSessionsInOtherOrg > 0) {
    console.error(
      `Refusing to run — user owns rows in other organizations (clients=${ownClientsInOtherOrg}, sessions=${ownSessionsInOtherOrg}).`
    );
    process.exit(1);
  }

  const result = await prisma.$transaction(async (tx) => {
    const roleUpdate = await tx.user.update({
      where: { id: user.id },
      data: { role: "USER" },
      select: { id: true, email: true, role: true, clinicRole: true, organizationId: true },
    });

    const clientUpdate = await tx.client.updateMany({
      where: { therapistId: user.id, organizationId: null },
      data: { organizationId: user.organizationId },
    });

    const sessionUpdate = await tx.therapySession.updateMany({
      where: { therapistId: user.id, organizationId: null },
      data: { organizationId: user.organizationId },
    });

    return { roleUpdate, clientsUpdated: clientUpdate.count, sessionsUpdated: sessionUpdate.count };
  });

  console.log("\nAFTER:");
  console.table([result.roleUpdate]);
  console.log("Rows updated:");
  console.table({
    clientsUpdated: result.clientsUpdated,
    sessionsUpdated: result.sessionsUpdated,
  });

  const finalClientsInOrg = await prisma.client.count({
    where: { therapistId: user.id, organizationId: user.organizationId },
  });
  const finalSessionsInOrg = await prisma.therapySession.count({
    where: { therapistId: user.id, organizationId: user.organizationId },
  });
  const finalClientsUnassigned = await prisma.client.count({
    where: { therapistId: user.id, organizationId: null },
  });
  const finalSessionsUnassigned = await prisma.therapySession.count({
    where: { therapistId: user.id, organizationId: null },
  });

  console.log("\nFinal counts (must match BEFORE totals and have 0 unassigned):");
  console.table({
    clientsInOrg: finalClientsInOrg,
    clientsUnassigned: finalClientsUnassigned,
    sessionsInOrg: finalSessionsInOrg,
    sessionsUnassigned: finalSessionsUnassigned,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
