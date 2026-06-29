import { signOut } from "next-auth/react";

export async function handleLogout() {
  if (typeof window === "undefined") return;

  // ביטול ה-session בצד השרת (bump ל-sessionVersion) לפני מחיקת ה-cookie בדפדפן.
  // signOut של NextAuth (מצב JWT) מוחק רק את ה-cookie המקומי — בלי הקריאה הזו
  // ה-JWT היה נשאר תקף בצד השרת עד לתפוגתו וניתן להזרקה חוזרת אם נחשף/נגנב.
  // כשל כאן (רשת/שרת) לא חוסם את ההתנתקות המקומית — ממשיכים ל-signOut בכל מקרה.
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // מתעלמים — signOut ירוץ בכל מקרה ויסיר את ה-cookie מקומית.
  }

  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
  }

  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "LOGOUT" });
  }

  await signOut({ callbackUrl: "/login" });
}
