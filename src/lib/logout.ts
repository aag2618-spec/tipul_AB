import { signOut } from "next-auth/react";

export async function handleLogout() {
  if (typeof window === "undefined") return;

  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
  }

  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "LOGOUT" });
  }

  await signOut({ callbackUrl: "/login" });
}
