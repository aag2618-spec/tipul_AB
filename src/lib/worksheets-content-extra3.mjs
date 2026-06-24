// ⚙️ AUTO-GENERATED ע"י scripts/gen-extra-pages.mjs — אל תערוך ידנית!
// מקור: src/lib/worksheets-pages/*.mjs (קובץ לכל דף). הרץ את הסקריפט מחדש כדי לרענן.
import p0 from "./worksheets-pages/act-acceptance-letting-go.mjs";
import p1 from "./worksheets-pages/act-circle-of-control.mjs";
import p2 from "./worksheets-pages/act-cognitive-defusion.mjs";
import p3 from "./worksheets-pages/act-values-identification.mjs";
import p4 from "./worksheets-pages/adler-conversation-skills.mjs";
import p5 from "./worksheets-pages/anger-letter.mjs";
import p6 from "./worksheets-pages/cbt-behavioral-activation.mjs";
import p7 from "./worksheets-pages/cbt-good-enough.mjs";
import p8 from "./worksheets-pages/cbt-procrastination.mjs";
import p9 from "./worksheets-pages/cbt-thought-record.mjs";
import p10 from "./worksheets-pages/cbt-worry-tree.mjs";
import p11 from "./worksheets-pages/cft-grief-waves.mjs";
import p12 from "./worksheets-pages/cft-guilt-vs-shame.mjs";
import p13 from "./worksheets-pages/cft-self-compassion.mjs";
import p14 from "./worksheets-pages/dbt-distress-tolerance.mjs";
import p15 from "./worksheets-pages/dbt-emotion-regulation.mjs";
import p16 from "./worksheets-pages/dbt-emotion-wheel.mjs";
import p17 from "./worksheets-pages/dbt-healthy-boundaries.mjs";
import p18 from "./worksheets-pages/dbt-i-statements.mjs";
import p19 from "./worksheets-pages/dbt-opposite-action.mjs";
import p20 from "./worksheets-pages/mindfulness-attention-anchor.mjs";
import p21 from "./worksheets-pages/mindfulness-diaphragmatic-breathing.mjs";
import p22 from "./worksheets-pages/mindfulness-mindful-eating.mjs";
import p23 from "./worksheets-pages/mindfulness-present-moment.mjs";
import p24 from "./worksheets-pages/mindfulness-safe-place.mjs";
import p25 from "./worksheets-pages/polyvagal-sensory-regulation.mjs";
import p26 from "./worksheets-pages/polyvagal-window-of-tolerance.mjs";
import p27 from "./worksheets-pages/positive-gratitude.mjs";
import p28 from "./worksheets-pages/positive-hope-ladder.mjs";
import p29 from "./worksheets-pages/positive-kindness-act.mjs";
import p30 from "./worksheets-pages/positive-resilience.mjs";
import p31 from "./worksheets-pages/positive-small-wins-journal.mjs";
import p32 from "./worksheets-pages/positive-smart-goals.mjs";
import p33 from "./worksheets-pages/reality-conflict-resolution.mjs";
import p34 from "./worksheets-pages/sfbt-miracle-question.mjs";
import p35 from "./worksheets-pages/stages-habit-building.mjs";
const pages = [p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15, p16, p17, p18, p19, p20, p21, p22, p23, p24, p25, p26, p27, p28, p29, p30, p31, p32, p33, p34, p35];
const byId = {};
for (const p of pages) {
  const { categoryId, approach, approachHe, categoryDescription, categoryColor, ...ws } = p;
  if (!byId[categoryId]) {
    byId[categoryId] = { id: categoryId, approach, approachHe, description: categoryDescription, color: categoryColor, worksheets: [] };
  }
  byId[categoryId].worksheets.push(ws);
}
export const extraCategories3 = Object.values(byId);
