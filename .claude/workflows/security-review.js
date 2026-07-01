export const meta = {
  name: 'security-review',
  description: 'ביקורת אבטחה רב-סוכנית למערכת קליניקה (PHI): מיפוי → 8 מחלקות פגיעות → אימות יריבי → סיכום מתועדף',
  whenToUse: 'לפני פוש או לביקורת אבטחה מלאה. args: { mode: "full" | "diff", note?: string }. ברירת מחדל full.',
  phases: [
    { title: 'Map', detail: 'מיפוי משטח התקיפה: routes, helpers של auth/scope, שדות PHI, webhooks/cron' },
    { title: 'Find', detail: '8 סוכנים סורקים את הקוד — כל אחד מחלקת פגיעות אחת' },
    { title: 'Critique', detail: 'מבקר כיסוי — מה לא נבדק (במקביל ל-Find/Verify)' },
    { title: 'Verify', detail: 'אימות יריבי — 3 עדשות מנסות להפריך כל ממצא critical/high/medium' },
    { title: 'Synthesize', detail: 'דה-דופ, תעדוף, דוח סופי בעברית' },
  ],
}

// ---------- הקשר הפרויקט (מוזרק לכל סוכן) ----------
const PROJECT_CONTEXT = `
מערכת: ניהול קליניקה טיפולית ב-T3 Stack (Next.js App Router, TypeScript, Prisma, NextAuth). **מאחסנת PHI — מידע רפואי סודי** (נושאי פגישה topic, הערות notes, תמלולים, תשלומים). כל דליפה = אסון.

תפקידים (roles):
- ADMIN — על-מנהל מערכת (super).
- MANAGER — בעל/ת הקליניקה (owner). יכול/ה דברים ניהוליים בקליניקה שלו, אך לא דברים שרק ADMIN מורשה.
- USER — מטפל/ת. רואה את המטופלים שלו בלבד.
- SECRETARY — מזכירה. גישה מוגבלת: **אסור** לראות PHI כמו topic/notes/תמלול. רואה לוז/תשלומים/פרטי קשר בלבד.

ארכיטקטורה רב-ארגונית (multi-tenant): כל קליניקה/ארגון מבודד. כל שאילתת resource חייבת להיות מסוננת לארגון של המשתמש.

Helpers וקונבנציות מהפרויקט (לחפש שימוש/היעדר שימוש בהם):
- אימות: requireAuth / api-auth.ts. scope: loadScopeUser, buildClientWhere, isSecretary, canSecretaryAccessModel.
- cron: cron-auth.ts (CRON_SECRET). webhooks: webhook-verification.ts / webhook-auth.ts / webhook-replay-protection.ts / cardcom verify-webhook.
- מייל: sanitizeEmailSubject (מניעת header injection), safeHttpUrl/escapeHtml ב-email-utils (מניעת XSS במייל).
- לוגים: logger.ts עם sanitization של PII. **אסור console.* בקוד שמטפל ב-PHI/PII** — עוקף sanitization.
- תשלומים: payment-utils, Prisma Decimal (תמיד "|| 0"), Cardcom (cardcom/*), idempotency.ts.

דפוסים תקינים — **לא** לדווח עליהם כבאג (false positives ידועים):
- Prisma ORM מבצע פרמטריזציה אוטומטית — שאילתות ORM רגילות אינן SQLi (רק $queryRawUnsafe / קונקטנציה ל-$queryRaw הן חשודות).
- &quot; בטקסט JSX = תקין (eslint דורש), לא XSS.
- export const dynamic = "force-dynamic" ב-routes = תקין.
- שדות NEXT_PUBLIC_ נחשפים ללקוח בכוונה — חשוד רק אם מכילים secret אמיתי (מפתח API/סוד).
`.trim()

const KNOWN_HELPERS_HINT = 'requireAuth, loadScopeUser, buildClientWhere, isSecretary, canSecretaryAccessModel, sanitizeEmailSubject, safeHttpUrl, escapeHtml, logger, cron-auth, webhook-verification, webhook-replay-protection, idempotency'

