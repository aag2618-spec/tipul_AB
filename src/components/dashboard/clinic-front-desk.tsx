// רכיב המוקד המשותף ("דלפק קבלה" / front-desk) — משרת גם מזכיר/ה (בדף הבית
// /dashboard) וגם בעל/ת קליניקה (בדף הבית של ניהול הקליניקה /clinic-admin).
// המימוש המלא נמצא ב-secretary-home.tsx; כאן רק שֵם ניטרלי-תפקיד, כדי שדף ניהול
// הקליניקה לא ייבא רכיב בשם "SecretaryHome". שניהם אותו רכיב, אותו scope-aware
// data-fetch (buildSessionWhere/buildPaymentWhere) — לבעל/ת קליניקה הוא מחזיר
// scope ארגוני וכל ההרשאות (secretaryCan מחזיר true ללא-מזכירה).
export { SecretaryHome as ClinicFrontDesk } from "./secretary-home";
