import { describe, it, expect } from "vitest";
import {
  createSessionConfirmationEmail,
  create2HourReminderEmail,
  createCancellationRejectedEmail,
} from "@/lib/email-templates";

// therapistName/address מגיעים מנתוני מטפל (session.therapist.name, session.location),
// rejectionReason מגוף בקשה. מטפל זדוני/פרוץ יכול להזריק HTML למייל שמגיע למטופל.
// הבדיקה מוודאת ש-escapeHtml מונע הזרקת תגיות גולמיות (פישינג/tracking pixels).
const base = {
  clientName: "דנה",
  therapistName: "כהן",
  date: "01/01/2026",
  time: "10:00",
};

describe("email-templates — escapeHtml בגוף ה-HTML", () => {
  it("מנקה therapistName ו-address ב-createSessionConfirmationEmail", () => {
    const { html } = createSessionConfirmationEmail({
      ...base,
      therapistName: "<img src=x onerror=alert(1)>",
      address: "<script>evil()</script>רחוב 5",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>evil");
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("&lt;script&gt;evil");
  });

  it("מנקה address ב-create2HourReminderEmail", () => {
    const { html } = create2HourReminderEmail({ ...base, address: "<b>x</b>" });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("מנקה rejectionReason ב-createCancellationRejectedEmail", () => {
    const { html } = createCancellationRejectedEmail({
      ...base,
      rejectionReason: "<a href=evil>פיש</a>",
    });
    expect(html).not.toContain("<a href=evil>");
    expect(html).toContain("&lt;a href=evil&gt;");
  });
});
