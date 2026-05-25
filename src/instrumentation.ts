export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.ENABLE_IN_APP_SCHEDULER !== "false"
  ) {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
