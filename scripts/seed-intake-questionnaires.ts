// One-off seed: יוצר לבעלים את 2 שאלוני הפנייה (מורחב + הורים).
// IDEMPOTENT — מדלג אם כבר קיים שאלון עם אותו שם (לא יוצר כפילויות).
// READ-only על user/קיימים; כותב רק IntakeQuestionnaire חדשים לבעלים.
// הרצה: npx tsx scripts/seed-intake-questionnaires.ts
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { randomUUID } from "crypto";

const OWNER_EMAIL = "aag2618@gmail.com";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Make sure .env.local exists.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type Q =
  | { text: string; type: "TEXT" | "TEXTAREA"; required?: boolean }
  | { text: string; type: "SELECT"; options: string[]; required?: boolean };

function build(questions: Q[]) {
  return questions.map((q, i) => ({
    id: randomUUID(),
    text: q.text,
    type: q.type,
    ...(q.type === "SELECT" ? { options: q.options } : {}),
    required: q.required ?? false,
    order: i + 1,
  }));
}

const EXTENDED: Q[] = [
  { text: "מה הביא אותך לפנות עכשיו?", type: "TEXTAREA", required: true },
  { text: "באיזה תחום תרצה/י עזרה?", type: "SELECT", options: ["חרדה / דיכאון", "זוגיות", "הורות", "ילדים ונוער", "טראומה / אובדן", "אחר"] },
  { text: "מה היית רוצה שישתפר בעקבות הטיפול?", type: "TEXTAREA" },
  { text: "כמה זמן זה נמשך?", type: "SELECT", options: ["עד חודש", "1–6 חודשים", "מעל חצי שנה"] },
  { text: "למי הטיפול מיועד?", type: "SELECT", options: ["לי", "לילד/ה שלי", "לבן/בת הזוג", "אחר"] },
  { text: "גיל המטופל/ת", type: "TEXT" },
  { text: "האם היית בטיפול בעבר?", type: "SELECT", options: ["לא", "כן — בעבר", "כן — כרגע"] },
  { text: "האם את/ה נוטל/ת תרופות פסיכיאטריות?", type: "SELECT", options: ["לא", "כן", "מעדיף/ה לא לפרט"] },
  { text: "האם יש משהו דחוף שחשוב שנדע עליו לפני הפגישה? (לא חובה)", type: "TEXTAREA" },
  { text: "העדפת מטפל/ת", type: "SELECT", options: ["גבר", "אישה", "לא משנה"] },
  { text: "מועד מועדף", type: "SELECT", options: ["בוקר", "צהריים", "ערב", "גמיש"] },
  { text: "פגישה פרונטלית או אונליין?", type: "SELECT", options: ["פרונטלי", "אונליין", "לא משנה"] },
  { text: "איך הגעת אלינו?", type: "TEXT" },
];

const PARENTS: Q[] = [
  { text: "שם הילד/ה", type: "TEXT", required: true },
  { text: "גיל הילד/ה", type: "TEXT" },
  { text: "מי ממלא את השאלון?", type: "SELECT", options: ["אמא", "אבא", "אפוטרופוס/ית", "אחר"] },
  { text: "מה מדאיג אתכם? מה מביא אתכם לפנות עכשיו?", type: "TEXTAREA", required: true },
  { text: "מתי שמתם לב לראשונה?", type: "SELECT", options: ["לאחרונה", "בחודשים האחרונים", "מזמן"] },
  { text: "איפה זה בא לידי ביטוי בעיקר?", type: "SELECT", options: ["בבית", "בגן / בבית הספר", "עם חברים", "שינה", "אכילה", "התנהגות", "רגשות", "בכמה תחומים"] },
  { text: "האם יש אבחון קיים?", type: "SELECT", options: ["לא", "כן"] },
  { text: "אם כן — איזה אבחון? (לא חובה)", type: "TEXT" },
  { text: "האם הילד/ה יודע/ת על הפנייה?", type: "SELECT", options: ["כן", "לא", "חלקית"] },
  { text: "מה הייתם הכי רוצים שישתפר?", type: "TEXTAREA" },
];

const QUESTIONNAIRES = [
  {
    name: "שאלון פנייה — מורחב",
    description: "שאלון מקדים לפגישת ייעוץ ראשונה — עוזר לנו להגיע מוכנים.",
    questions: EXTENDED,
  },
  {
    name: "שאלון פנייה — הורים (לגבי ילד/ה)",
    description: "שאלון להורים שפונים לגבי ילד/ה, לפני הפגישה הראשונה.",
    questions: PARENTS,
  },
];

async function main() {
  const owner = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, email: true },
  });
  if (!owner) {
    console.error(`User ${OWNER_EMAIL} not found.`);
    process.exit(1);
  }
  console.log(`Owner: ${owner.email} (${owner.id})`);

  for (const def of QUESTIONNAIRES) {
    const existing = await prisma.intakeQuestionnaire.findFirst({
      where: { userId: owner.id, name: def.name },
      select: { id: true },
    });
    if (existing) {
      console.log(`• SKIP (already exists): "${def.name}" → ${existing.id}`);
      continue;
    }
    const created = await prisma.intakeQuestionnaire.create({
      data: {
        userId: owner.id,
        name: def.name,
        description: def.description,
        isDefault: false,
        isActive: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        questions: build(def.questions) as any,
      },
      select: { id: true, name: true },
    });
    console.log(
      `• CREATED: "${created.name}" → ${created.id} (${def.questions.length} שאלות)`
    );
  }

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
