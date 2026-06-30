// מנוע פרשנות שאלונים — טהור, ללא תלות ב-React/DB/AI.
//
// שתי שכבות:
//   1. שכבה אוטומטית (fallback) — מרכיבה ניתוח מובנה מנתוני ה-scoring שכבר
//      קיימים בכל אחד מ-38 השאלונים (ranges/subscales/criticalItems/maxScore).
//      כך כל שאלון מחזיר ניתוח תקין מיד, בלי כתיבה ידנית.
//   2. שכבת תוכן עשיר — אם קיים InterpretationSpec עבור ה-code (כרגע BDI2 בלבד),
//      המנוע מעשיר את הניתוח בפסקאות קליניות, אשכולות ופרוטוקול סיכון כתובים ביד.
//
// ⚠️ אלה כלי סינון לתמיכה בשיקול הדעת הקליני — לא אבחנה רפואית. ראו DISCLAIMER.

import {
  getInterpretationSpec,
  type InterpretationSpec,
} from "@/data/questionnaire-interpretations";

// ---------------------------------------------------------------------------
// טייפים ציבוריים
// ---------------------------------------------------------------------------

export type RiskLevel = "info" | "warning" | "critical";
export type Severity = "none" | "low" | "moderate" | "high";

export interface RiskFlag {
  level: RiskLevel;
  title: string;
  body: string;
}

export interface SubscaleResult {
  key: string;
  name: string;
  score: number;
  maxScore?: number;
  /** מעל/מתחת לסף או תווית טווח, אם זמין */
  level?: string;
  note?: string;
  over?: boolean; // מעל cutoff
}

export interface LevelInfo {
  label: string;
  description: string;
}

export interface Interpretation {
  code: string;
  title: string;
  category: string | null;
  domain: Domain;
  totalScore: number;
  maxScore: number;
  percentage: number;
  /** רמה כוללת מתוך ranges; null בשאלונים מבוססי תת-סולמות בלבד */
  level: LevelInfo | null;
  severity: Severity;
  /** כותרת חד-שורתית שתמיד קיימת */
  headline: string;
  /** פסקאות עשירות (קיים רק כשיש InterpretationSpec) */
  richBody?: string[];
  /** "על מה לשים לב" */
  watchFor: string[];
  recommendations: string[];
  followUp?: string;
  subscales: SubscaleResult[];
  riskFlags: RiskFlag[];
  disclaimer: string;
  /** שקיפות: מאיפה הגיע הניתוח */
  source: "rich" | "auto";

  // --- שכבות העשרה (מאוכלסות רק כשקיים InterpretationSpec, כרגע BDI2) ---
  /** מוקדי המצוקה הבולטים — הפריטים שסומנו הכי גבוה */
  topItems?: ScoredItem[];
  /** אזורי חוסן — פריטים שסומנו 0 */
  strengths?: ScoredItem[];
  /** חתימה/דפוס המצוקה */
  pattern?: PatternInfo | null;
  /** שאלות מומלצות לבירור בפגישה הבאה */
  questionsToAsk?: string[];
  /** יעדי טיפול מוצעים */
  treatmentTargets?: string[];
  /** סיכום קליני נרטיבי (פסקה לרשומה) */
  narrative?: string;
  /** שינוי לעומת מדידה קודמת */
  change?: ChangeInfo;
  /** שאלונים משלימים מומלצים */
  complementary?: ComplementarySuggestion[];
  /** כיווני אבחנה מבדלת לשלילה (לא אבחנה) */
  differential?: string[];
}

export interface ScoredItem {
  id: number;
  title: string;
  value: number;
  max: number;
  /** טקסט האפשרות שנבחרה */
  text?: string;
}

export interface PatternInfo {
  key: string;
  name: string;
  description: string;
}

export interface ComplementarySuggestion {
  code: string;
  name: string;
  reason: string;
}

export interface ChangeInfo {
  previousScore: number;
  previousDate?: string | null;
  delta: number;
  direction: "improved" | "worsened" | "stable";
  magnitude: "קל" | "בינוני" | "משמעותי";
  note: string;
}

