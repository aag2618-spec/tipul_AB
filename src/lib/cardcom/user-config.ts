// src/lib/cardcom/user-config.ts
// Resolve Cardcom credentials for a specific therapist (USER tenant).
//
// Each therapist supplies their own credentials, stored encrypted in BillingProvider.

import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { CardcomClient } from './client';
import type { CardcomConfig } from './types';

interface UserCardcomCredentials {
  config: CardcomConfig;
  webhookSecret: string | null;
  /**
   * Previous webhook secret kept for grace period after rotation. Webhook
   * verifier accepts BOTH this and `webhookSecret` until validUntil expires.
   */
  previousWebhookSecret: string | null;
  providerId: string;
}

/**
 * Look up the active Cardcom provider for a therapist.
 * Returns null if the therapist has not connected a Cardcom terminal.
 */
export async function getUserCardcomCredentials(userId: string): Promise<UserCardcomCredentials | null> {
  // Pick primary first if multi-terminal; fall back to oldest active.
  // On a transient DB error treat as "no provider" rather than crashing the
  // caller — the request will degrade gracefully (e.g. "Cardcom not configured")
  // and the failure surfaces in observability.
  let provider;
  try {
    provider = await prisma.billingProvider.findFirst({
      where: { userId, provider: 'CARDCOM', isActive: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  } catch (err) {
    logger.error('[user-config] failed loading BillingProvider — returning null', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!provider) return null;

  // Convention for Cardcom BillingProvider:
  //   apiKey       = TerminalNumber (encrypted for consistency)
  //   apiSecret    = `${ApiName}:${ApiPassword}` — split on FIRST colon only,
  //                  because ApiPassword may itself contain colons.
  //   webhookSecret = HMAC secret for webhook verification
  const terminalNumber = decrypt(provider.apiKey);
  const apiSecretRaw = provider.apiSecret ? decrypt(provider.apiSecret) : '';
  const sepIndex = apiSecretRaw.indexOf(':');
  const apiName = sepIndex === -1 ? apiSecretRaw : apiSecretRaw.slice(0, sepIndex);
  const apiPassword = sepIndex === -1 ? '' : apiSecretRaw.slice(sepIndex + 1);

  const settings = (provider.settings as { mode?: 'sandbox' | 'production' } | null) ?? null;
  const mode = settings?.mode === 'production' ? 'production' : 'sandbox';

  const config: CardcomConfig = {
    terminalNumber,
    apiName: apiName ?? '',
    apiPassword: apiPassword || undefined,
    mode,
  };

  const webhookSecret = provider.webhookSecret ? decrypt(provider.webhookSecret) : null;

  // Surface the previous secret only while still valid — verifyWebhookSignature
  // tries both. Beyond the grace window, treat it as gone.
  let previousWebhookSecret: string | null = null;
  if (
    provider.previousWebhookSecret &&
    provider.previousWebhookSecretValidUntil &&
    provider.previousWebhookSecretValidUntil > new Date()
  ) {
    previousWebhookSecret = decrypt(provider.previousWebhookSecret);
  }

  return { config, webhookSecret, previousWebhookSecret, providerId: provider.id };
}

export async function getUserCardcomClient(userId: string): Promise<CardcomClient | null> {
  const creds = await getUserCardcomCredentials(userId);
  if (!creds) return null;
  return new CardcomClient(creds.config);
}
