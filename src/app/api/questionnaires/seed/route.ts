import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Questionnaire definitions
const questionnaires = [
  {
    code: "BDI2",
    name: "מדד דיכאון בק",
    nameEn: "Beck Depression Inventory - Second Edition",
    description: "שאלון המכיל 21 קבוצות של היגדים למדידת חומרת דיכאון בשבועיים האחרונים",
    category: "דיכאון",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "עצבות", options: [
        { value: 0, text: "אני לא מרגיש עצוב" },
        { value: 1, text: "אני מרגיש עצוב הרבה מהזמן" },
        { value: 2, text: "אני עצוב כל הזמן" },
        { value: 3, text: "אני כל כך עצוב או אומלל שאני לא יכול לשאת את זה" }
      ]},
      { id: 2, title: "פסימיות", options: [
        { value: 0, text: "אני לא מיואש לגבי העתיד שלי" },
        { value: 1, text: "אני מרגיש יותר מיואש לגבי העתיד שלי מאשר בעבר" },
        { value: 2, text: "אני לא מצפה שדברים יסתדרו בשבילי" },
        { value: 3, text: "אני מרגיש שהעתיד שלי חסר תקווה ושדברים רק ילכו ויחמירו" }
      ]},
      { id: 3, title: "כישלון בעבר", options: [
        { value: 0, text: "אני לא מרגיש כמו כישלון" },
        { value: 1, text: "נכשלתי יותר מכפי שהייתי צריך" },
        { value: 2, text: "כשאני מסתכל לאחור, אני רואה הרבה כישלונות" },
        { value: 3, text: "אני מרגיש שאני כישלון מוחלט כאדם" }
      ]},
      { id: 4, title: "אובדן הנאה", options: [
        { value: 0, text: "אני מקבל הנאה מדברים כמו תמיד" },
        { value: 1, text: "אני לא נהנה מדברים כמו פעם" },
        { value: 2, text: "אני מקבל מעט מאוד הנאה מדברים שבעבר נהניתי מהם" },
        { value: 3, text: "אני לא מקבל שום הנאה מדברים שבעבר נהניתי מהם" }
      ]},
      { id: 5, title: "רגשות אשמה", options: [
        { value: 0, text: "אני לא מרגיש אשם במיוחד" },
        { value: 1, text: "אני מרגיש אשם על הרבה דברים שעשיתי או שהייתי צריך לעשות" },
        { value: 2, text: "אני מרגיש אשם רוב הזמן" },
        { value: 3, text: "אני מרגיש אשם כל הזמן" }
      ]},
      { id: 6, title: "רגשות ענישה", options: [
        { value: 0, text: "אני לא מרגיש שאני נענש" },
        { value: 1, text: "אני מרגיש שאני עלול להיענש" },
        { value: 2, text: "אני מצפה להיענש" },
        { value: 3, text: "אני מרגיש שאני נענש" }
      ]},
      { id: 7, title: "חוסר אהבה עצמית", options: [
        { value: 0, text: "אני מרגיש אותו דבר כלפי עצמי כמו תמיד" },
        { value: 1, text: "איבדתי את הביטחון בעצמי" },
        { value: 2, text: "אני מאוכזב מעצמי" },
        { value: 3, text: "אני לא אוהב את עצמי" }
      ]},
      { id: 8, title: "ביקורת עצמית", options: [
        { value: 0, text: "אני לא מבקר או מאשים את עצמי יותר מהרגיל" },
        { value: 1, text: "אני יותר ביקורתי כלפי עצמי ממה שהייתי" },
        { value: 2, text: "אני מבקר את עצמי על כל הטעויות שלי" },
        { value: 3, text: "אני מאשים את עצמי על כל דבר רע שקורה" }
      ]},
      { id: 9, title: "מחשבות או משאלות התאבדות", isCritical: true, options: [
        { value: 0, text: "אין לי מחשבות לפגוע בעצמי" },
        { value: 1, text: "יש לי מחשבות לפגוע בעצמי, אבל לא אעשה זאת" },
        { value: 2, text: "הייתי רוצה להתאבד" },
        { value: 3, text: "הייתי מתאבד אם היתה לי הזדמנות" }
      ]},
      { id: 10, title: "בכי", options: [
        { value: 0, text: "אני לא בוכה יותר מהרגיל" },
        { value: 1, text: "אני בוכה יותר מפעם" },
        { value: 2, text: "אני בוכה על כל דבר קטן" },
        { value: 3, text: "אני מרגיש שאני רוצה לבכות, אבל אני לא יכול" }
      ]},
      { id: 11, title: "אי-שקט", options: [
        { value: 0, text: "אני לא יותר חסר מנוחה או מתוח מהרגיל" },
        { value: 1, text: "אני מרגיש יותר חסר מנוחה או מתוח מהרגיל" },
        { value: 2, text: "אני כל כך חסר מנוחה או נסער שקשה לי לשבת במקום" },
        { value: 3, text: "אני כל כך חסר מנוחה או נסער שאני חייב להמשיך לזוז" }
      ]},
      { id: 12, title: "אובדן עניין", options: [
        { value: 0, text: "לא איבדתי עניין באנשים אחרים או בפעילויות" },
        { value: 1, text: "אני פחות מתעניין באנשים אחרים או בדברים מאשר פעם" },
        { value: 2, text: "איבדתי את רוב העניין שלי באנשים אחרים או בדברים" },
        { value: 3, text: "קשה לי להתעניין בכלום" }
      ]},
      { id: 13, title: "חוסר החלטיות", options: [
        { value: 0, text: "אני מקבל החלטות כמו תמיד" },
        { value: 1, text: "קשה לי יותר מהרגיל לקבל החלטות" },
        { value: 2, text: "קשה לי הרבה יותר לקבל החלטות מפעם" },
        { value: 3, text: "יש לי בעיה לקבל כל החלטה שהיא" }
      ]},
      { id: 14, title: "חוסר ערך", options: [
        { value: 0, text: "אני לא מרגיש שאני חסר ערך" },
        { value: 1, text: "אני לא רואה את עצמי בעל ערך ושימושי כמו פעם" },
        { value: 2, text: "אני מרגיש יותר חסר ערך בהשוואה לאנשים אחרים" },
        { value: 3, text: "אני מרגיש חסר ערך לחלוטין" }
      ]},
      { id: 15, title: "אובדן אנרגיה", options: [
        { value: 0, text: "יש לי אותה כמות אנרגיה כמו תמיד" },
        { value: 1, text: "יש לי פחות אנרגיה מפעם" },
        { value: 2, text: "אין לי מספיק אנרגיה לעשות הרבה דברים" },
        { value: 3, text: "אין לי מספיק אנרגיה לעשות שום דבר" }
      ]},
      { id: 16, title: "שינויים בדפוסי שינה", options: [
        { value: 0, text: "לא חל שינוי בדפוס השינה שלי" },
        { value: 1, text: "אני ישן קצת יותר/פחות מהרגיל" },
        { value: 2, text: "אני ישן הרבה יותר/פחות מהרגיל" },
        { value: 3, text: "אני ישן כמעט כל היום / מתעורר מוקדם מדי" }
      ]},
      { id: 17, title: "עצבנות", options: [
        { value: 0, text: "אני לא יותר עצבני מהרגיל" },
        { value: 1, text: "אני יותר עצבני מהרגיל" },
        { value: 2, text: "אני הרבה יותר עצבני מהרגיל" },
        { value: 3, text: "אני עצבני כל הזמן" }
      ]},
      { id: 18, title: "שינויים בתיאבון", options: [
        { value: 0, text: "לא חל שינוי בתיאבון שלי" },
        { value: 1, text: "התיאבון שלי קצת פחות/יותר מהרגיל" },
        { value: 2, text: "התיאבון שלי הרבה פחות/יותר מהרגיל" },
        { value: 3, text: "אין לי תיאבון בכלל / אני משתוקק לאוכל כל הזמן" }
      ]},
      { id: 19, title: "קשיי ריכוז", options: [
        { value: 0, text: "אני יכול להתרכז כמו תמיד" },
        { value: 1, text: "אני לא יכול להתרכז כמו שאני רגיל" },
        { value: 2, text: "קשה לי להחזיק את הדעת על משהו לאורך זמן" },
        { value: 3, text: "אני לא מצליח להתרכז על שום דבר" }
      ]},
      { id: 20, title: "עייפות", options: [
        { value: 0, text: "אני לא יותר עייף מהרגיל" },
        { value: 1, text: "אני מתעייף יותר מהר מהרגיל" },
        { value: 2, text: "אני יותר מדי עייף לעשות הרבה דברים שעשיתי פעם" },
        { value: 3, text: "אני יותר מדי עייף לעשות את רוב הדברים שעשיתי פעם" }
      ]},
      { id: 21, title: "אובדן עניין במין", options: [
        { value: 0, text: "לא שמתי לב לשינוי באחרונה בעניין שלי במין" },
        { value: 1, text: "אני פחות מעוניין במין מפעם" },
        { value: 2, text: "אני הרבה פחות מעוניין במין עכשיו" },
        { value: 3, text: "איבדתי עניין במין לחלוטין" }
      ]}
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
    testType: "SELF_REPORT",
    questions: [
      { id: 1, section: "B", sectionName: "תסמיני חדירה", title: "זיכרונות חוזרים, לא רצויים ומטרידים של האירוע?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 2, section: "B", sectionName: "תסמיני חדירה", title: "חלומות חוזרים ומטרידים של האירוע?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 3, section: "B", sectionName: "תסמיני חדירה", title: "תחושה פתאומית כאילו האירוע חוזר וקורה שוב (פלאשבקים)?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 4, section: "B", sectionName: "תסמיני חדירה", title: "הרגשה רעה מאוד כשמשהו הזכיר לך את האירוע?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 5, section: "B", sectionName: "תסמיני חדירה", title: "תגובות גופניות חזקות כשמשהו הזכיר לך את האירוע?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 6, section: "C", sectionName: "הימנעות", title: "הימנעות מזיכרונות, מחשבות או תחושות הקשורים לאירוע?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 7, section: "C", sectionName: "הימנעות", title: "הימנעות מתזכורות חיצוניות לאירוע?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 8, section: "D", sectionName: "שינויים בקוגניציה ובמצב רוח", title: "קושי לזכור חלקים חשובים מהאירוע?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 9, section: "D", sectionName: "שינויים בקוגניציה ובמצב רוח", title: "אמונות שליליות מאוד על עצמך, על אנשים אחרים או על העולם?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 10, section: "D", sectionName: "שינויים בקוגניציה ובמצב רוח", title: "האשמת עצמך או אחרים באירוע?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 11, section: "D", sectionName: "שינויים בקוגניציה ובמצב רוח", title: "רגשות שליליים חזקים כמו פחד, אימה, כעס, אשמה או בושה?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 12, section: "D", sectionName: "שינויים בקוגניציה ובמצב רוח", title: "אובדן עניין בפעילויות שנהנית מהן בעבר?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 13, section: "D", sectionName: "שינויים בקוגניציה ובמצב רוח", title: "תחושת ריחוק או ניתוק מאנשים אחרים?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 14, section: "D", sectionName: "שינויים בקוגניציה ובמצב רוח", title: "קושי לחוות רגשות חיוביים?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 15, section: "E", sectionName: "שינויים בעוררות", title: "התנהגות עצבנית או פרצי כעס?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 16, section: "E", sectionName: "שינויים בעוררות", title: "לקיחת סיכונים מופרזת?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 17, section: "E", sectionName: "שינויים בעוררות", title: "היות על המשמר או בדריכות יתר?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 18, section: "E", sectionName: "שינויים בעוררות", title: "להיות מופתע או להיבהל בקלות?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 19, section: "E", sectionName: "שינויים בעוררות", title: "קושי להתרכז?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]},
      { id: 20, section: "E", sectionName: "שינויים בעוררות", title: "קשיי שינה?", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "במידה רבה" }, { value: 4, text: "במידה קיצונית" }
      ]}
    ],
    scoring: {
      cutoff: 31,
      maxScore: 80,
      ranges: [
        { min: 0, max: 30, label: "מתחת לסף", description: "לא עומד בסף אבחנתי ל-PTSD" },
        { min: 31, max: 80, label: "מעל הסף", description: "עומד בסף אבחנתי ל-PTSD" }
      ],
      subscales: {
        B: { items: [1,2,3,4,5], name: "תסמיני חדירה" },
        C: { items: [6,7], name: "הימנעות" },
        D: { items: [8,9,10,11,12,13,14], name: "שינויים בקוגניציה ובמצב רוח" },
        E: { items: [15,16,17,18,19,20], name: "שינויים בעוררות" }
      }
    }
  },
  {
    code: "HAMA",
    name: "סולם חרדה המילטון",
    nameEn: "Hamilton Anxiety Rating Scale",
    description: "סולם קליני ל-14 פריטים להערכת חומרת חרדה",
    category: "חרדה",
    testType: "CLINICIAN_RATED",
    questions: [
      { id: 1, title: "מצב רוח חרד", description: "דאגות, ציפייה לגרוע מכל, פחד, עצבנות", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 2, title: "מתח", description: "תחושת מתח, חוסר יכולת להירגע, רעד", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 3, title: "פחדים", description: "פחד מחשיכה, זרים, בעלי חיים, המונים", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 4, title: "נדודי שינה", description: "קושי להירדם, שינה מופרעת, סיוטים", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 5, title: "קוגניציה", description: "קושי בריכוז, זיכרון לקוי", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 6, title: "מצב רוח דיכאוני", description: "אובדן עניין, דיכאון", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 7, title: "תסמינים סומטיים - שריריים", description: "כאבי שרירים, נוקשות, רעד", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 8, title: "תסמינים סומטיים - חושיים", description: "טנטון, ראייה מטושטשת, חולשה", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 9, title: "תסמינים קרדיווסקולריים", description: "דפיקות לב, כאבים בחזה", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 10, title: "תסמינים נשימתיים", description: "קוצר נשימה, תחושת חנק", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 11, title: "תסמינים גסטרואינטסטינליים", description: "בחילה, כאבי בטן, עצירות", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 12, title: "תסמינים גניטו-אורינריים", description: "תכיפות מתן שתן, ירידה בחשק", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 13, title: "תסמינים אוטונומיים", description: "פה יבש, הזעה, סחרחורת", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 14, title: "התנהגות בראיון", description: "חוסר מנוחה, אי-שקט, רעד", options: [
        { value: 0, text: "לא קיים" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]}
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
        psychic: { items: [1,2,3,4,5,6,14], name: "חרדה פסיכית" },
        somatic: { items: [7,8,9,10,11,12,13], name: "חרדה סומטית" }
      }
    }
  },
  {
    code: "GAD7",
    name: "שאלון חרדה כללית",
    nameEn: "Generalized Anxiety Disorder 7-item",
    description: "שאלון קצר ל-7 פריטים למדידת חרדה כללית",
    category: "חרדה",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "הרגשת עצבנות, חרדה או מתח", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 2, title: "חוסר יכולת להפסיק או לשלוט בדאגות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 3, title: "דאגה יתרה לגבי דברים שונים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 4, title: "קושי להירגע", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 5, title: "חוסר מנוחה כך שקשה לשבת במקום", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 6, title: "להיות עצבני או להתרגז בקלות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 7, title: "פחד שמשהו נורא עומד לקרות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]}
    ],
    scoring: {
      maxScore: 21,
      ranges: [
        { min: 0, max: 4, label: "מינימלי", description: "חרדה מינימלית" },
        { min: 5, max: 9, label: "קל", description: "חרדה קלה" },
        { min: 10, max: 14, label: "בינוני", description: "חרדה בינונית" },
        { min: 15, max: 21, label: "חמור", description: "חרדה חמורה" }
      ]
    }
  },
  {
    code: "PHQ9",
    name: "שאלון בריאות המטופל - דיכאון",
    nameEn: "Patient Health Questionnaire-9",
    description: "שאלון קצר ל-9 פריטים למדידת דיכאון",
    category: "דיכאון",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "חוסר עניין או הנאה בעשיית דברים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 2, title: "תחושת דיכאון, ייאוש או חוסר תקווה", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 3, title: "קושי להירדם, לישון ברציפות או שינה מופרזת", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 4, title: "תחושת עייפות או חוסר אנרגיה", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 5, title: "תיאבון מועט או אכילה מופרזת", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 6, title: "תחושה רעה על עצמך", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 7, title: "קושי להתרכז בדברים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 8, title: "תנועה או דיבור איטיים מהרגיל / חוסר מנוחה", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]},
      { id: 9, title: "מחשבות שעדיף לך למות או לפגוע בעצמך", isCritical: true, options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מספר ימים" }, { value: 2, text: "יותר ממחצית הימים" }, { value: 3, text: "כמעט כל יום" }
      ]}
    ],
    scoring: {
      maxScore: 27,
      criticalItems: [9],
      ranges: [
        { min: 0, max: 4, label: "מינימלי", description: "דיכאון מינימלי" },
        { min: 5, max: 9, label: "קל", description: "דיכאון קל" },
        { min: 10, max: 14, label: "בינוני", description: "דיכאון בינוני" },
        { min: 15, max: 19, label: "בינוני-חמור", description: "דיכאון בינוני-חמור" },
        { min: 20, max: 27, label: "חמור", description: "דיכאון חמור" }
      ]
    }
  },
  // CAPS-5 - Clinician Administered PTSD Scale
  {
    code: "CAPS5",
    name: "ראיון קליני מובנה ל-PTSD",
    nameEn: "Clinician-Administered PTSD Scale for DSM-5",
    description: "ראיון אבחוני מובנה להערכת PTSD לפי DSM-5",
    category: "טראומה",
    testType: "CLINICIAN_RATED",
    questions: [
      { id: 1, section: "B", title: "זיכרונות חוזרים ולא רצויים", description: "זיכרונות פולשניים של האירוע", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 2, section: "B", title: "חלומות מטרידים", description: "חלומות חוזרים על האירוע", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 3, section: "B", title: "פלאשבקים", description: "תגובות דיסוציאטיביות", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 4, section: "B", title: "מצוקה פסיכולוגית בחשיפה לרמזים", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 5, section: "B", title: "תגובות פיזיולוגיות בחשיפה לרמזים", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 6, section: "C", title: "הימנעות מזיכרונות ומחשבות", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 7, section: "C", title: "הימנעות מתזכורות חיצוניות", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 8, section: "D", title: "אמנזיה דיסוציאטיבית", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 9, section: "D", title: "אמונות שליליות על עצמי/אחרים/עולם", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 10, section: "D", title: "האשמת עצמי או אחרים", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 11, section: "D", title: "רגשות שליליים מתמשכים", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 12, section: "D", title: "ירידה בעניין בפעילויות", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 13, section: "D", title: "תחושת ניכור מאחרים", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 14, section: "D", title: "הגבלת טווח רגשי", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 15, section: "E", title: "התנהגות עצבנית או התפרצויות כעס", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 16, section: "E", title: "התנהגות פזיזה או הרסנית עצמית", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 17, section: "E", title: "ערנות יתר", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 18, section: "E", title: "תגובת בהלה מוגזמת", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 19, section: "E", title: "קשיי ריכוז", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]},
      { id: 20, section: "E", title: "הפרעות שינה", options: [
        { value: 0, text: "חסר" }, { value: 1, text: "קל/תת-סף" }, { value: 2, text: "בינוני/סף" }, { value: 3, text: "חמור" }, { value: 4, text: "קיצוני" }
      ]}
    ],
    scoring: {
      maxScore: 80,
      subscales: {
        B: { items: [1,2,3,4,5], name: "תסמיני חדירה" },
        C: { items: [6,7], name: "הימנעות" },
        D: { items: [8,9,10,11,12,13,14], name: "שינויים בקוגניציה ורגש" },
        E: { items: [15,16,17,18,19,20], name: "שינויים בעוררות ותגובתיות" }
      }
    }
  },
  // Conners ADHD
  {
    code: "CONNERS3",
    name: "שאלון קונרס להערכת ADHD",
    nameEn: "Conners Rating Scales - 3rd Edition",
    description: "שאלון להערכת קשב וריכוז, היפראקטיביות ואימפולסיביות",
    category: "קשב וריכוז",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "מתקשה לשים לב לפרטים או עושה טעויות רשלניות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 2, title: "מתקשה לשמור על קשב במשימות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 3, title: "נראה שלא מקשיב כשמדברים אליו", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 4, title: "לא עוקב אחרי הוראות ולא מסיים משימות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 5, title: "מתקשה לארגן משימות ופעילויות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 6, title: "נמנע ממשימות הדורשות מאמץ מנטלי מתמשך", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 7, title: "מאבד דברים הנחוצים למשימות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 8, title: "מוסח בקלות על ידי גירויים חיצוניים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 9, title: "שכחן בפעילויות יומיומיות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 10, title: "מתנדנד בכיסא או מנקר בידיים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 11, title: "עוזב את מקומו במצבים שבהם צפוי להישאר", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 12, title: "רץ או מטפס במצבים לא מתאימים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 13, title: "מתקשה לשחק בשקט", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 14, title: "על המרוץ או מונע על ידי מנוע", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 15, title: "מדבר יותר מדי", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 16, title: "עונה לשאלות לפני שהן הסתיימו", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 17, title: "מתקשה לחכות לתורו", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]},
      { id: 18, title: "מפריע או מתפרץ לאחרים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה ניכרת" }, { value: 3, text: "הרבה מאוד" }
      ]}
    ],
    scoring: {
      maxScore: 54,
      subscales: {
        inattention: { items: [1,2,3,4,5,6,7,8,9], name: "חוסר קשב" },
        hyperactivity: { items: [10,11,12,13,14,15], name: "היפראקטיביות" },
        impulsivity: { items: [16,17,18], name: "אימפולסיביות" }
      }
    }
  },
  // CBCL - Child Behavior Checklist
  {
    code: "CBCL",
    name: "רשימת התנהגויות ילדים",
    nameEn: "Child Behavior Checklist",
    description: "שאלון להורים להערכת התנהגות ורגשות של ילדים",
    category: "ילדים",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, section: "anxiety", title: "מתלונן על בדידות", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 2, section: "anxiety", title: "בוכה הרבה", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 3, section: "anxiety", title: "מפחד מרעיונות או פעולות מסוימות", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 4, section: "anxiety", title: "מרגיש שהוא צריך להיות מושלם", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 5, section: "anxiety", title: "מרגיש שאף אחד לא אוהב אותו", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 6, section: "withdrawn", title: "מעדיף להיות לבד", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 7, section: "withdrawn", title: "מסרב לדבר", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 8, section: "withdrawn", title: "חסר פעילות או איטי", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 9, section: "somatic", title: "סחרחורות", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 10, section: "somatic", title: "כאבי ראש", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 11, section: "somatic", title: "בחילות", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 12, section: "aggressive", title: "מתווכח הרבה", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 13, section: "aggressive", title: "אכזרי או מציק לאחרים", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 14, section: "aggressive", title: "דורש תשומת לב", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 15, section: "aggressive", title: "משמיד דברים שלו", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 16, section: "attention", title: "לא יכול להתרכז", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 17, section: "attention", title: "לא יכול לשבת במקום", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]},
      { id: 18, section: "attention", title: "אימפולסיבי", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "נכון מאוד" }
      ]}
    ],
    scoring: {
      maxScore: 36,
      subscales: {
        anxiety: { items: [1,2,3,4,5], name: "חרדה/דיכאון" },
        withdrawn: { items: [6,7,8], name: "נסיגה/דיכאון" },
        somatic: { items: [9,10,11], name: "תלונות סומטיות" },
        aggressive: { items: [12,13,14,15], name: "התנהגות אגרסיבית" },
        attention: { items: [16,17,18], name: "בעיות קשב" }
      }
    }
  },
  // SCID-5 - Structured Clinical Interview
  {
    code: "SCID5_DEPRESSION",
    name: "ראיון קליני מובנה - דיכאון",
    nameEn: "SCID-5 Major Depressive Episode",
    description: "מודול דיכאון מהראיון הקליני המובנה לפי DSM-5",
    category: "מצב רוח",
    testType: "INTERVIEW",
    questions: [
      { id: 1, title: "מצב רוח מדוכא רוב היום", description: "האם הרגשת עצב, ריקנות או חוסר תקווה?", options: [
        { value: 1, text: "לא קיים" }, { value: 2, text: "תת-סף" }, { value: 3, text: "מעל הסף" }
      ]},
      { id: 2, title: "ירידה בעניין או הנאה", description: "אנהדוניה", options: [
        { value: 1, text: "לא קיים" }, { value: 2, text: "תת-סף" }, { value: 3, text: "מעל הסף" }
      ]},
      { id: 3, title: "שינוי משמעותי במשקל או תיאבון", options: [
        { value: 1, text: "לא קיים" }, { value: 2, text: "תת-סף" }, { value: 3, text: "מעל הסף" }
      ]},
      { id: 4, title: "הפרעת שינה", options: [
        { value: 1, text: "לא קיים" }, { value: 2, text: "תת-סף" }, { value: 3, text: "מעל הסף" }
      ]},
      { id: 5, title: "תסיסה או איטיות פסיכומוטורית", options: [
        { value: 1, text: "לא קיים" }, { value: 2, text: "תת-סף" }, { value: 3, text: "מעל הסף" }
      ]},
      { id: 6, title: "עייפות או אובדן אנרגיה", options: [
        { value: 1, text: "לא קיים" }, { value: 2, text: "תת-סף" }, { value: 3, text: "מעל הסף" }
      ]},
      { id: 7, title: "תחושות חוסר ערך או אשמה מוגזמת", options: [
        { value: 1, text: "לא קיים" }, { value: 2, text: "תת-סף" }, { value: 3, text: "מעל הסף" }
      ]},
      { id: 8, title: "קושי בחשיבה, ריכוז או קבלת החלטות", options: [
        { value: 1, text: "לא קיים" }, { value: 2, text: "תת-סף" }, { value: 3, text: "מעל הסף" }
      ]},
      { id: 9, title: "מחשבות על מוות או התאבדות", isCritical: true, options: [
        { value: 1, text: "לא קיים" }, { value: 2, text: "תת-סף" }, { value: 3, text: "מעל הסף" }
      ]}
    ],
    scoring: {
      minItemsForDiagnosis: 5,
      requiredItems: [1, 2]
    }
  },
  // Biopsychosocial Assessment
  {
    code: "BPS",
    name: "הערכה ביו-פסיכו-סוציאלית",
    nameEn: "Biopsychosocial Assessment",
    description: "הערכה מקיפה של גורמים ביולוגיים, פסיכולוגיים וחברתיים",
    category: "הערכה מקיפה",
    testType: "INTERVIEW",
    questions: [
      { 
        id: 1, 
        section: "bio", 
        title: "היסטוריה פסיכיאטרית משפחתית", 
        instruction: "פרט את ההיסטוריה הפסיכיאטרית של קרובי משפחה מדרגה ראשונה ושנייה - דיכאון, חרדה, הפרעה דו-קוטבית, סכיזופרניה, ADHD, התמכרויות וכו'",
        fields: [
          { name: "family_history", type: "textarea", label: "היסטוריה משפחתית" }
        ]
      },
      { 
        id: 2, 
        section: "bio", 
        title: "מחלות כרוניות ותרופות", 
        instruction: "פרט מחלות כרוניות קיימות (סוכרת, לחץ דם, מחלות לב, בלוטת התריס וכו') ותרופות נוכחיות",
        fields: [
          { name: "chronic_diseases", type: "textarea", label: "מחלות כרוניות" },
          { name: "medications", type: "textarea", label: "תרופות נוכחיות (כולל מינון)" }
        ]
      },
      { 
        id: 3, 
        section: "bio", 
        title: "שינה ופעילות גופנית",
        fields: [
          { name: "sleep_hours", type: "number", label: "שעות שינה ממוצעות בלילה" },
          { name: "sleep_quality", type: "select", label: "איכות שינה", options: ["מעולה", "טובה", "בינונית", "גרועה", "מאוד גרועה"] },
          { name: "sleep_problems", type: "textarea", label: "בעיות שינה (אם יש)" },
          { name: "exercise_frequency", type: "select", label: "תדירות פעילות גופנית", options: ["אף פעם", "פעם בשבוע", "2-3 פעמים בשבוע", "4+ פעמים בשבוע", "יומית"] }
        ]
      },
      { 
        id: 4, 
        section: "bio", 
        title: "שימוש בחומרים",
        fields: [
          { name: "smoking", type: "select", label: "עישון", options: ["לא מעשן", "מעשן לשעבר", "מעשן נוכחי"] },
          { name: "alcohol", type: "select", label: "צריכת אלכוהול", options: ["לא שותה", "לעתים רחוקות", "1-2 פעמים בשבוע", "3+ פעמים בשבוע", "יומית"] },
          { name: "drugs", type: "textarea", label: "שימוש בסמים/קנאביס (אם רלוונטי)" }
        ]
      },
      { 
        id: 5, 
        section: "psych", 
        title: "היסטוריה פסיכיאטרית אישית",
        instruction: "פרט אבחונים קודמים, אשפוזים פסיכיאטריים, ניסיונות התאבדות וכו'",
        fields: [
          { name: "psychiatric_history", type: "textarea", label: "היסטוריה פסיכיאטרית" }
        ]
      },
      { 
        id: 6, 
        section: "psych", 
        title: "טיפולים קודמים", 
        instruction: "פרט טיפולים פסיכולוגיים ופסיכיאטריים קודמים - סוג הטיפול, משך, יעילות",
        fields: [
          { name: "previous_treatments", type: "textarea", label: "טיפולים קודמים" },
          { name: "medications_history", type: "textarea", label: "תרופות פסיכיאטריות קודמות - יעילות ותופעות לוואי" }
        ]
      },
      { 
        id: 7, 
        section: "psych", 
        title: "טראומות ואירועי חיים משמעותיים",
        instruction: "פרט אירועים טראומטיים, אובדנים משמעותיים, התעללות, הזנחה וכו'",
        fields: [
          { name: "trauma_history", type: "textarea", label: "היסטוריה טראומטית" },
          { name: "life_events", type: "textarea", label: "אירועי חיים משמעותיים בשנה האחרונה" }
        ]
      },
      { 
        id: 8, 
        section: "psych", 
        title: "רמת תפקוד נוכחית", 
        instruction: "עבודה, לימודים, טיפול בעצמי, מערכות יחסים",
        options: [
          { value: 0, text: "תקין - מתפקד היטב בכל התחומים" }, 
          { value: 1, text: "ירידה קלה - קשיים מסוימים אך מתפקד" }, 
          { value: 2, text: "ירידה בינונית - קשיים משמעותיים בתפקוד" }, 
          { value: 3, text: "ירידה חמורה - לא מסוגל לתפקד במרבית התחומים" }
        ]
      },
      { 
        id: 9, 
        section: "social", 
        title: "משפחה ומערכות יחסים",
        fields: [
          { name: "marital_status", type: "select", label: "מצב משפחתי", options: ["רווק/ה", "בזוגיות", "נשוי/אה", "גרוש/ה", "אלמן/ה"] },
          { name: "children", type: "text", label: "ילדים (מספר וגילאים)" },
          { name: "family_relationships", type: "textarea", label: "איכות יחסים משפחתיים" },
          { name: "social_support", type: "textarea", label: "חברים ותמיכה חברתית" }
        ]
      },
      { 
        id: 10, 
        section: "social", 
        title: "תעסוקה ולימודים",
        fields: [
          { name: "employment_status", type: "select", label: "מצב תעסוקתי", options: ["עובד/ת במשרה מלאה", "עובד/ת במשרה חלקית", "מובטל/ת - מחפש עבודה", "מובטל/ת - לא מחפש", "סטודנט/ית", "פנסיונר/ית", "נכות"] },
          { name: "occupation", type: "text", label: "עיסוק/מקצוע" },
          { name: "job_satisfaction", type: "select", label: "שביעות רצון מעבודה/לימודים", options: ["גבוהה מאוד", "גבוהה", "בינונית", "נמוכה", "נמוכה מאוד", "לא רלוונטי"] }
        ]
      },
      { 
        id: 11, 
        section: "social", 
        title: "מצב כלכלי ומגורים",
        fields: [
          { name: "financial_status", type: "select", label: "מצב כלכלי סובייקטיבי", options: ["משגשג", "נוח", "מספיק לצרכים בסיסיים", "קושי כלכלי", "קושי כלכלי חמור"] },
          { name: "housing", type: "textarea", label: "מצב מגורים (עם מי, איכות, בעיות)" }
        ]
      },
      { 
        id: 12, 
        section: "summary", 
        title: "סיכום והערכה כוללת",
        instruction: "סכם את הגורמים הביולוגיים, פסיכולוגיים וסוציאליים המשפיעים על מצב המטופל. פרט גורמי סיכון וגורמי הגנה",
        fields: [
          { name: "risk_factors", type: "textarea", label: "גורמי סיכון עיקריים" },
          { name: "protective_factors", type: "textarea", label: "גורמי הגנה וחוזקות" },
          { name: "treatment_recommendations", type: "textarea", label: "המלצות טיפוליות" }
        ]
      }
    ],
    scoring: {}
  },
  // OCI-R - Obsessive Compulsive Inventory
  {
    code: "OCIR",
    name: "שאלון OCD מקוצר",
    nameEn: "Obsessive-Compulsive Inventory - Revised",
    description: "שאלון ל-18 פריטים להערכת תסמיני הפרעה טורדנית-כפייתית",
    category: "OCD",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, section: "washing", title: "אני מרגיש שהידיים שלי מלוכלכות כשאני נוגע בכסף", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 2, section: "washing", title: "אני רוחץ ידיים יותר ויותר זמן מהרגיל", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 3, section: "washing", title: "אני מודאג מאוד מניקיון", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 4, section: "checking", title: "אני בודק דברים יותר מהנדרש", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 5, section: "checking", title: "אני בודק שוב ושוב דלתות, חלונות וכו'", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 6, section: "checking", title: "אני בודק גז/ברזים/מתגים שוב ושוב", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 7, section: "ordering", title: "אני צריך שדברים יהיו מסודרים בצורה מסוימת", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 8, section: "ordering", title: "אני מוטרד כשדברים לא במקומם", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 9, section: "ordering", title: "אני מרגיש צורך לסדר דברים", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 10, section: "obsessing", title: "מחשבות לא נעימות נכנסות לי לראש בעל כורחי", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 11, section: "obsessing", title: "אני לא יכול להפסיק לחשוב על מחשבות מטרידות", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 12, section: "obsessing", title: "יש לי מחשבות לא נעימות על פגיעה באחרים", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 13, section: "hoarding", title: "אני אוסף דברים שאני לא צריך", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 14, section: "hoarding", title: "קשה לי לזרוק דברים", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 15, section: "hoarding", title: "הבית שלי עמוס בדברים מיותרים", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 16, section: "neutralizing", title: "אני מרגיש צורך לספור בזמן שאני עושה דברים", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 17, section: "neutralizing", title: "אני מרגיש צורך לחזור על מספרים מסוימים", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 18, section: "neutralizing", title: "יש לי טקסים שאני חייב לעשות", options: [
        { value: 0, text: "בכלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]}
    ],
    scoring: {
      maxScore: 72,
      cutoff: 21,
      subscales: {
        washing: { items: [1,2,3], name: "רחיצה" },
        checking: { items: [4,5,6], name: "בדיקה" },
        ordering: { items: [7,8,9], name: "סידור" },
        obsessing: { items: [10,11,12], name: "אובססיות" },
        hoarding: { items: [13,14,15], name: "אגירה" },
        neutralizing: { items: [16,17,18], name: "ניטרול" }
      }
    }
  },
  // AUDIT - Alcohol Use Disorders
  {
    code: "AUDIT",
    name: "שאלון שימוש באלכוהול",
    nameEn: "Alcohol Use Disorders Identification Test",
    description: "שאלון ל-10 פריטים לזיהוי בעיות שימוש באלכוהול",
    category: "התמכרויות",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "באיזו תדירות אתה שותה משקאות אלכוהוליים?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "פעם בחודש או פחות" }, { value: 2, text: "2-4 פעמים בחודש" }, { value: 3, text: "2-3 פעמים בשבוע" }, { value: 4, text: "4+ פעמים בשבוע" }
      ]},
      { id: 2, title: "כמה מנות אלכוהול אתה שותה ביום טיפוסי?", options: [
        { value: 0, text: "1-2" }, { value: 1, text: "3-4" }, { value: 2, text: "5-6" }, { value: 3, text: "7-9" }, { value: 4, text: "10+" }
      ]},
      { id: 3, title: "באיזו תדירות אתה שותה 6+ מנות באירוע אחד?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "פחות מפעם בחודש" }, { value: 2, text: "פעם בחודש" }, { value: 3, text: "פעם בשבוע" }, { value: 4, text: "כמעט כל יום" }
      ]},
      { id: 4, title: "בשנה האחרונה, כמה פעמים לא יכולת להפסיק לשתות אחרי שהתחלת?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "פחות מפעם בחודש" }, { value: 2, text: "פעם בחודש" }, { value: 3, text: "פעם בשבוע" }, { value: 4, text: "כמעט כל יום" }
      ]},
      { id: 5, title: "בשנה האחרונה, כמה פעמים לא עשית מה שהיה צפוי ממך בגלל שתייה?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "פחות מפעם בחודש" }, { value: 2, text: "פעם בחודש" }, { value: 3, text: "פעם בשבוע" }, { value: 4, text: "כמעט כל יום" }
      ]},
      { id: 6, title: "בשנה האחרונה, כמה פעמים הזדקקת למשקה בבוקר כדי להתחיל לתפקד?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "פחות מפעם בחודש" }, { value: 2, text: "פעם בחודש" }, { value: 3, text: "פעם בשבוע" }, { value: 4, text: "כמעט כל יום" }
      ]},
      { id: 7, title: "בשנה האחרונה, כמה פעמים הרגשת אשמה או חרטה אחרי שתייה?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "פחות מפעם בחודש" }, { value: 2, text: "פעם בחודש" }, { value: 3, text: "פעם בשבוע" }, { value: 4, text: "כמעט כל יום" }
      ]},
      { id: 8, title: "בשנה האחרונה, כמה פעמים לא זכרת מה קרה בלילה הקודם בגלל שתייה?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "פחות מפעם בחודש" }, { value: 2, text: "פעם בחודש" }, { value: 3, text: "פעם בשבוע" }, { value: 4, text: "כמעט כל יום" }
      ]},
      { id: 9, title: "האם נפגעת או מישהו אחר נפגע כתוצאה מהשתייה שלך?", options: [
        { value: 0, text: "לא" }, { value: 2, text: "כן, אבל לא בשנה האחרונה" }, { value: 4, text: "כן, בשנה האחרונה" }
      ]},
      { id: 10, title: "האם קרוב משפחה, חבר או איש מקצוע הביע דאגה לגבי השתייה שלך?", options: [
        { value: 0, text: "לא" }, { value: 2, text: "כן, אבל לא בשנה האחרונה" }, { value: 4, text: "כן, בשנה האחרונה" }
      ]}
    ],
    scoring: {
      maxScore: 40,
      ranges: [
        { min: 0, max: 7, label: "סיכון נמוך", description: "שתייה בסיכון נמוך" },
        { min: 8, max: 15, label: "סיכון בינוני", description: "שתייה מזיקה" },
        { min: 16, max: 19, label: "סיכון גבוה", description: "שתייה מזיקה - מומלץ ייעוץ" },
        { min: 20, max: 40, label: "תלות", description: "תלות באלכוהול - נדרש טיפול" }
      ]
    }
  },
  // BAI - Beck Anxiety Inventory
  {
    code: "BAI",
    name: "מדד חרדה בק",
    nameEn: "Beck Anxiety Inventory",
    description: "שאלון ל-21 פריטים למדידת חומרת תסמיני חרדה",
    category: "חרדה",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "נימול או עקצוץ", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 2, title: "תחושת חום", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 3, title: "רעד ברגליים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 4, title: "חוסר יכולת להירגע", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 5, title: "פחד שהגרוע מכל יקרה", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 6, title: "סחרחורת או חוסר יציבות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 7, title: "דפיקות לב מואצות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 8, title: "חוסר יציבות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 9, title: "פחד מאובדן שליטה", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 10, title: "פחד למות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 11, title: "בהלה", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 12, title: "בעיות עיכול", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 13, title: "חיוורון", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 14, title: "סומק פנים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 15, title: "הזעה (לא מחום)", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 16, title: "עצבנות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 17, title: "תחושת חנק", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 18, title: "רעד בידיים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 19, title: "רעד כללי", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 20, title: "קשיי נשימה", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]},
      { id: 21, title: "פחד משיגעון", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "במידה בינונית" }, { value: 3, text: "הרבה" }
      ]}
    ],
    scoring: {
      maxScore: 63,
      ranges: [
        { min: 0, max: 7, label: "מינימלי", description: "חרדה מינימלית" },
        { min: 8, max: 15, label: "קל", description: "חרדה קלה" },
        { min: 16, max: 25, label: "בינוני", description: "חרדה בינונית" },
        { min: 26, max: 63, label: "חמור", description: "חרדה חמורה" }
      ]
    }
  },
  // MDQ - Mood Disorder Questionnaire (Bipolar)
  {
    code: "MDQ",
    name: "שאלון הפרעות מצב רוח",
    nameEn: "Mood Disorder Questionnaire",
    description: "שאלון סקר להפרעה דו-קוטבית",
    category: "מצב רוח",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "הרגשת כל כך טוב או היפר שאחרים חשבו שאתה לא בסדר?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 2, title: "היית כל כך עצבני שצעקת על אנשים או התחלת מריבות?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 3, title: "הרגשת בטוח בעצמך הרבה יותר מהרגיל?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 4, title: "ישנת הרבה פחות מהרגיל ועדיין לא הרגשת עייף?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 5, title: "היית יותר דברן מהרגיל או דיברת מהר מאוד?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 6, title: "מחשבות רצו לך בראש במהירות?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 7, title: "הוסחת כל כך בקלות שהתקשית להתרכז?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 8, title: "היה לך הרבה יותר אנרגיה מהרגיל?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 9, title: "היית הרבה יותר פעיל או עשית הרבה יותר דברים מהרגיל?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 10, title: "היית הרבה יותר חברותי מהרגיל?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 11, title: "היית מעוניין במין הרבה יותר מהרגיל?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 12, title: "עשית דברים יוצאי דופן או שאחרים חשבו שמוגזמים?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 13, title: "הוצאת כסף שגרם לך או למשפחתך לצרות?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 14, title: "האם כמה מהדברים הללו קרו באותה תקופה?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 15, title: "כמה בעיות גרמו לך התנהגויות אלה?", options: [
        { value: 0, text: "אין בעיה" }, { value: 1, text: "בעיה קטנה" }, { value: 2, text: "בעיה בינונית" }, { value: 3, text: "בעיה רצינית" }
      ]}
    ],
    scoring: {
      positiveScreen: { minYes: 7, requiresConcurrence: true, requiresProblems: true }
    }
  },
  // ASRS - Adult ADHD Self-Report
  {
    code: "ASRS",
    name: "שאלון דיווח עצמי ל-ADHD במבוגרים",
    nameEn: "Adult ADHD Self-Report Scale",
    description: "שאלון סקר ל-18 פריטים להערכת ADHD במבוגרים",
    category: "קשב וריכוז",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "כמה פעמים יש לך קושי לסיים פרטים אחרונים בפרויקט?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 2, title: "כמה פעמים יש לך קושי לסדר דברים כשצריך לעשות משימה מאורגנת?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 3, title: "כמה פעמים יש לך קושי לזכור פגישות או התחייבויות?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 4, title: "כמה פעמים אתה נמנע או מתעכב להתחיל במשימה שדורשת חשיבה רבה?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 5, title: "כמה פעמים אתה מנקר בידיים או מתנדנד כשיושב לזמן ארוך?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 6, title: "כמה פעמים אתה מרגיש פעיל יתר או מונע לעשות דברים?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 7, title: "כמה פעמים אתה עושה טעויות רשלניות בעבודה משעממת?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 8, title: "כמה פעמים יש לך קושי לשמור על קשב בעבודה משעממת?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 9, title: "כמה פעמים יש לך קושי להתרכז במה שמישהו אומר לך?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 10, title: "כמה פעמים אתה שם דברים במקום לא נכון או מתקשה למצוא אותם?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 11, title: "כמה פעמים אתה מוסח ברעש או פעילות סביבך?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 12, title: "כמה פעמים אתה עוזב את מקומך בישיבות או במצבים אחרים?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 13, title: "כמה פעמים אתה מרגיש חוסר מנוחה?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 14, title: "כמה פעמים יש לך קושי להירגע בזמן פנוי?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 15, title: "כמה פעמים אתה מדבר יותר מדי במצבים חברתיים?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 16, title: "כמה פעמים אתה מסיים משפטים של אנשים לפני שהם סיימו?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 17, title: "כמה פעמים יש לך קושי לחכות לתורך כשצריך לחכות?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]},
      { id: 18, title: "כמה פעמים אתה מפריע לאחרים כשהם עסוקים?", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "לעתים רחוקות" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "לעתים קרובות מאוד" }
      ]}
    ],
    scoring: {
      maxScore: 72,
      partA: { items: [1,2,3,4,5,6], cutoff: 4 },
      subscales: {
        inattention: { items: [1,2,3,4,7,8,9,10,11], name: "חוסר קשב" },
        hyperactivity: { items: [5,6,12,13,14,15,16,17,18], name: "היפראקטיביות/אימפולסיביות" }
      }
    }
  },
  // DES - Dissociative Experiences Scale
  {
    code: "DES",
    name: "סולם חוויות דיסוציאטיביות",
    nameEn: "Dissociative Experiences Scale",
    description: "שאלון ל-28 פריטים להערכת חוויות דיסוציאטיביות",
    category: "דיסוציאציה",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "נסעתי במכונית ופתאום הבנתי שלא זכרתי מה קרה בחלק מהנסיעה", options: [
        { value: 0, text: "0%" }, { value: 10, text: "10%" }, { value: 20, text: "20%" }, { value: 30, text: "30%" }, { value: 40, text: "40%" }, { value: 50, text: "50%" }, { value: 60, text: "60%" }, { value: 70, text: "70%" }, { value: 80, text: "80%" }, { value: 90, text: "90%" }, { value: 100, text: "100%" }
      ]},
      { id: 2, title: "מישהו דיבר אליי ולא שמעתי חלק או כל מה שאמר", options: [
        { value: 0, text: "0%" }, { value: 10, text: "10%" }, { value: 20, text: "20%" }, { value: 30, text: "30%" }, { value: 40, text: "40%" }, { value: 50, text: "50%" }, { value: 60, text: "60%" }, { value: 70, text: "70%" }, { value: 80, text: "80%" }, { value: 90, text: "90%" }, { value: 100, text: "100%" }
      ]},
      { id: 3, title: "מצאתי את עצמי במקום ולא ידעתי איך הגעתי לשם", options: [
        { value: 0, text: "0%" }, { value: 10, text: "10%" }, { value: 20, text: "20%" }, { value: 30, text: "30%" }, { value: 40, text: "40%" }, { value: 50, text: "50%" }, { value: 60, text: "60%" }, { value: 70, text: "70%" }, { value: 80, text: "80%" }, { value: 90, text: "90%" }, { value: 100, text: "100%" }
      ]},
      { id: 4, title: "מצאתי את עצמי לבוש בבגדים שלא זכרתי שלבשתי", options: [
        { value: 0, text: "0%" }, { value: 10, text: "10%" }, { value: 20, text: "20%" }, { value: 30, text: "30%" }, { value: 40, text: "40%" }, { value: 50, text: "50%" }, { value: 60, text: "60%" }, { value: 70, text: "70%" }, { value: 80, text: "80%" }, { value: 90, text: "90%" }, { value: 100, text: "100%" }
      ]},
      { id: 5, title: "מצאתי דברים חדשים בין החפצים שלי ולא זכרתי שקניתי אותם", options: [
        { value: 0, text: "0%" }, { value: 10, text: "10%" }, { value: 20, text: "20%" }, { value: 30, text: "30%" }, { value: 40, text: "40%" }, { value: 50, text: "50%" }, { value: 60, text: "60%" }, { value: 70, text: "70%" }, { value: 80, text: "80%" }, { value: 90, text: "90%" }, { value: 100, text: "100%" }
      ]},
      { id: 6, title: "אנשים ניגשו אליי וקראו לי בשם אחר או טענו שהם מכירים אותי", options: [
        { value: 0, text: "0%" }, { value: 10, text: "10%" }, { value: 20, text: "20%" }, { value: 30, text: "30%" }, { value: 40, text: "40%" }, { value: 50, text: "50%" }, { value: 60, text: "60%" }, { value: 70, text: "70%" }, { value: 80, text: "80%" }, { value: 90, text: "90%" }, { value: 100, text: "100%" }
      ]},
      { id: 7, title: "הרגשתי שאני עומד ליד עצמי או צופה בעצמי עושה משהו", options: [
        { value: 0, text: "0%" }, { value: 10, text: "10%" }, { value: 20, text: "20%" }, { value: 30, text: "30%" }, { value: 40, text: "40%" }, { value: 50, text: "50%" }, { value: 60, text: "60%" }, { value: 70, text: "70%" }, { value: 80, text: "80%" }, { value: 90, text: "90%" }, { value: 100, text: "100%" }
      ]},
      { id: 8, title: "לא הכרתי חברים או בני משפחה", options: [
        { value: 0, text: "0%" }, { value: 10, text: "10%" }, { value: 20, text: "20%" }, { value: 30, text: "30%" }, { value: 40, text: "40%" }, { value: 50, text: "50%" }, { value: 60, text: "60%" }, { value: 70, text: "70%" }, { value: 80, text: "80%" }, { value: 90, text: "90%" }, { value: 100, text: "100%" }
      ]},
      { id: 9, title: "לא זכרתי אירועים חשובים בחיי", options: [
        { value: 0, text: "0%" }, { value: 10, text: "10%" }, { value: 20, text: "20%" }, { value: 30, text: "30%" }, { value: 40, text: "40%" }, { value: 50, text: "50%" }, { value: 60, text: "60%" }, { value: 70, text: "70%" }, { value: 80, text: "80%" }, { value: 90, text: "90%" }, { value: 100, text: "100%" }
      ]},
      { id: 10, title: "הואשמתי בשקר כשלא שיקרתי", options: [
        { value: 0, text: "0%" }, { value: 10, text: "10%" }, { value: 20, text: "20%" }, { value: 30, text: "30%" }, { value: 40, text: "40%" }, { value: 50, text: "50%" }, { value: 60, text: "60%" }, { value: 70, text: "70%" }, { value: 80, text: "80%" }, { value: 90, text: "90%" }, { value: 100, text: "100%" }
      ]}
    ],
    scoring: {
      maxScore: 100,
      cutoff: 30,
      ranges: [
        { min: 0, max: 10, label: "נורמלי", description: "חוויות דיסוציאטיביות בטווח הנורמלי" },
        { min: 11, max: 30, label: "מוגבר", description: "חוויות דיסוציאטיביות מוגברות" },
        { min: 31, max: 100, label: "קליני", description: "רמה קלינית - מומלץ אבחון נוסף" }
      ]
    }
  },
  // ACE - Adverse Childhood Experiences
  {
    code: "ACE",
    name: "שאלון חוויות ילדות שליליות",
    nameEn: "Adverse Childhood Experiences Questionnaire",
    description: "שאלון ל-10 פריטים להערכת חוויות טראומטיות בילדות",
    category: "טראומה",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "האם הורה או מבוגר אחר בבית לעתים קרובות קילל, העליב או השפיל אותך?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 2, title: "האם הורה או מבוגר בבית לעתים קרובות דחף, חבט, סטר או זרק עליך דברים?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 3, title: "האם מבוגר אי פעם נגע בך או ליטף אותך באופן מיני?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 4, title: "האם הרגשת שאף אחד במשפחה לא אוהב אותך או חושב שאתה חשוב?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 5, title: "האם לא היה לך מספיק אוכל, נאלצת ללבוש בגדים מלוכלכים, או לא היה לך מי שיגן עליך?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 6, title: "האם ההורים שלך אי פעם התגרשו או נפרדו?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 7, title: "האם אמא שלך או אמא חורגת הותקפה לעתים קרובות על ידי בן הזוג?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 8, title: "האם גרת עם מישהו שהיה שיכור, השתמש בסמים או היה מכור?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 9, title: "האם בן משפחה היה מדוכא, חולה נפש או ניסה להתאבד?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 10, title: "האם בן משפחה היה בכלא?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]}
    ],
    scoring: {
      maxScore: 10,
      ranges: [
        { min: 0, max: 0, label: "ללא", description: "ללא חוויות ילדות שליליות" },
        { min: 1, max: 3, label: "נמוך-בינוני", description: "1-3 חוויות שליליות" },
        { min: 4, max: 10, label: "גבוה", description: "4+ חוויות - סיכון מוגבר לבעיות בריאות" }
      ]
    }
  },
  // Edinburgh Postnatal Depression Scale
  {
    code: "EPDS",
    name: "סולם אדינבורו לדיכאון לאחר לידה",
    nameEn: "Edinburgh Postnatal Depression Scale",
    description: "שאלון ל-10 פריטים לסקר דיכאון אחרי לידה",
    category: "דיכאון",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "יכולתי לצחוק ולראות את הצד המצחיק של הדברים", options: [
        { value: 0, text: "כמו תמיד" }, { value: 1, text: "קצת פחות מתמיד" }, { value: 2, text: "הרבה פחות מתמיד" }, { value: 3, text: "בכלל לא" }
      ]},
      { id: 2, title: "הסתכלתי קדימה עם הנאה לדברים", options: [
        { value: 0, text: "כמו תמיד" }, { value: 1, text: "קצת פחות מתמיד" }, { value: 2, text: "הרבה פחות מתמיד" }, { value: 3, text: "בכלל לא" }
      ]},
      { id: 3, title: "האשמתי את עצמי שלא לצורך כשדברים השתבשו", options: [
        { value: 3, text: "כן, רוב הזמן" }, { value: 2, text: "כן, לפעמים" }, { value: 1, text: "לא לעתים קרובות" }, { value: 0, text: "לא, אף פעם" }
      ]},
      { id: 4, title: "הייתי חרדה או מודאגת ללא סיבה טובה", options: [
        { value: 0, text: "לא, בכלל לא" }, { value: 1, text: "כמעט לא" }, { value: 2, text: "כן, לפעמים" }, { value: 3, text: "כן, לעתים קרובות מאוד" }
      ]},
      { id: 5, title: "הרגשתי פחד או פאניקה ללא סיבה טובה", options: [
        { value: 3, text: "כן, די הרבה" }, { value: 2, text: "כן, לפעמים" }, { value: 1, text: "לא, לא הרבה" }, { value: 0, text: "לא, בכלל לא" }
      ]},
      { id: 6, title: "דברים הציפו אותי", options: [
        { value: 3, text: "כן, רוב הזמן לא יכולתי להתמודד" }, { value: 2, text: "כן, לפעמים לא הסתדרתי כרגיל" }, { value: 1, text: "לא, רוב הזמן הסתדרתי טוב" }, { value: 0, text: "לא, הסתדרתי כמו תמיד" }
      ]},
      { id: 7, title: "הייתי כל כך אומללה שהיה לי קשה לישון", options: [
        { value: 3, text: "כן, רוב הזמן" }, { value: 2, text: "כן, לפעמים" }, { value: 1, text: "לא לעתים קרובות" }, { value: 0, text: "לא, בכלל לא" }
      ]},
      { id: 8, title: "הרגשתי עצובה או אומללה", options: [
        { value: 3, text: "כן, רוב הזמן" }, { value: 2, text: "כן, לעתים קרובות" }, { value: 1, text: "לא לעתים קרובות" }, { value: 0, text: "לא, בכלל לא" }
      ]},
      { id: 9, title: "הייתי כל כך אומללה שבכיתי", options: [
        { value: 3, text: "כן, רוב הזמן" }, { value: 2, text: "כן, לעתים קרובות" }, { value: 1, text: "רק מדי פעם" }, { value: 0, text: "לא, אף פעם" }
      ]},
      { id: 10, title: "המחשבה לפגוע בעצמי עלתה בי", isCritical: true, options: [
        { value: 3, text: "כן, לעתים קרובות" }, { value: 2, text: "לפעמים" }, { value: 1, text: "כמעט אף פעם" }, { value: 0, text: "אף פעם" }
      ]}
    ],
    scoring: {
      maxScore: 30,
      cutoff: 10,
      criticalItems: [10],
      ranges: [
        { min: 0, max: 9, label: "תקין", description: "סיכון נמוך לדיכאון" },
        { min: 10, max: 12, label: "בסיכון", description: "אפשרי דיכאון - מומלץ מעקב" },
        { min: 13, max: 30, label: "גבוה", description: "סביר דיכאון - נדרשת הערכה" }
      ]
    }
  },
  // Social Phobia Inventory
  {
    code: "SPIN",
    name: "מדד פוביה חברתית",
    nameEn: "Social Phobia Inventory",
    description: "שאלון ל-17 פריטים להערכת חרדה חברתית",
    category: "חרדה",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "אני מפחד מאנשים בעמדות סמכות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 2, title: "מפריע לי להסמיק בפני אנשים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 3, title: "מסיבות ואירועים חברתיים מפחידים אותי", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 4, title: "אני נמנע מלדבר עם אנשים שאני לא מכיר", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 5, title: "להיות ביקורת מפחיד אותי מאוד", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 6, title: "אני נמנע מלעשות דברים או לדבר עם אנשים מפחד למבוכה", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 7, title: "להזיע בפני אנשים גורם לי מצוקה", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 8, title: "אני נמנע ממסיבות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 9, title: "אני נמנע מפעילויות שבהן אני במרכז תשומת הלב", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 10, title: "לדבר עם זרים מפחיד אותי", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 11, title: "אני נמנע מלדבר בפני קהל", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 12, title: "אני אעשה כל דבר כדי להימנע מביקורת", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 13, title: "דפיקות לב מטרידות אותי כשאני עם אנשים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 14, title: "אני מפחד לעשות דברים כשאנשים מסתכלים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 15, title: "להיות מביך או להיראות טיפש הם מהפחדים הגדולים שלי", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 16, title: "אני נמנע מלדבר עם מישהו בסמכות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 17, title: "לרעוד או לרטוט בפני אחרים מציק לי", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]}
    ],
    scoring: {
      maxScore: 68,
      cutoff: 19,
      ranges: [
        { min: 0, max: 20, label: "ללא", description: "ללא חרדה חברתית משמעותית" },
        { min: 21, max: 30, label: "קל", description: "חרדה חברתית קלה" },
        { min: 31, max: 40, label: "בינוני", description: "חרדה חברתית בינונית" },
        { min: 41, max: 50, label: "חמור", description: "חרדה חברתית חמורה" },
        { min: 51, max: 68, label: "חמור מאוד", description: "חרדה חברתית חמורה מאוד" }
      ]
    }
  }
];