/** הקשר מחושב המועבר לפונקציות התוכן העשיר. */
export interface RichContext {
  domain: Domain;
  totalScore: number;
  maxScore: number;
  percentage: number;
  level: LevelInfo | null;
  severity: Severity;
  clusters: Array<{
    key: string;
    name: string;
    score: number;
    max: number;
    ratio: number;
  }>;
  items: ScoredItem[];
  topItems: ScoredItem[];
  strengths: ScoredItem[];
  hasRisk: boolean;
  change?: ChangeInfo;
  /** ערך פריט לפי id (0 אם לא נענה) */
  item: (id: number) => number;
}

export interface InterpretOptions {
  /** מדידה קודמת של אותו שאלון לאותו מטופל — להשוואת שינוי */
  previous?: { totalScore?: number | null; completedAt?: string | null } | null;
}

export interface DomainSummary {
  domain: Domain;
  label: string;
  severity: Severity;
  /** תיאורי הפריטים שתרמו לדומיין (שם שאלון + רמה) */
  items: string[];
}

export interface CombinedInterpretation {
  domains: DomainSummary[];
  riskFlags: RiskFlag[];
  /** תבניות חוצות-דומיינים (קומורבידיות, תמונה מעורבת וכו') */
  patterns: string[];
  summary: string;
  disclaimer: string;
}

// קלט מינימלי — מה שבאמת מגיע מה-DB / ה-seed.
export interface ScoringRange {
  min: number;
  max: number;
  label: string;
  description?: string;
}
export interface ScoringSubscale {
  name?: string;
  items?: number[] | number;
  cutoff?: number;
  maxScore?: number;
  ranges?: ScoringRange[];
}
export interface Scoring {
  ranges?: ScoringRange[];
  maxScore?: number;
  subscales?: Record<string, ScoringSubscale>;
  criticalItems?: number[];
  [key: string]: unknown;
}
export interface TemplateLike {
  code: string;
  name: string;
  category?: string | null;
  questions: Array<{
    id: number;
    title?: string;
    section?: string;
    isCritical?: boolean;
    options?: Array<{ value: number; text?: string; score?: number }>;
  }>;
  scoring?: Scoring | null;
}
export interface ResponseLike {
  answers?: Array<{ value?: number; text?: string; score?: number }> | null;
  totalScore?: number | null;
  subscores?: Record<string, number> | null;
}

// ---------------------------------------------------------------------------
// קבועים
// ---------------------------------------------------------------------------

export const DISCLAIMER =
  "ניתוח זה הוא כלי סינון לתמיכה בשיקול הדעת הקליני בלבד, ואינו מהווה אבחנה רפואית או פסיכיאטרית. " +
  "יש לפרש את התוצאה בהקשר הקליני הכולל, בשילוב ראיון, התרשמות ושיקול דעת מקצועי.";

export type Domain =
  | "depression"
  | "anxiety"
  | "trauma"
  | "risk"
  | "sleep"
  | "eating"
  | "parenting"
  | "personality"
  | "functioning"
  | "wellbeing"
  | "attention"
  | "addiction"
  | "dissociation"
  | "ocd"
  | "cognition"
  | "mood"
  | "attachment"
  | "general";

export const DOMAIN_LABEL: Record<Domain, string> = {
  depression: "דיכאון / מצב רוח",
  anxiety: "חרדה",
  trauma: "טראומה ופוסט-טראומה",
  risk: "סיכון",
  sleep: "שינה",
  eating: "הפרעות אכילה",
  parenting: "הורות ומשפחה",
  personality: "אישיות",
  functioning: "תפקוד",
  wellbeing: "רווחה נפשית",
  attention: "קשב וריכוז",
  addiction: "התמכרויות",
  dissociation: "דיסוציאציה",
  ocd: "טורדנות-כפייתיות",
  cognition: "דפוסי חשיבה",
  mood: "מצב רוח",
  attachment: "התקשרות",
  general: "כללי",
};

