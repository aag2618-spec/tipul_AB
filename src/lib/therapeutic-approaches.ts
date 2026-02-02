/**
 * Comprehensive list of therapeutic approaches and theorists
 * Each approach includes Hebrew and English names for dual-language support
 */

export interface TherapeuticApproach {
  id: string;
  nameHe: string;
  nameEn: string;
  category: string;
  description: string;
  prompt: string;
}

export const APPROACH_CATEGORIES = [
  { id: 'psychodynamic', nameHe: 'פסיכואנליטית / פסיכודינמית', nameEn: 'Psychoanalytic / Psychodynamic' },
  { id: 'cbt', nameHe: 'קוגניטיבית-התנהגותית', nameEn: 'Cognitive-Behavioral' },
  { id: 'humanistic', nameHe: 'הומניסטית / אקזיסטנציאלית', nameEn: 'Humanistic / Existential' },
  { id: 'systemic', nameHe: 'מערכתית / משפחתית', nameEn: 'Systemic / Family' },
  { id: 'trauma', nameHe: 'טראומה ו-EMDR', nameEn: 'Trauma & EMDR' },
  { id: 'mindfulness', nameHe: 'מיינדפולנס ומודעות', nameEn: 'Mindfulness & Awareness' },
  { id: 'expressive', nameHe: 'אקספרסיביות וגוף-נפש', nameEn: 'Expressive & Body-Mind' },
  { id: 'brief', nameHe: 'קצרות ומוקדות פתרון', nameEn: 'Brief & Solution-Focused' },
  { id: 'modern', nameHe: 'חדישות ואינטגרטיביות', nameEn: 'Modern & Integrative' },
  { id: 'coaching', nameHe: 'קוצ\'ינג ופיתוח', nameEn: 'Coaching & Development' },
];

