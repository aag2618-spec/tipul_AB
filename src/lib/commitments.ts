/**
 * לוגיקה משותפת להתחייבות קופ"ח — האם ההשתתפות העצמית עדיין חלה.
 *
 * הרעיון: המטפל מגדיר מספר טיפולים מאושרים (approvedSessions) שעבורם הקופה
 * מסבסדת, והמטופל משלם רק השתתפות עצמית (copaymentAmount). ברגע שמוצו כל
 * הטיפולים המאושרים — אין יותר כיסוי מהקופה, ולכן יש לחייב את מחיר הפגישה
 * המלא הרגיל.
 *
 * הפונקציות כאן משמשות גם בשרת (חישוב סכום התשלום + ספירת הטיפולים) וגם
 * בצד הלקוח (הדיאלוגים שמציגים/ממלאים מראש את סכום החיוב), כדי שכל המקומות
 * יתנהגו בדיוק אותו דבר — מקור אמת אחד.
 */

export interface CommitmentUsage {
  copaymentAmount: number | null;
  approvedSessions: number | null;
  usedSessions: number;
}

/**
 * האם נותרו טיפולים מאושרים בהתחייבות.
 * approvedSessions === null פירושו "ללא הגבלה" — תמיד נשארים טיפולים.
 */
export function commitmentHasRemainingSessions(c: {
  approvedSessions: number | null;
  usedSessions: number;
}): boolean {
  return c.approvedSessions == null || c.usedSessions < c.approvedSessions;
}

/**
 * האם יש לחייב את ההשתתפות העצמית (במקום מחיר מלא) עבור הפגישה הבאה.
 * נדרשים שני תנאים: קיימת השתתפות עצמית מוגדרת, וגם נותרו טיפולים מאושרים.
 */
export function copayApplies(c: CommitmentUsage): boolean {
  return c.copaymentAmount != null && commitmentHasRemainingSessions(c);
}