// מיפוי קוד → דומיין. מקור אמת לניתוח המשולב.
const DOMAIN_BY_CODE: Record<string, Domain> = {
  BDI2: "depression",
  PHQ9: "depression",
  EPDS: "depression",
  CDI2: "depression",
  SCID5_DEPRESSION: "depression",
  GAD7: "anxiety",
  BAI: "anxiety",
  HAMA: "anxiety",
  SPIN: "anxiety",
  SCARED: "anxiety",
  PCL5: "trauma",
  CAPS5: "trauma",
  ACE: "trauma",
  CTQ: "trauma",
  ITQ: "trauma",
  BHS: "risk",
  ISI: "sleep",
  EAT26: "eating",
  PSI_SF: "parenting",
  SDQ_PARENT: "parenting",
  ECBI: "parenting",
  APQ: "parenting",
  MSI_BPD: "personality",
  PDQ4: "personality",
  WHODAS2: "functioning",
  WEMWBS: "wellbeing",
  CONNERS3: "attention",
  ASRS: "attention",
  VADPRS: "attention",
  AUDIT: "addiction",
  DES: "dissociation",
  OCIR: "ocd",
  RRS: "cognition",
  MDQ: "mood",
  ECR_R: "attachment",
  PBI: "attachment",
  CBCL: "general",
  BPS: "general",
};

// בדומיינים אלה ציון גבוה = מצב טוב יותר (הכיוון הפוך לסולמות תסמינים).
const HIGHER_IS_BETTER: Set<Domain> = new Set<Domain>(["wellbeing"]);

const CATEGORY_TO_DOMAIN: Record<string, Domain> = {
  דיכאון: "depression",
  "מצב רוח": "mood",
  חרדה: "anxiety",
  טראומה: "trauma",
  סיכון: "risk",
  שינה: "sleep",
  "הפרעות אכילה": "eating",
  הורים: "parenting",
  "הפרעות אישיות": "personality",
  תפקוד: "functioning",
  רווחה: "wellbeing",
  "קשב וריכוז": "attention",
  התמכרויות: "addiction",
  דיסוציאציה: "dissociation",
  OCD: "ocd",
  קוגניציה: "cognition",
  התקשרות: "attachment",
};

export function domainForTemplate(template: TemplateLike): Domain {
  return (
    DOMAIN_BY_CODE[template.code] ||
    (template.category ? CATEGORY_TO_DOMAIN[template.category] : undefined) ||
    "general"
  );
}

// ---------------------------------------------------------------------------
// עזרי חישוב
// ---------------------------------------------------------------------------

/** ניקוד פריט בודד: score גובר על value (כלים עם ניקוד נפרד), אחרת value. */
function itemPoints(a?: { value?: number; score?: number }): number {
  if (!a) return 0;
  return a.score ?? a.value ?? 0;
}

/** מחשב את הניקוד המרבי האפשרי כשאין maxScore מוגדר. */
function computeMaxScore(template: TemplateLike): number {
  let max = 0;
  for (const q of template.questions || []) {
    if (!q.options || q.options.length === 0) continue;
    const optMax = Math.max(
      ...q.options.map((o) => o.score ?? o.value ?? 0)
    );
    if (Number.isFinite(optMax)) max += optMax;
  }
  return max;
}

/** ניקוד כולל — מעדיף את הערך השמור, אחרת מסכם מהתשובות. */
function resolveTotal(template: TemplateLike, response: ResponseLike): number {
  if (typeof response.totalScore === "number") return response.totalScore;
  let total = 0;
  for (const a of response.answers || []) total += itemPoints(a);
  return total;
}

function findRange(ranges: ScoringRange[] | undefined, score: number) {
  if (!ranges || ranges.length === 0) return null;
  return (
    ranges.find((r) => score >= r.min && score <= r.max) ||
    // אם נפל מחוץ לטווחים — נצמד לקרוב ביותר.
    [...ranges].sort((a, b) => a.min - b.min).find((r) => score <= r.max) ||
    ranges[ranges.length - 1]
  );
}