export const THERAPEUTIC_APPROACHES: TherapeuticApproach[] = [
  // ==================== PSYCHODYNAMIC / PSYCHOANALYTIC ====================
  {
    id: 'freud',
    nameHe: 'פרויד - פסיכואנליזה קלאסית',
    nameEn: 'Freud - Classical Psychoanalysis',
    category: 'psychodynamic',
    description: 'id, ego, superego, הלא-מודע',
    prompt: `התמקד בתהליכים לא מודעים, עימותים פנימיים, והקשר בין id, ego, superego. חפש דפוסי הגנה והעברה.`
  },
  {
    id: 'jung',
    nameHe: 'יונג - פסיכולוגיה אנליטית',
    nameEn: 'Jung - Analytical Psychology',
    category: 'psychodynamic',
    description: 'ארכיטיפים, צל, אישיות',
    prompt: `התמקד בארכיטיפים, צל, אנימה/אנימוס, אינדיבידואציה. חפש סמלים וחלומות משמעותיים.`
  },
  {
    id: 'adler',
    nameHe: 'אדלר - פסיכולוגיה אינדיבידואלית',
    nameEn: 'Adler - Individual Psychology',
    category: 'psychodynamic',
    description: 'תחושת נחיתות, שאיפה למעלה',
    prompt: `התמקד בתחושת נחיתות, פיצוי, שאיפה לעליונות, ותרומה חברתית. חפש מטרות חיים.`
  },
  {
    id: 'klein',
    nameHe: 'קליין - יחסי אובייקט',
    nameEn: 'Klein - Object Relations',
    category: 'psychodynamic',
    description: 'פוזיציות, פיצול, השלכה',
    prompt: `התמקד בפוזיציה פרנואידית-סכיזואידית ודפרסיבית, פיצול, השלכה, והשלכה השלכתית. נתח אובייקטים פנימיים.`
  },
  {
    id: 'bion',
    nameHe: 'ביון - containment וחשיבה',
    nameEn: 'Bion - Containment & Thinking',
    category: 'psychodynamic',
    description: 'containment, רווירי, תפקוד אלפא',
    prompt: `התמקד ב-containment, יכולת החשיבה, רוורי (reverie), ותפקוד אלפא/בטא. נתח את האם המטפל מכיל את החוויות הרגשיות.`
  },
  {
    id: 'fairbairn',
    nameHe: 'פיירבייר - יחסי אובייקט',
    nameEn: 'Fairbairn - Object Relations',
    category: 'psychodynamic',
    description: 'אובייקטים פנימיים, ego מפוצל',
    prompt: `התמקד באובייקטים פנימיים מרגיזים ומושכים, פיצול ה-ego, והצורך ביחסים.`
  },
  {
    id: 'kernberg',
    nameHe: 'קרנברג - הפרעות אישיות',
    nameEn: 'Kernberg - Personality Disorders',
    category: 'psychodynamic',
    description: 'ארגון אישיות, נרקיסיזם',
    prompt: `התמקד בארגון אישיות (נוירוטי, גבולי, פסיכוטי), נרקיסיזם פתולוגי, ו-TFP.`
  },
  {
    id: 'mahler',
    nameHe: 'מאהלר - הפרדה-אינדיבידואציה',
    nameEn: 'Mahler - Separation-Individuation',
    category: 'psychodynamic',
    description: 'התפתחות תינוקות, סימביוזה',
    prompt: `התמקד בתהליכי הפרדה-אינדיבידואציה, סימביוזה, rapprochement. נתח קשיים התפתחותיים מוקדמים.`
  },
  {
    id: 'winnicott',
    nameHe: 'ויניקוט - holding ואובייקט מעברי',
    nameEn: 'Winnicott - Holding & Transitional Object',
    category: 'psychodynamic',
    description: 'holding, good-enough mother, אובייקט מעברי',
    prompt: `התמקד ב-holding, good-enough mother, אובייקט מעברי, ו-true/false self. נתח את איכות ההכלה הטיפולית.`
  },
  {
    id: 'kohut',
    nameHe: 'קוהוט - פסיכולוגיית העצמי',
    nameEn: 'Kohut - Self Psychology',
    category: 'psychodynamic',
    description: 'selfobjects, נרקיסיזם בריא',
    prompt: `התמקד ב-selfobjects (mirroring, idealizing, twinship), נרקיסיזם בריא, ופצעים נרקיסיסטיים. נתח צרכי self.`
  },
  {
    id: 'bowlby',
    nameHe: 'בולבי - תיאורית ההתקשרות',
    nameEn: 'Bowlby - Attachment Theory',
    category: 'psychodynamic',
    description: 'התקשרות, דמויות קשר',
    prompt: `התמקד בדפוסי התקשרות, דמויות קשר פנימיות, וחיפוש קרבה. נתח היסטוריית התקשרות.`
  },
  {
    id: 'fonagy',
    nameHe: 'פונאג\'י - טיפול מבוסס mentalization',
    nameEn: 'Fonagy - Mentalization-Based Therapy (MBT)',
    category: 'psychodynamic',
    description: 'mentalization, reflective functioning',
    prompt: `התמקד ביכולת ה-mentalization, reflective functioning, והבנת מצבים נפשיים. עודד חשיבה על מחשבות.`
  },
  {
    id: 'stern',
    nameHe: 'שטרן - intersubjectivity',
    nameEn: 'Stern - Intersubjectivity',
    category: 'psychodynamic',
    description: 'רגעים עכשוויים, intersubjectivity',
    prompt: `התמקד ב-intersubjectivity, רגעי נוכחות, ו-now moments. נתח את החוויה המשותפת בין מטפל-מטופל.`
  },
  {
    id: 'mitchell',
    nameHe: 'מיטשל - פסיכואנליזה רלציונלית',
    nameEn: 'Mitchell - Relational Psychoanalysis',
    category: 'psychodynamic',
    description: 'יחסים, אינטראקציה דו-כיוונית',
    prompt: `התמקד במטריקס הרלציונלי, השפעה הדדית, ו-enactments. נתח את הדינמיקה הבין-אישית.`
  },

  // ==================== COGNITIVE-BEHAVIORAL ====================
  {
    id: 'beck-cbt',
    nameHe: 'בק - CBT קוגניטיבית',
    nameEn: 'Beck - Cognitive Therapy',
    category: 'cbt',
    description: 'מחשבות אוטומטיות, עיוותים קוגניטיביים',
    prompt: `התמקד במחשבות אוטומטיות, עיוותים קוגניטיביים (all-or-nothing, catastrophizing), ו-core beliefs. הצע שיעורי בית התנהגותיים.`
  },
  {
    id: 'ellis-rebt',
    nameHe: 'אליס - REBT רציונלית-רגשית',
    nameEn: 'Ellis - REBT',
    category: 'cbt',
    description: 'ABC model, irrational beliefs',
    prompt: `התמקד ב-ABC model (Activating event, Beliefs, Consequences). זהה ואתגר irrational beliefs ו-musts/shoulds.`
  },
  {
    id: 'meichenbaum',
    nameHe: 'מייכנבאום - שינוי קוגניטיבי-התנהגותי',
    nameEn: 'Meichenbaum - Cognitive-Behavioral Modification',
    category: 'cbt',
    description: 'self-talk, stress inoculation',
    prompt: `התמקד ב-self-talk, stress inoculation training, ו-coping skills. בנה חוסן ומיומנויות התמודדות.`
  },
  {
    id: 'young-schema',
    nameHe: 'יאנג - Schema Therapy',
    nameEn: 'Young - Schema Therapy',
    category: 'cbt',
    description: 'סכמות מוקדמות לא-מסתגלות',
    prompt: `זהה Early Maladaptive Schemas (abandonment, mistrust, defectiveness), מצבי סכמה (child/parent/adult modes), ו-coping styles.`
  },
  {
    id: 'hayes-act',
    nameHe: 'הייס - ACT',
    nameEn: 'Hayes - Acceptance & Commitment Therapy',
    category: 'cbt',
    description: 'ערכים, קבלה, defusion',
    prompt: `התמקד בערכים אישיים, קבלה פסיכולוגית, cognitive defusion, ו-committed action. עודד גמישות פסיכולוגית.`
  },
  {
    id: 'linehan-dbt',
    nameHe: 'ליניהן - DBT דיאלקטית',
    nameEn: 'Linehan - Dialectical Behavior Therapy',
    category: 'cbt',
    description: 'רגולציה רגשית, distress tolerance',
    prompt: `התמקד ב-4 מודולים: mindfulness, distress tolerance, emotion regulation, interpersonal effectiveness. נתח דיאלקטיקות.`
  },
  {
    id: 'segal-mbct',
    nameHe: 'סיגל, וויליאמס, טיסדייל - MBCT',
    nameEn: 'Segal, Williams, Teasdale - MBCT',
    category: 'cbt',
    description: 'מיינדפולנס קוגניטיבי',
    prompt: `שלב מיינדפולנס עם CBT. עודד awareness ללא שיפוט, decentering, והתבוננות במחשבות כאירועים נפשיים.`
  },
  {
    id: 'gilbert-cft',
    nameHe: 'גילברט - Compassion-Focused',
    nameEn: 'Gilbert - Compassion-Focused Therapy',
    category: 'cbt',
    description: 'חמלה עצמית, 3 מערכות רגש',
    prompt: `התמקד ב-3 מערכות רגש (threat, drive, soothing), חמלה עצמית, ו-compassionate mind. טפח self-compassion.`
  },

  // ==================== HUMANISTIC / EXISTENTIAL ====================
  {
    id: 'rogers',
    nameHe: 'רוג\'רס - Person-Centered',
    nameEn: 'Rogers - Person-Centered Therapy',
    category: 'humanistic',
    description: 'קבלה ללא תנאי, אמפתיה, אותנטיות',
    prompt: `התמקד בקבלה ללא תנאי, אמפתיה, אותנטיות, ותהליך self-actualization. צור אקלים טיפולי מקבל.`
  },
  {
    id: 'perls-gestalt',
    nameHe: 'פרלס - גשטלט',
    nameEn: 'Perls - Gestalt Therapy',
    category: 'humanistic',
    description: 'כאן ועכשיו, awareness, ניסויים',
    prompt: `התמקד בכאן ועכשיו, awareness, והשלמת gestalts לא גמורות. עודד ניסויים וקונטקט אותנטי.`
  },
  {
    id: 'yalom',
    nameHe: 'יאלום - אקזיסטנציאלית',
    nameEn: 'Yalom - Existential Therapy',
    category: 'humanistic',
    description: 'מוות, חירות, בדידות, משמעות',
    prompt: `התמקד ב-4 דאגות אקזיסטנציאליות: מוות, חירות, בדידות אקזיסטנציאלית, וחיפוש משמעות.`
  },
  {
    id: 'frankl-logotherapy',
    nameHe: 'פרנקל - Logotherapy',
    nameEn: 'Frankl - Logotherapy',
    category: 'humanistic',
    description: 'חיפוש משמעות, will to meaning',
    prompt: `התמקד בחיפוש משמעות בחיים ובסבל, will to meaning, ואחריות אישית. עודד מציאת purpose.`
  },
  {
    id: 'may',
    nameHe: 'מיי - אקזיסטנציאליזם אמריקאי',
    nameEn: 'May - American Existentialism',
    category: 'humanistic',
    description: 'חרדה, אומץ, חירות',
    prompt: `התמקד בחרדה כחלק בלתי נפרד מחירות, אומץ להיות, ויצירתיות. נתח את המשמעות של חירות.`
  },
  {
    id: 'maslow',
    nameHe: 'מאסלו - הומניסטית',
    nameEn: 'Maslow - Humanistic',
    category: 'humanistic',
    description: 'היררכיית צרכים, self-actualization',
    prompt: `התמקד בהיררכיית הצרכים, self-actualization, ו-peak experiences. עודד צמיחה אישית ומימוש עצמי.`
  },

  // ==================== SYSTEMIC / FAMILY ====================
  {
    id: 'minuchin',
    nameHe: 'מינוכין - מבנית',
    nameEn: 'Minuchin - Structural Family Therapy',
    category: 'systemic',
    description: 'גבולות, היררכיות, תת-מערכות',
    prompt: `נתח מבנה משפחתי, גבולות (clear/rigid/diffuse), היררכיות, ו-subsystems. זהה enmeshment או disengagement.`
  },
  {
    id: 'haley-strategic',
    nameHe: 'הילי - אסטרטגית',
    nameEn: 'Haley - Strategic Family Therapy',
    category: 'systemic',
    description: 'פרדוקסים, מטרות, שינוי מהיר',
    prompt: `התמקד בפתרון בעיות ספציפיות, שימוש באסטרטגיות פרדוקסליות, וinterventions ממוקדות. חפש דפוסי תקשורת.`
  },
  {
    id: 'satir',
    nameHe: 'סאטיר - תקשורת',
    nameEn: 'Satir - Communication-Focused',
    category: 'systemic',
    description: 'תקשורת, self-esteem, דפוסי תקשורת',
    prompt: `התמקד בדפוסי תקשורת (placating, blaming, computing, distracting), self-esteem, וחיבור רגשי.`
  },
  {
    id: 'bowen',
    nameHe: 'באוון - Bowenian',
    nameEn: 'Bowen - Bowen Family Systems',
    category: 'systemic',
    description: 'דיפרנציאציה, triangulation',
    prompt: `התמקד בדיפרנציאציה של העצמי, triangulation, cutoffs רגשיים, ו-multigenerational transmission. השתמש ב-genograms.`
  },
  {
    id: 'milan',
    nameHe: 'מילאן - Milan Approach',
    nameEn: 'Milan - Milan Systemic',
    category: 'systemic',
    description: 'circular questioning, neutrality',
    prompt: `השתמש ב-circular questioning, neutrality, ו-systemic hypotheses. חפש דפוסים מעגליים ומשחקים משפחתיים.`
  },
  {
    id: 'white-narrative',
    nameHe: 'ווייט ואפסטון - נרטיבית',
    nameEn: 'White & Epston - Narrative Therapy',
    category: 'systemic',
    description: 'סיפורים, externalization',
    prompt: `התמקד ב-externalization של הבעיה, re-authoring, ו-unique outcomes. עזור לבנות נרטיב חלופי מעצים.`
  },
  {
    id: 'de-shazer-sfbt',
    nameHe: 'דה שייזר וברג - ממוקדת פתרונות',
    nameEn: 'De Shazer & Berg - Solution-Focused',
    category: 'systemic',
    description: 'חוזקות, יוצאים מן הכלל, שאלת הנס',
    prompt: `התמקד בחוזקות, יוצאים מן הכלל, scaling questions, ושאלת הנס. בנה על מה שעובד במקום על הבעיה.`
  },

  // ==================== TRAUMA & EMDR ====================
  {
    id: 'shapiro-emdr',
    nameHe: 'שפירו - EMDR',
    nameEn: 'Shapiro - EMDR',
    category: 'trauma',
    description: 'עיבוד טראומות, bilateral stimulation',
    prompt: `התמקד בזיכרונות טראומטיים, negative cognitions, ו-bilateral stimulation. עקוב אחר SUD ו-VOC scores.`
  },
  {
    id: 'levine-se',
    nameHe: 'לוין - Somatic Experiencing',
    nameEn: 'Levine - Somatic Experiencing',
    category: 'trauma',
    description: 'טראומה בגוף, titration',
    prompt: `התמקד בתחושות גופניות, freeze response, ו-titration. עזור לשחרר אנרגיה טראומטית תקועה בהדרגה.`
  },
  {
    id: 'tf-cbt',
    nameHe: 'CBT ממוקד טראומה',
    nameEn: 'Trauma-Focused CBT',
    category: 'trauma',
    description: 'חשיפה, עיבוד קוגניטיבי',
    prompt: `התמקד בחשיפה מדורגת, עיבוד קוגניטיבי של טראומה, ורגולציה רגשית. השתמש ב-trauma narrative.`
  },
  {
    id: 'ogden-sensorimotor',
    nameHe: 'אוגדן - Sensorimotor',
    nameEn: 'Ogden - Sensorimotor Psychotherapy',
    category: 'trauma',
    description: 'טראומה בגוף, bottom-up',
    prompt: `התמקד בתחושות גופניות, movements, ו-bottom-up processing. עבוד עם ה-body memory של טראומה.`
  },

  // ==================== MINDFULNESS & AWARENESS ====================
  {
    id: 'kabat-zinn-mbsr',
    nameHe: 'קבט-זין - MBSR',
    nameEn: 'Kabat-Zinn - MBSR',
    category: 'mindfulness',
    description: 'מיינדפולנס, הפחתת לחץ',
    prompt: `התמקד בתרגולי mindfulness, body scan, ו-non-judgmental awareness. עודד קבלה ונוכחוּת.`
  },
  {
    id: 'mindfulness-based',
    nameHe: 'מבוסס מיינדפולנס',
    nameEn: 'Mindfulness-Based Therapy',
    category: 'mindfulness',
    description: 'מודעות, קבלה, נוכחות',
    prompt: `התמקד במודעות לרגע הנוכחי, קבלה ללא שיפוט, ו-decentering. עודד תרגול מיינדפולנס.`
  },

  // ==================== EXPRESSIVE & BODY-MIND ====================
  {
    id: 'art-therapy',
    nameHe: 'טיפול באמנות',
    nameEn: 'Art Therapy',
    category: 'expressive',
    description: 'ביטוי יצירתי, סמלים',
    prompt: `התמקד בביטוי יצירתי, סמלים ביצירות, ו-non-verbal expression. נתח משמעות רגשית ביצירות.`
  },
  {
    id: 'music-therapy',
    nameHe: 'טיפול במוזיקה',
    nameEn: 'Music Therapy',
    category: 'expressive',
    description: 'ביטוי מוזיקלי, רגולציה',
    prompt: `התמקד בביטוי מוזיקלי, רגולציה רגשית דרך מוזיקה, ו-non-verbal communication.`
  },
  {
    id: 'dance-movement',
    nameHe: 'טיפול בתנועה וריקוד',
    nameEn: 'Dance/Movement Therapy',
    category: 'expressive',
    description: 'תנועה, גוף, ביטוי',
    prompt: `התמקד בתנועה כביטוי רגשי, body awareness, ו-non-verbal expression דרך הגוף.`
  },
  {
    id: 'moreno-psychodrama',
    nameHe: 'מורנו - פסיכודרמה',
    nameEn: 'Moreno - Psychodrama',
    category: 'expressive',
    description: 'דרמה טיפולית, role playing',
    prompt: `התמקד ב-role playing, enactments, ו-spontaneity. השתמש בטכניקות כמו role reversal ו-doubling.`
  },
  {
    id: 'lowen-bioenergetics',
    nameHe: 'לואן - Bioenergetics',
    nameEn: 'Lowen - Bioenergetic Analysis',
    category: 'expressive',
    description: 'אנרגיה בגוף, character armor',
    prompt: `התמקד באנרגיה בגוף, character armor, grounding, ו-body expression. עבוד עם נשימה ותנועה.`
  },
  {
    id: 'kurtz-hakomi',
    nameHe: 'קורץ - Hakomi',
    nameEn: 'Kurtz - Hakomi',
    category: 'expressive',
    description: 'mindfulness סומטי, gentleness',
    prompt: `שלב mindfulness עם somatic awareness, gentleness, ו-loving presence. חקור core beliefs דרך הגוף.`
  },

  // ==================== BRIEF & SOLUTION-FOCUSED ====================
  {
    id: 'solution-focused',
    nameHe: 'ממוקדת פתרונות',
    nameEn: 'Solution-Focused Brief Therapy',
    category: 'brief',
    description: 'חוזקות, מטרות, יוצאים מן הכלל',
    prompt: `התמקד במה שעובד, scaling questions, miracle question, ו-exceptions. בנה על חוזקות ולא על בעיות.`
  },
  {
    id: 'brief-psychodynamic',
    nameHe: 'פסיכודינמית קצרה',
    nameEn: 'Brief Psychodynamic Therapy',
    category: 'brief',
    description: 'מוקד מרכזי, זמן מוגבל',
    prompt: `זהה מוקד קונפליקט מרכזי (CCRT), עבוד עליו במסגרת זמן מוגבלת. התמקד בהעברה.`
  },

  // ==================== MODERN & INTEGRATIVE ====================
  {
    id: 'schwartz-ifs',
    nameHe: 'שוורץ - IFS (Internal Family Systems)',
    nameEn: 'Schwartz - Internal Family Systems',
    category: 'modern',
    description: 'parts, Self, exiles, managers, firefighters',
    prompt: `זהה parts פנימיות (exiles, managers, firefighters), עבוד מה-Self, ו-unblending. עזור ל-parts להתרפא.`
  },
  {
    id: 'greenberg-eft',
    nameHe: 'גרינברג - EFT ממוקדת רגש',
    nameEn: 'Greenberg - Emotion-Focused Therapy',
    category: 'modern',
    description: 'רגשות ראשוניים, emotional processing',
    prompt: `התמקד ברגשות ראשוניים (vs משניים), emotional processing, ו-chair work. עזור לגשת לרגשות מרכזיים.`
  },
  {
    id: 'tfp',
    nameHe: 'TFP - Transference-Focused',
    nameEn: 'Transference-Focused Psychotherapy',
    category: 'modern',
    description: 'הפרעות אישיות, העברה',
    prompt: `התמקד בהעברה וניגוד-העברה, פיצול, ו-object relations. מותאם להפרעות אישיות חמורות.`
  },
  {
    id: 'seligman-positive',
    nameHe: 'סליגמן - פסיכולוגיה חיובית',
    nameEn: 'Seligman - Positive Psychology',
    category: 'modern',
    description: 'חוזקות, אושר, flourishing',
    prompt: `התמקד בחוזקות, PERMA model (Positive emotion, Engagement, Relationships, Meaning, Achievement), ו-flourishing.`
  },
  {
    id: 'integrative',
    nameHe: 'אינטגרטיבית',
    nameEn: 'Integrative Therapy',
    category: 'modern',
    description: 'שילוב גישות לפי צורך',
    prompt: `שלב גישות שונות לפי הצורך הקליני. התאם את הגישה למטופל ולא להיפך.`
  },
  {
    id: 'lazarus-multimodal',
    nameHe: 'לזרוס - Multimodal',
    nameEn: 'Lazarus - Multimodal Therapy',
    category: 'modern',
    description: 'BASIC ID, שבעה ממדים',
    prompt: `השתמש ב-BASIC ID framework: Behavior, Affect, Sensation, Imagery, Cognition, Interpersonal, Drugs/Biology.`
  },

  // ==================== COACHING & DEVELOPMENT ====================
  {
    id: 'life-coaching',
    nameHe: 'Life Coaching',
    nameEn: 'Life Coaching',
    category: 'coaching',
    description: 'מטרות, תוצאות, פעולה',
    prompt: `התמקד במטרות ברורות, action plans, accountability, ותוצאות מדידות. עודד צמיחה ופעולה.`
  },
  {
    id: 'nlp',
    nameHe: 'NLP',
    nameEn: 'Neuro-Linguistic Programming',
    category: 'coaching',
    description: 'דפוסי חשיבה, reframing',
    prompt: `התמקד בדפוסי חשיבה, anchoring, reframing, ו-modeling excellence. עבוד עם שפה ותפיסה.`
  },
  {
    id: 'motivational-interviewing',
    nameHe: 'מיללר ורולניק - ראיון מוטיבציוני',
    nameEn: 'Miller & Rollnick - Motivational Interviewing',
    category: 'coaching',
    description: 'מוטיבציה פנימית, ambivalence',
    prompt: `התמקד במוטיבציה פנימית, חקור ambivalence, ו-OARS (Open questions, Affirmations, Reflections, Summaries).`
  },
  {
    id: 'strengths-based',
    nameHe: 'מבוסס חוזקות',
    nameEn: 'Strengths-Based Approach',
    category: 'coaching',
    description: 'חוזקות, משאבים, resilience',
    prompt: `התמקד בחוזקות קיימות, משאבים, ו-resilience. בנה על מה שעובד ועל יכולות.`
  },

  // ==================== ECLECTIC ====================
  {
    id: 'eclectic',
    nameHe: 'אקלקטית / אינטגרטיבית',
    nameEn: 'Eclectic / Integrative',
    category: 'modern',
    description: 'שילוב גישות מרובות',
    prompt: `שלב גישות מרובות בהתאם למטופל והצורך הקליני. היה גמיש ומגיב לצרכים המשתנים.`
  },
];

// Helper functions
export function getApproachesByCategory(categoryId: string): TherapeuticApproach[] {
  return THERAPEUTIC_APPROACHES.filter(a => a.category === categoryId);
}

export function searchApproaches(query: string): TherapeuticApproach[] {
  const lowerQuery = query.toLowerCase();
  return THERAPEUTIC_APPROACHES.filter(a => 
    a.nameHe.toLowerCase().includes(lowerQuery) ||
    a.nameEn.toLowerCase().includes(lowerQuery) ||
    a.description.toLowerCase().includes(lowerQuery)
  );
}

export function getApproachById(id: string): TherapeuticApproach | undefined {
  return THERAPEUTIC_APPROACHES.find(a => a.id === id);
}

export function getApproachPrompts(approachIds: string[]): string {
  return approachIds
    .map(id => {
      const approach = getApproachById(id);
      return approach ? approach.prompt : '';
    })
    .filter(p => p)
    .join('\n\n');
}
