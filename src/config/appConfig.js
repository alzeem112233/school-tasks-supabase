export { roles } from "../utils/permissionUtils.js";

export const schools = [
  { id: "11111111-1111-4111-8111-111111111111", name: "الإدارة العامة", shortName: "ع.ع" },
  { id: "22222222-2222-4222-8222-222222222222", name: "المدرسة أ", shortName: "أ" },
  { id: "33333333-3333-4333-8333-333333333333", name: "المدرسة ب", shortName: "ب" },
];

export const departments = [
  "الإدارة العامة",
  "إدارة المدرسة",
  "السكرتارية",
  "الإشراف المرحلي",
  "الإشراف التربوي",
  "الإشراف الاخصائي",
  "وحدة الحاسوب",
  "وحدة الطباعة",
];
export const taskStatuses = ["new", "in_progress", "under_review", "approved", "completed", "overdue", "archived"];
export const taskCreationStatuses = ["new", "in_progress", "under_review", "approved", "completed", "archived"];

export const icons = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 13h8V3H3v10Z"/><path d="M13 21h8v-8h-8v8Z"/><path d="M13 3v8h8V3h-8Z"/><path d="M3 21h8v-6H3v6Z"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  notebook: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-1.5Z"/><path d="M8 7h6"/><path d="M8 11h6"/><path d="M8 15h4"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 0 1-15.3 6.4"/><path d="M3 12A9 9 0 0 1 18.3 5.6"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5"/></svg>',
  message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16.6A5 5 0 0 1 18 21H6a5 5 0 0 1-2-4.4"/></svg>',
  approval: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3s9 4.03 9 9Z"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M23 3H1v5h22V3Z"/><path d="M10 12h4"/></svg>',
  logs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>',
  finance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 7h18v12H3z"/><path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z"/><path d="M3 7l3-3h12l3 3"/><circle cx="17" cy="13" r=".5" fill="currentColor"/></svg>',
  grades: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5M16 16l2 2 3-4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3a7 7 0 1 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
};

export const labels = {
  general_manager: "مدير الإدارة العامة",
  school_principal: "مدير المدرسة",
  deputy_principal: "وكيل المدرسة",
  school_secretary: "الاسكرتير",
  educational_supervisor: "المشرف التربوي",
  specialist_supervisor: "المشرف الاخصائي",
  stage_supervisor: "مشرف المرحلة",
  activity_supervisor: "مشرف الأنشطة",
  finance: "المالية",
  computer_unit: "وحدة الحاسوب",
  printing_unit: "وحدة الطباعة",
  tracker: "متعقب",
  high: "عالية", medium: "متوسطة", low: "منخفضة", new: "جديدة", in_progress: "قيد التنفيذ", under_review: "قيد المراجعة", approved: "معتمدة", completed: "مكتملة", overdue: "متأخرة", archived: "مؤرشفة", once: "مرة واحدة", permanent: "دفتر المهام السنوي", daily: "مستمرة",
};

export const reportTypes = ["task", "employee", "department", "delay", "daily_notebook", "discount"];
export const reportTypeLabels = { task: "تقارير المهام", employee: "تقارير الموظفين", department: "تقارير الأقسام", delay: "تقارير التأخير", daily_notebook: "دفتر المهام اليومي", discount: "تقرير التخفيضات" };
export const schoolProfileDefaults = {
  name: "منصة مهام المدارس",
  logoText: "مد",
  footer: "نظام رسمي لإدارة المهام والتقارير المدرسية",
  dailyNotebookCutoffTime: "23:59",
};
export const paginationDefaults = { usersPage: 1, tasksPage: 1, permanentTasksPage: 1, financePage: 1, gradeAdjustmentsPage: 1, reportsPage: 1, logsPage: 1, notificationsPage: 1 };
