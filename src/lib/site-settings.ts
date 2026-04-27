// src/lib/site-settings.ts
// Typed accessor for the SiteSetting key-value store.
//
// Keys are whitelisted via SiteSettingKey to prevent arbitrary writes.
// Sensitive credentials (API passwords, webhook secrets) belong in env vars,
// NOT here.

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { SiteSettingKey } from "@/lib/cardcom/types";

/** Read a single site setting. Returns null when the key is absent. */
export async function getSiteSetting<T = unknown>(
  key: SiteSettingKey
): Promise<T | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  return row ? (row.value as T) : null;
}

/**
 * Read multiple settings at once. Returns a partial map; missing keys are absent.
 */
export async function getSiteSettings<T extends SiteSettingKey>(
  keys: readonly T[]
): Promise<Partial<Record<T, unknown>>> {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: keys as unknown as string[] } },
  });
  const result: Partial<Record<T, unknown>> = {};
  for (const row of rows) {
    result[row.key as T] = row.value;
  }
  return result;
}

/**
 * Upsert a site setting. Tracks who made the change.
 *
 * For sensitive value changes (e.g. business type switch, pricing) callers
 * should wrap this in `withAudit` upstream.
 */
export async function setSiteSetting(
  key: SiteSettingKey,
  value: unknown,
  updatedById: string | null
): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, value: value as never, updatedById: updatedById ?? undefined },
    update: { value: value as never, updatedById: updatedById ?? undefined },
  });
  logger.info("[SiteSetting] updated", { key, updatedById });
}

/** Resolved business profile for the global ADMIN tenant (issuer of receipts). */
export interface AdminBusinessProfile {
  type: "EXEMPT" | "LICENSED";
  name: string;
  idNumber: string;
  address: string;
  phone: string;
  email: string;
  vatRate: number; // 0 for EXEMPT, 18 (or current) for LICENSED
  logoUrl: string | null;
  footerText: string | null;
}

const ADMIN_PROFILE_KEYS = [
  "admin_business_type",
  "admin_business_name",
  "admin_business_id_number",
  "admin_business_address",
  "admin_business_phone",
  "admin_business_email",
  "admin_business_vat_rate",
  "admin_business_logo_url",
  "admin_business_footer_text",
] as const;

/**
 * Read the resolved ADMIN business profile, falling back to safe defaults
 * when settings have not yet been configured.
 */
export async function getAdminBusinessProfile(): Promise<AdminBusinessProfile> {
  const settings = await getSiteSettings(ADMIN_PROFILE_KEYS);

  const typeValue = settings.admin_business_type;
  const type: AdminBusinessProfile["type"] = typeValue === "LICENSED" ? "LICENSED" : "EXEMPT";

  return {
    type,
    name: (settings.admin_business_name as string | undefined) ?? "MyTipul",
    idNumber: (settings.admin_business_id_number as string | undefined) ?? "",
    address: (settings.admin_business_address as string | undefined) ?? "",
    phone: (settings.admin_business_phone as string | undefined) ?? "",
    email: (settings.admin_business_email as string | undefined) ?? "",
    vatRate: type === "LICENSED" ? Number(settings.admin_business_vat_rate ?? 18) : 0,
    logoUrl: (settings.admin_business_logo_url as string | null | undefined) ?? null,
    footerText: (settings.admin_business_footer_text as string | null | undefined) ?? null,
  };
}