// ---------- 8 מחלקות פגיעות ----------
const DIMENSIONS = [
  {
    key: 'authz',
    title: 'אימות והרשאות',
    focus: `אימות (NextAuth), הרשאות ותפקידים, ניהול session, 2FA, impersonation, איפוס סיסמה.
בדוק: route-ים רגישים בלי requireAuth; בדיקת role חסרה/שגויה (MANAGER מבצע פעולת ADMIN; SECRETARY מבצע פעולת USER); endpoints של setup/make-admin/create-admin שאינם מוגנים; impersonate (start/stop/status) ללא הרשאה; 2FA bypass (האם twoFactorVerifiedForLoginAt נבדק בכל מסלול רגיש?); session fixation/hijacking; דליפת מידע דרך הבדל הודעות שגיאה (403 vs 404) שמאפשר מניית משאבים.`,
  },
  {
    key: 'tenant-idor',
    title: 'בידוד רב-ארגוני ו-IDOR',
    focus: `האם כל שאילתה למשאב מסוננת לארגון/קליניקה של המשתמש? IDOR דרך פרמטר id ב-URL.
בדוק במיוחד: clients/[id], sessions/[id], payments/[id], tasks/[id], notifications/[id], saved-cards/[tokenId], support/[id], intake-questionnaires/[id], recurring-patterns/[id]. האם משתמשים ב-buildClientWhere/scope או רק ב-findUnique({id}) חשוף? קישורי זימון עצמי (token+OTP) — האם ה-token נבדק ולא ניתן לניחוש/replay? questionnaires/[code] — האם הקוד מבודד?`,
  },
  {
    key: 'phi-leak',
    title: 'דליפת PHI/PII',
    focus: `חשיפת מידע רפואי בתגובות API ובלוגים.
בדוק: endpoints שמחזירים topic/notes/transcription למזכירה או למשתמש לא מורשה; over-fetching (select מחזיר שדות רגישים שלא צריך); sessions routes — האם מסננים topic/notes ל-SECRETARY (memory: תוקן, לאמת שלא נסוג); calendar/communications/notifications שעלולים לדלוף PHI ב-subject/body; שימוש ב-console.log/error/warn במקום logger בקוד שמטפל ב-PHI/PII (errorMessage עלול להכיל נתוני מטופל); דליפת PHI ב-URL/query-string שנכנס ללוגים.`,
  },
  {
    key: 'injection-xss',
    title: 'הזרקות ו-XSS',
    focus: `XSS, SQL injection, path traversal, SSRF, open redirect, ולידציית קלט.
בדוק: dangerouslySetInnerHTML עם תוכן משתמש; XSS בגוף מיילי HTML (האם escapeHtml/safeHttpUrl מוחלים על כל ערך דינמי?); $queryRawUnsafe או קונקטנציית מחרוזת ל-$queryRaw; path traversal בהורדות/העלאות קבצים (download/*, support-attachments, cardcom-receipt-pdf) — האם שם הקובץ/נתיב מסונן?; SSRF ב-fetch לכתובת שמקורה במשתמש; open redirect (google-calendar callback, redirect params); כיסוי zod — routes שמקבלים body בלי ולידציה.`,
  },
  {
    key: 'secrets',
    title: 'חשיפת סודות ומפתחות',
    focus: `secrets בקוד, בתגובות, בלוגים, או ב-bundle של הלקוח.
בדוק: מפתחות/סיסמאות/tokens hard-coded; secret שנחשף ב-NEXT_PUBLIC_ בטעות; Cardcom/Google/SMTP credentials בתגובת API או בלוג; tokens (saved-cards, receipt-token, google-oauth-state) שנחשפים ללקוח שלא לצורך; דליפת מפתחות דרך error responses; .env / env.ts — חשיפת משתני סביבה ל-client.`,
  },
  {
    key: 'payments',
    title: 'תשלומים ו-Webhooks',
    focus: `שלמות חיוב ו-webhooks (Cardcom).
בדוק: אימות חתימה/מקור של webhook Cardcom (verify-webhook) — האם תמיד נאכף?; replay protection ו-idempotency על webhooks וחיובים (memory: כל endpoint ב-scheduler חייב אידמפוטנטיות); price/amount tampering — האם הסכום נלקח מהשרת (effective-price/resolve) ולא מהלקוח?; refund/chargeback — האם רק ADMIN מורשה?; subscription bypass — האם אפשר לקבל tier בלי תשלום?; saved-cards/token — שימוש בכרטיס שמור של מטופל אחר; rate-limiting על endpoints של תשלום.`,
  },
  {
    key: 'cron-email',
    title: 'Cron, מתזמן ומייל',
    focus: `אבטחת משימות מתוזמנות ושליחת מיילים/SMS.
בדוק: כל route תחת api/cron/* — האם מוגן ב-cron-auth (CRON_SECRET)? route לא מוגן = הפעלה חיצונית של חיובים/מחיקות; Email Header Injection — האם sanitizeEmailSubject מוחל על **כל** שורת נושא? (memory: 30+ נושאים בלי ניקוי, הוחל רק על זימון עצמי); אידמפוטנטיות/dedup בשליחות (memory: תזכורת מנוי שלחה כל 15 דק' — לאמת CommunicationLog dedup); endpoints של email/send, bulk-send, send-confirmation — הרשאה + הגבלת קצב; test-email/maintenance/seed/make-admin — endpoints מסוכנים שאסור שיהיו פתוחים בפרודקשן.`,
  },
  {
    key: 'web-csrf-headers',
    title: 'CSRF, Headers ו-Cookies',
    focus: `הגנות web רוחביות.
בדוק: CSRF על mutations (NextAuth/SameSite — האם מספיק?); דגלי cookie (httpOnly, secure, sameSite) ל-session ול-token-ים; security headers (CSP, X-Frame-Options, HSTS) — middleware/next.config; CORS פתוח מדי; rate-limiting — כיסוי על login/reset/OTP/booking; open redirect; information disclosure בהודעות שגיאה/stack traces; חשיפת endpoints פנימיים (admin/maintenance/setup) ללא הגנת שכבה.`,
  },
]

