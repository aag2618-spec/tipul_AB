// src/lib/cardcom/admin-config.ts
// Resolve Cardcom credentials for the global ADMIN flow.
//
// Strategy: secrets in env vars; non-sensitive config in SiteSetting.
// Sandbox mode is selected via SiteSetting `admin_cardcom_mode`.

import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { CardcomClient, CARDCOM_SANDBOX_TERMINAL, CARDCOM_SANDBOX_API_NAME } from './client';
import type { CardcomConfig, CardcomMode } from './types';

// On a transient DB outage we'd rather charge against sandbox (safe default)
// than crash the request — the failure is logged and surfaces in observability.
async function readMode(): Promise<CardcomMode> {
  try {
    const setting = await prisma.siteSetting.findUnique({ where: { key: 'admin_cardcom_mode' } });
    const value = setting?.value as string | undefined;
    return value === 'production' ? 'production' : 'sandbox';
  } catch (err) {
    logger.error('[admin-config] failed reading admin_cardcom_mode — falling back to sandbox', {
      error: err instanceof Error ? err.message : String(err),
    });
    return 'sandbox';
  }
}

/**
 * Read the resolved Cardcom config for the ADMIN tenant.
 * Throws if production mode is selected but env vars are missing.
 */
export async function getAdminCardcomConfig(): Promise<CardcomConfig> {
  const mode = await readMode();

  if (mode === 'sandbox') {
    return {
      terminalNumber: process.env.CARDCOM_SANDBOX_TERMINAL_NUMBER || CARDCOM_SANDBOX_TERMINAL,
      apiName: process.env.CARDCOM_SANDBOX_API_NAME || CARDCOM_SANDBOX_API_NAME,
      apiPassword: process.env.CARDCOM_SANDBOX_API_PASSWORD,
      mode: 'sandbox',
    };
  }

  const terminalNumber = process.env.CARDCOM_ADMIN_TERMINAL_NUMBER;
  const apiName = process.env.CARDCOM_ADMIN_API_NAME;
  const apiPassword = process.env.CARDCOM_ADMIN_API_PASSWORD;
  if (!terminalNumber || !apiName) {
    throw new Error('CARDCOM_ADMIN_PRODUCTION_NOT_CONFIGURED');
  }

  return { terminalNumber, apiName, apiPassword, mode: 'production' };
}

export function getAdminWebhookSecret(): string {
  const secret = process.env.CARDCOM_ADMIN_WEBHOOK_SECRET;
  if (!secret) throw new Error('CARDCOM_ADMIN_WEBHOOK_SECRET_MISSING');
  return secret;
}

export async function getAdminCardcomClient(): Promise<CardcomClient> {
  const config = await getAdminCardcomConfig();
  return new CardcomClient(config);
}
