import prisma from "../src/lib/prisma";

// Questionnaire definitions based on markdown files
const questionnaires = [
  {
    code: "BDI2",
    name: "מדד דיכאון בק",
    nameEn: "Beck Depression Inventory - Second Edition",
    description: "שאלון המכיל 21 קבוצות של היגדים למדידת חומרת דיכאון בשבועיים האחרונים",
    category: "דיכאון",
    questions: [
      {
        id: 1,
        title: "עצבות",
        options: [
          { value: 0, text: "אני לא מרגיש עצוב" },
          { value: 1, text: "אני מרגיש עצוב הרבה מהזמן" },
          { value: 2, text: "אני עצוב כל הזמן" },
          { value: 3, text: "אני כל כך עצוב או אומלל שאני לא יכול לשאת את זה" }
        ]
      },
      {
        id: 2,
        title: "פסימיות",
        options: [
          { value: 0, text: "אני לא מיואש לגבי העתיד שלי" },
          { value: 1, text: "אני מרגיש יותר מיואש לגבי העתיד שלי מאשר בעבר" },
          { value: 2, text: "אני לא מצפה שדברים יסתדרו בשבילי" },
          { value: 3, text: "אני מרגיש שהעתיד שלי חסר תקווה ושדברים רק ילכו ויחמירו" }
        ]
      },
      {
        id: 3,
        title: "כישלון בעבר",
        options: [
          { value: 0, text: "אני לא מרגיש כמו כישלון" },
          { value: 1, text: "נכשלתי יותר מכפי שהייתי צריך" },
          { value: 2, text: "כשאני מסתכל לאחור, אני רואה הרבה כישלונות" },
          { value: 3, text: "אני מרגיש שאני כישלון מוחלט כאדם" }
        ]
      },
      {
        id: 4,
        title: "אובדן הנאה",
        options: [
          { value: 0, text: "אני מקבל הנאה מדברים כמו תמיד" },
          { value: 1, text: "אני לא נהנה מדברים כמו פעם" },
          { value: 2, text: "אני מקבל מעט מאוד הנאה מדברים שבעבר נהניתי מהם" },
          { value: 3, text: "אני לא מקבל שום הנאה מדברים שבעבר נהניתי מהם" }
        ]
      },
      {
        id: 5,
        title: "רגשות אשמה",
        options: [
          { value: 0, text: "אני לא מרגיש אשם במיוחד" },
          { value: 1, text: "אני מרגיש אשם על הרבה דברים שעשיתי או שהייתי צריך לעשות" },
          { value: 2, text: "אני מרגיש אשם רוב הזמן" },
          { value: 3, text: "אני מרגיש אשם כל הזמן" }
        ]
      },
      {
        id: 6,
        title: "רגשות ענישה",
        options: [
          { value: 0, text: "אני לא מרגיש שאני נענש" },
          { value: 1, text: "אני מרגיש שאני עלול להיענש" },
          { value: 2, text: "אני מצפה להיענש" },
          { value: 3, text: "אני מרגיש שאני נענש" }
        ]
      },
      {
        id: 7,
        title: "חוסר אהבה עצמית",
        options: [
          { value: 0, text: "אני מרגיש אותו דבר כלפי עצמי כמו תמיד" },
          { value: 1, text: "איבדתי את הביטחון בעצמי" },
          { value: 2, text: "אני מאוכזב מעצמי" },
          { value: 3, text: "אני לא אוהב את עצמי" }
        ]
      },
      {
        id: 8,
        title: "ביקורת עצמית",
        options: [
          { value: 0, text: "אני לא מבקר או מאשים את עצמי יותר מהרגיל" },
          { value: 1, text: "אני יותר ביקורתי כלפי עצמי ממה שהייתי" },
          { value: 2, text: "אני מבקר את עצמי על כל הטעויות שלי" },
          { value: 3, text: "אני מאשים את עצמי על כל דבר רע שקורה" }
        ]
      },
      {
        id: 9,
        title: "מחשבות או משאלות התאבדות",
        options: [
          { value: 0, text: "אין לי מחשבות לפגוע בעצמי" },
          { value: 1, text: "יש לי מחשבות לפגוע בעצמי, אבל לא אעשה זאת" },
          { value: 2, text: "הייתי רוצה להתאבד" },
          { value: 3, text: "הייתי מתאבד אם היתה לי הזדמנות" }
        ],
        isCritical: true
      },
      {
        id: 10,
        title: "בכי",
        options: [
          { value: 0, text: "אני לא בוכה יותר מהרגיל" },
          { value: 1, text: "אני בוכה יותר מפעם" },
          { value: 2, text: "אני בוכה על כל דבר קטן" },
          { value: 3, text: "אני מרגיש שאני רוצה לבכות, אבל אני לא יכול" }
        ]
      },
      {
        id: 11,
        title: "אי-שקט",
        options: [
          { value: 0, text: "אני לא יותר חסר מנוחה או מתוח מהרגיל" },
          { value: 1, text: "אני מרגיש יותר חסר מנוחה או מתוח מהרגיל" },
          { value: 2, text: "אני כל כך חסר מנוחה או נסער שקשה לי לשבת במקום" },
          { value: 3, text: "אני כל כך חסר מנוחה או נסער שאני חייב להמשיך לזוז או לעשות משהו" }
        ]
      },
      {
        id: 12,
        title: "אובדן עניין",
        options: [
          { value: 0, text: "לא איבדתי עניין באנשים אחרים או בפעילויות" },
          { value: 1, text: "אני פחות מתעניין באנשים אחרים או בדברים מאשר פעם" },
          { value: 2, text: "איבדתי את רוב העניין שלי באנשים אחרים או בדברים" },
          { value: 3, text: "קשה לי להתעניין בכלום" }
        ]
      },
      {
        id: 13,
        title: "חוסר החלטיות",
        options: [
          { value: 0, text: "אני מקבל החלטות כמו תמיד" },
          { value: 1, text: "קשה לי יותר מהרגיל לקבל החלטות" },
          { value: 2, text: "קשה לי הרבה יותר לקבל החלטות מפעם" },
          { value: 3, text: "יש לי בעיה לקבל כל החלטה שהיא" }
        ]
      },
      {
        id: 14,
        title: "חוסר ערך",
        options: [
          { value: 0, text: "אני לא מרגיש שאני חסר ערך" },
          { value: 1, text: "אני לא רואה את עצמי בעל ערך ושימושי כמו פעם" },
          { value: 2, text: "אני מרגיש יותר חסר ערך בהשוואה לאנשים אחרים" },
          { value: 3, text: "אני מרגיש חסר ערך לחלוטין" }
        ]
      },
      {
        id: 15,
        title: "אובדן אנרגיה",
        options: [
          { value: 0, text: "יש לי אותה כמות אנרגיה כמו תמיד" },
          { value: 1, text: "יש לי פחות אנרגיה מפעם" },
          { value: 2, text: "אין לי מספיק אנרגיה לעשות הרבה דברים" },
          { value: 3, text: "אין לי מספיק אנרגיה לעשות שום דבר" }
        ]
      },
      {
        id: 16,
        title: "שינויים בדפוסי שינה",
        options: [
          { value: 0, text: "לא חל שינוי בדפוס השינה שלי" },
          { value: 1, text: "אני ישן קצת יותר/פחות מהרגיל" },
          { value: 2, text: "אני ישן הרבה יותר/פחות מהרגיל" },
          { value: 3, text: "אני ישן כמעט כל היום / אני מתעורר שעה-שעתיים מוקדם ולא מצליח להירדם שוב" }
        ]
      },
      {
        id: 17,
        title: "עצבנות",
        options: [
          { value: 0, text: "אני לא יותר עצבני מהרגיל" },
          { value: 1, text: "אני יותר עצבני מהרגיל" },
          { value: 2, text: "אני הרבה יותר עצבני מהרגיל" },
          { value: 3, text: "אני עצבני כל הזמן" }
        ]
      },
      {
        id: 18,
        title: "שינויים בתיאבון",
        options: [
          { value: 0, text: "לא חל שינוי בתיאבון שלי" },
          { value: 1, text: "התיאבון שלי קצת פחות/יותר מהרגיל" },
          { value: 2, text: "התיאבון שלי הרבה פחות/יותר מהרגיל" },
          { value: 3, text: "אין לי תיאבון בכלל / אני משתוקק לאוכל כל הזמן" }
        ]
      },
      {
        id: 19,
        title: "קשיי ריכוז",
        options: [
          { value: 0, text: "אני יכול להתרכז כמו תמיד" },
          { value: 1, text: "אני לא יכול להתרכז כמו שאני רגיל" },
          { value: 2, text: "קשה לי להחזיק את הדעת על משהו לאורך זמן" },
          { value: 3, text: "אני לא מצליח להתרכז על שום דבר" }
        ]
      },
      {
        id: 20,
        title: "עייפות",
        options: [
          { value: 0, text: "אני לא יותר עייף מהרגיל" },
          { value: 1, text: "אני מתעייף יותר מהר מהרגיל" },
          { value: 2, text: "אני יותר מדי עייף לעשות הרבה דברים שעשיתי פעם" },
          { value: 3, text: "אני יותר מדי עייף לעשות את רוב הדברים שעשיתי פעם" }
        ]
      },
      {
        id: 21,
        title: "אובדן עניין במין",
        options: [
          { value: 0, text: "לא שמתי לב לשינוי באחרונה בעניין שלי במין" },
          { value: 1, text: "אני פחות מעוניין במין מפעם" },
          { value: 2, text: "אני הרבה פחות מעוניין במין עכשיו" },
          { value: 3, text: "איבדתי עניין במין לחלוטין" }
        ]
      }
    ],
    scoring: {
      ranges: [
        { min: 0, max: 13, label: "מינימלי", description: "רמת דיכאון מינימלית" },
        { min: 14, max: 19, label: "קל", description: "רמת דיכאון קלה" },
        { min: 20, max: 28, label: "בינוני", description: "רמת דיכאון בינונית" },
        { min: 29, max: 63, label: "חמור", description: "רמת דיכאון חמורה" }
      ],
      maxScore: 63,
      criticalItems: [9]
    }
  },
  {
    code: "PCL5",
    name: "רשימת בדיקה לתסמיני PTSD",
    nameEn: "PTSD Checklist for DSM-5",
    description: "שאלון ל-20 פריטים לבדיקת תסמיני הפרעת דחק פוסט-טראומטית לפי DSM-5",
    category: "טראומה",
    questions: [
      {
        id: 1,
        section: "B",
        sectionName: "תסמיני חדירה",
        title: "זיכרונות חוזרים, לא רצויים ומטרידים של האירוע?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 2,
        section: "B",
        sectionName: "תסמיני חדירה",
        title: "חלומות חוזרים ומטרידים של האירוע?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 3,
        section: "B",
        sectionName: "תסמיני חדירה",
        title: "תחושה פתאומית כאילו האירוע חוזר וקורה שוב (פלאשבקים)?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 4,
        section: "B",
        sectionName: "תסמיני חדירה",
        title: "הרגשה רעה מאוד כשמשהו הזכיר לך את האירוע?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 5,
        section: "B",
        sectionName: "תסמיני חדירה",
        title: "תגובות גופניות חזקות (דופק מהיר, קושי לנשום, הזעה) כשמשהו הזכיר לך את האירוע?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 6,
        section: "C",
        sectionName: "הימנעות",
        title: "הימנעות מזיכרונות, מחשבות או תחושות הקשורים לאירוע?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 7,
        section: "C",
        sectionName: "הימנעות",
        title: "הימנעות מתזכורות חיצוניות לאירוע (אנשים, מקומות, שיחות, פעילויות, אובייקטים, מצבים)?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 8,
        section: "D",
        sectionName: "שינויים בקוגניציה ובמצב רוח",
        title: "קושי לזכור חלקים חשובים מהאירוע?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 9,
        section: "D",
        sectionName: "שינויים בקוגניציה ובמצב רוח",
        title: "אמונות שליליות מאוד על עצמך, על אנשים אחרים או על העולם?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 10,
        section: "D",
        sectionName: "שינויים בקוגניציה ובמצב רוח",
        title: "האשמת עצמך או אחרים באירוע או במה שקרה אחריו?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 11,
        section: "D",
        sectionName: "שינויים בקוגניציה ובמצב רוח",
        title: "רגשות שליליים חזקים כמו פחד, אימה, כעס, אשמה או בושה?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 12,
        section: "D",
        sectionName: "שינויים בקוגניציה ובמצב רוח",
        title: "אובדן עניין בפעילויות שנהנית מהן בעבר?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 13,
        section: "D",
        sectionName: "שינויים בקוגניציה ובמצב רוח",
        title: "תחושת ריחוק או ניתוק מאנשים אחרים?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 14,
        section: "D",
        sectionName: "שינויים בקוגניציה ובמצב רוח",
        title: "קושי לחוות רגשות חיוביים (אושר, אהבה, קרבה)?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 15,
        section: "E",
        sectionName: "שינויים בעוררות ובתגובתיות",
        title: "התנהגות עצבנית, פרצי כעס או התנהגות תוקפנית?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 16,
        section: "E",
        sectionName: "שינויים בעוררות ובתגובתיות",
        title: "לקיחת סיכונים מופרזת או התנהגות שעלולה לפגוע בך?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 17,
        section: "E",
        sectionName: "שינויים בעוררות ובתגובתיות",
        title: "היות 'על המשמר' או בדריכות יתר?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 18,
        section: "E",
        sectionName: "שינויים בעוררות ובתגובתיות",
        title: "להיות מופתע או להיבהל בקלות?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 19,
        section: "E",
        sectionName: "שינויים בעוררות ובתגובתיות",
        title: "קושי להתרכז?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      },
      {
        id: 20,
        section: "E",
        sectionName: "שינויים בעוררות ובתגובתיות",
        title: "קשיי שינה (קושי להירדם, להישאר ישן או שינה לא רגועה)?",
        options: [
          { value: 0, text: "כלל לא" },
          { value: 1, text: "מעט" },
          { value: 2, text: "במידה בינונית" },
          { value: 3, text: "במידה רבה" },
          { value: 4, text: "במידה קיצונית" }
        ]
      }
    ],
    scoring: {
      cutoff: 31,
      maxScore: 80,
      criteria: {
        B: { items: [1, 2, 3, 4, 5], required: 1, minScore: 2 },
        C: { items: [6, 7], required: 1, minScore: 2 },
        D: { items: [8, 9, 10, 11, 12, 13, 14], required: 2, minScore: 2 },
        E: { items: [15, 16, 17, 18, 19, 20], required: 2, minScore: 2 }
      },
      ranges: [
        { min: 0, max: 30, label: "מתחת לסף", description: "לא עומד בסף אבחנתי ל-PTSD" },
        { min: 31, max: 80, label: "מעל הסף", description: "עומד בסף אבחנתי ל-PTSD (יש לאמת עם ראיון קליני)" }
      ]
    }
  },
  {
    code: "HAMA",
    name: "סולם חרדה המילטון",
    nameEn: "Hamilton Anxiety Rating Scale",
    description: "סולם קליני ל-14 פריטים להערכת חומרת חרדה",
    category: "חרדה",
    questions: [
      {
        id: 1,
        title: "מצב רוח חרד",
        description: "דאגות, ציפייה לגרוע מכל, פחד, עצבנות",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל - לא מפריע משמעותית לתפקוד" },
          { value: 2, text: "בינוני - השפעה מסוימת על התפקוד" },
          { value: 3, text: "חמור - השפעה משמעותית על התפקוד" },
          { value: 4, text: "חמור מאוד / משתק - פגיעה חמורה בתפקוד" }
        ]
      },
      {
        id: 2,
        title: "מתח",
        description: "תחושת מתח, חוסר יכולת להירגע, תגובת בהלה, בכי קל, רעד, תחושת אי-מנוחה",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      },
      {
        id: 3,
        title: "פחדים",
        description: "מחשיכה, מזרים, מלהישאר לבד, מבעלי חיים, מתעבורה, מהמונים",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      },
      {
        id: 4,
        title: "נדודי שינה",
        description: "קושי להירדם, שינה מופרעת, שינה לא מרגיעה, עייפות בהתעוררות, חלומות, סיוטים",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      },
      {
        id: 5,
        title: "קוגניציה",
        description: "קושי בריכוז, זיכרון לקוי",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      },
      {
        id: 6,
        title: "מצב רוח דיכאוני",
        description: "אובדן עניין, חוסר הנאה מתחביבים, דיכאון, התעוררות מוקדמת, שינויים במצב רוח במהלך היום",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      },
      {
        id: 7,
        title: "תסמינים סומטיים - שריריים",
        description: "כאבים ועוויתות בשרירים, נוקשות, רעד, חריקת שיניים, קול לא יציב",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      },
      {
        id: 8,
        title: "תסמינים סומטיים - חושיים",
        description: "טנטון, ראייה מטושטשת, גלי חום וצמרמורת, תחושת חולשה, תחושת עקצוץ",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      },
      {
        id: 9,
        title: "תסמינים קרדיווסקולריים",
        description: "טכיקרדיה, דפיקות לב, כאבים בחזה, פעימות כלי דם, עילפון",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      },
      {
        id: 10,
        title: "תסמינים נשימתיים",
        description: "לחץ או כיווץ בחזה, תחושת חנק, אנחות, קוצר נשימה",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      },
      {
        id: 11,
        title: "תסמינים גסטרואינטסטינליים",
        description: "קושי בבליעה, גזים, כאבי בטן, צרבת, בחילה, הקאות, שלשול, עצירות, ירידה במשקל",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      },
      {
        id: 12,
        title: "תסמינים גניטו-אורינריים",
        description: "תכיפות מתן שתן, דחיפות, אמנוריאה, מנוראגיה, ירידה בחשק המיני, שפיכה מוקדמת, אימפוטנציה",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      },
      {
        id: 13,
        title: "תסמינים אוטונומיים",
        description: "פה יבש, סומק, חיוורון, הזעה, סחרחורת, כאבי ראש מתח, סימור שיער",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      },
      {
        id: 14,
        title: "התנהגות בראיון",
        description: "חוסר מנוחה, אי-שקט, רעד בידיים, קמטים במצח, מתח פנים, אנחות או נשימה מהירה, חיוורון פנים, בליעה",
        options: [
          { value: 0, text: "לא קיים" },
          { value: 1, text: "קל" },
          { value: 2, text: "בינוני" },
          { value: 3, text: "חמור" },
          { value: 4, text: "חמור מאוד" }
        ]
      }
    ],
    scoring: {
      maxScore: 56,
      ranges: [
        { min: 0, max: 7, label: "תקין/מינימלי", description: "ללא חרדה משמעותית" },
        { min: 8, max: 14, label: "קל", description: "חרדה קלה" },
        { min: 15, max: 23, label: "בינוני", description: "חרדה בינונית" },
        { min: 24, max: 56, label: "חמור", description: "חרדה חמורה" }
      ],
      subscales: {
        psychic: { items: [1, 2, 3, 4, 5, 6, 14], name: "חרדה פסיכית" },
        somatic: { items: [7, 8, 9, 10, 11, 12, 13], name: "חרדה סומטית" }
      }
    }
  },
  
  // ==================== מבחני השלכה ====================
  
  {
    code: "RORSCHACH",
    name: "מבחן רורשאך",
    nameEn: "Rorschach Inkblot Test",
    description: "מבחן השלכתי קלאסי המציג 10 לוחות של כתמי דיו. הנבדק מתבקש לתאר מה הוא רואה בכל לוח, ותגובותיו מנותחות לפי מערכת הקידוד המקיפה (Exner) או R-PAS.",
    category: "השלכתי",
    testType: "PROJECTIVE",
    stimuli: [
      { id: 1, name: "לוח I", description: "כתם דיו שחור-אפור סימטרי", isColor: false },
      { id: 2, name: "לוח II", description: "כתם דיו שחור-אדום סימטרי", isColor: true },
      { id: 3, name: "לוח III", description: "כתם דיו שחור-אדום עם דמויות אנושיות", isColor: true },
      { id: 4, name: "לוח IV", description: "כתם דיו שחור-אפור גדול ('לוח האב')", isColor: false },
      { id: 5, name: "לוח V", description: "כתם דיו שחור סימטרי ('עטלף/פרפר')", isColor: false },
      { id: 6, name: "לוח VI", description: "כתם דיו שחור-אפור עם טקסטורה", isColor: false },
      { id: 7, name: "לוח VII", description: "כתם דיו אפור בהיר ('לוח האם')", isColor: false },
      { id: 8, name: "לוח VIII", description: "לוח צבעוני ראשון - פסטלים", isColor: true },
      { id: 9, name: "לוח IX", description: "לוח צבעוני מורכב", isColor: true },
      { id: 10, name: "לוח X", description: "לוח צבעוני עם פריטים נפרדים", isColor: true }
    ],
    questions: [
      {
        id: 1,
        phase: "response",
        title: "שלב תגובה",
        instruction: "הצג את הלוח ושאל: 'מה זה יכול להיות?' תעד את כל התגובות מילה במילה.",
        fields: [
          { name: "responses", type: "textarea", label: "תגובות הנבדק (כל תגובה בשורה נפרדת)" },
          { name: "responseTime", type: "number", label: "זמן תגובה ראשונה (שניות)" },
          { name: "totalTime", type: "number", label: "זמן כולל בלוח (שניות)" },
          { name: "cardRotation", type: "text", label: "סיבובי הכרטיס" }
        ]
      },
      {
        id: 2,
        phase: "inquiry",
        title: "שלב חקירה",
        instruction: "חזור על כל תגובה ושאל: 'היכן בלוח ראית את זה?' ו'מה בלוח גרם לזה להיראות כך?'",
        fields: [
          { name: "location", type: "select", label: "מיקום", options: ["W (שלם)", "D (פרט גדול)", "Dd (פרט קטן)", "S (רווח לבן)"] },
          { name: "determinants", type: "multiselect", label: "קובעים", options: ["F (צורה)", "M (תנועה אנושית)", "FM (תנועת חיה)", "m (תנועה דוממת)", "C (צבע)", "C' (אכרומטי)", "T (טקסטורה)", "Y (הצללה)", "V (מימד)"] },
          { name: "content", type: "multiselect", label: "תוכן", options: ["H (אדם שלם)", "Hd (חלק אנושי)", "(H) (דמות אנושית)", "A (חיה שלמה)", "Ad (חלק חיה)", "An (אנטומיה)", "Art (אמנות)", "Bl (דם)", "Bt (בוטניקה)", "Cg (בגדים)", "Cl (ענן)", "Ex (פיצוץ)", "Fi (אש)", "Fd (אוכל)", "Ge (גאוגרפיה)", "Hh (בית)", "Ls (נוף)", "Na (טבע)", "Sc (מדע)", "Sx (מין)", "Xy (רנטגן)"] },
          { name: "formQuality", type: "select", label: "איכות צורה", options: ["+ (מעולה)", "o (רגילה)", "u (יוצאת דופן)", "- (מינוס)"] },
          { name: "popularResponse", type: "checkbox", label: "תגובה פופולרית (P)" },
          { name: "specialScores", type: "multiselect", label: "ציונים מיוחדים", options: ["DV (Deviant Verbalization)", "INC (Incongruous Combination)", "DR (Deviant Response)", "FAB (Fabulized Combination)", "ALOG (Autistic Logic)", "CONTAM (Contamination)", "AG (אגרסיה)", "COP (שיתוף פעולה)", "MOR (מורבידיות)"] }
        ]
      }
    ],
    scoring: {
      system: "Exner Comprehensive System / R-PAS",
      mainIndices: [
        { code: "R", name: "מספר תגובות", normal: "17-27" },
        { code: "Lambda", name: "יחס צורה טהורה", normal: "0.30-0.99" },
        { code: "F%", name: "אחוז צורה", normal: "30-70%" },
        { code: "X+%", name: "איכות צורה חיובית", normal: ">70%" },
        { code: "X-%", name: "איכות צורה שלילית", normal: "<15%" },
        { code: "Afr", name: "יחס רגשי", normal: "0.50-0.75" },
        { code: "EA", name: "חוויה בפועל", description: "M + WSumC" },
        { code: "es", name: "גירוי נחווה", description: "FM+m + SumShading" },
        { code: "D", name: "ציון D", normal: "0 ± 1" },
        { code: "Adj D", name: "ציון D מותאם", normal: "0 ± 1" }
      ],
      clusters: [
        { name: "שליטה ועמידות בלחץ", indices: ["D", "Adj D", "EA", "CDI"] },
        { name: "רגש", indices: ["DEPI", "Afr", "FC:CF+C", "Pure C", "S", "CP"] },
        { name: "עיבוד מידע", indices: ["Zf", "W:D:Dd", "W:M", "DQ+", "DQv"] },
        { name: "תיווך", indices: ["XA%", "WDA%", "X-%", "P", "X+%", "Xu%"] },
        { name: "אידיאציה", indices: ["a:p", "Ma:Mp", "2AB+Art+Ay", "MOR", "M-", "Sum6", "WSum6", "Lvl-2"] },
        { name: "תפיסה עצמית", indices: ["3r+(2)/R", "Fr+rF", "FD", "An+Xy", "MOR", "H:(H)+Hd+(Hd)"] },
        { name: "יחסים בינאישיים", indices: ["CDI", "HVI", "a:p", "Fd", "SumT", "H", "GHR:PHR", "COP", "AG", "PER", "Isolation"] }
      ]
    }
  },
  
  {
    code: "TAT",
    name: "מבחן אפרצפציה תמטית",
    nameEn: "Thematic Apperception Test",
    description: "מבחן השלכתי המציג תמונות עמומות ומבקש מהנבדק לספר סיפור על כל תמונה. מאפשר הערכת צרכים, לחצים, קונפליקטים ודינמיקה בינאישית.",
    category: "השלכתי",
    testType: "PROJECTIVE",
    stimuli: [
      { id: 1, name: "לוח 1", description: "ילד מסתכל על כינור", themes: ["שאיפות", "יחסים עם הורים", "הישגיות"] },
      { id: 2, name: "לוח 2", description: "סצנה כפרית עם שלוש דמויות", themes: ["שאיפות", "קונפליקט משפחתי", "לימודים"] },
      { id: "3BM", name: "לוח 3BM", description: "דמות כורעת ליד ספה", themes: ["דיכאון", "אובדן", "אשמה"] },
      { id: "3GF", name: "לוח 3GF", description: "אישה צעירה עומדת ליד דלת", themes: ["דיכאון", "קונפליקט", "יחסים"] },
      { id: 4, name: "לוח 4", description: "אישה מחזיקה בגבר", themes: ["יחסים זוגיים", "קונפליקט", "נאמנות"] },
      { id: 5, name: "לוח 5", description: "אישה מציצה לחדר", themes: ["יחסי אם", "חטטנות", "חרדה"] },
      { id: "6BM", name: "לוח 6BM", description: "גבר צעיר ואישה מבוגרת", themes: ["יחסי אם-בן", "עזיבה", "אשמה"] },
      { id: "6GF", name: "לוח 6GF", description: "אישה צעירה עם גבר מאחור", themes: ["יחסים הטרוסקסואליים", "חשד", "הפתעה"] },
      { id: "7BM", name: "לוח 7BM", description: "שני גברים", themes: ["יחסי אב-בן", "מנטור", "עימות"] },
      { id: "7GF", name: "לוח 7GF", description: "אישה מבוגרת וילדה עם בובה", themes: ["יחסי אם-בת", "זהות נשית"] },
      { id: "8BM", name: "לוח 8BM", description: "סצנת ניתוח עם נער", themes: ["אגרסיה", "שאיxxx", "xxטזיות"] },
      { id: "8GF", name: "לוח 8GF", description: "אישה צעירה יושבת", themes: ["הרהורים", "עתיד", "זהות"] },
      { id: 9, name: "לוח 9", description: "קבוצת גברים שוכבים", themes: ["יחסים חברתיים", "xxxxסקסואליות", "קבוצה"] },
      { id: 10, name: "לוח 10", description: "שתי דמויות בחיבוק", themes: ["אינטימיות", "פרידה", "יחסים קרובים"] },
      { id: 11, name: "לוח 11", description: "נוף סלעי עם יצורים", themes: ["פחדים ארכאיים", "פנטזיות", "סכנה"] },
      { id: 12, name: "לוח 12", description: "דמות שוכבת ודמות עומדת", themes: ["יחסי טיפול", "היפנוזה", "שליטה"] },
      { id: "13MF", name: "לוח 13MF", description: "גבר עומד, אישה שוכבת במיטה", themes: ["xxxxxx", "אשמה", "מוות"] },
      { id: 14, name: "לוח 14", description: "צללית בחלון", themes: ["שאיפות", "בדידות", "אופטימיות/פסימיות"] },
      { id: 15, name: "לוח 15", description: "דמות בבית קברות", themes: ["מוות", "אובדן", "דיכאון"] },
      { id: 16, name: "לוח 16", description: "לוח לבן", themes: ["פנטזיה חופשית", "אידיאל עצמי"] }
    ],
    questions: [
      {
        id: 1,
        phase: "story",
        title: "קבלת הסיפור",
        instruction: "הצג את התמונה ובקש: 'ספר לי סיפור על התמונה הזו. מה קורה כאן? מה קרה לפני? מה יקרה אחר כך? מה הדמויות חושבות ומרגישות?'",
        fields: [
          { name: "story", type: "textarea", label: "הסיפור המלא" },
          { name: "responseTime", type: "number", label: "זמן עד תחילת סיפור (שניות)" },
          { name: "totalTime", type: "number", label: "זמן כולל (שניות)" }
        ]
      },
      {
        id: 2,
        phase: "inquiry",
        title: "חקירה",
        instruction: "שאל שאלות הבהרה אם חסרים אלמנטים (מה קרה לפני? מה יקרה? מה מרגישים?)",
        fields: [
          { name: "clarifications", type: "textarea", label: "תוספות והבהרות" }
        ]
      },
      {
        id: 3,
        phase: "analysis",
        title: "ניתוח (למילוי ע\"י הבוחן)",
        fields: [
          { name: "hero", type: "text", label: "הגיבור (דמות ההזדהות)" },
          { name: "needs", type: "textarea", label: "צרכים (needs) שעולים" },
          { name: "press", type: "textarea", label: "לחצים (press) סביבתיים" },
          { name: "themes", type: "textarea", label: "תמות מרכזיות" },
          { name: "outcome", type: "select", label: "סיום הסיפור", options: ["חיובי", "שלילי", "עמום", "לא הושלם"] },
          { name: "defenses", type: "textarea", label: "הגנות שזוהו" },
          { name: "objectRelations", type: "textarea", label: "יחסי אובייקט" },
          { name: "affectIntegration", type: "select", label: "שילוב רגש", options: ["גבוה", "בינוני", "נמוך"] }
        ]
      }
    ],
    scoring: {
      system: "Murray/Bellak",
      analysisAreas: [
        { name: "צרכים (Needs)", examples: ["הישג", "השתייכות", "אגרסיה", "אוטונומיה", "תלות", "דומיננטיות", "הבנה", "מין"] },
        { name: "לחצים (Press)", examples: ["היעדר", "אגרסיה", "דחייה", "דומיננטיות", "הזנחה", "הגנה", "אובדן"] },
        { name: "אינטגרציה של האגו", description: "יכולת לבנות סיפור קוהרנטי עם התחלה, אמצע וסוף" },
        { name: "תפיסת העולם", description: "אופטימית/פסימית, עוינת/תומכת" },
        { name: "יחסי אובייקט", description: "איכות היחסים הבינאישיים בסיפורים" }
      ]
    }
  },
  
  {
    code: "HTP",
    name: "בית-עץ-אדם",
    nameEn: "House-Tree-Person Test",
    description: "מבחן ציור השלכתי בו הנבדק מצייר בית, עץ ואדם. הציורים מספקים מידע על תפיסה עצמית, יחסים בינאישיים ותפקוד רגשי.",
    category: "השלכתי",
    testType: "PROJECTIVE",
    questions: [
      {
        id: 1,
        drawing: "house",
        title: "ציור בית",
        instruction: "תן לנבדק דף A4 לרוחב ובקש: 'צייר בית. צייר את הבית הכי טוב שאתה יכול.'",
        fields: [
          { name: "drawingTime", type: "number", label: "זמן ציור (דקות)" },
          { name: "drawingNotes", type: "textarea", label: "הערות תהליך (התנהגות, מחיקות, סדר)" }
        ],
        postDrawingQuestions: [
          "מהו הבית הזה? מי גר בו?",
          "האם זה בית שמח או עצוב?",
          "מה קורה בתוך הבית?",
          "אם היית יכול לשנות משהו בבית, מה היית משנה?",
          "מה הבית הזה הכי צריך?"
        ]
      },
      {
        id: 2,
        drawing: "tree",
        title: "ציור עץ",
        instruction: "תן דף חדש לאורך ובקש: 'צייר עץ. צייר את העץ הכי טוב שאתה יכול.'",
        fields: [
          { name: "drawingTime", type: "number", label: "זמן ציור (דקות)" },
          { name: "drawingNotes", type: "textarea", label: "הערות תהליך" }
        ],
        postDrawingQuestions: [
          "איזה סוג עץ זה?",
          "כמה זה עץ חי/בריא?",
          "מה העץ הזה הכי צריך?",
          "אם העץ היה יכול לדבר, מה הוא היה אומר?",
          "כמה בערך בן העץ הזה?"
        ]
      },
      {
        id: 3,
        drawing: "person",
        title: "ציור אדם",
        instruction: "תן דף חדש לאורך ובקש: 'צייר אדם שלם, לא איש קו ולא קריקטורה.'",
        fields: [
          { name: "drawingTime", type: "number", label: "זמן ציור (דקות)" },
          { name: "drawingNotes", type: "textarea", label: "הערות תהליך" },
          { name: "personGender", type: "select", label: "מין הדמות שצוירה", options: ["זכר", "נקבה", "לא ברור"] }
        ],
        postDrawingQuestions: [
          "מי זה? כמה הוא/היא בן/בת?",
          "מה האדם הזה עושה? על מה הוא/היא חושב/ת?",
          "איך האדם הזה מרגיש?",
          "מה האדם הזה הכי צריך?",
          "מה האדם הזה הכי רוצה?"
        ]
      },
      {
        id: 4,
        drawing: "person2",
        title: "ציור אדם מהמין השני",
        instruction: "אם צייר גבר: 'עכשיו צייר אישה.' ולהפך.",
        fields: [
          { name: "drawingTime", type: "number", label: "זמן ציור (דקות)" },
          { name: "drawingNotes", type: "textarea", label: "הערות תהליך" }
        ]
      }
    ],
    scoring: {
      interpretationAreas: [
        { 
          element: "בית", 
          symbolism: "מייצג את ה-self, חיי הבית, יחסים משפחתיים",
          indicators: [
            { feature: "גודל", meaning: "תפיסת ה-self ומקומו בעולם" },
            { feature: "דלת", meaning: "פתיחות לאחרים, נגישות" },
            { feature: "חלונות", meaning: "קשר עם העולם החיצון" },
            { feature: "גג", meaning: "פנטזיה, חיי הרוח" },
            { feature: "עשן", meaning: "חמימות, מתח בבית" },
            { feature: "שביל", meaning: "נגישות, רצון בקשר" }
          ]
        },
        { 
          element: "עץ", 
          symbolism: "מייצג את ה-self העמוק, חיים פנימיים, התפתחות",
          indicators: [
            { feature: "גזע", meaning: "כוח האגו, יציבות" },
            { feature: "ענפים", meaning: "שאיפות, קשרים" },
            { feature: "שורשים", meaning: "קשר למציאות, לעבר" },
            { feature: "עלים", meaning: "חיוניות, יצירתיות" },
            { feature: "פירות", meaning: "הישגים, פוריות" },
            { feature: "צלקות", meaning: "טראומות, פגיעות" }
          ]
        },
        { 
          element: "אדם", 
          symbolism: "מייצג את תפיסת הגוף, זהות, יחסים",
          indicators: [
            { feature: "ראש", meaning: "אינטלקט, פנטזיה, שליטה" },
            { feature: "עיניים", meaning: "קשר, חשדנות, תקשורת" },
            { feature: "ידיים", meaning: "יכולת לפעול, שליטה" },
            { feature: "רגליים", meaning: "יציבות, עצמאות" },
            { feature: "גוף", meaning: "תפיסה עצמית פיזית" }
          ]
        }
      ]
    }
  },
  
  // ==================== מבחני אינטליגנציה ====================
  
  {
    code: "WAIS4",
    name: "מבחן וקסלר למבוגרים",
    nameEn: "Wechsler Adult Intelligence Scale - Fourth Edition",
    description: "מבחן האינטליגנציה המקיף ביותר למבוגרים (16+). מספק IQ כללי וארבעה מדדים: הבנה מילולית, חשיבה תפיסתית, זיכרון עבודה ומהירות עיבוד.",
    category: "אינטליגנציה",
    testType: "INTELLIGENCE",
    subtests: [
      {
        domain: "VCI",
        domainName: "הבנה מילולית (Verbal Comprehension)",
        tests: [
          { code: "SI", name: "דמיון", nameEn: "Similarities", description: "מציאת קשר בין שני מושגים", core: true },
          { code: "VC", name: "אוצר מילים", nameEn: "Vocabulary", description: "הגדרת מילים", core: true },
          { code: "IN", name: "ידע", nameEn: "Information", description: "ידע כללי", core: true },
          { code: "CO", name: "הבנה", nameEn: "Comprehension", description: "הבנת נורמות חברתיות", supplemental: true }
        ]
      },
      {
        domain: "PRI",
        domainName: "חשיבה תפיסתית (Perceptual Reasoning)",
        tests: [
          { code: "BD", name: "קוביות", nameEn: "Block Design", description: "שחזור דגמים עם קוביות", core: true },
          { code: "MR", name: "מטריצות", nameEn: "Matrix Reasoning", description: "השלמת סדרות ויזואליות", core: true },
          { code: "VP", name: "פאזלים", nameEn: "Visual Puzzles", description: "בחירת חלקים להשלמת תמונה", core: true },
          { code: "FW", name: "משקלות", nameEn: "Figure Weights", description: "חשיבה כמותית ואנלוגית", supplemental: true },
          { code: "PC", name: "השלמת תמונות", nameEn: "Picture Completion", description: "זיהוי חלק חסר", supplemental: true }
        ]
      },
      {
        domain: "WMI",
        domainName: "זיכרון עבודה (Working Memory)",
        tests: [
          { code: "DS", name: "טווח ספרות", nameEn: "Digit Span", description: "חזרה על סדרות מספרים", core: true },
          { code: "AR", name: "חשבון", nameEn: "Arithmetic", description: "בעיות חשבון מילוליות", core: true },
          { code: "LN", name: "סדרות אותיות-מספרים", nameEn: "Letter-Number Sequencing", description: "סידור סדרות מעורבות", supplemental: true }
        ]
      },
      {
        domain: "PSI",
        domainName: "מהירות עיבוד (Processing Speed)",
        tests: [
          { code: "SS", name: "חיפוש סמלים", nameEn: "Symbol Search", description: "התאמת סמלים בזמן", core: true },
          { code: "CD", name: "קידוד", nameEn: "Coding", description: "התאמת מספרים לסמלים", core: true },
          { code: "CA", name: "ביטול", nameEn: "Cancellation", description: "סימון צורות יעד", supplemental: true }
        ]
      }
    ],
    questions: [
      {
        id: 1,
        phase: "administration",
        title: "ביצוע תת-מבחן",
        instruction: "תעד את הציונים הגולמיים לכל תת-מבחן",
        fields: [
          { name: "subtest", type: "select", label: "תת-מבחן" },
          { name: "rawScore", type: "number", label: "ציון גולמי" },
          { name: "scaledScore", type: "number", label: "ציון סטנדרטי (1-19)" },
          { name: "notes", type: "textarea", label: "הערות התנהגותיות" }
        ]
      }
    ],
    scoring: {
      indexScores: [
        { code: "FSIQ", name: "IQ כללי", mean: 100, sd: 15 },
        { code: "VCI", name: "הבנה מילולית", mean: 100, sd: 15 },
        { code: "PRI", name: "חשיבה תפיסתית", mean: 100, sd: 15 },
        { code: "WMI", name: "זיכרון עבודה", mean: 100, sd: 15 },
        { code: "PSI", name: "מהירות עיבוד", mean: 100, sd: 15 }
      ],
      classifications: [
        { range: "130+", label: "גבוה מאוד", percentile: "98+" },
        { range: "120-129", label: "גבוה", percentile: "91-97" },
        { range: "110-119", label: "ממוצע גבוה", percentile: "75-90" },
        { range: "90-109", label: "ממוצע", percentile: "25-74" },
        { range: "80-89", label: "ממוצע נמוך", percentile: "9-24" },
        { range: "70-79", label: "גבולי", percentile: "2-8" },
        { range: "<70", label: "נמוך מאוד", percentile: "<2" }
      ],
      subtestMean: 10,
      subtestSD: 3
    }
  },
  
  {
    code: "WISC5",
    name: "מבחן וקסלר לילדים",
    nameEn: "Wechsler Intelligence Scale for Children - Fifth Edition",
    description: "מבחן האינטליגנציה המקיף ביותר לילדים (6-16). מספק IQ כללי וחמישה מדדים ראשוניים.",
    category: "אינטליגנציה",
    testType: "INTELLIGENCE",
    subtests: [
      {
        domain: "VCI",
        domainName: "הבנה מילולית (Verbal Comprehension)",
        tests: [
          { code: "SI", name: "דמיון", nameEn: "Similarities", core: true },
          { code: "VC", name: "אוצר מילים", nameEn: "Vocabulary", core: true },
          { code: "IN", name: "ידע", nameEn: "Information", supplemental: true },
          { code: "CO", name: "הבנה", nameEn: "Comprehension", supplemental: true }
        ]
      },
      {
        domain: "VSI",
        domainName: "חזותי-מרחבי (Visual Spatial)",
        tests: [
          { code: "BD", name: "קוביות", nameEn: "Block Design", core: true },
          { code: "VP", name: "פאזלים", nameEn: "Visual Puzzles", core: true }
        ]
      },
      {
        domain: "FRI",
        domainName: "חשיבה גמישה (Fluid Reasoning)",
        tests: [
          { code: "MR", name: "מטריצות", nameEn: "Matrix Reasoning", core: true },
          { code: "FW", name: "משקלות", nameEn: "Figure Weights", core: true },
          { code: "PC", name: "השלמת תמונות", nameEn: "Picture Concepts", supplemental: true },
          { code: "AR", name: "חשבון", nameEn: "Arithmetic", supplemental: true }
        ]
      },
      {
        domain: "WMI",
        domainName: "זיכרון עבודה (Working Memory)",
        tests: [
          { code: "DS", name: "טווח ספרות", nameEn: "Digit Span", core: true },
          { code: "PS", name: "טווח תמונות", nameEn: "Picture Span", core: true },
          { code: "LN", name: "סדרות אותיות-מספרים", nameEn: "Letter-Number Sequencing", supplemental: true }
        ]
      },
      {
        domain: "PSI",
        domainName: "מהירות עיבוד (Processing Speed)",
        tests: [
          { code: "CD", name: "קידוד", nameEn: "Coding", core: true },
          { code: "SS", name: "חיפוש סמלים", nameEn: "Symbol Search", core: true },
          { code: "CA", name: "ביטול", nameEn: "Cancellation", supplemental: true }
        ]
      }
    ],
    questions: [
      {
        id: 1,
        phase: "administration",
        title: "ביצוע תת-מבחן",
        fields: [
          { name: "subtest", type: "select", label: "תת-מבחן" },
          { name: "rawScore", type: "number", label: "ציון גולמי" },
          { name: "scaledScore", type: "number", label: "ציון סטנדרטי (1-19)" },
          { name: "notes", type: "textarea", label: "הערות" }
        ]
      }
    ],
    scoring: {
      indexScores: [
        { code: "FSIQ", name: "IQ כללי", mean: 100, sd: 15 },
        { code: "VCI", name: "הבנה מילולית", mean: 100, sd: 15 },
        { code: "VSI", name: "חזותי-מרחבי", mean: 100, sd: 15 },
        { code: "FRI", name: "חשיבה גמישה", mean: 100, sd: 15 },
        { code: "WMI", name: "זיכרון עבודה", mean: 100, sd: 15 },
        { code: "PSI", name: "מהירות עיבוד", mean: 100, sd: 15 }
      ]
    }
  },
  
  // ==================== מבחנים נוירופסיכולוגיים ====================
  
  {
    code: "BENDER",
    name: "מבחן בנדר-גשטלט II",
    nameEn: "Bender Visual-Motor Gestalt Test II",
    description: "מבחן לאינטגרציה ויזואלית-מוטורית. הנבדק מעתיק 16 דגמים גיאומטריים ומשחזר אותם מזיכרון.",
    category: "נוירופסיכולוגי",
    testType: "NEUROPSYCH",
    questions: [
      {
        id: 1,
        phase: "copy",
        title: "שלב העתקה",
        instruction: "הצג כל דגם ובקש להעתיק אותו על הנייר",
        fields: [
          { name: "design", type: "select", label: "דגם (1-16)" },
          { name: "copyErrors", type: "multiselect", label: "שגיאות", options: ["עיוות צורה", "סיבוב", "פרסברציה", "אינטגרציה", "השמטה", "חפיפה"] },
          { name: "copyTime", type: "number", label: "זמן (שניות)" }
        ]
      },
      {
        id: 2,
        phase: "recall",
        title: "שלב זיכרון",
        instruction: "לאחר 10-15 דקות, בקש לשחזר את הדגמים מזיכרון",
        fields: [
          { name: "recallErrors", type: "multiselect", label: "שגיאות בשחזור" },
          { name: "designsRecalled", type: "number", label: "מספר דגמים שנזכרו" }
        ]
      },
      {
        id: 3,
        phase: "motor",
        title: "מבחן מוטורי",
        instruction: "ביצוע משימות מוטוריות נוסxxx",	        fields: [
          { name: "motorTime", type: "number", label: "זמן ביצוע" },
          { name: "motorNotes", type: "textarea", label: "הערות" }
        ]
      }
    ],
    scoring: {
      copyScore: { max: 52, mean: 26, description: "ציון העתקה" },
      recallScore: { max: 52, mean: 20, description: "ציון זיכרון" },
      motorScore: { description: "ציון מוטורי" },
      interpretation: [
        { area: "אינטגרציה ויזו-מוטורית", description: "יכולת לתרגם קלט חזותי לפלט מוטורי" },
        { area: "זיכרון חזותי", description: "יכולת לזכור ולשחזר צורות" },
        { area: "תכנון מוטורי", description: "ארגון התנועה לביצוע המשימה" }
      ]
    }
  },
  
  {
    code: "RAVLT",
    name: "מבחן למידה מילולית-שמיעתית",
    nameEn: "Rey Auditory Verbal Learning Test",
    description: "מבחן זיכרון מילולי הכולל למידה של רשימת 15 מילים לאורך 5 ניסיונות, רשימה מפריעה, שחזור מיידי ומושהה, וזיהוי.",
    category: "נוירופסיכולוגי",
    testType: "NEUROPSYCH",
    questions: [
      {
        id: 1,
        phase: "learning",
        title: "ניסיונות למידה (1-5)",
        instruction: "קרא את רשימת 15 המילים ובקש לחזור עליהן. חזור 5 פעמים.",
        fields: [
          { name: "trial", type: "select", label: "ניסיון", options: ["1", "2", "3", "4", "5"] },
          { name: "wordsRecalled", type: "number", label: "מילים שנזכרו (0-15)" },
          { name: "intrusions", type: "number", label: "חדירות (מילים שגויות)" },
          { name: "repetitions", type: "number", label: "חזרות (אותה מילה פעמיים)" }
        ]
      },
      {
        id: 2,
        phase: "interference",
        title: "רשימה B (הפרעה)",
        instruction: "קרא רשימה חדשה של 15 מילים פעם אחת ובקש לחזור",
        fields: [
          { name: "listBRecall", type: "number", label: "מילים מרשימה B" }
        ]
      },
      {
        id: 3,
        phase: "immediateRecall",
        title: "שחזור מיידי של רשימה A",
        instruction: "בקש לזכור את הרשימה הראשונה (ללא קריאה מחדש)",
        fields: [
          { name: "immediateRecall", type: "number", label: "מילים מרשימה A (0-15)" }
        ]
      },
      {
        id: 4,
        phase: "delayedRecall",
        title: "שחזור מושהה (20-30 דקות)",
        instruction: "לאחר עיסוק בפעילות אחרת, בקש לזכור את הרשימה הראשונה",
        fields: [
          { name: "delayedRecall", type: "number", label: "מילים מרשימה A (0-15)" }
        ]
      },
      {
        id: 5,
        phase: "recognition",
        title: "זיהוי",
        instruction: "הצג רשימה של 50 מילים ובקש לזהות את המילים מרשימה A",
        fields: [
          { name: "hits", type: "number", label: "זיהוי נכון (0-15)" },
          { name: "falsePositives", type: "number", label: "זיהוי שגוי (0-35)" }
        ]
      }
    ],
    scoring: {
      measures: [
        { name: "למידה כוללת", description: "סכום ניסיונות 1-5", max: 75 },
        { name: "עקומת למידה", description: "שיפור בין ניסיונות" },
        { name: "פרואקטיבית", description: "השפעת רשימה A על B" },
        { name: "רטרואקטיבית", description: "השפעת רשימה B על שחזור A" },
        { name: "שימור", description: "יחס שחזור מושהה לניסיון 5" },
        { name: "זיהוי", description: "hits - false positives" }
      ]
    }
  }
];

async function seedQuestionnaires() {
  console.log("Seeding questionnaires...");
  
  for (const q of questionnaires) {
    const existing = await prisma.questionnaireTemplate.findUnique({
      where: { code: q.code }
    });
    
    const data = {
      name: q.name,
      nameEn: q.nameEn,
      description: q.description,
      category: q.category,
      questions: q.questions,
      scoring: q.scoring || null,
      testType: (q as any).testType || "SELF_REPORT",
      stimuli: (q as any).stimuli || null,
      subtests: (q as any).subtests || null,
    };
    
    if (existing) {
      console.log(`Updating: ${q.code}`);
      await prisma.questionnaireTemplate.update({
        where: { code: q.code },
        data
      });
    } else {
      console.log(`Creating: ${q.code}`);
      await prisma.questionnaireTemplate.create({
        data: {
          code: q.code,
          ...data
        }
      });
    }
  }
  
  console.log("Done seeding questionnaires!");
}

seedQuestionnaires()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
