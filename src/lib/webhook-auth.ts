/**
 * Webhook authentication and logging wrapper.
 *
 * Provides a unified helper that wraps webhook route handlers with:
 * - Secret / signature verification
 * - Structured request logging
 * - Consistent error responses
 *
 * Usage (does NOT replace existing routes — just provides a reusable utility):
 *
 *   import { withWebhookAuth } from '@/lib/webhook-auth';
 *
 *   export const POST = withWebhookAuth({
 *     name: 'sumit',
 *     verifyRequest: async (req, body) => {
 *       const sig = req.headers.get('x-sumit-signature') || '';
 *       return verifySumitWebhook(body, sig, process.env.SUMIT_WEBHOOK_SECRET!);
 *     },
 *     handler: async (req, body) => {
 *       // ... business logic ...
 *       return NextResponse.json({ received: true });
 *     },
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import { bearerEquals } from '@/lib/cron-auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookAuthOptions {
  /** Human-readable webhook name used in logs (e.g. "sumit", "render"). */
  name: string;

  /**
   * Verify the incoming request. Return `true` if the request is authentic.
   *
   * Receives the raw body string so signature verification can operate on it.
   * If this function is not provided, the wrapper checks for a Bearer token
   * in the Authorization header against `secretEnvVar`.
   */
  verifyRequest?: (req: NextRequest, rawBody: string) => Promise<boolean> | boolean;

  /**
   * Environment variable name that holds the webhook secret.
   * Used both for the built-in Bearer-token check (when `verifyRequest` is
   * not provided) and to fail fast if the env var is missing.
   */
  secretEnvVar?: string;

  /**
   * The actual handler that processes the verified webhook payload.
   * Receives the original request and the raw body string.
   */
  handler: (req: NextRequest, rawBody: string) => Promise<NextResponse>;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Wraps a webhook handler with authentication verification and structured logging.
 */
export function withWebhookAuth(options: WebhookAuthOptions) {
  const { name, verifyRequest, secretEnvVar, handler } = options;

  return async function webhookRoute(req: NextRequest): Promise<NextResponse> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    console.log(`[webhook:${name}] Incoming request ${requestId}`);

    try {
      // 1. Check that the secret env var is configured
      if (secretEnvVar) {
        const secret = process.env[secretEnvVar];
        if (!secret) {
          console.error(`[webhook:${name}] ${secretEnvVar} not configured`);
          return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
        }
      }

      // 2. Read raw body
      const rawBody = await req.text();

      // 3. Verify authenticity
      let isValid: boolean;

      if (verifyRequest) {
        isValid = await verifyRequest(req, rawBody);
      } else if (secretEnvVar) {
        // Default: Bearer token check (timing-safe — Stage 1.19).
        const authHeader = req.headers.get('authorization');
        const expected = process.env[secretEnvVar] ?? '';
        isValid = bearerEquals(authHeader, expected);
      } else {
        // No verification configured — reject by default
        console.error(`[webhook:${name}] No verification method configured`);
        return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
      }

      if (!isValid) {
        console.error(`[webhook:${name}] Authentication failed for ${requestId}`);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }

      // 4. Delegate to handler
      const response = await handler(req, rawBody);

      const duration = Date.now() - startTime;
      console.log(`[webhook:${name}] ${requestId} completed in ${duration}ms — status ${response.status}`);

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[webhook:${name}] ${requestId} failed after ${duration}ms:`, error);

      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500 },
      );
    }
  };
}