// ---------- Schemas ----------
const MAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    routeGroups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          subsystem: { type: 'string' },
          sensitivity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          routes: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
        },
        required: ['subsystem', 'sensitivity', 'routes'],
      },
    },
    authHelpers: { type: 'array', items: { type: 'string' } },
    phiFields: { type: 'array', items: { type: 'string' } },
    publicOrUnauthRoutes: { type: 'array', items: { type: 'string' } },
    webhooks: { type: 'array', items: { type: 'string' } },
    crons: { type: 'array', items: { type: 'string' } },
    middlewareNote: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['routeGroups', 'summary'],
}

const FINDING_PROPS = {
  title: { type: 'string' },
  severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
  file: { type: 'string' },
  line: { type: ['integer', 'null'] },
  vulnClass: { type: 'string' },
  description: { type: 'string' },
  attackScenario: { type: 'string' },
  phiAtRisk: { type: 'boolean' },
  recommendation: { type: 'string' },
  confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  evidence: { type: 'string' },
}

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: FINDING_PROPS,
        required: ['title', 'severity', 'file', 'description', 'recommendation', 'confidence'],
      },
    },
    coverageNotes: { type: 'string' },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    refuted: { type: 'boolean' },
    reasoning: { type: 'string' },
    adjustedSeverity: { type: ['string', 'null'], enum: ['critical', 'high', 'medium', 'low', 'info', null] },
    falsePositiveReason: { type: ['string', 'null'] },
  },
  required: ['refuted', 'reasoning'],
}

const CRITIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    coverageGaps: { type: 'array', items: { type: 'string' } },
    uncoveredSubsystems: { type: 'array', items: { type: 'string' } },
    suggestedFollowups: { type: 'array', items: { type: 'string' } },
  },
  required: ['coverageGaps'],
}

const SYNTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summaryHe: { type: 'string' },
    criticalCount: { type: 'integer' },
    highCount: { type: 'integer' },
    mediumCount: { type: 'integer' },
    lowCount: { type: 'integer' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rank: { type: 'integer' },
          title: { type: 'string' },
          titleHe: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          file: { type: 'string' },
          line: { type: ['integer', 'null'] },
          vulnClass: { type: 'string' },
          phiAtRisk: { type: 'boolean' },
          explanationHe: { type: 'string' },
          recommendationHe: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          verifyVotes: { type: 'string' },
        },
        required: ['title', 'severity', 'file', 'explanationHe', 'recommendationHe'],
      },
    },
    coverageGapsHe: { type: 'array', items: { type: 'string' } },
    nextStepsHe: { type: 'array', items: { type: 'string' } },
  },
  required: ['summaryHe', 'findings'],
}

