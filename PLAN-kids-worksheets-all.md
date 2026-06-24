# PLAN — גרסת ילדים לכל דפי העבודה (חיה תנ"כית + סיפור)

## ✅ הושלם 2026-06-24 — כל 39 הדפים
- 39 קבצי enrichment (5 קודמים + 34 חדשים), כל אחד עם kids מלא + חיה תנ"כית ייחודית.
- 39 HTML דפי ילדים + 39 PDF (6 עמ' A4 כל אחד), 0 "מותר", גודל אחיד.
- kids-manifest.json (39) + כפתור "גרסת ילדים" בקטלוג (eslint+tsc נקי).
- שיטה: סוכן ניסיוני → Workflow (30/33) → 3 השלמות ידניות. NetFree לא חסם (סוכנים כותבים לדיסק, מחזירים מטא).
- **טרם נדחף ל-main** (ממתין לאישור) ו**טרם נבדק חזותית בדפדפן** (auth + סיכון NetFree; העיצוב זהה ל-5 שאושרו).


מקור: צ'אט "דפי עבודה ב" נחסם ע"י **NetFree** (418 badwords, לא quota). המשתמש נתן אישור מלא לעבוד עצמאית, בלי שאלות, עם סוכנים מקבילים. תאריך: 2026-06-24.

## הארכיטקטורה (איך זה עובד)
- מקור תוכן: `src/lib/worksheets-content.mjs` (מבוגרים).
- שכבת העשרה לכל נושא: `src/lib/worksheets-enrichment/{slug}.mjs` — `export default { slug, background, psychoed, deepening, tracking, kids }`.
- בנייה: `node scripts/build-worksheets.mjs` → HTML (כולל `{slug}-kids-mytipul.html` כשיש שדה `kids`).
- PDF: `node scripts/generate-worksheet-pdfs.mjs {slug}-kids-mytipul.html public`.

## כללי תוכן (חובה)
1. עברית פשוטה+מקצועית, מובנת לילד בן 9, לא ילדותית.
2. **אסור** המילה "מותר" (כמו "מותר לכעוס") → שיקוף ונרמול רגש במקום.
3. כל דף = חיה תנ"כית שונה + סיפור מקורי שונה.
4. קהל דתי-חרדי → שפה צנועה ועדינה.
5. enrichment מלא (גם שדרוג מבוגרים: background/psychoed/deepening/tracking).
6. NetFree: שפה עדינה; אם נכתב נחסם → לנסות שוב.

## עקרון בטיחות NetFree
הסוכנים כותבים את הקבצים **ישירות לדיסק** ומחזירים מטא בלבד (slug/animal/status) — כדי שתוכן רגיש לא ייכנס לקונטקסט הראשי ולא יחסום. build+PDF+QA מקומיים = בטוחים. **לא דוחפים ל-main** בלי אישור מפורש (כלל הזהב + צ'אטים מקבילים).

## הושלם (5)
כְּפִיר=anger-thermometer · יָעֵל=cbt-exposure-ladder · נֶשֶׁר=cft-compassionate-letter · יוֹנָה=dbt-wise-mind · טלה=mindfulness-breath-anchor (HTML+PDF מוכנים, 6 עמ' A4).

## נשאר (34) — הקצאת חיות
| # | slug | גישה | חיה | status |
|---|------|------|-----|--------|
| 1 | cbt-cognitive-distortions | CBT | שׁוּעָל | pending |
| 2 | dbt-dearman | DBT | אֲרִי | pending |
| 3 | dbt-radical-acceptance | DBT | גָּמָל | pending |
| 4 | act-matrix | ACT | אַיָּל | pending |
| 5 | positive-character-strengths | חיובית | דּוּכִיפַת | pending |
| 6 | polyvagal-states-map | Polyvagal | שָׁפָן | pending |
| 7 | logotherapy-meaning-search | לוגותרפיה | חֲסִידָה | pending |
| 8 | narrative-externalizing | נרטיבי | דֹּב | pending |
| 9 | ifs-internal-parts | IFS | דְּבוֹרָה | pending |
| 10 | schema-identification | סכמה | עֵז | pending |
| 11 | stages-of-change | שלבי שינוי | תּוֹר | pending |
| 12 | reality-wdep | מציאות | סוּס | pending |
| 13 | gestalt-empty-chair | גשטלט | דְּרוֹר | pending |
| 14 | ta-ego-states | TA | פָּרָה | pending |
| 15 | adler-purpose-belonging | אדלר | עָגוּר | pending |
| 16 | cbt-decatastrophizing | CBT | אַרְנֶבֶת | pending |
| 17 | dbt-accepts | DBT | נֵץ | pending |
| 18 | act-observing-self | ACT | אַיָּה | pending |
| 19 | mindfulness-body-scan | Mindfulness | צְבִי | pending |
| 20 | cft-three-circles | CFT | רָחֵל | pending |
| 21 | positive-best-possible-self | חיובית | אַיֶּלֶת | pending |
| 22 | sfbt-exception-finding | SFBT | דָּג | pending |
| 23 | anger-time-out-plan | ויסות כעס | נָמֵר | pending |
| 24 | polyvagal-glimmers | Polyvagal | גְּדִי | pending |
| 25 | schema-modes | סכמה | זְאֵב | pending |
| 26 | cbt-problem-solving | CBT | נְמָלָה | pending |
| 27 | act-committed-action | ACT | שׁוֹר | pending |
| 28 | mindfulness-grounding-54321 | Mindfulness | שְׂלָו | pending |
| 29 | cft-compassionate-image | CFT | צִפּוֹר | pending |
| 30 | positive-gratitude-letter | חיובית | בַּרְבּוּר | pending |
| 31 | sfbt-scaling-questions | SFBT | עֵגֶל | pending |
| 32 | anger-trigger-log | ויסות כעס | רְאֵם | pending |
| 33 | polyvagal-regulation-breath | Polyvagal | סְנוּנִית | pending |
| 34 | schema-flashcard | סכמה | עוֹרֵב | pending |

## זרימת עבודה
1. סוכן ניסיוני (1) → אימות build+QA.
2. batches של ~6-8 סוכנים מקבילים → כל אחד יוצר enrichment.
3. `node scripts/build-worksheets.mjs` → HTML.
4. `node scripts/generate-worksheet-pdfs.mjs` לכל ה-kids החדשים.
5. QA מקומי: sections≥5, "מותר"=0, סיום תקין, 6 עמ' PDF.
6. commit מקומי (בלי push).
7. (זמן מותר) חיבור UI בקטלוג + סיכום.
