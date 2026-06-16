import { describe, it, expect } from "vitest";
import { isClinicCalendarView } from "../clinic-view";

describe("isClinicCalendarView — גידור 'יומן קליניקה' מול 'היומן הרגיל'", () => {
  it("מטפל עצמאי (לא רב-מטפלים) → תמיד false, בלי קשר ל-viewMode/תפקיד", () => {
    expect(
      isClinicCalendarView({ multiTherapist: false, viewMode: "personal", isSecretary: false })
    ).toBe(false);
    expect(
      isClinicCalendarView({ multiTherapist: false, viewMode: "clinic", isSecretary: false })
    ).toBe(false);
    // גם אם משום מה isSecretary=true בלי קליניקה רב-מטפלית — עדיין false.
    expect(
      isClinicCalendarView({ multiTherapist: false, viewMode: "clinic", isSecretary: true })
    ).toBe(false);
  });

  it("בעלים בתצוגת 'שלי' (personal) → false — היומן הרגיל לא מושפע", () => {
    expect(
      isClinicCalendarView({ multiTherapist: true, viewMode: "personal", isSecretary: false })
    ).toBe(false);
  });

  it("בעלים בתצוגת 'כל הקליניקה' (clinic) → true", () => {
    expect(
      isClinicCalendarView({ multiTherapist: true, viewMode: "clinic", isSecretary: false })
    ).toBe(true);
  });

  it("מזכירה → true גם כש-cookie הוא 'personal' (אין לה תצוגת 'שלי')", () => {
    expect(
      isClinicCalendarView({ multiTherapist: true, viewMode: "personal", isSecretary: true })
    ).toBe(true);
    expect(
      isClinicCalendarView({ multiTherapist: true, viewMode: "clinic", isSecretary: true })
    ).toBe(true);
  });
});
