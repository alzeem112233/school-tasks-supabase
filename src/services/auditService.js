import { today } from "../utils/dateUtils.js";
import { createUuid } from "../utils/idUtils.js";

export function createAuditService(getContext) {
  const activityLabels = {
    activity: "نشاط",
    login: "تسجيل دخول",
    user_created: "إنشاء مستخدم",
    user_updated: "تحديث مستخدم",
    user_deleted: "حذف مستخدم",
    task_created: "إنشاء مهمة",
    task_updated: "تحديث مهمة",
    task_deleted: "حذف مهمة",
    task_assigned: "إسناد مهمة",
    task_completed: "إكمال مهمة",
    attachment_uploaded: "رفع مرفق",
    attachment_deleted: "حذف مرفق",
    task_status: "تحديث حالة مهمة",
    task_approved: "اعتماد مهمة",
    report_exported: "تصدير تقرير",
    backup_created: "إنشاء نسخة احتياطية",
    backup_restored: "استعادة نسخة احتياطية",
    finance_discount_created: "إنشاء طلب تخفيض",
    finance_discount_updated: "تعديل طلب تخفيض",
    finance_discount_received: "استلام طلب تخفيض",
    finance_discount_completed: "إكمال طلب تخفيض",
  };

  const auditLabels = {
    audit_event: "حدث تدقيقي",
    login: "تسجيل دخول",
    user_created: "إنشاء مستخدم",
    user_updated: "تحديث مستخدم",
    user_deleted: "حذف مستخدم",
    user_role_changed: "تغيير دور مستخدم",
    user_school_changed: "نقل المستخدم بين المدارس",
    user_access_changed: "تغيير حالة الوصول",
    task_created: "إنشاء مهمة",
    task_updated: "تحديث مهمة",
    task_deleted: "حذف مهمة",
    task_assigned: "إسناد مهمة",
    task_completed: "إكمال مهمة",
    attachment_uploaded: "رفع مرفق",
    attachment_deleted: "حذف مرفق",
    backup_created: "إنشاء نسخة احتياطية",
    backup_restored: "استعادة نسخة احتياطية",
    report_exported: "تصدير تقرير",
  };

  function activityTypeLabel(type) {
    return activityLabels[type] || "نشاط";
  }

  function auditActionLabel(action) {
    return auditLabels[action] || "إجراء تدقيقي";
  }

  function auditTargetTypeLabel(type) {
    return { system: "النظام", session: "جلسة", user: "مستخدم", profile: "مستخدم", task: "مهمة", attachment: "مرفق", backup: "نسخة احتياطية", report: "تقرير" }[type] || "عنصر";
  }

  function severityLabel(severity) {
    return { low: "منخفضة", medium: "متوسطة", high: "مرتفعة", critical: "حرجة" }[severity] || "متوسطة";
  }

  function normalizeActivityLog(log) {
    return {
      id: log.id,
      schoolId: log.schoolId || "general",
      userId: log.userId || "",
      type: log.type || "activity",
      title: log.title || "نشاط",
      description: log.description || "",
      createdAt: log.createdAt || log.createdAtTs || new Date().toISOString(),
    };
  }

  function normalizeAuditLog(log) {
    return {
      id: log.id,
      schoolId: log.schoolId || "general",
      actorId: log.actorId || "",
      action: log.action || "audit_event",
      targetType: log.targetType || "system",
      targetId: log.targetId || "",
      severity: log.severity || "low",
      createdAt: log.createdAt || log.createdAtTs || new Date().toISOString(),
      details: log.details || "",
    };
  }

  function visibleActivityLogs() {
    const { state, scopedSchoolId, getUser, compareTimestamp } = getContext();
    const schoolScope = scopedSchoolId();
    return state.activityLogs
      .filter((item) => schoolScope === "all" || item.schoolId === schoolScope)
      .filter((item) => !state.search.trim() || [item.title, item.description, item.type, getUser(item.userId)?.name || "", item.schoolId].join(" ").toLowerCase().includes(state.search.trim().toLowerCase()))
      .sort((a, b) => compareTimestamp(b.createdAt, a.createdAt));
  }

  function visibleAuditLogs() {
    const { state, scopedSchoolId, getUser, compareTimestamp, canViewAuditLogs } = getContext();
    if (!canViewAuditLogs()) return [];
    const schoolScope = scopedSchoolId();
    return state.auditLogs
      .filter((item) => schoolScope === "all" || item.schoolId === schoolScope)
      .filter((item) => !state.search.trim() || [item.action, item.details, item.targetType, item.targetId, getUser(item.actorId)?.name || "", item.schoolId].join(" ").toLowerCase().includes(state.search.trim().toLowerCase()))
      .sort((a, b) => compareTimestamp(b.createdAt, a.createdAt));
  }

  async function recordActivity(type, title, description, schoolId = getContext().state.currentUser?.schoolId || "general", userId = getContext().state.currentUser?.id || "") {
    const { cloud, state, persistLocal, supabase } = getContext();
    const entry = normalizeActivityLog({ id: createUuid(), schoolId, userId, type, title, description, createdAt: today() });
    if (cloud.enabled) {
      try {
        await supabase.callFunction("writeLogEntry", { kind: "activity", schoolId, type, title, description });
        return true;
      } catch (error) {
        console.warn("تعذر تحديث سجل النشاط دون التأثير على العملية الأساسية.", error);
        return false;
      }
    }
    state.activityLogs = [entry, ...state.activityLogs].slice(0, 500);
    persistLocal();
    return true;
  }

  async function recordAudit(action, targetType, targetId, details, severity = "low", schoolId = getContext().state.currentUser?.schoolId || "general", actorId = getContext().state.currentUser?.id || "") {
    const { cloud, state, persistLocal, supabase } = getContext();
    const entry = normalizeAuditLog({ id: createUuid(), schoolId, actorId, action, targetType, targetId, severity, createdAt: today(), details });
    if (cloud.enabled) {
      try {
        await supabase.callFunction("writeLogEntry", { kind: "audit", schoolId, action, targetType, targetId, severity, details });
        return true;
      } catch (error) {
        console.warn("تعذر تحديث سجل التدقيق دون التأثير على العملية الأساسية.", error);
        return false;
      }
    }
    state.auditLogs = [entry, ...state.auditLogs].slice(0, 500);
    persistLocal();
    return true;
  }

  return {
    activityTypeLabel,
    auditActionLabel,
    auditTargetTypeLabel,
    severityLabel,
    normalizeActivityLog,
    normalizeAuditLog,
    visibleActivityLogs,
    visibleAuditLogs,
    recordActivity,
    recordAudit,
  };
}
