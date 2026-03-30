let schedulerStarted = false;

export function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  console.log("[Scheduler] In-app cron scheduler started");

  // First run after 45 seconds (let server fully boot)
  setTimeout(runAllTasks, 45_000);

  // Then every 15 minutes
  setInterval(runAllTasks, INTERVAL_MS);
}

async function runAllTasks() {
  const port = process.env.PORT || 3000;
  const baseUrl = `http://localhost:${port}`;
  const secret = process.env.CRON_SECRET || "";
  const headers: Record<string, string> = {};
  if (secret) {
    headers["Authorization"] = `Bearer ${secret}`;
  }

  const now = new Date();
  const israelHour = getIsraelHour(now);

  console.log(
    `[Scheduler] Tick at ${now.toISOString()} (Israel hour: ${israelHour})`
  );

  // Session reminders run on every tick (they have built-in duplicate prevention)
  await callEndpoint(`${baseUrl}/api/cron/reminders`, headers, "24h-reminders");
  await callEndpoint(
    `${baseUrl}/api/cron/reminders-2h`,
    headers,
    "2h-reminders"
  );

  // Morning summary: 05:00-12:00 Israel time (wide window - per-user time filtering in cron)
  if (israelHour >= 5 && israelHour <= 12) {
    await callEndpoint(
      `${baseUrl}/api/cron/notifications?type=morning`,
      headers,
      "morning-summary"
    );
  }

  // Evening summary: 16:00-23:00 Israel time (wide window - per-user time filtering in cron)
  if (israelHour >= 16 && israelHour <= 23) {
    await callEndpoint(
      `${baseUrl}/api/cron/notifications?type=evening`,
      headers,
      "evening-summary"
    );
  }

  // Debt reminders: 08:00-10:00 Israel time
  if (israelHour >= 8 && israelHour <= 10) {
    await callEndpoint(
      `${baseUrl}/api/cron/debt-reminders`,
      headers,
      "debt-reminders"
    );
  }

  // Subscription reminders: 08:00-10:00 Israel time
  if (israelHour >= 8 && israelHour <= 10) {
    await callEndpoint(
      `${baseUrl}/api/cron/subscription-reminders`,
      headers,
      "subscription-reminders"
    );
  }

  // Fix stuck payments: 08:00-10:00 Israel time
  if (israelHour >= 8 && israelHour <= 10) {
    await callEndpoint(
      `${baseUrl}/api/cron/fix-stuck-payments`,
      headers,
      "fix-stuck-payments"
    );
  }

  // Admin alerts: 07:00-09:00 Israel time
  if (israelHour >= 7 && israelHour <= 9) {
    await callEndpoint(
      `${baseUrl}/api/cron/generate-alerts`,
      headers,
      "generate-alerts"
    );
  }

  console.log("[Scheduler] Tick complete");
}

function getIsraelHour(date: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(date)
  );
}

async function callEndpoint(
  url: string,
  headers: Record<string, string>,
  name: string
) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);

    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await res.json().catch(() => ({}));
    console.log(`[Scheduler] ${name}: ${res.status}`, JSON.stringify(data));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Scheduler] ${name} failed: ${msg}`);
  }
}
