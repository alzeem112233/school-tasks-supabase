import { today } from "../utils/dateUtils.js";
import { createUuid } from "../utils/idUtils.js";

const BACKUP_FILE_FORMAT = "school-tasks-database-backup";
const MAX_BACKUP_FILE_SIZE = 20 * 1024 * 1024;

export function createBackupModule(getContext) {
  function normalizeBackup(backup) {
    return {
      id: backup.id,
      schoolId: backup.schoolId || "general",
      label: backup.label || "نسخة احتياطية",
      createdAt: backup.createdAt || backup.createdAtTs || new Date().toISOString(),
      createdBy: backup.createdBy || "",
      scopeType: backup.scopeType || backup.entityCounts?.scopeType || "school",
      entityCounts: {
        ...(backup.entityCounts || {}),
        schools: backup.entityCounts?.schools ?? 1,
        users: backup.entityCounts?.users ?? backup.entityCounts?.profiles ?? 0,
        departments: backup.entityCounts?.departments ?? 0,
        tasks: backup.entityCounts?.tasks ?? 0,
        administrativeReports: backup.entityCounts?.administrativeReports ?? 0,
        financeDiscounts: backup.entityCounts?.financeDiscounts ?? 0,
        attachments: backup.entityCounts?.attachments ?? 0,
        notifications: backup.entityCounts?.notifications ?? 0,
        activityLogs: backup.entityCounts?.activityLogs ?? 0,
        auditLogs: backup.entityCounts?.auditLogs ?? 0,
        storageFiles: backup.entityCounts?.storageFiles ?? 0,
      },
      payload: backup.payload || null,
    };
  }

  function visibleBackups() {
    const { state, scopedSchoolId, compareTimestamp } = getContext();
    const schoolScope = scopedSchoolId();
    return state.backups
      .filter((item) => schoolScope === "all" || item.schoolId === schoolScope)
      .sort((a, b) => compareTimestamp(b.createdAt, a.createdAt));
  }

  function visibleArchivedTasks() {
    const { tasks } = getContext();
    return tasks.visibleTasks().filter((task) => tasks.effectiveStatus(task) === "archived");
  }

  function createBackupPayload(labelOverride = "") {
    const { state, scopedSchoolId, schoolName } = getContext();
    const schoolScope = scopedSchoolId();
    const inScope = (item) => schoolScope === "all" || item.schoolId === schoolScope;
    const users = state.users.filter(inScope);
    const tasks = state.tasks.filter(inScope);
    const administrativeReports = (state.administrativeReports || []).filter(inScope);
    const notifications = state.notifications.filter(inScope);
    const financeDiscounts = state.financeDiscounts.filter(inScope);
    const scopedSchools = state.schools.filter((school) => schoolScope === "all" || school.id === schoolScope);
    const attachmentCount = tasks.reduce((total, task) => total + (task.attachments || []).length, 0);
    return normalizeBackup({
      id: createUuid(),
      schoolId: schoolScope,
      scopeType: schoolScope === "all" ? "site" : "school",
      label: labelOverride || `نسخة احتياطية ${today()} ${schoolScope === "all" ? "جميع المدارس" : schoolName(schoolScope)}`,
      createdAt: new Date().toISOString(),
      createdBy: state.currentUser?.id || "",
      entityCounts: { schools: scopedSchools.length, users: users.length, tasks: tasks.length, administrativeReports: administrativeReports.length, financeDiscounts: financeDiscounts.length, attachments: attachmentCount, notifications: notifications.length },
      payload: {
        schemaVersion: 2,
        scopeType: schoolScope === "all" ? "site" : "school",
        schoolId: schoolScope,
        generatedAt: new Date().toISOString(),
        schools: scopedSchools,
        users,
        tasks,
        administrativeReports,
        financeDiscounts,
        notifications,
        activityLogs: state.activityLogs.filter(inScope),
        auditLogs: state.auditLogs.filter(inScope),
        reportConfig: state.reportConfig,
        schoolProfile: state.schoolProfile,
        activeSchoolId: state.activeSchoolId,
        theme: state.theme,
      },
    });
  }

  function backupFilename(scopeName = "school") {
    const time = new Date().toTimeString().slice(0, 5).replace(":", "");
    return `school-tasks-database-${scopeName}-${today()}-${time}.json`;
  }

  async function requestBackupSaveTarget(filename) {
    if (typeof window.showSaveFilePicker !== "function") return { filename, handle: null };
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "نسخة قاعدة بيانات منصة المهام", accept: { "application/json": [".json"] } }],
        excludeAcceptAllOption: false,
      });
      return { filename, handle };
    } catch (error) {
      if (error?.name === "AbortError") return null;
      throw error;
    }
  }

  function portableBackupDocument(backup) {
    return {
      format: BACKUP_FILE_FORMAT,
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      backup,
    };
  }

  async function writeBackupFile(target, backup) {
    const { downloadBlob } = getContext();
    const content = JSON.stringify(portableBackupDocument(backup), null, 2);
    if (target.handle) {
      const writable = await target.handle.createWritable();
      try {
        await writable.write(new Blob([content], { type: "application/json;charset=utf-8" }));
      } finally {
        await writable.close();
      }
      return "selected";
    }
    downloadBlob(target.filename, content, "application/json;charset=utf-8");
    return "downloads";
  }

  function extractPortableBackup(parsed) {
    if (!parsed || typeof parsed !== "object") throw new Error("ملف النسخة الاحتياطية غير صالح.");
    const backup = parsed.format === BACKUP_FILE_FORMAT ? parsed.backup : parsed.backup || parsed;
    if (!backup || typeof backup !== "object") throw new Error("ملف النسخة الاحتياطية لا يحتوي على بيانات قابلة للاستعادة.");
    const payload = backup.backup_data || backup.backupData || backup.payload;
    if (!payload || typeof payload !== "object") throw new Error("بيانات قاعدة البيانات غير موجودة داخل ملف النسخة.");
    const schemaVersion = Number(payload.schemaVersion || 0);
    if (![1, 2].includes(schemaVersion)) throw new Error("إصدار ملف النسخة الاحتياطية غير مدعوم.");
    const taskRows = payload.tasks;
    const userRows = payload.profiles || payload.users;
    if (!Array.isArray(taskRows) || !Array.isArray(userRows)) throw new Error("ملف النسخة الاحتياطية ناقص ولا يحتوي على المستخدمين والمهام.");
    return { backup, payload };
  }

  async function createBackup() {
    const { cloud, state, persistLocal, showToast, supabase, audit, canCreateBackups, render } = getContext();
    if (state.backupBusy) return;
    const backup = cloud.enabled
      ? normalizeBackup({ id: "", schoolId: getContext().scopedSchoolId(), createdBy: state.currentUser?.id || "" })
      : createBackupPayload();
    const includeAll = backup.schoolId === "all";
    if (!canCreateBackups(includeAll ? null : backup)) {
      showToast("لا توجد صلاحية لإنشاء نسخة احتياطية لهذا النطاق.");
      return;
    }
    const scopeName = includeAll ? "full-site" : backup.schoolId;
    let saveTarget;
    try {
      saveTarget = await requestBackupSaveTarget(backupFilename(scopeName));
    } catch (error) {
      console.error(error);
      showToast("تعذر فتح نافذة اختيار مكان حفظ النسخة.");
      return;
    }
    if (!saveTarget) return;
    state.backupBusy = true;
    render();
    try {
      if (cloud.enabled) {
        const result = await supabase.callFunction("createBackup", {
          schoolId: backup.schoolId,
          includeAll,
          settings: {
            reportConfig: state.reportConfig,
            schoolProfile: state.schoolProfile,
            activeSchoolId: state.activeSchoolId,
            theme: state.theme,
          },
        });
        const exported = await supabase.callFunction("exportBackup", { backupId: result.backupId });
        const saveMode = await writeBackupFile(saveTarget, exported.backup);
        await supabase.refreshCloudData(false);
        const warningText = result?.storageWarnings ? ` مع ${result.storageWarnings} ملف تعذر نسخه داخل التخزين السحابي` : "";
        const locationText = saveMode === "selected" ? "في المسار الذي حددته" : "في مجلد التنزيلات";
        showToast(`تم إنشاء نسخة قاعدة البيانات وحفظها ${locationText}${warningText}.`);
        return;
      }
      state.backups = [backup, ...state.backups].slice(0, 50);
      persistLocal();
      await writeBackupFile(saveTarget, backup);
      await audit.recordActivity("backup_created", "تم إنشاء نسخة احتياطية", backup.label, backup.schoolId);
      await audit.recordAudit("backup_created", "backup", backup.id, `تم إنشاء نسخة احتياطية للمدرسة ${backup.schoolId}.`, "medium", backup.schoolId);
      showToast("تم إنشاء نسخة قاعدة البيانات وحفظها على الجهاز.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر إنشاء نسخة قاعدة البيانات.");
    } finally {
      state.backupBusy = false;
      render();
    }
  }

  async function executeCloudRestore(backupId) {
    const { state, supabase, schoolProfileDefaults, applyTheme, persistLocal } = getContext();
    const currentUserId = state.currentUser?.id || "";
    let listenersStopped = false;
    try {
      await supabase.stopCloudListeners();
      listenersStopped = true;
      const result = await supabase.callFunction("restoreBackup", { backupId });
      const settings = result?.appSettings || {};
      if (settings.reportConfig) state.reportConfig = { ...state.reportConfig, ...settings.reportConfig };
      if (settings.schoolProfile) state.schoolProfile = { ...schoolProfileDefaults, ...settings.schoolProfile };
      if (settings.activeSchoolId) state.activeSchoolId = settings.activeSchoolId;
      if (settings.theme) state.theme = settings.theme;
      applyTheme();
      persistLocal();
      if (currentUserId) await supabase.loadProfile(currentUserId);
      listenersStopped = false;
      return result;
    } catch (error) {
      if (listenersStopped && state.currentUser) {
        supabase.startScopedListeners(state.currentUser).catch((listenerError) => console.error("Backup listener restart failed", listenerError));
      }
      throw error;
    }
  }

  async function applyLocalBackup(backup) {
    const { state, persistLocal, applyTheme, users, tasks, finance, notifications, audit, administrativeReports, schoolProfileDefaults } = getContext();
    const payload = backup.payload;
    if (!payload || !Array.isArray(payload.users)) throw new Error("هذه النسخة تتطلب الاتصال بقاعدة البيانات لاستعادتها.");
    state.users = payload.users.map(users.normalizeUser);
    state.tasks = tasks.generateRecurringInstances((payload.tasks || []).map(tasks.normalizeTask));
    state.administrativeReports = (payload.administrativeReports || []).map(administrativeReports.normalizeReport);
    state.financeDiscounts = (payload.financeDiscounts || []).map(finance.normalizeDiscount);
    state.notifications = (payload.notifications || []).map(notifications.normalizeNotification);
    state.activityLogs = (payload.activityLogs || []).map(audit.normalizeActivityLog);
    state.auditLogs = (payload.auditLogs || []).map(audit.normalizeAuditLog);
    state.reportConfig = { ...state.reportConfig, ...(payload.reportConfig || {}) };
    state.schoolProfile = { ...schoolProfileDefaults, ...(payload.schoolProfile || {}) };
    state.activeSchoolId = payload.activeSchoolId || state.activeSchoolId;
    state.theme = payload.theme || state.theme;
    applyTheme();
    persistLocal();
  }

  async function restoreBackup(backupId) {
    const { state, cloud, render, showToast, audit, canRestoreBackup } = getContext();
    const backup = state.backups.find((item) => item.id === backupId);
    if (!backup) return showToast("النسخة الاحتياطية غير موجودة.");
    if (!canRestoreBackup(backup)) return showToast("لا توجد صلاحية لاستعادة هذه النسخة الاحتياطية.");
    const scopeText = backup.scopeType === "site" ? "جميع بيانات الموقع وكل الفروع" : "بيانات هذا الفرع";
    if (!confirm(`هل تريد استعادة "${backup.label}"؟\n\nسيتم استبدال ${scopeText} بالمحتويات المحفوظة في هذه النسخة. لا تغلق الصفحة أثناء الاستعادة.`)) return;
    if (state.backupBusy) return;
    state.backupBusy = true;
    render();
    try {
      if (cloud.enabled) {
        const result = await executeCloudRestore(backupId);
        const warningCount = (result?.authWarnings?.length || 0) + (result?.storageWarnings?.length || 0);
        showToast(`تمت استعادة قاعدة البيانات وتفعيل محتوياتها${warningCount ? ` مع ${warningCount} تنبيه` : ""}.`);
        return;
      }
      await applyLocalBackup(backup);
      await audit.recordActivity("backup_restored", "تمت استعادة نسخة احتياطية", backup.label, backup.schoolId);
      await audit.recordAudit("backup_restored", "backup", backup.id, `تمت استعادة نسخة احتياطية للمدرسة ${backup.schoolId}.`, "high", backup.schoolId);
      showToast("تمت استعادة النسخة الاحتياطية وكل محتوياتها.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر استعادة النسخة الاحتياطية.");
    } finally {
      state.backupBusy = false;
      render();
    }
  }

  async function restoreLatestBackup() {
    const latest = visibleBackups()[0];
    if (!latest) return getContext().showToast("لا توجد نسخة احتياطية متاحة للاستعادة.");
    await restoreBackup(latest.id);
  }

  function openBackupFilePicker() {
    const { state } = getContext();
    if (state.backupBusy) return;
    const input = document.getElementById("backup-restore-file");
    if (input) input.click();
  }

  async function restoreBackupFile(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (input) input.value = "";
    if (!file) return;
    const { state, cloud, showToast, canCreateBackups, supabase, render } = getContext();
    if (!canCreateBackups()) return showToast("لا توجد صلاحية لاستعادة نسخة من ملف.");
    if (file.size > MAX_BACKUP_FILE_SIZE) return showToast("حجم ملف النسخة أكبر من 20 ميجابايت.");
    let imported;
    try {
      imported = extractPortableBackup(JSON.parse(await file.text()));
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر قراءة ملف النسخة الاحتياطية.");
      return;
    }
    const rawBackup = imported.backup;
    const label = rawBackup.backup_name || rawBackup.label || file.name;
    const scopeType = imported.payload.scopeType || rawBackup.scopeType || rawBackup.entity_counts?.scopeType || "school";
    const scopeText = scopeType === "site" ? "جميع بيانات الموقع وكل الفروع" : "بيانات الفرع المحفوظة";
    if (!confirm(`هل تريد استعادة ملف "${label}"؟\n\nسيتم التحقق من الملف ثم استبدال ${scopeText}. لا تغلق الصفحة أثناء الاستعادة.`)) return;
    if (state.backupBusy) return;
    state.backupBusy = true;
    render();
    try {
      if (cloud.enabled) {
        const importedResult = await supabase.callFunction("importBackup", { backup: rawBackup });
        const result = await executeCloudRestore(importedResult.backupId);
        const warningCount = (result?.authWarnings?.length || 0) + (result?.storageWarnings?.length || 0);
        showToast(`تمت استعادة ملف قاعدة البيانات وتفعيل محتوياته${warningCount ? ` مع ${warningCount} تنبيه` : ""}.`);
        return;
      }
      const localBackup = normalizeBackup({
        ...rawBackup,
        payload: imported.payload,
        scopeType,
        schoolId: rawBackup.schoolId || imported.payload.schoolId,
      });
      await applyLocalBackup(localBackup);
      showToast("تمت استعادة ملف النسخة الاحتياطية وتفعيل محتوياته.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر استعادة ملف النسخة الاحتياطية.");
    } finally {
      state.backupBusy = false;
      render();
    }
  }

  async function exportBackup(backupId = "") {
    const { cloud, showToast, canCreateBackups, supabase } = getContext();
    const backup = visibleBackups().find((item) => item.id === backupId) || visibleBackups()[0];
    if (!backup) return showToast("لا توجد نسخة احتياطية متاحة للحفظ.");
    if (!canCreateBackups(backup.scopeType === "site" ? null : backup)) return showToast("لا توجد صلاحية لحفظ هذه النسخة.");
    let saveTarget;
    try {
      const scopeName = backup.scopeType === "site" ? "full-site" : backup.schoolId;
      saveTarget = await requestBackupSaveTarget(backupFilename(scopeName));
    } catch (error) {
      console.error(error);
      showToast("تعذر فتح نافذة اختيار مكان حفظ النسخة.");
      return;
    }
    if (!saveTarget) return;
    try {
      if (cloud.enabled) {
        const result = await supabase.callFunction("exportBackup", { backupId: backup.id });
        const saveMode = await writeBackupFile(saveTarget, result.backup);
        showToast(saveMode === "selected" ? "تم حفظ نسخة قاعدة البيانات في المسار المحدد." : "تم حفظ نسخة قاعدة البيانات في مجلد التنزيلات.");
        return;
      }
      await writeBackupFile(saveTarget, backup);
      showToast("تم حفظ ملف نسخة قاعدة البيانات.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر حفظ نسخة قاعدة البيانات.");
    }
  }

  return {
    normalizeBackup,
    visibleBackups,
    visibleArchivedTasks,
    createBackup,
    restoreBackup,
    restoreLatestBackup,
    openBackupFilePicker,
    restoreBackupFile,
    exportBackup,
  };
}
