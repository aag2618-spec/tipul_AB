// CSRF — שכבת הגנה נוספת (defense-in-depth) מעבר ל-SameSite=Lax בעוגיית הסשן.
//
// ההגנה העיקרית מפני CSRF היא `sameSite: "lax"` בעוגיית הסשן (src/lib/auth.ts):
// דפדפן לא שולח את עוגיית האימות בבקשת POST/PUT/PATCH/DELETE שמקורהּ באתר זר.
// הפונקציה כאן מוסיפה בדיקת מקור מפורשת — ההמלצה של OWASP — שתופסת גם מקרי קצה
// (באגי דפדפן ב-SameSite, התקפות מבוססות תת-דומיין, ומוטציות state-changing שגגתיות).
//
// נקראת מ-src/proxy.ts על מוטציות לנתיבי /api/* בלבד. וובהוקים (Cardcom/Meshulam/
// Resend), cron ו-/api/auth/* מוחרגים כבר מה-proxy, כך שספקים חיצוניים לא מושפעים.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * מחזיר true אם הבקשה היא מוטציה (POST/PUT/PATCH/DELETE) שמקורהּ חוצה-אתר —
 * כלומר בקשה שיש לחסום מסיבת CSRF.
 *
 * סדר ההכרעה:
 * 1. שיטות קריאה (GET/HEAD/OPTIONS) → לעולם לא נחסמות.
 * 2. `Sec-Fetch-Site` (כל דפדפן מודרני שולח): `cross-site` נחסם;
 *    `same-origin`/`same-site`/`none` מותרים.
 * 3. נפילה לדפדפנים ישנים: השוואת ה-host של `Origin` מול ה-host של הבקשה.
 *    אי-התאמה או `Origin` פגום → נחסם.
 * 4. אין `Sec-Fetch-Site` וגם אין `Origin` → מותר. זהו לקוח לא-דפדפן או דפדפן
 *    ישן מאוד; SameSite=Lax הוא הרשת התחתונה. תקיפת CSRF אמיתית תמיד מגיעה
 *    מדפדפן ששולח לפחות אחת מהכותרות במוטציה חוצת-מקור.
 *
 * @param method  שיטת ה-HTTP של הבקשה
 * @param headers כותרות הבקשה
 * @param selfHost ה-host של הבקשה עצמה (Host header / nextUrl.host) להשוואה מול Origin
 */
export function isCrossOriginMutation(
  method: string,
  headers: Headers,
  selfHost: string | null
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;

  const secFetchSite = headers.get("sec-fetch-site");
  if (secFetchSite) {
    return secFetchSite === "cross-site";
  }

  const origin = headers.get("origin");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      // Origin פגום או "null" (iframe מ-sandbox / redirect אטום) → נחסם.
      return true;
    }
    if (!selfHost) return false; // אין עם מה להשוות — נשען על SameSite
    return originHost.toLowerCase() !== selfHost.toLowerCase();
  }

  return false;
}
