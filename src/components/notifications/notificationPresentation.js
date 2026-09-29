const notificationTypeLabels = {
  task_created: "إنشاء مهمة",
  task_updated: "تحديث مهمة",
  task_status: "تحديث الحالة",
  task_deleted: "حذف مهمة",
  task_assigned: "إسناد مهمة",
  task_unassigned: "إلغاء إسناد",
  task_reopened: "إعادة فتح",
  task_archived: "أرشفة مهمة",
  task_approved: "اعتماد مهمة",
  task_comment: "تعليق جديد",
  deadline_reminder: "تذكير",
  overdue_alert: "تأخير",
  notebook_expired: "انتهاء دفتر",
  notebook_renewed: "تجديد دفتر",
  notebook_archived: "أرشفة دفتر",
  notebook_assigned: "إسناد دفتر",
  role_changed: "تغيير الدور",
  access_changed: "تحديث الصلاحية",
  admin_alert: "تنبيه إداري",
  manual: "رسالة إدارية",
  general: "عام",
  daily_notebook_reminder: "تذكير دفتر المهام",
  chat_message: "رسالة دردشة",
  administrative_circular: "تعميم إداري",
  meeting_invite: "دعوة اجتماع",
};

export function notificationTypeLabel(type) {
  return notificationTypeLabels[type] || "تحديث";
}
