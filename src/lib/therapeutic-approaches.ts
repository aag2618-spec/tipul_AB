/**
 * רשימת גישות טיפוליות מפורטות
 * כל גישה כוללת שם בעברית ובאנגלית לתמיכה דו-לשונית
 * 
 * גרסה 2.0 - 6 גישות מפורטות עם prompts מעמיקים
 */

export interface TherapeuticApproach {
  id: string;
  nameHe: string;
  nameEn: string;
  category: string;
  descriptionHe: string;
  descriptionEn: string;
  prompt: string;
}

export const APPROACH_CATEGORIES = [
  { id: 'psychodynamic', nameHe: 'פסיכואנליטית / פסיכודינמית', nameEn: 'Psychoanalytic / Psychodynamic' },
  { id: 'cbt', nameHe: 'קוגניטיבית-התנהגותית', nameEn: 'Cognitive-Behavioral' },
  { id: 'humanistic', nameHe: 'הומניסטית / אקזיסטנציאלית', nameEn: 'Humanistic / Existential' },
];

/**
 * 6 גישות טיפוליות עם prompts מפורטים
 * נוספו תרגומים מלאים לעברית
 */
export const THERAPEUTIC_APPROACHES: TherapeuticApproach[] = [
  // ==================== טיפול קוגניטיבי-התנהגותי ====================
  {
    id: 'beck-cbt',
    nameHe: 'בק - טיפול קוגניטיבי-התנהגותי',
    nameEn: 'Beck - Cognitive Behavioral Therapy',
    category: 'cbt',
    descriptionHe: 'מחשבות אוטומטיות, עיוותים קוגניטיביים, אמונות ליבה',
    descriptionEn: 'Automatic thoughts, cognitive distortions, core beliefs',
    prompt: `
# בק - טיפול קוגניטיבי-התנהגותי
# Beck - Cognitive Behavioral Therapy (CBT)

## רקע תיאורטי:
אהרון בק פיתח את הטיפול הקוגניטיבי בשנות ה-60. הגישה מתמקדת בהווה, מובנית, וממוקדת מטרה.

## מודל ABC:
- A - אירוע מעורר (Activating Event)
- B - מחשבות/אמונות (Beliefs)
- C - תוצאות רגשיות והתנהגותיות (Consequences)

**עיקרון מרכזי:** לא האירוע גורם לרגש, אלא הפרשנות שלנו לאירוע.

## מושגי מפתח - חובה לזהות:

### 1. מחשבות אוטומטיות (Automatic Thoughts):
- מחשבות ספונטניות שעולות בתגובה למצב
- מהירות, לא רצוניות, לעיתים לא מודעות

### 2. עיוותים קוגניטיביים (Cognitive Distortions):
- חשיבה שחור-לבן (All-or-Nothing Thinking)
- הגזמה קטסטרופלית (Catastrophizing)
- הכללת יתר (Overgeneralization)
- קריאת מחשבות (Mind Reading)
- שיפוט רגשי (Emotional Reasoning)
- תיוג (Labeling)
- האשמה עצמית (Personalization)

### 3. אמונות ליבה (Core Beliefs):
- אמונות עמוקות על העצמי, אחרים, והעולם
- נוצרות בילדות, יציבות, קשות לשינוי
- שלושה תחומים:
  * על העצמי: "אני לא רצוי", "אני לא מספיק טוב"
  * על אחרים: "אנשים לא אמינים"
  * על העולם: "העולם מסוכן"

### 4. אמונות ביניים (Intermediate Beliefs):
- כללים, הנחות, עמדות
- "אם... אז..." או "חייב/צריך"

### 5. מעגל תחזוקה (Maintenance Cycle):
מצב ← מחשבה ← רגש ← התנהגות ← תוצאה ← חיזוק המחשבה

## מסגרת ניתוח:

### שלב 1: זיהוי מצב/טריגר
### שלב 2: מיפוי מחשבות אוטומטיות
### שלב 3: זיהוי עיוותים קוגניטיביים
### שלב 4: זיהוי רגשות
### שלב 5: זיהוי התנהגויות
### שלב 6: זיהוי אמונות ליבה
### שלב 7: מיפוי מעגל התחזוקה
### שלב 8: המלצות להתערבות

## התערבויות מומלצות:
- יומן מחשבות (Thought Record)
- ניסויים התנהגותיים (Behavioral Experiments)
- שינוי מחשבות (Cognitive Restructuring)
- תכנון פעילויות (Activity Scheduling)

## כללים חשובים:
✅ התמקד בהווה
✅ היה קונקרטי ומדיד
✅ זהה קשרים בין מחשבות-רגשות-התנהגות
✅ הצע פעולות ספציפיות

❌ אל תשתמש במונחים פסיכודינמיים
❌ אל תתמקד בעבר הרחוק
❌ אל תהיה מופשט

## מבנה JSON לניתוח:

{
  "summaryHe": "סיכום קצר בעברית",
  "situationTrigger": "המצב המעורר",
  "automaticThoughts": [
    {
      "thoughtHe": "המחשבה בעברית",
      "context": "מתי עלתה"
    }
  ],
  "cognitiveDistortions": [
    {
      "distortionHe": "שם העיוות בעברית",
      "distortionEn": "שם העיוות באנגלית",
      "example": "דוגמה מהחומר"
    }
  ],
  "coreBeliefs": [
    {
      "beliefHe": "האמונה בעברית",
      "domain": "עצמי/אחרים/עולם",
      "evidence": "מה מצביע על זה"
    }
  ],
  "emotions": [
    {
      "emotionHe": "שם הרגש",
      "intensity": "1-10"
    }
  ],
  "behaviors": [
    {
      "behaviorHe": "התנהגות ספציפית",
      "function": "מה התפקיד שלה"
    }
  ],
  "maintenanceCycle": "תיאור המעגל הסגור",
  "interventions": [
    {
      "interventionHe": "שם ההתערבות בעברית",
      "interventionEn": "שם ההתערבות באנגלית",
      "description": "מה לעשות"
    }
  ],
  "homeworkSuggestions": [
    "מטלת בית ספציפית 1",
    "מטלת בית ספציפית 2"
  ]
}
`
  },

  // ==================== מאהלר - הפרדה-אינדיבידואציה ====================
  {
    id: 'mahler',
    nameHe: 'מאהלר - הפרדה-אינדיבידואציה',
    nameEn: 'Mahler - Separation-Individuation',
    category: 'psychodynamic',
    descriptionHe: 'שלבי התפתחות, סימביוזה, קביעות אובייקט',
    descriptionEn: 'Developmental stages, symbiosis, object constancy',
    prompt: `
# מאהלר - תיאוריית ההפרדה-אינדיבידואציה
# Mahler - Separation-Individuation Theory

## רקע תיאורטי:
מרגרט מאהלר חקרה את ההתפתחות הפסיכולוגית המוקדמת. התיאוריה מתארת את התהליך שבו התינוק עובר ממיזוג פסיכולוגי עם האם לעצמי נפרד.

**עיקרון יסוד:** "הלידה הפסיכולוגית" אינה חופפת ללידה הביולוגית - היא תהליך שלוקח כשלוש שנים.

## שלבי ההתפתחות:

### 1. אוטיזם נורמלי (לידה עד חודש 1)
- Normal Autism
- התינוק לא מודע לעולם החיצוני

### 2. סימביוזה (חודשים 1-5)
- Symbiosis
- התינוק והאם נתפסים כיחידה אחת
- "dual unity" - אחדות כפולה

### 3. הפרדה-אינדיבידואציה (חודשים 5-36)
זהו השלב המרכזי, מחולק ל-4 תת-שלבים:

#### 3א. התמיינות (חודשים 5-10)
- Differentiation
- "בקיעה" מהסימביוזה
- תחילת חרדת זרים

#### 3ב. תרגול (חודשים 10-16)
- Practicing
- "התאהבות בעולם"
- תחושת כל-יכולת
- "טעינה רגשית" - Emotional Refueling

#### 3ג. התקרבות מחדש (חודשים 16-24) ⭐ קריטי!
- Rapprochement
- משבר ההתקרבות מחדש
- אמביוולנטיות חריפה
- "עוקב" ו"בורח" - Shadowing & Darting Away

#### 3ד. קביעות אובייקט (חודשים 24-36)
- Object Constancy
- יכולת לשמור ייצוג פנימי יציב של האם
- יכולת להיות לבד

## מושגי מפתח:

### פיצול (Splitting)
- האובייקט נתפס כ"כולו טוב" או "כולו רע"

### צרכים סימביוטיים (Symbiotic Needs)
- צורך למיזוג עם דמות משמעותית

### חרדת בליעה (Engulfment Anxiety)
- פחד מאובדן העצמי באחר

### חרדת נטישה (Abandonment Anxiety)
- פחד מאובדן האובייקט

### תסכול אופטימלי (Optimal Frustration)
- רמה מתאימה של תסכול שמקדמת התפתחות

## מסגרת ניתוח:

### שלב 1: זיהוי שלב התפתחותי
### שלב 2: ניתוח היסטוריה התפתחותית
### שלב 3: זיהוי חרדות מרכזיות
### שלב 4: ניתוח דפוסי יחסים
### שלב 5: הערכת קביעות אובייקט
### שלב 6: ניתוח הדינמיקה בטיפול

## כללים חשובים:
✅ התייחס לשלבי ההתפתחות הספציפיים
✅ זהה את הקונפליקט: עצמאות מול קרבה
✅ נתח את איכות קביעות האובייקט
✅ בחן חרדות נטישה ובליעה

❌ אל תשתמש במונחי CBT
❌ אל תערבב עם תיאוריות התקשרות

## מבנה JSON לניתוח:

{
  "summaryHe": "סיכום קצר לפי מאהלר",
  "developmentalStage": {
    "currentStage": "השלב שבו המטופל 'תקוע'",
    "stageNameHe": "שם השלב בעברית",
    "stageNameEn": "שם השלב באנגלית",
    "evidence": ["ראיה 1", "ראיה 2"]
  },
  "separationIndividuationAnalysis": {
    "symbioticExperience": {
      "quality": "מספקת/לא מספקת/מוגזמת",
      "description": "תיאור"
    },
    "rapprochementPhase": {
      "crisisNature": "אופי המשבר",
      "maternalResponse": "תגובת האם"
    },
    "objectConstancy": {
      "level": "הושגה/חלקית/לא הושגה",
      "evidence": "מה מעיד על כך"
    }
  },
  "coreAnxieties": {
    "abandonmentAnxiety": {
      "present": true/false,
      "intensity": "1-10",
      "triggers": ["מצב 1", "מצב 2"]
    },
    "engulfmentAnxiety": {
      "present": true/false,
      "intensity": "1-10",
      "triggers": ["מצב 1", "מצב 2"]
    }
  },
  "defenseMechanisms": {
    "splitting": {
      "present": true/false,
      "examples": ["דוגמה 1"]
    }
  },
  "therapeuticRecommendations": {
    "developmentalNeeds": "מה המטופל צריך התפתחותית",
    "correctiveExperience": "חוויה מתקנת נדרשת",
    "therapistStance": "עמדה טיפולית מומלצת"
  }
}
`
  },

  // ==================== ויניקוט - החזקה ואובייקט מעברי ====================
  {
    id: 'winnicott',
    nameHe: 'ויניקוט - החזקה ואובייקט מעברי',
    nameEn: 'Winnicott - Holding & Transitional Object',
    category: 'psychodynamic',
    descriptionHe: 'החזקה, אם טובה-דיה, עצמי אמיתי/כוזב',
    descriptionEn: 'Holding, good-enough mother, true/false self',
    prompt: `
# ויניקוט - תיאוריית ההתפתחות הרגשית המוקדמת
# Winnicott - Early Emotional Development Theory

## רקע תיאורטי:
דונלד ויניקוט היה רופא ילדים ופסיכואנליטיקאי שהדגיש את חשיבות הסביבה בהתפתחות העצמי.

**אמירת יסוד:** "אין דבר כזה תינוק" - תמיד יש דיאדה: תינוק-ומי-שמטפל-בו.

## מושגי מפתח:

### 1. החזקה (Holding)
- לא רק החזקה פיזית, אלא מכלול הטיפול
- יצירת סביבה בטוחה, צפויה ומגיבה

רכיבי ההחזקה:
- טיפול פיזי (Handling)
- הצגת העולם (Object Presenting)
- נוכחות מתמשכת (Living With)
- הגנה מפני פלישות (Protecting From Impingements)

### 2. אם טובה-דיה (Good-Enough Mother)
- לא צריכה להיות מושלמת
- דווקא כישלונות קטנים ומותאמים מאפשרים התפתחות

שלושה שלבים:
- עיסוק אימהי ראשוני (Primary Maternal Preoccupation)
- כישלון מדורג (Graduated Failure)
- הפסקת התאמה (De-adaptation)

### 3. עצמי אמיתי / עצמי כוזב (True Self / False Self)

**עצמי אמיתי:**
- הליבה הספונטנית, האותנטית
- מקור היצירתיות והחיוניות
- מרגיש "אמיתי", "חי"

**עצמי כוזב:**
- מבנה הגנתי להגנה על העצמי האמיתי
- התאמת יתר לציפיות הסביבה
- מרגיש "ריק", "מזויף"

ספקטרום העצמי הכוזב:
1. בריא - פרזנטציה חברתית
2. פתולוגי קל - התאמת יתר
3. פתולוגי בינוני - העצמי הכוזב שלט
4. פתולוגי חמור - ניתוק מהעצמי האמיתי
5. קיצוני - סכנת פסיכוזה

### 4. אובייקט מעברי (Transitional Object)
- החפץ הראשון שהתינוק "בוחר"
- לא "עצמי" ולא "אחר" - בתווך
- שמיכה, בובה

### 5. מרחב פוטנציאלי (Potential Space)
- מרחב "בין" - לא פנימי ולא חיצוני
- מקום למשחק, יצירתיות, טיפול

### 6. פלישה (Impingement)
- חוויה שמאלצת תגובה לפני מוכנות
- מפריעה לרציפות הקיום

### 7. רציפות של קיום (Going-on-Being)
- תחושת הרציפות הבסיסית
- הבסיס לתחושת העצמי

### 8. היכולת להיות לבד (Capacity to Be Alone)
- מתפתחת מתוך להיות לבד בנוכחות האם

### 9. חרדות הכחדה (Annihilation Anxieties)
- התפרקות (Going to Pieces)
- נפילה אינסופית (Falling Forever)
- אובדן קשר לגוף
- בידוד מוחלט

### 10. שימוש באובייקט (Use of Object)
- ההבדל בין התייחסות לשימוש
- האובייקט חייב לשרוד את ההרס

## מסגרת ניתוח:

### שלב 1: הערכת עצמי אמיתי / כוזב
### שלב 2: ניתוח היסטוריית החזקה
### שלב 3: יכולת להיות לבד
### שלב 4: המרחב המעברי
### שלב 5: חרדות פרימיטיביות
### שלב 6: הדינמיקה הטיפולית

## כללים חשובים:
✅ חפש את הדיאלקטיקה עצמי אמיתי/כוזב
✅ בדוק את איכות ההחזקה
✅ התייחס למרחב הפוטנציאלי
✅ שים לב לחרדות פרימיטיביות

❌ אל תתייחס לעצמי כוזב כ"שקר" מוסרי
❌ אל תדחק לספונטניות

## מבנה JSON לניתוח:

{
  "summaryHe": "סיכום קצר לפי ויניקוט",
  "trueFalseSelfAnalysis": {
    "trueSelfAccess": "גבוהה/חלקית/נמוכה/אין",
    "trueSelfManifestations": ["ביטויי עצמי אמיתי"],
    "falseSelfLevel": "1-5 לפי הספקטרום",
    "falseSelfFunction": "למה משמש",
    "authenticityExperience": "תיאור חוויית האותנטיות"
  },
  "holdingHistory": {
    "earlyEnvironment": "תיאור הסביבה המוקדמת",
    "motherGoodEnough": "האם הייתה טובה-דיה?",
    "impingements": ["פלישות שזוהו"],
    "goingOnBeing": "האם יש רציפות קיום?"
  },
  "capacityToBeAlone": {
    "present": true/false,
    "quality": "תיאור היכולת",
    "loneliness": "איך נחוות בדידות"
  },
  "transitionalSpace": {
    "access": "יש/חלקי/אין",
    "playCapacity": "יכולת למשחק וליצירתיות"
  },
  "primitiveAnxieties": {
    "present": true/false,
    "types": ["סוגי חרדות הכחדה"],
    "triggers": ["מה מעורר אותן"]
  },
  "therapeuticRecommendations": {
    "holdingRequired": "סוג ההחזקה הנדרש",
    "trueSelfEmergence": "איך לאפשר צמיחת עצמי אמיתי",
    "therapistStance": "עמדה טיפולית מומלצת"
  }
}
`
  },

  // ==================== בולבי - תיאוריית ההתקשרות ====================
  {
    id: 'bowlby',
    nameHe: 'בולבי - תיאוריית ההתקשרות',
    nameEn: 'Bowlby - Attachment Theory',
    category: 'psychodynamic',
    descriptionHe: 'סגנונות התקשרות, מודלים פעילים פנימיים',
    descriptionEn: 'Attachment styles, internal working models',
    prompt: `
# בולבי - תיאוריית ההתקשרות
# Bowlby - Attachment Theory

## רקע תיאורטי:
ג'ון בולבי פיתח את תיאוריית ההתקשרות - אחת התיאוריות המשפיעות ביותר בפסיכולוגיה.

**עיקרון יסוד:** להתקשרות יש ערך הישרדותי אבולוציוני.

## מושגי מפתח:

### 1. מערכת ההתנהגות ההתקשרותית (Attachment Behavioral System)
- מופעלת בזמן סכנה או מצוקה
- מטרה: שמירה על קרבה לדמות מגנה
- יעד: תחושת ביטחון (Felt Security)

התנהגויות התקשרות:
- בכי, קריאה
- הושטת ידיים
- עקיבה
- חיפוש מבט

### 2. מודלים פעילים פנימיים (Internal Working Models - IWMs)
ייצוגים של העצמי, האחר, והיחסים.

**מודל העצמי:**
- חיובי: "אני ראוי לאהבה"
- שלילי: "אני לא ראוי, מעמסה"

**מודל האחר:**
- חיובי: "אחרים זמינים ומגיבים"
- שלילי: "אחרים לא אמינים"

### 3. סגנונות התקשרות (Attachment Styles)

#### א. התקשרות בטוחה (Secure)
- כ-55-65% מהאוכלוסייה
- דמות התקשרות זמינה ורגישה
- נוחות עם קרבה ואינטימיות
- יכולת לבקש ולתת עזרה

#### ב. התקשרות חרדה-אמביוולנטית (Anxious-Ambivalent / Preoccupied)
- כ-10-15% מהאוכלוסייה
- דמות התקשרות לא עקבית
- אסטרטגיה: הגברת ההתקשרות (Hyperactivation)
- חרדת נטישה גבוהה
- תלות רגשית

#### ג. התקשרות נמנעת (Avoidant / Dismissing)
- כ-20-25% מהאוכלוסייה
- דמות התקשרות דוחה
- אסטרטגיה: השבתת ההתקשרות (Deactivation)
- עצמאות יתר
- קושי באינטימיות

#### ד. התקשרות לא-מאורגנת (Disorganized / Fearful)
- כ-10-15% מהאוכלוסייה
- דמות ההתקשרות גם מקור פחד וגם מקור נחמה
- טראומה, התעללות
- התנהגות לא קוהרנטית

### 4. דמות התקשרות (Attachment Figure)
- האדם שאליו פונים במצוקה

מאפיינים:
- שמירה על קרבה (Proximity Maintenance)
- נמל מבטחים (Safe Haven)
- בסיס בטוח (Secure Base)
- מצוקת פרידה (Separation Distress)

### 5. בסיס בטוח (Secure Base)
- ממנו אפשר לצאת ולחקור את העולם

### 6. נמל מבטחים (Safe Haven)
- מקום מפלט בזמני מצוקה

### 7. טראומת התקשרות (Attachment Injury)
- כשדמות ההתקשרות לא זמינה בזמן קריטי

### 8. ביטחון נרכש (Earned Security)
- התפתחות ביטחון בבגרות למרות ילדות לא בטוחה

## מסגרת ניתוח:

### שלב 1: זיהוי סגנון התקשרות
### שלב 2: ניתוח מודלים פעילים פנימיים
### שלב 3: היסטוריית התקשרות
### שלב 4: ביטויים ביחסים נוכחיים
### שלב 5: ויסות רגשי
### שלב 6: הקשר הטיפולי

## כללים חשובים:
✅ זהה סגנון התקשרות עם ראיות
✅ נתח את המודלים הפעילים הפנימיים
✅ בחן היסטוריית התקשרות
✅ קשר להתנהגות ביחסים

❌ אל תתייחס לסגנון כמשהו קבוע
❌ אל תערבב עם מאהלר

## מבנה JSON לניתוח:

{
  "summaryHe": "סיכום קצר לפי בולבי",
  "attachmentStyle": {
    "primary": "בטוחה/חרדה/נמנעת/לא-מאורגנת",
    "primaryEn": "Secure/Anxious/Avoidant/Disorganized",
    "evidence": ["ראיה 1", "ראיה 2"]
  },
  "internalWorkingModels": {
    "selfModel": {
      "content": "תוכן המודל על העצמי",
      "valence": "חיובי/שלילי/אמביוולנטי"
    },
    "otherModel": {
      "content": "תוכן המודל על אחרים",
      "valence": "חיובי/שלילי/אמביוולנטי"
    },
    "relationshipExpectations": ["ציפייה 1", "ציפייה 2"]
  },
  "attachmentHistory": {
    "primaryFigures": [
      {
        "who": "מי",
        "quality": "איכות ההתקשרות",
        "availability": "זמינות"
      }
    ],
    "losses": ["אובדנים"],
    "traumas": ["טראומות התקשרות"]
  },
  "regulationStrategies": {
    "primary": "הגברה/השבתה/לא-מאורגן",
    "primaryEn": "Hyperactivation/Deactivation/Disorganized",
    "manifestations": ["ביטוי 1", "ביטוי 2"]
  },
  "therapeuticRecommendations": {
    "focus": "מוקד עבודה",
    "secureBaseProvision": "איך להיות בסיס בטוח",
    "earnedSecurityPath": "מסלול לביטחון נרכש"
  }
}
`
  },

  // ==================== קליין - יחסי אובייקט ====================
  {
    id: 'klein',
    nameHe: 'קליין - יחסי אובייקט',
    nameEn: 'Klein - Object Relations',
    category: 'psychodynamic',
    descriptionHe: 'פוזיציות, פיצול, הזדהות השלכתית',
    descriptionEn: 'Positions, splitting, projective identification',
    prompt: `
# קליין - תיאוריית יחסי האובייקט
# Klein - Object Relations Theory

## רקע תיאורטי:
מלאני קליין פיתחה גישה ייחודית לפסיכואנליזה. היא האמינה שחיי הפנטזיה מתחילים מהלידה.

**עיקרון יסוד:** מרגע הלידה, התינוק נמצא ביחסים עם "אובייקטים" - ייצוגים פנימיים של אנשים.

## מושגי מפתח:

### 1. אובייקט (Object)
- לא "חפץ" אלא ייצוג פנימי של אדם

סוגי אובייקטים:
- אובייקט חיצוני (External Object)
- אובייקט פנימי (Internal Object)
- אובייקט חלקי (Part Object)
- אובייקט שלם (Whole Object)

### 2. הפוזיציה הפרנואידית-סכיזואידית (Paranoid-Schizoid Position)
- מצב נפשי פרימיטיבי
- העולם מחולק לטוב מוחלט ורע מוחלט
- חודשים ראשונים, אך חוזר לאורך החיים

מנגנונים:
- פיצול (Splitting)
- השלכה (Projection)
- הפנמה (Introjection)
- הזדהות השלכתית (Projective Identification)
- אידיאליזציה (Idealization)
- חרדה רדיפתית (Persecutory Anxiety)

### 3. הפוזיציה הדפרסיבית (Depressive Position)
- מצב נפשי מתקדם יותר
- יכולת לראות את האובייקט כשלם
- מחודש 4-6

מאפיינים:
- אינטגרציה (Integration)
- יחסי אובייקט שלמים (Whole Object Relations)
- חרדה דפרסיבית / אשמה (Depressive Anxiety / Guilt)
- דאגה (Concern)
- תיקון (Reparation)
- אבל (Mourning)

### 4. הזדהות השלכתית (Projective Identification)
**מושג מפתח קריטי!**
- הפניה של חלקים מהעצמי לתוך האחר
- לא רק דמיון - גורם לאחר להרגיש/להתנהג בהתאם

שימושים:
- תקשורת
- הגנה
- שליטה

### 5. קנאה והכרת תודה (Envy & Gratitude)

**קנאה פרימיטיבית (Envy):**
- רצון להרוס את הטוב שיש לאחר
- מפריעה להפנמת טוב

**קנאת יריבות (Jealousy):**
- רוצה את מה שלאחר יש
- משולשת

**הכרת תודה (Gratitude):**
- יכולת להכיר בטוב ולהודות
- ההיפך מקנאה

### 6. פנטזיה לא-מודעת (Phantasy)
- שימו לב: "Ph" ולא "F"
- הביטוי הנפשי של דחפים
- פועלת מחוץ למודעות

### 7. העולם הפנימי (Internal World)
- מרחב נפשי שבו "חיים" אובייקטים פנימיים

## מסגרת ניתוח:

### שלב 1: זיהוי הפוזיציה הדומיננטית
### שלב 2: ניתוח מנגנוני הגנה
### שלב 3: מיפוי העולם הפנימי
### שלב 4: ניתוח חרדות
### שלב 5: בחינת יכולת לתיקון
### שלב 6: קנאה והכרת תודה
### שלב 7: ניתוח הדינמיקה הטיפולית

## כללים חשובים:
✅ השתמש במונחים של קליין
✅ זהה את הפוזיציה הדומיננטית
✅ מפה מנגנוני הגנה פרימיטיביים
✅ שים לב להזדהות השלכתית בטיפול

❌ אל תתייחס לפוזיציות כ"שלבים" חד-כיווניים
❌ אל תתעלם מחשיבות הפנטזיה

## מבנה JSON לניתוח:

{
  "summaryHe": "סיכום קצר לפי קליין",
  "dominantPosition": {
    "position": "פרנואידית-סכיזואידית / דפרסיבית / מתנדנד",
    "positionEn": "Paranoid-Schizoid / Depressive / Oscillating",
    "evidence": ["ראיה 1", "ראיה 2"],
    "stability": "יציבות הפוזיציה"
  },
  "defenseMechanisms": {
    "splitting": {
      "present": true/false,
      "objects": ["מה/מי מפוצל"],
      "pattern": "תיאור הפיצול"
    },
    "projection": {
      "present": true/false,
      "content": ["מה מושלך"],
      "target": "על מי"
    },
    "projectiveIdentification": {
      "present": true/false,
      "content": "מה מושלך",
      "target": "לתוך מי",
      "function": "תקשורת/הגנה/שליטה",
      "therapistExperience": "מה המטפל חווה"
    }
  },
  "internalWorld": {
    "goodObjects": {
      "present": true/false,
      "quality": "תיאור",
      "stability": "יציבות"
    },
    "persecutoryObjects": {
      "present": true/false,
      "nature": "אופי",
      "threat": "האיום"
    }
  },
  "anxietyType": {
    "persecutory": {
      "present": true/false,
      "content": ["פחדים רדיפתיים"]
    },
    "depressive": {
      "present": true/false,
      "content": ["אשמה, דאגה"]
    }
  },
  "envyGratitude": {
    "envy": {
      "level": "אין/קלה/בינונית/חמורה",
      "manifestations": ["ביטויים"]
    },
    "gratitude": {
      "capacity": "יכולת להכרת תודה"
    }
  },
  "reparation": {
    "capacity": "יכולת לתיקון",
    "blocks": "מה מפריע"
  },
  "therapeuticRecommendations": {
    "focus": "מוקד עבודה",
    "containment": "מה צריך להכיל",
    "interpretation": "סוג פרשנויות מומלץ"
  }
}
`
  },

  // ==================== יאלום - טיפול אקזיסטנציאלי ====================
  {
    id: 'yalom',
    nameHe: 'יאלום - טיפול אקזיסטנציאלי',
    nameEn: 'Yalom - Existential Therapy',
    category: 'humanistic',
    descriptionHe: 'מוות, חירות, בדידות, משמעות',
    descriptionEn: 'Death, freedom, isolation, meaninglessness',
    prompt: `
# יאלום - פסיכותרפיה אקזיסטנציאלית
# Yalom - Existential Psychotherapy

## רקע תיאורטי:
ארווין יאלום פיתח גישה שיטתית לפסיכותרפיה אקזיסטנציאלית.

**עיקרון יסוד:** הקונפליקט המרכזי הוא בין האדם לבין "הנתונים של הקיום" - העובדות הבסיסיות של החיים.

## ארבע הדאגות האקזיסטנציאליות:

### 1. מוות (Death)

**הקונפליקט:**
מודעות למוות מול רצון להמשיך להתקיים

**דרכי התמודדות לא-אדפטיביות:**
- הכחשה
- אמונה בייחודיות
- מציל אולטימטיבי (Ultimate Rescuer)
- הישגיות כפייתית

**התמודדות בריאה:**
- חוויות מעוררות (Awakening Experiences)
- "מודעות למוות מצילה אותנו"
- חיים אותנטיים יותר

### 2. חירות (Freedom)

**הקונפליקט:**
חירות מוחלטת מול צורך במבנה ובוודאות

**מרכיבי החירות:**
- חוסר קרקע (Groundlessness)
- אחריות (Responsibility)
- רצון (Will)

**דרכי התמודדות לא-אדפטיביות:**
- כפייתיות (Compulsivity)
- העברת אחריות
- הכחשת אחריות
- קושי בקבלת החלטות

**מושגים חשובים:**
- אחריות לא שווה אשמה
- רצון פסיבי (Wishing) מול רצון פעיל (Willing)

### 3. בדידות אקזיסטנציאלית (Existential Isolation)

**הקונפליקט:**
בדידות בסיסית מול כמיהה לחיבור

**שלושה סוגי בדידות:**
- בדידות בין-אישית (Interpersonal) - חוסר קשרים
- בדידות תוך-אישית (Intrapersonal) - ניכור מעצמי
- בדידות אקזיסטנציאלית - הפרדה בסיסית

**דרכי התמודדות לא-אדפטיביות:**
- ניסיון למיזוג (Fusion)
- יחסי תלות
- שליטה באחרים

**הפרדוקס:**
רק דרך קבלת הבדידות נוכל להתקרב באמת לאחרים.

### 4. חוסר משמעות (Meaninglessness)

**הקונפליקט:**
עולם חסר משמעות מוחלטת מול צורך אנושי במשמעות

**מקורות משמעות:**
- יצירה: עבודה, פרויקטים
- חוויה: אהבה, יופי
- עמדה: הגישה כלפי סבל

**דרכי התמודדות לא-אדפטיביות:**
- ניהיליזם
- קנאות אידיאולוגית
- עשייה כפייתית
- הדוניזם
- חומרנות

**התמודדות בריאה:**
- מעורבות עמוקה בחיים (Engagement)
- יצירת משמעות אישית

## מושגים נוספים:

### חיים אותנטיים מול לא-אותנטיים
**אותנטיים:**
- מודעות לנתונים של הקיום
- לקיחת אחריות
- יצירת משמעות

**לא-אותנטיים:**
- הכחשה, בריחה
- חיים לפי ציפיות אחרים

### מצבי גבול (Boundary Situations)
- מצבים שמעמתים עם הנתונים של הקיום
- מחלה, אובדן, סכנה

### היחס הטיפולי
- המטפל כ"בן לוויה" (Fellow Traveler)
- "כאן ועכשיו" ביחסים

## מסגרת ניתוח:

### שלב 1: זיהוי הדאגה המרכזית
### שלב 2: מיפוי ההגנות
### שלב 3: בחינת האותנטיות
### שלב 4: חיפוש משמעות
### שלב 5: ניתוח היחסים
### שלב 6: חוויות מעוררות
### שלב 7: כיוונים טיפוליים

## כללים חשובים:
✅ זהה את הדאגות הרלוונטיות
✅ מפה הגנות ודרכי בריחה
✅ בחן רמת אותנטיות
✅ נתח את נושא המשמעות

❌ אל תתמקד בעבר הרחוק
❌ אל תהפוך לפילוסופי מדי
❌ אל תתן "תשובות" - עזור להתמודד

## מבנה JSON לניתוח:

{
  "summaryHe": "סיכום קצר לפי יאלום",
  "ultimateConcerns": {
    "death": {
      "relevance": "גבוהה/בינונית/נמוכה/אין",
      "awareness": "רמת המודעות",
      "defenses": ["הגנות"]
    },
    "freedom": {
      "relevance": "גבוהה/בינונית/נמוכה/אין",
      "responsibilityTaking": "מידת לקיחת אחריות",
      "decisionMaking": "יכולת החלטה"
    },
    "isolation": {
      "relevance": "גבוהה/בינונית/נמוכה/אין",
      "experienceOfLoneliness": "איך חווה בדידות",
      "capacityToBeAlone": "יכולת להיות לבד"
    },
    "meaninglessness": {
      "relevance": "גבוהה/בינונית/נמוכה/אין",
      "meaningSources": ["מקורות משמעות"],
      "emptinessExperience": "תחושת ריקנות"
    }
  },
  "primaryConcern": {
    "concern": "הדאגה המרכזית",
    "conflict": "הקונפליקט הליבתי",
    "manifestation": "איך מתבטא"
  },
  "authenticityAssessment": {
    "level": "גבוהה/בינונית/נמוכה",
    "authenticAreas": ["תחומים אותנטיים"],
    "inauthenticAreas": ["תחומים לא אותנטיים"]
  },
  "defensePatterns": {
    "againstDeath": ["הגנות מפני מוות"],
    "againstFreedom": ["הגנות מפני חירות"],
    "againstIsolation": ["הגנות מפני בדידות"],
    "againstMeaninglessness": ["הגנות מפני חוסר משמעות"]
  },
  "therapeuticRecommendations": {
    "primaryFocus": "מוקד עבודה",
    "confrontation": "עם מה להתעמת",
    "meaningWork": "עבודה על משמעות",
    "authenticityGoals": "יעדים לאותנטיות"
  }
}
`
  }
];

