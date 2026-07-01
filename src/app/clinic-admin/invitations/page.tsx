import { redirect } from "next/navigation";

// הטאב "צירוף לקליניקה" אוחד לתוך "צוות הקליניקה" (/clinic-admin/members):
// חברים פעילים + הזמנות ממתינות + היסטוריה + טופס הצירוף — הכול במסך אחד.
// נשמרת הפניה כדי שסימניות/קישורים ישנים ל-/clinic-admin/invitations לא יישברו.
export default function ClinicInvitationsRedirect() {
  redirect("/clinic-admin/members");
}