/** חומרה ניטרלית-לתווית: לפי מיקום הטווח, עם היפוך בדומיינים "גבוה=טוב". */
function severityFromRange(
  ranges: ScoringRange[],
  matched: ScoringRange,
  domain: Domain
): Severity {
  const sorted = [...ranges].sort((a, b) => a.min - b.min);
  const n = sorted.length;
  const idx = sorted.findIndex(
    (r) => r.min === matched.min && r.max === matched.max
  );
  if (idx < 0 || n <= 1) return "moderate";
  const concernIdx = HIGHER_IS_BETTER.has(domain) ? n - 1 - idx : idx;
  const ratio = concernIdx / (n - 1);
  if (ratio <= 0) return "none";
  if (ratio < 0.5) return "low";
  if (ratio < 1) return "moderate";
  return "high";
}

const SEVERITY_RANK: Record<Severity, number> = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
};
const SEVERITY_LABEL: Record<Severity, string> = {
  none: "תקין",
  low: "קל",
  moderate: "בינוני",
  high: "גבוה",
};

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

// המלצות גנריות אוטומטיות לפי חומרה (משמשות כשאין תוכן עשיר).
function autoRecommendations(severity: Severity, domain: Domain): string[] {
  if (HIGHER_IS_BETTER.has(domain)) {
    switch (severity) {
      case "none":
        return ["רמת הרווחה הנפשית בטווח התקין; כדאי לחזק ולשמר משאבים קיימים."];
      case "low":
        return [
          "רמת הרווחה הנפשית מעט נמוכה; כדאי לברר גורמים מעכבים ולחזק משאבי התמודדות.",
        ];
      default:
        return [
          "רמת הרווחה הנפשית נמוכה; מומלץ לברר מצוקה נלווית ולשקול התערבות תומכת.",
        ];
    }
  }
  switch (severity) {
    case "none":
      return [
        "התוצאה בטווח התקין. אין אינדיקציה להתערבות ייעודית; ניתן להמשיך במעקב שגרתי.",
      ];
    case "low":
      return [
        "תסמינים קלים. מומלץ מעקב ושיחה ממוקדת, ולשקול הערכה חוזרת בעוד מספר שבועות.",
      ];
    case "moderate":
      return [
        "תסמינים בעוצמה בינונית. מומלץ לשקול התערבות טיפולית ממוקדת ומעקב צמוד יותר.",
      ];
    case "high":
      return [
        "התוצאה מצביעה על עוצמה גבוהה של תסמינים. מומלץ הערכה קלינית מעמיקה ושקילת התערבות מתאימה בהקדם.",
      ];
  }
}

// ---------------------------------------------------------------------------
// תת-סולמות
// ---------------------------------------------------------------------------