// ---------- מצב ----------
const mode = (args && args.mode) || 'full'
const note = (args && args.note) || ''
const scopeLine = mode === 'diff'
  ? 'מצב DIFF: התמקד **רק** בקבצים ששונו. הרץ `git diff HEAD --stat` ו-`git diff HEAD -- <file>` כדי לראות את השינויים, וכן `git status`. בדוק את הקוד החדש/המשונה ואת הצרכנים הישירים שלו.'
  : 'מצב FULL: ביקורת אבטחה מלאה של כל הקוד הרלוונטי למחלקת הפגיעות שלך. השתמש ב-Grep/Glob/Read רחב כדי לסרוק את כל ה-routes וה-lib.'

// ---------- Phase 1: מיפוי ----------
phase('Map')
const map = await agent(
  `אתה סוכן מיפוי משטח-תקיפה לביקורת אבטחה. ${PROJECT_CONTEXT}

${scopeLine}
${note ? 'הערת המשתמש: ' + note : ''}

משימה: מפה את משטח התקיפה של המערכת. עבור על src/app/api/**/route.ts ועל src/lib. החזר:
- routeGroups: קבץ את כל ה-routes לפי תת-מערכת (auth, payments, cardcom, sessions, clients, cron, admin, integrations, email, impersonation, self-booking וכו') עם דירוג רגישות.
- authHelpers: היכן מוגדרים helpers של auth/scope (requireAuth, loadScopeUser, buildClientWhere, isSecretary...).
- phiFields: אילו שדות נחשבים PHI במודלים (topic, notes, transcription וכו').
- publicOrUnauthRoutes: routes שנראים ללא אימות (setup/make-admin, create-admin, test-email, seed, maintenance, questionnaires/[code], self-booking, webhooks).
- webhooks, crons: רשימת נקודות כניסה אוטומטיות.
- middlewareNote: האם קיים middleware (root/src) ומה הוא אוכף (headers/auth/rate-limit)? אם אין — ציין.
- summary: 4-6 משפטים על המבנה והאזורים המסוכנים ביותר.

עבוד מהיר אבל יסודי. אל תתקן כלום — מיפוי בלבד.`,
  { schema: MAP_SCHEMA, label: 'attack-surface-map', phase: 'Map' },
)

const mapBrief = JSON.stringify({
  summary: map.summary,
  authHelpers: map.authHelpers || [],
  phiFields: map.phiFields || [],
  publicOrUnauthRoutes: map.publicOrUnauthRoutes || [],
  webhooks: map.webhooks || [],
  crons: map.crons || [],
  middlewareNote: map.middlewareNote || '',
  routeGroups: (map.routeGroups || []).map(g => ({ subsystem: g.subsystem, sensitivity: g.sensitivity, count: (g.routes || []).length })),
}).slice(0, 6000)

log(`מיפוי הושלם: ${(map.routeGroups || []).length} תת-מערכות. מתחיל סריקה ב-${DIMENSIONS.length} מחלקות פגיעות + מבקר כיסוי.`)

// ---------- עזר: אימות יריבי לממצא בודד ----------
const LENSES = [
  { key: 'exploitability', prompt: 'עדשת "ניצולות": האם תוקף יכול **בפועל** להגיע לקוד הזה ולהפעיל אותו? האם יש auth/scope/guard במעלה הזרם שכבר חוסם את התרחיש? אם המסלול לא ניתן לניצול מעשי — refuted=true.' },
  { key: 'code-correctness', prompt: 'עדשת "נכונות קוד": קרא את הקובץ והשורות בפועל. האם הקוד עושה את מה שהממצא טוען? חפש guard/בדיקה שהממצא פספס (requireAuth, buildClientWhere, role check). אם הקוד למעשה מוגן — refuted=true.' },
  { key: 'compensating-controls', prompt: 'עדשת "בקרות מפצות/הקשר": האם קיימת הגנה במקום אחר (middleware, helper, ברירת מחדל של framework, Prisma parametrization, sanitizer) שמנטרלת את הבעיה? האם זה קוד מת/טסט/mock? אם מנוטרל — refuted=true.' },
]

