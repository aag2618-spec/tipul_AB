/**
 * לוגיקת מדיניות ביטול פגישה — מקור-אמת אחד לשאלה "האם ביטול עכשיו אמור
 * להציע חיוב דמי ביטול".
 *
 * הכלל: ביטול נחשב "מאוחר" (וניתן לחייב עליו) כאשר נותרו *פחות* מ-
 * `minCancellationHours` שעות עד תחילת הפגישה, ויש לפגישה מחיר חיובי.
 * בדיוק על הסף (hoursUntil === minCancellationHours) — עדיין מותר לבטל בלי חיוב.
 *
 * `minCancellationHours` מגיע מהגדרת המטפל (`communicationSetting`,
 * ברירת מחדל 24) — מקור אחיד עם ביטול ע"י מטופל.
 */
export function shouldChargeCancellation(
  hoursUntilSession: number,
  minCancellationHours: number,
  price: number,
): boolean {
  if (price <= 0) return false;
  return hoursUntilSession < minCancellationHours;
}

/**
 * שעות (עשרוני) עד תחילת הפגישה ממועד נתון. שלילי = הפגישה כבר עברה.
 * `now` מוזרק כדי לשמור על טהירות (בדיקות דטרמיניסטיות).
 */
export function hoursUntil(startTime: string | Date, now: Date): number {
  const start = startTime instanceof Date ? startTime : new Date(startTime);
  return (start.getTime() - now.getTime()) / (1000 * 60 * 60);
}