function buildSubscales(
  template: TemplateLike,
  response: ResponseLike
): SubscaleResult[] {
  const meta = template.scoring?.subscales;
  if (!meta) return [];
  const subscores = response.subscores || {};
  const results: SubscaleResult[] = [];
  for (const [key, m] of Object.entries(meta)) {
    if (!m || typeof m !== "object") continue;
    const score = typeof subscores[key] === "number" ? subscores[key] : 0;
    const over =
      typeof m.cutoff === "number" ? score >= m.cutoff : undefined;
    let level: string | undefined;
    if (m.ranges) {
      level = findRange(m.ranges, score)?.label;
    } else if (typeof over === "boolean") {
      level = over ? "מעל הסף" : "מתחת לסף";
    }
    results.push({
      key,
      name: m.name || key,
      score,
      maxScore: m.maxScore,
      level,
      over,
      note:
        over === true
          ? `הציון בתת-הסולם חצה את סף ההתייחסות (${m.cutoff}).`
          : undefined,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// דגלי סיכון אוטומטיים (פריטים קריטיים + דומיין סיכון)
// ---------------------------------------------------------------------------

function autoRiskFlags(
  template: TemplateLike,
  response: ResponseLike,
  domain: Domain,
  overallSeverity: Severity
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const criticalIds = template.scoring?.criticalItems || [];
  const answers = response.answers || [];

  for (const critId of criticalIds) {
    const idx = (template.questions || []).findIndex((q) => q.id === critId);
    if (idx < 0) continue;
    const val = itemPoints(answers[idx]);
    if (val >= 1) {
      const q = template.questions[idx];
      flags.push({
        level: val >= 2 ? "critical" : "warning",
        title: `פריט קריטי: ${q.title || `שאלה ${critId}`}`,
        body:
          "המטופל סימן תשובה המעידה על סיכון אפשרי בפריט זה. יש לברר זאת ישירות " +
          "עם המטופל בהקדם, להעריך מסוכנות, ולשקול התייעצות / הפניה בהתאם לפרוטוקול.",
      });
    }
  }

  if (domain === "risk" && SEVERITY_RANK[overallSeverity] >= 2) {
    flags.push({
      level: overallSeverity === "high" ? "critical" : "warning",
      title: "ציון מוגבר בכלי הערכת סיכון",
      body:
        "התוצאה בכלי זה מצביעה על רמת סיכון מוגברת. מומלץ להעמיק בהערכת מסוכנות " +
        "ולשקול תכנית בטיחות והתייעצות מקצועית.",
    });
  }

  return flags;
}

// ---------------------------------------------------------------------------
// פרשנות לתגובה בודדת
// ---------------------------------------------------------------------------

export function interpretResponse(
  template: TemplateLike,
  response: ResponseLike,
  opts?: InterpretOptions
): Interpretation {
  const domain = domainForTemplate(template);
  const total = resolveTotal(template, response);
  const maxScore =
    template.scoring?.maxScore && template.scoring.maxScore > 0
      ? template.scoring.maxScore
      : computeMaxScore(template);
  const percentage = maxScore > 0 ? Math.round((total / maxScore) * 100) : 0;

  const ranges = template.scoring?.ranges;
  const matched = findRange(ranges, total);
  const level: LevelInfo | null = matched
    ? { label: matched.label, description: matched.description || "" }
    : null;

  const subscales = buildSubscales(template, response);

  // חומרה כוללת
  let severity: Severity;
  if (matched && ranges) {
    severity = severityFromRange(ranges, matched, domain);
  } else if (subscales.length > 0) {
    const overCount = subscales.filter((s) => s.over).length;
    severity = overCount >= 2 ? "high" : overCount === 1 ? "moderate" : "none";
  } else {
    severity = "none";
  }

  const spec = getInterpretationSpec(template.code);

  // דגלי סיכון — פרוטוקול עשיר אם קיים, אחרת אוטומטי.
  let riskFlags: RiskFlag[];
  if (spec?.criticalProtocol) {
    riskFlags = applyCriticalProtocol(spec, template, response);
  } else {
    riskFlags = autoRiskFlags(template, response, domain, severity);
  }

  // בסיס אוטומטי
  const base: Interpretation = {
    code: template.code,
    title: template.name,
    category: template.category ?? null,
    domain,
    totalScore: total,
    maxScore,
    percentage,
    level,
    severity,
    headline: buildHeadline(level, subscales, total, maxScore),
    watchFor: [],
    recommendations: autoRecommendations(severity, domain),
    subscales,
    riskFlags,
    disclaimer: DISCLAIMER,
    source: "auto",
  };

  // העשרה מתוכן כתוב-ביד, אם קיים לרמה הנוכחית.
  if (spec) {
    const rich = spec.levels?.find((l) =>
      level ? l.matches(level.label, severity) : l.matches("", severity)
    );
    if (rich) {
      base.richBody = rich.body;
      base.watchFor = rich.watchFor || [];
      base.recommendations = rich.recommendations || base.recommendations;
      base.followUp = rich.followUp;
      base.source = "rich";
    }
    // אשכולות מחושבים מהתשובות הגולמיות (למשל קוגניטיבי מול סומטי ב-BDI2).
    const clusterCtx: RichContext["clusters"] = [];
    if (spec.clusters) {
      for (const c of spec.clusters) {
        const { score, max } = clusterScore(c.itemIds, template, response);
        clusterCtx.push({
          key: c.key,
          name: c.name,
          score,
          max,
          ratio: max > 0 ? score / max : 0,
        });
        base.subscales.push({
          key: c.key,
          name: c.name,
          score,
          maxScore: max,
          note: c.interpret(score, max),
        });
      }
    }

    // --- שכבות העשרה (פרסונליזציה / כלים / מעקב) ---
    const items = buildScoredItems(template, response);
    const topItems = pickTopItems(items);
    const strengths = pickStrengths(items);
    const hasRisk = riskFlags.length > 0;
    const change = computeChange(total, maxScore, domain, opts?.previous);

    const ctx: RichContext = {
      domain,
      totalScore: total,
      maxScore,
      percentage,
      level,
      severity,
      clusters: clusterCtx,
      items,
      topItems,
      strengths,
      hasRisk,
      change,
      item: (id: number) => items.find((it) => it.id === id)?.value ?? 0,
    };

    base.topItems = topItems;
    base.strengths = strengths;
    base.change = change;
    base.pattern = spec.detectPattern ? spec.detectPattern(ctx) : null;
    base.questionsToAsk = spec.questionsToAsk ? spec.questionsToAsk(ctx) : [];
    base.treatmentTargets = spec.treatmentTargets
      ? spec.treatmentTargets(ctx)
      : [];
    base.complementary = spec.complementary ? spec.complementary(ctx) : [];
    base.differential = spec.differential ? spec.differential(ctx) : [];
    base.narrative = buildNarrative(base, ctx);
  }

  return base;
}

// פריטים מנוקדים מהתשובות הגולמיות (רק פריטים בעלי אפשרויות מנוקדות).
function buildScoredItems(
  template: TemplateLike,
  response: ResponseLike
): ScoredItem[] {
  const answers = response.answers || [];
  const out: ScoredItem[] = [];
  template.questions.forEach((q, idx) => {
    if (!q.options || q.options.length === 0) return;
    const a = answers[idx];
    const value = itemPoints(a);
    const max = Math.max(...q.options.map((o) => o.score ?? o.value ?? 0));
    if (!Number.isFinite(max) || max <= 0) return;
    out.push({
      id: q.id,
      title: q.title || `שאלה ${q.id}`,
      value,
      max,
      text: a?.text,
    });
  });
  return out;
}

// מוקדי מצוקה — הפריטים הגבוהים. מעדיף ערך מוחלט גבוה, עד 4.
function pickTopItems(items: ScoredItem[]): ScoredItem[] {
  const sorted = [...items].sort(
    (a, b) => b.value / b.max - a.value / a.max || b.value - a.value
  );
  const strong = sorted.filter((it) => it.value >= 2);
  const pool = strong.length > 0 ? strong : sorted.filter((it) => it.value >= 1);
  return pool.slice(0, 4);
}

// אזורי חוסן — פריטים שסומנו 0 (עד 4).
function pickStrengths(items: ScoredItem[]): ScoredItem[] {
  return items.filter((it) => it.value === 0).slice(0, 4);
}

// שינוי לעומת מדידה קודמת. סף יחסי ל-maxScore כדי להכליל בין כלים.
function computeChange(
  total: number,
  maxScore: number,
  domain: Domain,
  previous?: InterpretOptions["previous"]
): ChangeInfo | undefined {
  if (!previous || typeof previous.totalScore !== "number") return undefined;
  const prev = previous.totalScore;
  const delta = total - prev;
  const absRatio = maxScore > 0 ? Math.abs(delta) / maxScore : 0;
  const betterWhenUp = HIGHER_IS_BETTER.has(domain);
  const improved = betterWhenUp ? delta > 0 : delta < 0;

  let direction: ChangeInfo["direction"];
  let magnitude: ChangeInfo["magnitude"];
  if (absRatio < 0.05 || delta === 0) {
    direction = "stable";
    magnitude = "קל";
  } else {
    direction = improved ? "improved" : "worsened";
    magnitude = absRatio >= 0.15 ? "משמעותי" : absRatio >= 0.08 ? "בינוני" : "קל";
  }

  const word =
    direction === "stable"
      ? "ללא שינוי מהותי"
      : direction === "improved"
        ? `שיפור ${magnitude}`
        : `החמרה ${magnitude}`;
  const dateStr = previous.completedAt
    ? ` (${new Date(previous.completedAt).toLocaleDateString("he-IL")})`
    : "";
  const note =
    direction === "stable"
      ? `התוצאה יציבה לעומת המדידה הקודמת (${prev}${dateStr}).`
      : `${word} של ${Math.abs(delta)} נק' לעומת המדידה הקודמת (${prev}${dateStr}).`;

  return { previousScore: prev, previousDate: previous.completedAt, delta, direction, magnitude, note };
}

// סיכום קליני נרטיבי — פסקה לרשומה, מורכבת מהממצאים המובנים.
function buildNarrative(base: Interpretation, ctx: RichContext): string {
  const parts: string[] = [];
  const lvl = ctx.level?.label || SEVERITY_LABEL[ctx.severity];
  parts.push(`התמונה מהשאלון "${base.title}": ${lvl} (ציון ${ctx.totalScore}/${ctx.maxScore})`);

  const dom = [...ctx.clusters].sort((a, b) => b.ratio - a.ratio)[0];
  if (dom && dom.ratio >= 0.34) {
    parts.push(`עם דגש ${dom.name.replace("אשכול ", "")}`);
  }
  if (base.pattern) parts.push(`דפוס בולט: ${base.pattern.name}`);
  if (ctx.topItems.length) {
    parts.push(`מוקדי המצוקה: ${ctx.topItems.map((t) => t.title).join(", ")}`);
  }
  if (ctx.hasRisk) parts.push("דווח פריט סיכון המצריך התייחסות מפורשת");
  if (ctx.change && ctx.change.direction !== "stable") {
    parts.push(ctx.change.note.replace(/\.$/, ""));
  }
  const rec = base.recommendations[0];
  let text = parts.join(", ") + ".";
  if (rec) text += ` ${rec}`;
  return text;
}

function buildHeadline(
  level: LevelInfo | null,
  subscales: SubscaleResult[],
  total: number,
  max: number
): string {
  if (level) {
    return level.description
      ? `${level.label} — ${level.description}`
      : level.label;
  }
  const over = subscales.filter((s) => s.over).length;
  if (subscales.length > 0) {
    return over > 0
      ? `${over} מתוך ${subscales.length} תת-סולמות מעל סף ההתייחסות`
      : "כל תת-הסולמות מתחת לסף ההתייחסות";
  }
  return `ציון כולל: ${total} מתוך ${max}`;
}

function clusterScore(
  itemIds: number[],
  template: TemplateLike,
  response: ResponseLike
): { score: number; max: number } {
  const answers = response.answers || [];
  let score = 0;
  let max = 0;
  const idSet = new Set(itemIds);
  template.questions.forEach((q, idx) => {
    if (!idSet.has(q.id)) return;
    score += itemPoints(answers[idx]);
    if (q.options && q.options.length)
      max += Math.max(...q.options.map((o) => o.score ?? o.value ?? 0));
  });
  return { score, max };
}

function applyCriticalProtocol(
  spec: InterpretationSpec,
  template: TemplateLike,
  response: ResponseLike
): RiskFlag[] {
  const cp = spec.criticalProtocol;
  if (!cp) return [];
  const idx = template.questions.findIndex((q) => q.id === cp.itemId);
  if (idx < 0) return [];
  const val = itemPoints((response.answers || [])[idx]);
  const flag = cp.byValue[val];
  return flag ? [flag] : [];
}

// ---------------------------------------------------------------------------
// ניתוח משולב (חוצה-שאלונים)
// ---------------------------------------------------------------------------

export function interpretCombined(
  items: Array<{ template: TemplateLike; response: ResponseLike }>
): CombinedInterpretation {
  const interps = items.map((it) =>
    interpretResponse(it.template, it.response)
  );

  // צבירה לפי דומיין — נשמרת החומרה הגבוהה ביותר בכל דומיין.
  const byDomain = new Map<Domain, DomainSummary>();
  for (const i of interps) {
    const existing = byDomain.get(i.domain);
    const itemDesc = `${i.title}: ${i.level?.label || SEVERITY_LABEL[i.severity]}`;
    if (existing) {
      existing.severity = maxSeverity(existing.severity, i.severity);
      existing.items.push(itemDesc);
    } else {
      byDomain.set(i.domain, {
        domain: i.domain,
        label: DOMAIN_LABEL[i.domain],
        severity: i.severity,
        items: [itemDesc],
      });
    }
  }
  const domains = [...byDomain.values()].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
  );

  // דגלי סיכון מצרפיים — קריטיים תחילה, נעוצים בראש.
  const riskFlags = interps
    .flatMap((i) => i.riskFlags)
    .sort(
      (a, b) =>
        riskRank(b.level) - riskRank(a.level)
    );

  const patterns = derivePatterns(byDomain, riskFlags.length > 0);

  const sevByDomain = (d: Domain): Severity =>
    byDomain.get(d)?.severity || "none";
  const elevated = domains.filter((d) => SEVERITY_RANK[d.severity] >= 2);
  let summary: string;
  if (riskFlags.some((f) => f.level === "critical")) {
    summary =
      "התמונה כוללת דגל סיכון הדורש התייחסות מיידית (ראו סעיף הסיכון בראש). " +
      (elevated.length
        ? `במקביל בולטים: ${elevated.map((d) => d.label).join(", ")}.`
        : "");
  } else if (elevated.length >= 2) {
    summary = `תמונה מורכבת עם מעורבות מוגברת בכמה תחומים: ${elevated
      .map((d) => d.label)
      .join(", ")}.`;
  } else if (elevated.length === 1) {
    summary = `הממצא הבולט הוא בתחום ${elevated[0].label}.`;
  } else {
    summary = "לא נמצאה מעורבות מוגברת בולטת בתחומים שנבדקו.";
  }

  return {
    domains,
    riskFlags,
    patterns,
    summary,
    disclaimer: DISCLAIMER,
  };
}

function riskRank(level: RiskLevel): number {
  return level === "critical" ? 3 : level === "warning" ? 2 : 1;
}

// חוקים מורכבים חוצי-דומיינים — מכסים "צירופים" בלי טבלה אקספוננציאלית.
function derivePatterns(
  byDomain: Map<Domain, DomainSummary>,
  hasRisk: boolean
): string[] {
  const out: string[] = [];
  const sev = (d: Domain): number =>
    SEVERITY_RANK[byDomain.get(d)?.severity || "none"];

  if (sev("depression") >= 2 && sev("anxiety") >= 2) {
    out.push(
      "תמונה מעורבת של חרדה ודיכאון — שילוב נפוץ שמצריך התייחסות לשני התחומים יחד; " +
        "כדאי לבחון איזה מהם מוביל ומחזק את השני."
    );
  }
  if (sev("trauma") >= 2 && sev("depression") >= 2) {
    out.push(
      "מעורבות טראומה לצד דיכאון — ייתכן דיכאון על רקע פוסט-טראומטי; " +
        "כדאי לשקול עיבוד טראומה כחלק מהתכנית הטיפולית."
    );
  }
  if (sev("trauma") >= 2 && sev("anxiety") >= 2) {
    out.push(
      "מעורבות טראומה לצד חרדה — תסמיני העוררות והדריכות עשויים להזין זה את זה."
    );
  }
  if (sev("sleep") >= 2 && (sev("depression") >= 2 || sev("anxiety") >= 2)) {
    out.push(
      "קשיי שינה בולטים לצד מצוקה רגשית — שיפור היגיינת השינה עשוי לתמוך גם בשאר התחומים."
    );
  }
  if (sev("addiction") >= 2 && (sev("depression") >= 2 || sev("anxiety") >= 2)) {
    out.push(
      "שימוש בחומרים לצד מצוקה רגשית — כדאי לבחון שימוש כוויסות-עצמי ולתאם טיפול בשני התחומים."
    );
  }
  if (sev("personality") >= 2 && sev("depression") >= 2) {
    out.push(
      "סימני קושי בתחום האישיות לצד דיכאון — כדאי להבחין בין מצב רוח אקוטי לדפוסים יציבים יותר."
    );
  }
  if (hasRisk) {
    out.unshift(
      "קיימים דגלי סיכון פעילים — יש להתייחס אליהם בעדיפות עליונה לפני המשך התכנון הטיפולי."
    );
  }
  return out;
}