async function verifyFinding(f, dimKey) {
  const sev = f.severity || 'medium'
  if (sev === 'low' || sev === 'info') {
    return { ...f, vulnClass: f.vulnClass || dimKey, _dim: dimKey, survived: true, verified: false, realVotes: 0, totalVotes: 0 }
  }
  const verdicts = await parallel(
    LENSES.map(lens => () =>
      agent(
        `אתה מאמת אבטחה יריב. ${PROJECT_CONTEXT}

מפת המערכת (תקציר): ${mapBrief}

ממצא לבדיקה (נמצא ע"י סוכן ${dimKey}):
- כותרת: ${f.title}
- חומרה: ${sev}
- קובץ: ${f.file}${f.line ? ':' + f.line : ''}
- תיאור: ${f.description}
- תרחיש תקיפה: ${f.attackScenario || '—'}
- ראיה: ${f.evidence || '—'}

${lens.prompt}

קרא את הקוד בפועל (Read/Grep) לפני שאתה מכריע. נטל ההוכחה: ${(sev === 'critical' || sev === 'high') ? 'מאחר שזה ' + sev + ' ונוגע אולי ל-PHI — הפרך רק אם יש ראיה ברורה שזה לא אמיתי או לא ניתן לניצול.' : 'הפרך אם אינך מוצא ראיה קונקרטית שזו בעיה אמיתית וניתנת לניצול.'}
החזר refuted (true=לא בעיה אמיתית), reasoning, ובמידת הצורך adjustedSeverity.`,
        { schema: VERDICT_SCHEMA, label: `verify:${dimKey}:${lens.key}`, phase: 'Verify' },
      ),
    ),
  )
  const v = verdicts.filter(Boolean)
  const realVotes = v.filter(x => !x.refuted).length
  const threshold = (sev === 'critical' || sev === 'high') ? 1 : 2
  // התאמת חומרה אם שני מאמתים+ הציעו להוריד
  const downgrades = v.map(x => x.adjustedSeverity).filter(Boolean)
  return {
    ...f,
    vulnClass: f.vulnClass || dimKey,
    _dim: dimKey,
    survived: realVotes >= threshold,
    verified: true,
    realVotes,
    totalVotes: v.length,
    verdictReasons: v.map(x => x.reasoning),
    suggestedDowngrades: downgrades,
  }
}

// ---------- Phase 2+3+4: Find → Verify (pipeline) במקביל למבקר ----------
const findThenVerify = pipeline(
  DIMENSIONS,
  d =>
    agent(
      `אתה סוכן ביקורת אבטחה המתמחה ב: **${d.title}**. ${PROJECT_CONTEXT}

מפת המערכת (תקציר): ${mapBrief}

${scopeLine}
${note ? 'הערת המשתמש: ' + note : ''}

מוקד הבדיקה שלך:
${d.focus}

הנחיות:
- סרוק את הקוד בפועל עם Grep/Glob/Read. אל תנחש — צטט file:line וקטע קוד כראיה.
- דווח רק על בעיות **אמיתיות וניתנות לניצול בקוד הזה**, לא עצות גנריות. עדיף מעט ממצאים מדויקים מהרבה רעש.
- הימנע מה-false-positives הידועים שצוינו בהקשר.
- לכל ממצא: severity, file, line, vulnClass, description, attackScenario (איך תוקף מנצל), phiAtRisk (האם נחשף מידע רפואי), recommendation (תיקון קונקרטי), confidence, evidence (קטע קוד).
- אל תתקן כלום — דיווח בלבד.
- ב-coverageNotes ציין מה בדקת ומה לא הספקת.`,
      { schema: FINDINGS_SCHEMA, label: `find:${d.key}`, phase: 'Find' },
    ),
  (res, d) => {
    const findings = (res && res.findings) || []
    if (findings.length === 0) return []
    return parallel(findings.map(f => () => verifyFinding(f, d.key)))
  },
)