// ==================== פונקציות עזר ====================

/**
 * קבלת גישות לפי קטגוריה
 */
export function getApproachesByCategory(categoryId: string): TherapeuticApproach[] {
  return THERAPEUTIC_APPROACHES.filter(a => a.category === categoryId);
}

/**
 * חיפוש גישות לפי מילות מפתח
 */
export function searchApproaches(query: string): TherapeuticApproach[] {
  const lowerQuery = query.toLowerCase();
  return THERAPEUTIC_APPROACHES.filter(a => 
    a.nameHe.toLowerCase().includes(lowerQuery) ||
    a.nameEn.toLowerCase().includes(lowerQuery) ||
    a.descriptionHe.toLowerCase().includes(lowerQuery) ||
    a.descriptionEn.toLowerCase().includes(lowerQuery)
  );
}

/**
 * קבלת גישה לפי מזהה
 */
export function getApproachById(id: string): TherapeuticApproach | undefined {
  return THERAPEUTIC_APPROACHES.find(a => a.id === id);
}

/**
 * קבלת prompts מאוחדים לפי מזהי גישות
 */
export function getApproachPrompts(approachIds: string[]): string {
  return approachIds
    .map(id => {
      const approach = getApproachById(id);
      return approach ? approach.prompt : '';
    })
    .filter(p => p)
    .join('\n\n---\n\n');
}

/**
 * קבלת כל שמות הגישות לתצוגה
 */
export function getApproachDisplayNames(): Array<{id: string, nameHe: string, nameEn: string}> {
  return THERAPEUTIC_APPROACHES.map(a => ({
    id: a.id,
    nameHe: a.nameHe,
    nameEn: a.nameEn
  }));
}
