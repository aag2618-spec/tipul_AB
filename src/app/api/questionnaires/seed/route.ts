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
      { id: 1, section: "bio", title: "היסטוריה פסיכיאטרית משפחתית", type: "text", options: [] },
      { id: 2, section: "bio", title: "מחלות כרוניות", type: "text", options: [] },
      { id: 3, section: "bio", title: "תרופות נוכחיות", type: "text", options: [] },
      { id: 4, section: "bio", title: "בעיות שינה", options: [
        { value: 0, text: "אין" }, { value: 1, text: "קושי להירדם" }, { value: 2, text: "יקיצות ליליות" }, { value: 3, text: "יקיצה מוקדמת" }
      ]},
      { id: 5, section: "psych", title: "היסטוריה פסיכיאטרית", type: "text", options: [] },
      { id: 6, section: "psych", title: "טיפולים קודמים", type: "text", options: [] },
      { id: 7, section: "psych", title: "אירועי חיים משמעותיים", type: "text", options: [] },
      { id: 8, section: "psych", title: "רמת תפקוד נוכחית", options: [
        { value: 0, text: "תקין" }, { value: 1, text: "ירידה קלה" }, { value: 2, text: "ירידה בינונית" }, { value: 3, text: "ירידה חמורה" }
      ]},
      { id: 9, section: "social", title: "מערכות תמיכה", type: "text", options: [] },
      { id: 10, section: "social", title: "מצב תעסוקתי", options: [
        { value: 0, text: "עובד" }, { value: 1, text: "לא עובד - מחפש" }, { value: 2, text: "לא עובד - לא מחפש" }, { value: 3, text: "פנסיונר" }
      ]},
      { id: 11, section: "social", title: "מצב כלכלי", options: [
        { value: 0, text: "טוב" }, { value: 1, text: "מספיק" }, { value: 2, text: "קושי" }, { value: 3, text: "קושי חמור" }
      ]},
      { id: 12, section: "social", title: "מערכות יחסים", type: "text", options: [] }
    ],
    scoring: {}
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
