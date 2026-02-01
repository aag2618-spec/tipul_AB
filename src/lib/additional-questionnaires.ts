// Additional Questionnaires - 30+ new questionnaires
// To be added to the seed route

export const additionalQuestionnaires = [
  // ==================== CHILDREN & ADOLESCENTS ====================
  
  // CDI-2 - Children's Depression Inventory
  {
    code: "CDI2",
    name: "מדד דיכאון לילדים",
    nameEn: "Children's Depression Inventory - 2",
    description: "שאלון ל-28 פריטים להערכת תסמיני דיכאון בילדים ובני נוער (7-17)",
    category: "ילדים",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "עצבות", options: [
        { value: 0, text: "אני עצוב מדי פעם" },
        { value: 1, text: "אני עצוב הרבה פעמים" },
        { value: 2, text: "אני עצוב כל הזמן" }
      ]},
      { id: 2, title: "פסימיות", options: [
        { value: 0, text: "דברים רעים לא יקרו לי" },
        { value: 1, text: "אני לא בטוח אם דברים רעים יקרו לי" },
        { value: 2, text: "דברים רעים בטוח יקרו לי" }
      ]},
      { id: 3, title: "תחושת כישלון", options: [
        { value: 0, text: "אני עושה הרבה דברים בסדר" },
        { value: 1, text: "אני עושה הרבה דברים לא בסדר" },
        { value: 2, text: "כל דבר שאני עושה הוא לא בסדר" }
      ]},
      { id: 4, title: "הנאה", options: [
        { value: 0, text: "דברים כיפיים זה כיף" },
        { value: 1, text: "דברים כיפיים זה לפעמים כיף" },
        { value: 2, text: "דברים כיפיים זה בכלל לא כיף" }
      ]},
      { id: 5, title: "תחושת רע", options: [
        { value: 0, text: "אני לא מרגיש רע כל הזמן" },
        { value: 1, text: "אני מרגיש רע הרבה פעמים" },
        { value: 2, text: "אני מרגיש רע כל הזמן" }
      ]}
    ],
    scoring: {
      maxScore: 56,
      ranges: [
        { min: 0, max: 12, label: "ממוצע", description: "רמה ממוצעת" },
        { min: 13, max: 19, label: "מוגבר", description: "תסמיני דיכאון מוגברים" },
        { min: 20, max: 28, label: "גבוה", description: "תסמיני דיכאון משמעותיים" },
        { min: 29, max: 56, label: "גבוה מאוד", description: "תסמיני דיכאון חמורים" }
      ]
    }
  },

  // SCARED - Screen for Child Anxiety
  {
    code: "SCARED",
    name: "סקר חרדות לילדים",
    nameEn: "Screen for Child Anxiety Related Disorders",
    description: "שאלון ל-41 פריטים לזיהוי הפרעות חרדה בילדים ובני נוער",
    category: "ילדים",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, section: "panic", title: "כשאני מפחד, קשה לי לנשום", options: [
        { value: 0, text: "כמעט אף פעם" }, { value: 1, text: "לפעמים" }, { value: 2, text: "לעתים קרובות" }
      ]},
      { id: 2, section: "panic", title: "אני מרגיש חום בפנים כשאני חרד", options: [
        { value: 0, text: "כמעט אף פעם" }, { value: 1, text: "לפעמים" }, { value: 2, text: "לעתים קרובות" }
      ]},
      { id: 3, section: "general", title: "אני דואג לגבי דברים", options: [
        { value: 0, text: "כמעט אף פעם" }, { value: 1, text: "לפעמים" }, { value: 2, text: "לעתים קרובות" }
      ]},
      { id: 4, section: "separation", title: "אני מפחד להיות רחוק מההורים שלי", options: [
        { value: 0, text: "כמעט אף פעם" }, { value: 1, text: "לפעמים" }, { value: 2, text: "לעתים קרובות" }
      ]},
      { id: 5, section: "social", title: "אני מפחד שאנשים יצחקו עליי", options: [
        { value: 0, text: "כמעט אף פעם" }, { value: 1, text: "לפעמים" }, { value: 2, text: "לעתים קרובות" }
      ]}
    ],
    scoring: {
      maxScore: 82,
      cutoff: 25,
      subscales: {
        panic: { name: "פאניקה/סומטי", cutoff: 7 },
        general: { name: "חרדה כללית", cutoff: 9 },
        separation: { name: "חרדת נטישה", cutoff: 5 },
        social: { name: "חרדה חברתית", cutoff: 8 },
        school: { name: "חרדה מבית ספר", cutoff: 3 }
      }
    }
  },

  // ==================== PARENT QUESTIONNAIRES ====================
  
  // SDQ - Strengths and Difficulties (Parent Version)
  {
    code: "SDQ_PARENT",
    name: "שאלון חוזקות וקשיים - גרסת הורים",
    nameEn: "Strengths and Difficulties Questionnaire - Parent",
    description: "שאלון ל-25 פריטים להורים להערכת התנהגות רגשית וחברתית של ילדים",
    category: "הורים",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "מתחשב ברגשות של אחרים", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "בהחלט נכון" }
      ]},
      { id: 2, title: "חסר מנוחה, פעיל יתר, לא יכול לשבת במקום לזמן רב", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "בהחלט נכון" }
      ]},
      { id: 3, title: "מתלונן לעתים קרובות על כאבי ראש, בטן או בחילה", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "בהחלט נכון" }
      ]},
      { id: 4, title: "משתף בקלות עם ילדים אחרים", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "בהחלט נכון" }
      ]},
      { id: 5, title: "לעתים קרובות יש לו התקפי זעם או כעס", options: [
        { value: 0, text: "לא נכון" }, { value: 1, text: "נכון במידה מסוימת" }, { value: 2, text: "בהחלט נכון" }
      ]}
    ],
    scoring: {
      maxScore: 40,
      subscales: {
        emotional: { items: [3,8,13,16,24], name: "בעיות רגשיות", cutoff: 5 },
        conduct: { items: [5,7,12,18,22], name: "בעיות התנהגות", cutoff: 4 },
        hyperactivity: { items: [2,10,15,21,25], name: "היפראקטיביות", cutoff: 7 },
        peer: { items: [6,11,14,19,23], name: "בעיות עם חברים", cutoff: 4 },
        prosocial: { items: [1,4,9,17,20], name: "התנהגות פרו-חברתית", cutoff: 5 }
      }
    }
  },

  // PSI-SF - Parenting Stress Index Short Form
  {
    code: "PSI_SF",
    name: "מדד לחץ הורי - גרסה מקוצרת",
    nameEn: "Parenting Stress Index - Short Form",
    description: "שאלון ל-36 פריטים למדידת לחץ במערכת הורה-ילד",
    category: "הורים",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, section: "PD", title: "הילד שלי לעתים קרובות עושה דברים שמרגיזים אותי", options: [
        { value: 1, text: "מסכים מאוד" }, { value: 2, text: "מסכים" }, { value: 3, text: "לא בטוח" }, { value: 4, text: "לא מסכים" }, { value: 5, text: "לא מסכים בכלל" }
      ]},
      { id: 2, section: "PCDI", title: "אני מרגיש שקשה לי לקבל החלטות כהורה", options: [
        { value: 1, text: "מסכים מאוד" }, { value: 2, text: "מסכים" }, { value: 3, text: "לא בטוח" }, { value: 4, text: "לא מסכים" }, { value: 5, text: "לא מסכים בכלל" }
      ]},
      { id: 3, section: "DC", title: "הילד שלי מחייך הרבה פחות מכפי שציפיתי", options: [
        { value: 1, text: "מסכים מאוד" }, { value: 2, text: "מסכים" }, { value: 3, text: "לא בטוח" }, { value: 4, text: "לא מסכים" }, { value: 5, text: "לא מסכים בכלל" }
      ]}
    ],
    scoring: {
      maxScore: 180,
      cutoff: 90,
      subscales: {
        PD: { name: "מצוקה הורית", cutoff: 36 },
        PCDI: { name: "אינטראקציה הורה-ילד", cutoff: 27 },
        DC: { name: "ילד קשה", cutoff: 36 }
      }
    }
  },

  // ==================== EATING DISORDERS ====================
  
  // EAT-26 - Eating Attitudes Test
  {
    code: "EAT26",
    name: "מבחן עמדות אכילה",
    nameEn: "Eating Attitudes Test-26",
    description: "שאלון ל-26 פריטים לסקר הפרעות אכילה",
    category: "הפרעות אכילה",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "אני מפחד לעלות במשקל", options: [
        { value: 3, text: "תמיד" }, { value: 2, text: "בדרך כלל" }, { value: 1, text: "לעתים קרובות" }, { value: 0, text: "לפעמים/לעתים רחוקות/אף פעם" }
      ]},
      { id: 2, title: "אני נמנע מאכילה כשאני רעב", options: [
        { value: 3, text: "תמיד" }, { value: 2, text: "בדרך כלל" }, { value: 1, text: "לעתים קרובות" }, { value: 0, text: "לפעמים/לעתים רחוקות/אף פעם" }
      ]},
      { id: 3, title: "אני מרוכז באוכל", options: [
        { value: 3, text: "תמיד" }, { value: 2, text: "בדרך כלל" }, { value: 1, text: "לעתים קרובות" }, { value: 0, text: "לפעמים/לעתים רחוקות/אף פעם" }
      ]},
      { id: 4, title: "היו לי אפיזודות של אכילה מופרזת שבהן הרגשתי שאני לא יכול להפסיק", options: [
        { value: 3, text: "תמיד" }, { value: 2, text: "בדרך כלל" }, { value: 1, text: "לעתים קרובות" }, { value: 0, text: "לפעמים/לעתים רחוקות/אף פעם" }
      ]},
      { id: 5, title: "אני חותך את האוכל שלי לחתיכות קטנות", options: [
        { value: 3, text: "תמיד" }, { value: 2, text: "בדרך כלל" }, { value: 1, text: "לעתים קרובות" }, { value: 0, text: "לפעמים/לעתים רחוקות/אף פעם" }
      ]}
    ],
    scoring: {
      maxScore: 78,
      cutoff: 20,
      ranges: [
        { min: 0, max: 19, label: "תקין", description: "ללא הפרעת אכילה סבירה" },
        { min: 20, max: 78, label: "חשוד", description: "מעל הסף - נדרשת הערכה נוספת" }
      ]
    }
  },

  // ==================== SLEEP ====================
  
  // ISI - Insomnia Severity Index
  {
    code: "ISI",
    name: "מדד חומרת נדודי שינה",
    nameEn: "Insomnia Severity Index",
    description: "שאלון ל-7 פריטים להערכת חומרת נדודי שינה",
    category: "שינה",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "חומרת קושי להירדם", options: [
        { value: 0, text: "ללא בעיה" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 2, title: "חומרת קושי להישאר ער", options: [
        { value: 0, text: "ללא בעיה" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 3, title: "בעיית התעוררות מוקדמת", options: [
        { value: 0, text: "ללא בעיה" }, { value: 1, text: "קל" }, { value: 2, text: "בינוני" }, { value: 3, text: "חמור" }, { value: 4, text: "חמור מאוד" }
      ]},
      { id: 4, title: "עד כמה אתה מרוצה/לא מרוצה מהשינה הנוכחית שלך?", options: [
        { value: 0, text: "מרוצה מאוד" }, { value: 1, text: "מרוצה" }, { value: 2, text: "בינוני" }, { value: 3, text: "לא מרוצה" }, { value: 4, text: "לא מרוצה מאוד" }
      ]},
      { id: 5, title: "עד כמה בעיית השינה שלך בולטת לאחרים?", options: [
        { value: 0, text: "לא בולטת כלל" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד בולטת" }
      ]},
      { id: 6, title: "עד כמה אתה מודאג/מוטרד לגבי בעיית השינה?", options: [
        { value: 0, text: "לא מודאג כלל" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד מודאג" }
      ]},
      { id: 7, title: "עד כמה בעיית השינה מפריעה לתפקוד היומיומי?", options: [
        { value: 0, text: "לא מפריעה כלל" }, { value: 1, text: "קצת" }, { value: 2, text: "במידה מסוימת" }, { value: 3, text: "הרבה" }, { value: 4, text: "מפריעה מאוד" }
      ]}
    ],
    scoring: {
      maxScore: 28,
      ranges: [
        { min: 0, max: 7, label: "תקין", description: "אין נדודי שינה קליניים" },
        { min: 8, max: 14, label: "תת-סף", description: "נדודי שינה תת-קליניים" },
        { min: 15, max: 21, label: "בינוני", description: "נדודי שינה בינוניים" },
        { min: 22, max: 28, label: "חמור", description: "נדודי שינה חמורים" }
      ]
    }
  },

  // ==================== PERSONALITY DISORDERS ====================
  
  // BPD Checklist - McLean Screening Instrument
  {
    code: "MSI_BPD",
    name: "שאלון סקר להפרעת אישיות גבולית",
    nameEn: "McLean Screening Instrument for BPD",
    description: "שאלון ל-10 פריטים לזיהוי מהיר של הפרעת אישיות גבולית",
    category: "הפרעות אישיות",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "האם נטשת לעתים קרובות אנשים לפני שהם יכלו לנטוש אותך?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 2, title: "האם היו לך מערכות יחסים סוערות ורבות?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 3, title: "האם דימוי העצמי שלך משתנה באופן דרמטי?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 4, title: "האם פעלת לעתים קרובות באימפולסיביות בשני תחומים שעלולים לפגוע בך?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 5, title: "האם ניסית אי פעם לפגוע בעצמך או להתאבד?", isCritical: true, options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 6, title: "האם היו לך שינויי מצב רוח תכופים?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 7, title: "האם הרגשת ריקנות כרונית?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 8, title: "האם היה לך לעתים קרובות כעס עז או התקשית לשלוט בכעס?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 9, title: "האם הרגשת חשד או ניתוק מהמציאות כשהיית במתח?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 10, title: "האם היית מודאג באופן תכוף שאנשים חשובים לך ינטשו אותך?", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]}
    ],
    scoring: {
      maxScore: 10,
      cutoff: 7,
      criticalItems: [5],
      ranges: [
        { min: 0, max: 6, label: "שלילי", description: "סביר שאין BPD" },
        { min: 7, max: 10, label: "חיובי", description: "חשוד ל-BPD - נדרש אבחון מקיף" }
      ]
    }
  },

  // ==================== INTERGENERATIONAL TRANSMISSION ====================
  
  // CTQ - Childhood Trauma Questionnaire
  {
    code: "CTQ",
    name: "שאלון טראומת ילדות",
    nameEn: "Childhood Trauma Questionnaire",
    description: "שאלון ל-28 פריטים להערכת חוויות טראומטיות והזנחה בילדות",
    category: "טראומה",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, section: "EA", title: "אנשים במשפחתי קראו לי דברים כמו 'טיפש' או 'עצלן'", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, { value: 3, text: "לפעמים" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "לעתים קרובות מאוד" }
      ]},
      { id: 2, section: "PA", title: "נענשתי במכות שהשאירו חבורות או סימנים", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, { value: 3, text: "לפעמים" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "לעתים קרובות מאוד" }
      ]},
      { id: 3, section: "SA", title: "מישהו ניסה לגעת בי או לגרום לי לגעת בו בצורה מינית", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, { value: 3, text: "לפעמים" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "לעתים קרובות מאוד" }
      ]},
      { id: 4, section: "EN", title: "הרגשתי שלא היה לי מספיק לאכול", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, { value: 3, text: "לפעמים" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "לעתים קרובות מאוד" }
      ]},
      { id: 5, section: "EN", title: "הרגשתי שלא יהיה מי שיגן עליי", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, { value: 3, text: "לפעמים" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "לעתים קרובות מאוד" }
      ]}
    ],
    scoring: {
      maxScore: 125,
      subscales: {
        EA: { name: "התעללות רגשית", cutoff: 13, items: 5 },
        PA: { name: "התעללות פיזית", cutoff: 10, items: 5 },
        SA: { name: "התעללות מינית", cutoff: 8, items: 5 },
        EN: { name: "הזנחה רגשית", cutoff: 15, items: 5 },
        PN: { name: "הזנחה פיזית", cutoff: 10, items: 5 }
      }
    }
  },

  // ECR-R - Experiences in Close Relationships - Revised
  {
    code: "ECR_R",
    name: "חוויות במערכות יחסים קרובות",
    nameEn: "Experiences in Close Relationships - Revised",
    description: "שאלון ל-36 פריטים למדידת סגנון התקשרות במבוגרים",
    category: "התקשרות",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, section: "anxiety", title: "אני חושש שאאבד את אהבת בן הזוג שלי", options: [
        { value: 1, text: "מסכים בכלל" }, { value: 2, text: "מסכים" }, { value: 3, text: "מסכים קצת" }, { value: 4, text: "נייטרלי" }, { value: 5, text: "לא מסכים קצת" }, { value: 6, text: "לא מסכים" }, { value: 7, text: "לא מסכים בכלל" }
      ]},
      { id: 2, section: "avoidance", title: "אני מעדיף לא להראות לבן הזוג את הרגשות העמוקים שלי", options: [
        { value: 1, text: "מסכים בכלל" }, { value: 2, text: "מסכים" }, { value: 3, text: "מסכים קצת" }, { value: 4, text: "נייטרלי" }, { value: 5, text: "לא מסכים קצת" }, { value: 6, text: "לא מסכים" }, { value: 7, text: "לא מסכים בכלל" }
      ]},
      { id: 3, section: "anxiety", title: "אני מודאג שבן הזוג לא באמת אוהב אותי", options: [
        { value: 1, text: "מסכים בכלל" }, { value: 2, text: "מסכים" }, { value: 3, text: "מסכים קצת" }, { value: 4, text: "נייטרלי" }, { value: 5, text: "לא מסכים קצת" }, { value: 6, text: "לא מסכים" }, { value: 7, text: "לא מסכים בכלל" }
      ]},
      { id: 4, section: "avoidance", title: "אני מרגיש נוח לחלוק עם בן הזוג מחשבות ורגשות אינטימיים", options: [
        { value: 7, text: "מסכים בכלל" }, { value: 6, text: "מסכים" }, { value: 5, text: "מסכים קצת" }, { value: 4, text: "נייטרלי" }, { value: 3, text: "לא מסכים קצת" }, { value: 2, text: "לא מסכים" }, { value: 1, text: "לא מסכים בכלל" }
      ]}
    ],
    scoring: {
      maxScore: 252,
      subscales: {
        anxiety: { items: 18, name: "חרדת נטישה", lowRange: [18,54], highRange: [108,126] },
        avoidance: { items: 18, name: "הימנעות מקירבה", lowRange: [18,54], highRange: [108,126] }
      }
    }
  },

  // PBI - Parental Bonding Instrument
  {
    code: "PBI",
    name: "מכשיר קשר הורי",
    nameEn: "Parental Bonding Instrument",
    description: "שאלון ל-25 פריטים להערכת זיכרון של טיפול הורי וגבולות בילדות",
    category: "התקשרות",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, section: "care", title: "דיבר אליי בקול חם וידידותי", options: [
        { value: 0, text: "מאוד לא אופייני" }, { value: 1, text: "קצת אופייני" }, { value: 2, text: "די אופייני" }, { value: 3, text: "מאוד אופייני" }
      ]},
      { id: 2, section: "overprotection", title: "ניסה לשלוט בכל דבר שעשיתי", options: [
        { value: 0, text: "מאוד לא אופייני" }, { value: 1, text: "קצת אופייני" }, { value: 2, text: "די אופייני" }, { value: 3, text: "מאוד אופייני" }
      ]},
      { id: 3, section: "care", title: "נתן לי להרגיש שלא רצו אותי", options: [
        { value: 3, text: "מאוד לא אופייני" }, { value: 2, text: "קצת אופייני" }, { value: 1, text: "די אופייני" }, { value: 0, text: "מאוד אופייני" }
      ]},
      { id: 4, section: "care", title: "נראה רגשית קר אליי", options: [
        { value: 3, text: "מאוד לא אופייני" }, { value: 2, text: "קצת אופייני" }, { value: 1, text: "די אופייני" }, { value: 0, text: "מאוד אופייני" }
      ]},
      { id: 5, section: "care", title: "נראה שמבין את הבעיות והדאגות שלי", options: [
        { value: 0, text: "מאוד לא אופייני" }, { value: 1, text: "קצת אופייני" }, { value: 2, text: "די אופייני" }, { value: 3, text: "מאוד אופייני" }
      ]}
    ],
    scoring: {
      subscales: {
        care: { items: 12, name: "חום/דחייה", lowCare: [0,24], highCare: [27,36] },
        overprotection: { items: 13, name: "שליטה/אוטונומיה", lowControl: [0,12], highControl: [25,39] }
      }
    }
  },

  // ==================== ADDITIONAL ====================
  
  // BHS - Beck Hopelessness Scale
  {
    code: "BHS",
    name: "סולם חוסר תקווה בק",
    nameEn: "Beck Hopelessness Scale",
    description: "שאלון ל-20 פריטים למדידת חוסר תקווה ופסימיות",
    category: "סיכון",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "אני מצפה לעתיד בציפייה והתלהבות", options: [
        { value: 1, text: "נכון" }, { value: 0, text: "לא נכון" }
      ]},
      { id: 2, title: "עדיף שאוותר כי אין מה שאני יכול לעשות לגבי עצמי", options: [
        { value: 0, text: "נכון" }, { value: 1, text: "לא נכון" }
      ]},
      { id: 3, title: "כשדברים הולכים לא טוב, זה עוזר לי לדעת שהם לא יכולים להישאר ככה לנצח", options: [
        { value: 1, text: "נכון" }, { value: 0, text: "לא נכון" }
      ]},
      { id: 4, title: "אני לא יכול לדמיין איך יהיו החיים שלי בעוד 10 שנים", options: [
        { value: 0, text: "נכון" }, { value: 1, text: "לא נכון" }
      ]},
      { id: 5, title: "יש לי מספיק זמן להשיג את מה שהכי חשוב לי", options: [
        { value: 1, text: "נכון" }, { value: 0, text: "לא נכון" }
      ]}
    ],
    scoring: {
      maxScore: 20,
      ranges: [
        { min: 0, max: 3, label: "מינימלי", description: "חוסר תקווה מינימלי" },
        { min: 4, max: 8, label: "קל", description: "חוסר תקווה קל" },
        { min: 9, max: 14, label: "בינוני", description: "חוסר תקווה בינוני" },
        { min: 15, max: 20, label: "חמור", description: "חוסר תקווה חמור" }
      ]
    }
  },

  // WHODAS 2.0 - WHO Disability Assessment
  {
    code: "WHODAS2",
    name: "הערכת מוגבלות WHO",
    nameEn: "WHO Disability Assessment Schedule 2.0",
    description: "שאלון ל-12 פריטים להערכת תפקוד ומוגבלות",
    category: "תפקוד",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, section: "cognition", title: "ריכוז למשך 10 דקות", options: [
        { value: 0, text: "ללא קושי" }, { value: 1, text: "קושי קל" }, { value: 2, text: "קושי בינוני" }, { value: 3, text: "קושי רב" }, { value: 4, text: "קושי קיצוני או אי-יכולת" }
      ]},
      { id: 2, section: "cognition", title: "זכירת דברים חשובים", options: [
        { value: 0, text: "ללא קושי" }, { value: 1, text: "קושי קל" }, { value: 2, text: "קושי בינוני" }, { value: 3, text: "קושי רב" }, { value: 4, text: "קושי קיצוני או אי-יכולת" }
      ]},
      { id: 3, section: "mobility", title: "עמידה לזמן ארוך (30 דקות)", options: [
        { value: 0, text: "ללא קושי" }, { value: 1, text: "קושי קל" }, { value: 2, text: "קושי בינוני" }, { value: 3, text: "קושי רב" }, { value: 4, text: "קושי קיצוני או אי-יכולת" }
      ]},
      { id: 4, section: "self_care", title: "רחיצת כל הגוף", options: [
        { value: 0, text: "ללא קושי" }, { value: 1, text: "קושי קל" }, { value: 2, text: "קושי בינוני" }, { value: 3, text: "קושי רב" }, { value: 4, text: "קושי קיצוני או אי-יכולת" }
      ]},
      { id: 5, section: "self_care", title: "לבישה", options: [
        { value: 0, text: "ללא קושי" }, { value: 1, text: "קושי קל" }, { value: 2, text: "קושי בינוני" }, { value: 3, text: "קושי רב" }, { value: 4, text: "קושי קיצוני או אי-יכולת" }
      ]},
      { id: 6, section: "getting_along", title: "תקשורת עם אנשים לא מוכרים", options: [
        { value: 0, text: "ללא קושי" }, { value: 1, text: "קושי קל" }, { value: 2, text: "קושי בינוני" }, { value: 3, text: "קושי רב" }, { value: 4, text: "קושי קיצוני או אי-יכולת" }
      ]},
      { id: 7, section: "getting_along", title: "שמירה על ידידות", options: [
        { value: 0, text: "ללא קושי" }, { value: 1, text: "קושי קל" }, { value: 2, text: "קושי בינוני" }, { value: 3, text: "קושי רב" }, { value: 4, text: "קושי קיצוני או אי-יכולת" }
      ]},
      { id: 8, section: "life_activities", title: "טיפול בתפקידים ביתיים", options: [
        { value: 0, text: "ללא קושי" }, { value: 1, text: "קושי קל" }, { value: 2, text: "קושי בינוני" }, { value: 3, text: "קושי רב" }, { value: 4, text: "קושי קיצוני או אי-יכולת" }
      ]},
      { id: 9, section: "life_activities", title: "ביצוע עבודה יומיומית חשובה", options: [
        { value: 0, text: "ללא קושי" }, { value: 1, text: "קושי קל" }, { value: 2, text: "קושי בינוני" }, { value: 3, text: "קושי רב" }, { value: 4, text: "קושי קיצוני או אי-יכולת" }
      ]},
      { id: 10, section: "participation", title: "השתתפות בפעילויות קהילתיות", options: [
        { value: 0, text: "ללא קושי" }, { value: 1, text: "קושי קל" }, { value: 2, text: "קושי בינוני" }, { value: 3, text: "קושי רב" }, { value: 4, text: "קושי קיצוני או אי-יכולת" }
      ]},
      { id: 11, section: "participation", title: "השפעת הבעיות הבריאותיות רגשית", options: [
        { value: 0, text: "ללא השפעה" }, { value: 1, text: "השפעה קלה" }, { value: 2, text: "השפעה בינונית" }, { value: 3, text: "השפעה רבה" }, { value: 4, text: "השפעה קיצונית" }
      ]},
      { id: 12, section: "participation", title: "התמודדות כלכלית עקב הבריאות", options: [
        { value: 0, text: "ללא קושי" }, { value: 1, text: "קושי קל" }, { value: 2, text: "קושי בינוני" }, { value: 3, text: "קושי רב" }, { value: 4, text: "קושי קיצוני או אי-יכולת" }
      ]}
    ],
    scoring: {
      maxScore: 48,
      subscales: {
        cognition: { items: [1,2], name: "הבנה ותקשורת" },
        mobility: { items: [3], name: "ניידות" },
        self_care: { items: [4,5], name: "טיפול עצמי" },
        getting_along: { items: [6,7], name: "יחסים בין-אישיים" },
        life_activities: { items: [8,9], name: "פעילויות חיים" },
        participation: { items: [10,11,12], name: "השתתפות בחברה" }
      }
    }
  },

  // ==================== MORE PARENT QUESTIONNAIRES ====================
  
  // Vanderbilt ADHD Parent Rating
  {
    code: "VADPRS",
    name: "הערכת ADHD על ידי הורים - ונדרבילט",
    nameEn: "Vanderbilt ADHD Diagnostic Parent Rating Scale",
    description: "שאלון ל-55 פריטים להורים להערכת ADHD ותפקוד",
    category: "הורים",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, section: "inattention", title: "לא מצליח לתת תשומת לב לפרטים או עושה טעויות רשלניות", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "מדי פעם" }, { value: 2, text: "לעתים קרובות" }, { value: 3, text: "לעתים קרובות מאוד" }
      ]},
      { id: 2, section: "inattention", title: "מתקשה לשמור על קשב במשימות או משחקים", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "מדי פעם" }, { value: 2, text: "לעתים קרובות" }, { value: 3, text: "לעתים קרובות מאוד" }
      ]},
      { id: 3, section: "hyperactivity", title: "מנענע ידיים או רגליים או מתנדנד בכיסא", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "מדי פעם" }, { value: 2, text: "לעתים קרובות" }, { value: 3, text: "לעתים קרובות מאוד" }
      ]},
      { id: 4, section: "oppositional", title: "מאבד עשתונות", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "מדי פעם" }, { value: 2, text: "לעתים קרובות" }, { value: 3, text: "לעתים קרובות מאוד" }
      ]},
      { id: 5, section: "anxiety", title: "חרד או מודאג", options: [
        { value: 0, text: "אף פעם" }, { value: 1, text: "מדי פעם" }, { value: 2, text: "לעתים קרובות" }, { value: 3, text: "לעתים קרובות מאוד" }
      ]}
    ],
    scoring: {
      subscales: {
        inattention: { items: 9, cutoff: 6, name: "חוסר קשב" },
        hyperactivity: { items: 9, cutoff: 6, name: "היפראקטיביות/אימפולסיביות" },
        oppositional: { items: 8, cutoff: 4, name: "הפרעת התנגדות" },
        conduct: { items: 14, cutoff: 3, name: "הפרעת התנהגות" },
        anxiety: { items: 7, cutoff: 3, name: "חרדה/דיכאון" }
      }
    }
  },

  // ECBI - Eyberg Child Behavior Inventory
  {
    code: "ECBI",
    name: "מלאי התנהגות ילדים אייברג",
    nameEn: "Eyberg Child Behavior Inventory",
    description: "שאלון ל-36 פריטים להורים למדידת התנהגות בעייתית בילדים 2-16",
    category: "הורים",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "דורש תשומת לב רבה", 
        intensityOptions: [
          { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, 
          { value: 3, text: "לפעמים" }, { value: 4, text: "לעתים קרובות" }, 
          { value: 5, text: "תמיד" }, { value: 6, text: "N/A" }, { value: 7, text: "לא תופס" }
        ],
        problemOptions: [
          { value: 0, text: "לא" }, { value: 1, text: "כן" }
        ]
      },
      { id: 2, title: "מתווכח עם הורים", 
        intensityOptions: [
          { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, 
          { value: 3, text: "לפעמים" }, { value: 4, text: "לעתים קרובות" }, 
          { value: 5, text: "תמיד" }, { value: 6, text: "N/A" }, { value: 7, text: "לא תופס" }
        ],
        problemOptions: [
          { value: 0, text: "לא" }, { value: 1, text: "כן" }
        ]
      }
    ],
    scoring: {
      intensity: { maxScore: 252, cutoff: 131 },
      problem: { maxScore: 36, cutoff: 15 }
    }
  },

  // Alabama Parenting Questionnaire
  {
    code: "APQ",
    name: "שאלון הורות אלבמה",
    nameEn: "Alabama Parenting Questionnaire",
    description: "שאלון ל-42 פריטים להערכת שיטות הורות",
    category: "הורים",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, section: "positive", title: "אתה אומר לילד שלך משהו נחמד על משהו שהוא עשה", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "כמעט אף פעם" }, { value: 3, text: "לפעמים" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "תמיד" }
      ]},
      { id: 2, section: "involvement", title: "אתה משחק משחקים עם הילד שלך", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "כמעט אף פעם" }, { value: 3, text: "לפעמים" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "תמיד" }
      ]},
      { id: 3, section: "monitoring", title: "אתה יודע מה הילד שלך עושה בזמן פנוי", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "כמעט אף פעם" }, { value: 3, text: "לפעמים" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "תמיד" }
      ]},
      { id: 4, section: "inconsistent", title: "אתה מאיים להעניש אבל לא עושה זאת", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "כמעט אף פעם" }, { value: 3, text: "לפעמים" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "תמיד" }
      ]},
      { id: 5, section: "corporal", title: "אתה סוטר את הילד כשהוא עושה משהו לא נכון", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "כמעט אף פעם" }, { value: 3, text: "לפעמים" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "תמיד" }
      ]}
    ],
    scoring: {
      subscales: {
        positive: { name: "חיזוק חיובי", items: 6 },
        involvement: { name: "מעורבות הורית", items: 10 },
        monitoring: { name: "פיקוח", items: 10 },
        inconsistent: { name: "משמעת לא עקבית", items: 6 },
        corporal: { name: "ענישה גופנית", items: 3 }
      }
    }
  },

  // ==================== PERSONALITY DISORDERS ====================
  
  // PDQ-4+ - Personality Diagnostic Questionnaire
  {
    code: "PDQ4",
    name: "שאלון אבחון הפרעות אישיות",
    nameEn: "Personality Diagnostic Questionnaire-4+",
    description: "שאלון ל-99 פריטים כן/לא לסקר כל הפרעות האישיות",
    category: "הפרעות אישיות",
    testType: "SELF_REPORT",
    questions: [
      // Paranoid
      { id: 1, section: "paranoid", title: "אני מגן על עצמי אפילו כשאין צורך בכך", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 2, section: "paranoid", title: "אני חושד שאנשים מדברים עליי מאחורי גבי", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 3, section: "paranoid", title: "אני זוכר עלבונות ופגיעות לזמן רב", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      // Schizoid
      { id: 4, section: "schizoid", title: "אני לא נהנה מקשרים חברתיים", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 5, section: "schizoid", title: "אני מעדיף לעשות דברים לבד", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      // Schizotypal
      { id: 6, section: "schizotypal", title: "יש לי חוויות מוזרות או יוצאות דופן", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 7, section: "schizotypal", title: "אנשים חושבים שאני מוזר או אקסצנטרי", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      // Borderline
      { id: 8, section: "borderline", title: "אני עושה דברים באימפולס", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 9, section: "borderline", title: "ניסיתי לפגוע בעצמי או להתאבד", isCritical: true, options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 10, section: "borderline", title: "יש לי שינויי מצב רוח תכופים", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      // Antisocial
      { id: 11, section: "antisocial", title: "אין לי בעיה להשתמש באנשים כדי להשיג מה שאני רוצה", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 12, section: "antisocial", title: "שיקרתי או רימיתי אנשים", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      // Narcissistic
      { id: 13, section: "narcissistic", title: "אני מרגיש שאני מיוחד ויוצא דופן", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 14, section: "narcissistic", title: "אני מצפה שאנשים יתנו לי יחס מיוחד", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      // Avoidant
      { id: 15, section: "avoidant", title: "אני נמנע ממפגשים חברתיים מפחד שלא יאהבו אותי", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 16, section: "avoidant", title: "אני מודאג מביקורת או דחייה במצבים חברתיים", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      // Dependent
      { id: 17, section: "dependent", title: "קשה לי לקבל החלטות יומיומיות ללא ייעוץ מאחרים", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 18, section: "dependent", title: "אני צריך שאחרים יקבלו עבורי אחריות", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      // Obsessive-Compulsive
      { id: 19, section: "ocpd", title: "אני מוקדש לעבודה עד שמזניח משפחה וחברים", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]},
      { id: 20, section: "ocpd", title: "אני פרפקציוניסט ואני דורש שדברים ייעשו בדיוק", options: [
        { value: 0, text: "לא" }, { value: 1, text: "כן" }
      ]}
    ],
    scoring: {
      subscales: {
        paranoid: { cutoff: 4, name: "פרנואידי" },
        schizoid: { cutoff: 4, name: "סכיזואידי" },
        schizotypal: { cutoff: 5, name: "סכיזוטיפלי" },
        borderline: { cutoff: 5, name: "גבולי" },
        antisocial: { cutoff: 3, name: "אנטי-חברתי" },
        narcissistic: { cutoff: 5, name: "נרקיסיסטי" },
        avoidant: { cutoff: 4, name: "נמנע" },
        dependent: { cutoff: 5, name: "תלותי" },
        ocpd: { cutoff: 4, name: "אובססיבי-קומפולסיבי" }
      }
    }
  },

  // ==================== INTERGENERATIONAL ====================
  
  // ITQ - International Trauma Questionnaire
  {
    code: "ITQ",
    name: "שאלון טראומה בינלאומי",
    nameEn: "International Trauma Questionnaire",
    description: "שאלון ל-18 פריטים להערכת PTSD וטראומה מורכבת (C-PTSD)",
    category: "טראומה",
    testType: "SELF_REPORT",
    questions: [
      // PTSD Core
      { id: 1, section: "re", title: "מחשבות או זיכרונות חוזרים על החוויה", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "בינוני" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 2, section: "av", title: "הימנעות מזיכרונות או תזכורות", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "בינוני" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 3, section: "th", title: "תחושת איום עכשווי", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "בינוני" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      // Disturbances in Self-Organization (DSO)
      { id: 4, section: "ad", title: "קושי לוויסות רגשות (כעס, עצב)", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "בינוני" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 5, section: "nsc", title: "תחושת כישלון או חוסר ערך", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "בינוני" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]},
      { id: 6, section: "dr", title: "קושי להרגיש קרוב לאנשים", options: [
        { value: 0, text: "כלל לא" }, { value: 1, text: "מעט" }, { value: 2, text: "בינוני" }, { value: 3, text: "הרבה" }, { value: 4, text: "מאוד" }
      ]}
    ],
    scoring: {
      ptsd: { cutoff: 2, subscales: ["re", "av", "th"] },
      dso: { cutoff: 2, subscales: ["ad", "nsc", "dr"] },
      cptsd: { requires: ["ptsd", "dso"] }
    }
  },

  // ==================== ADDITIONAL USEFUL ====================
  
  // RRS - Ruminative Response Scale
  {
    code: "RRS",
    name: "סולם תגובות הרהור",
    nameEn: "Ruminative Response Scale",
    description: "שאלון ל-22 פריטים למדידת הרהורים דיכאוניים",
    category: "קוגניציה",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "אני חושב 'מה עשיתי שגרם לזה?'", options: [
        { value: 1, text: "כמעט אף פעם" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "כמעט תמיד" }
      ]},
      { id: 2, title: "אני חושב על כמה אני מרגיש עצוב", options: [
        { value: 1, text: "כמעט אף פעם" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "כמעט תמיד" }
      ]},
      { id: 3, title: "אני חושב על כל החסרונות, הכשלים והטעויות שלי", options: [
        { value: 1, text: "כמעט אף פעם" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "כמעט תמיד" }
      ]},
      { id: 4, title: "אני חושב 'מדוע אני לא יכול להסתדר יותר טוב?'", options: [
        { value: 1, text: "כמעט אף פעם" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "כמעט תמיד" }
      ]},
      { id: 5, title: "אני חושב 'מדוע אני תמיד מגיב ככה?'", options: [
        { value: 1, text: "כמעט אף פעם" }, { value: 2, text: "לפעמים" }, { value: 3, text: "לעתים קרובות" }, { value: 4, text: "כמעט תמיד" }
      ]}
    ],
    scoring: {
      maxScore: 88,
      subscales: {
        brooding: { items: 5, name: "הרהורים דיכאוניים" },
        reflection: { items: 5, name: "הרהור מודע" },
        depression: { items: 12, name: "הרהורים על דיכאון" }
      }
    }
  },

  // WEMWBS - Warwick-Edinburgh Mental Wellbeing Scale
  {
    code: "WEMWBS",
    name: "סולם רווחה נפשית",
    nameEn: "Warwick-Edinburgh Mental Wellbeing Scale",
    description: "שאלון ל-14 פריטים למדידת רווחה נפשית חיובית",
    category: "רווחה",
    testType: "SELF_REPORT",
    questions: [
      { id: 1, title: "הרגשתי אופטימי לגבי העתיד", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, { value: 3, text: "חלק מהזמן" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "כל הזמן" }
      ]},
      { id: 2, title: "הרגשתי שימושי", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, { value: 3, text: "חלק מהזמן" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "כל הזמן" }
      ]},
      { id: 3, title: "הרגשתי רגוע", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, { value: 3, text: "חלק מהזמן" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "כל הזמן" }
      ]},
      { id: 4, title: "טיפלתי בבעיות בצורה טובה", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, { value: 3, text: "חלק מהזמן" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "כל הזמן" }
      ]},
      { id: 5, title: "חשבתי בצורה צלולה", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, { value: 3, text: "חלק מהזמן" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "כל הזמן" }
      ]},
      { id: 6, title: "הרגשתי קרוב לאנשים אחרים", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, { value: 3, text: "חלק מהזמן" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "כל הזמן" }
      ]},
      { id: 7, title: "יכולתי להחליט בעצמי", options: [
        { value: 1, text: "אף פעם" }, { value: 2, text: "לעתים רחוקות" }, { value: 3, text: "חלק מהזמן" }, { value: 4, text: "לעתים קרובות" }, { value: 5, text: "כל הזמן" }
      ]}
    ],
    scoring: {
      maxScore: 70,
      minScore: 14,
      ranges: [
        { min: 14, max: 42, label: "נמוך", description: "רווחה נפשית נמוכה" },
        { min: 43, max: 59, label: "ממוצע", description: "רווחה נפשית ממוצעת" },
        { min: 60, max: 70, label: "גבוה", description: "רווחה נפשית גבוהה" }
      ]
    }
  }
];
