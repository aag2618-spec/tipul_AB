/**
 * המרת Prisma Decimal objects למספרים רגילים בתגובות API.
 * Prisma מחזירה Decimal כאובייקטים עם מבנה פנימי (d, e, s).
 * JSON.stringify ממיר אותם ל-strings כמו "350.00" במקום מספרים כמו 350.
 * פונקציה זו ממירה את כולם למספרים רגילים.
 */
export function serializePrisma<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      // Prisma Decimal: אובייקט עם d, e, s properties
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "d" in value &&
        "e" in value &&
        "s" in value
      ) {
        return Number(value);
      }
      return value;
    })
  );
}
