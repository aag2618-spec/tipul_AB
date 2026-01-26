/**
 * Migration script to split client.name into firstName and lastName
 * Run with: npx tsx scripts/migrate-client-names.ts
 */

import prisma from "../src/lib/prisma";

async function migrateClientNames() {
  console.log("Starting migration: Splitting client names...");

  const clients = await prisma.client.findMany({
    select: { id: true, name: true, firstName: true, lastName: true },
  });

  console.log(`Found ${clients.length} clients to migrate`);

  let updated = 0;
  let skipped = 0;

  for (const client of clients) {
    // Skip if already has firstName and lastName
    if (client.firstName && client.lastName) {
      skipped++;
      continue;
    }

    // Split name
    const nameParts = (client.name || "").trim().split(" ");
    let firstName = "";
    let lastName = "";

    if (nameParts.length === 0 || !client.name) {
      // No name - set default values
      firstName = "לא";
      lastName = "ידוע";
    } else if (nameParts.length === 1) {
      // Only one word - use as first name
      firstName = nameParts[0];
      lastName = nameParts[0];
    } else {
      // Multiple words - first word is first name, rest is last name
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(" ");
    }

    try {
      await prisma.client.update({
        where: { id: client.id },
        data: {
          firstName,
          lastName,
          name: client.name, // Keep original name for compatibility
        },
      });
      updated++;
      console.log(`✓ Updated: ${client.name} -> ${firstName} ${lastName}`);
    } catch (error) {
      console.error(`✗ Failed to update client ${client.id}:`, error);
    }
  }

  console.log(`\nMigration complete!`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total: ${clients.length}`);
}

migrateClientNames()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