// POST - Seed questionnaires to database
export async function POST(request: NextRequest) {
  try {
    // Allow with secret key or session
    const secretKey = request.headers.get("x-seed-key");
    const validSecret = process.env.SEED_SECRET || "tipul-seed-2024";
    
    if (secretKey !== validSecret) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const results = {
      created: [] as string[],
      updated: [] as string[],
      errors: [] as string[]
    };

    for (const q of questionnaires) {
      try {
        const existing = await prisma.questionnaireTemplate.findUnique({
          where: { code: q.code }
        });

        const data = {
          name: q.name,
          nameEn: q.nameEn,
          description: q.description,
          category: q.category,
          testType: q.testType as "SELF_REPORT" | "CLINICIAN_RATED" | "PROJECTIVE" | "INTELLIGENCE" | "NEUROPSYCH" | "INTERVIEW",
          questions: q.questions,
          scoring: q.scoring,
        };

        if (existing) {
          await prisma.questionnaireTemplate.update({
            where: { code: q.code },
            data
          });
          results.updated.push(q.code);
        } else {
          await prisma.questionnaireTemplate.create({
            data: {
              code: q.code,
              ...data
            }
          });
          results.created.push(q.code);
        }
      } catch (err) {
        results.errors.push(`${q.code}: ${err}`);
      }
    }

    return NextResponse.json({
      message: "Seed completed",
      created: results.created.length,
      updated: results.updated.length,
      errors: results.errors.length,
      details: results
    });
  } catch (error) {
    console.error("Error seeding questionnaires:", error);
    return NextResponse.json(
      { error: "Failed to seed questionnaires" },
      { status: 500 }
    );
  }
}

// GET - Check current questionnaire count
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await prisma.questionnaireTemplate.count();
    const templates = await prisma.questionnaireTemplate.findMany({
      select: { code: true, name: true, category: true, testType: true }
    });

    return NextResponse.json({
      count,
      templates,
      availableToSeed: questionnaires.map(q => ({ code: q.code, name: q.name }))
    });
  } catch (error) {
    console.error("Error checking questionnaires:", error);
    return NextResponse.json(
      { error: "Failed to check questionnaires" },
      { status: 500 }
    );
  }
}
