import { TasksManager } from "@/components/clinic-admin/tasks-manager";

// מסך ניהול מטלות הצוות במעטפת ניהול הקליניקה (בעלים / מנהלת). הגישה נאכפת
// בלייאאוט (/api/clinic-admin/me) וב-API (canManageStaffTasks). המימוש המשותף
// נמצא ב-tasks-manager.tsx ומרונדר גם ב-/dashboard/staff-tasks (מעטפת המזכיר/ה),
// כך שמזכיר/ה עם canAssignTasks מנהלת מטלות בלי להיזרק למסך ניהול הקליניקה.
export default function ClinicTasksPage() {
  return <TasksManager />;
}