phase('Critique')
const critique = agent(
  `אתה מבקר כיסוי לביקורת אבטחה. ${PROJECT_CONTEXT}

מפת המערכת: ${mapBrief}

מחלקות הפגיעות שכבר מכוסות ע"י סוכנים אחרים: ${DIMENSIONS.map(d => d.title).join(' | ')}.

משימה: זהה מה **לא** מכוסה. חשוב על: תת-מערכות מהמפה שאף מחלקה לא נוגעת בהן; מחלקות פגיעות שחסרות (למשל: business-logic abuse, mass assignment, race conditions/TOCTOU בתשלומים, file upload type/size, GraphQL/tRPC אם קיים, dependency vulns, נתוני audit-log, מחיקות/retention, timezone/DST בהקשר אבטחה); אזורים רגישים שראויים לסבב עמוק יותר.
החזר coverageGaps (פערים קונקרטיים), uncoveredSubsystems, suggestedFollowups. השתמש ב-Grep/Glob לאימות מהיר.`,
  { schema: CRITIC_SCHEMA, label: 'completeness-critic', phase: 'Critique' },
)

const [perDim, critic] = await Promise.all([findThenVerify, critique])

// ---------- איסוף ----------
const allVerified = perDim.flat().filter(Boolean)
const confirmed = allVerified.filter(f => f.survived)
const dropped = allVerified.filter(f => !f.survived)
log(`סריקה+אימות הושלמו: ${allVerified.length} ממצאים גולמיים → ${confirmed.length} אומתו, ${dropped.length} סוננו (הופרכו).`)

// ---------- Phase 5: סיכום ----------
phase('Synthesize')
const confirmedForSynth = confirmed.map(f => ({
  title: f.title,
  severity: f.severity,
  file: f.file,
  line: f.line || null,
  vulnClass: f.vulnClass,
  phiAtRisk: !!f.phiAtRisk,
  description: f.description,
  attackScenario: f.attackScenario || '',
  recommendation: f.recommendation,
  confidence: f.confidence,
  verify: f.verified ? `${f.realVotes}/${f.totalVotes} מאמתים אישרו` : 'לא עבר אימות יריבי (low/info)',
  suggestedDowngrades: f.suggestedDowngrades || [],
}))

const synth = await agent(
  `אתה כותב דוח ביקורת אבטחה סופי עבור **מטפל שאינו מתכנת**, דובר עברית. ${PROJECT_CONTEXT}

להלן ${confirmedForSynth.length} ממצאים שאומתו (אחרי אימות יריבי). דה-דפלקט ממצאים כפולים (אותו קובץ+בעיה), אחד את מה שחופף, ותעדף לפי חומרה ואז לפי סיכון PHI.

ממצאים (JSON):
${JSON.stringify(confirmedForSynth).slice(0, 14000)}

פערי כיסוי שזוהו ע"י המבקר (JSON):
${JSON.stringify({ coverageGaps: critic && critic.coverageGaps, uncovered: critic && critic.uncoveredSubsystems, followups: critic && critic.suggestedFollowups }).slice(0, 3000)}

הפק:
- summaryHe: סיכום מנהלים בעברית פשוטה (3-5 משפטים): כמה בעיות, מה הכי דחוף, האם יש סיכון לדליפת מידע רפואי.
- criticalCount/highCount/mediumCount/lowCount.
- findings ממוינים (rank=1 הכי דחוף): title (אנגלית טכני), titleHe (עברית), severity, file, line, vulnClass, phiAtRisk, explanationHe (הסבר פשוט בעברית מה הבעיה והסיכון), recommendationHe (מה לתקן, בעברית), confidence, verifyVotes.
- coverageGapsHe: פערי כיסוי בעברית.
- nextStepsHe: 3-6 צעדים מומלצים בעברית, מתועדפים.
שמור נתיבי קבצים וקוד באנגלית; כל הסבר/המלצה בעברית.`,
  { label: 'final-report', phase: 'Synthesize' },
).catch(() => 'סיכום טקסטואלי נכשל — ראה confirmedFindings למטה.')

return {
  mode,
  report: synth,
  confirmedFindings: confirmedForSynth,
  coverageGaps: critic || null,
  stats: {
    rawFindings: allVerified.length,
    confirmed: confirmed.length,
    dropped: dropped.length,
    byDimension: DIMENSIONS.map(d => ({
      dim: d.key,
      confirmed: confirmed.filter(f => f._dim === d.key).length,
      dropped: dropped.filter(f => f._dim === d.key).length,
    })),
  },
  droppedFindings: dropped.map(f => ({ title: f.title, file: f.file, dim: f._dim, votes: `${f.realVotes}/${f.totalVotes}`, reasons: f.verdictReasons })),
  attackSurface: { routeGroups: (map.routeGroups || []).length, summary: map.summary },
}
