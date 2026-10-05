import { formatArabicDate, nowTimestamp, today } from "../utils/dateUtils.js";
import { createUuid } from "../utils/idUtils.js";
import { isGeneralManager, normalizeRole } from "../utils/permissionUtils.js";

const STORAGE_KEY = "schoolTasksExamSchedulesLocalV1";
const SETTINGS_KEY = "schoolTasksExamScheduleSettingsLocalV1";
const LOGS_KEY = "schoolTasksExamScheduleLogsLocalV1";
const SUBJECT_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#0891b2", "#d97706", "#059669", "#be185d", "#475569"];
const defaultSubjects = ["لغة عربية", "رياضيات", "قرآن كريم", "علوم", "لغة إنجليزية", "اجتماعيات", "فيزياء", "كيمياء", "أحياء"];
const centralExamRoles = ["superadmin", "general_manager", "branch_manager", "development_supervision_manager", "general_secretary"];
const examAccessRoles = [...centralExamRoles, "school_principal", "deputy_principal", "educational_supervisor", "computer_unit", "printing_unit"];
const examScheduleManagerRoles = [...centralExamRoles, "school_principal", "deputy_principal", "educational_supervisor", "printing_unit"];
const examScheduleFinalEditorRoles = ["superadmin", "general_manager", "branch_manager", "school_principal"];
const examReportRoles = [...centralExamRoles, "school_principal", "deputy_principal"];
const trackingSteps = [
  { key: "gradeReceived", label: "استلام كشف الدرجات", role: "deputy_principal", color: "#0f766e" },
  { key: "gradesEntered", label: "إدخال كشف الدرجات", role: "computer_unit", color: "#2563eb" },
  { key: "printReceived", label: "استلام الاختبار", role: "printing_unit", color: "#d97706" },
  { key: "printCompleted", label: "انتهاء الطباعة", role: "printing_unit", color: "#7c3aed" },
];

const defaultStages = [];

function isPrintingUnitUser(user) {
  const role = normalizeRole(user?.role, "");
  const label = [user?.name, user?.position, user?.jobTitle, user?.roleLabel, user?.departmentName, user?.department]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return role === "printing_unit" || label.includes("وحدة الطباعة") || label.includes("الطباعة") || label.includes("printing");
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function safeText(value) {
  return String(value || "").trim();
}

function uniqueList(values) {
  return [...new Set((values || []).map(safeText).filter(Boolean))];
}

function cloneDefaultStages() {
  return JSON.parse(JSON.stringify(defaultStages));
}

function cloneStages(stages = []) {
  return JSON.parse(JSON.stringify(stages || []));
}

function hijriDateLabel(dateValue) {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${dateValue || today()}T12:00:00`));
  } catch {
    return "";
  }
}

function dayRange(start, end) {
  const dates = [];
  const startDate = new Date(`${start || today()}T12:00:00`);
  const endDate = new Date(`${end || start || today()}T12:00:00`);
  const cursor = Number.isNaN(startDate.getTime()) ? new Date(`${today()}T12:00:00`) : startDate;
  const last = Number.isNaN(endDate.getTime()) ? cursor : endDate;
  while (cursor.getTime() <= last.getTime()) {
    const day = cursor.getDay();
    if (day !== 4 && day !== 5) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function workingDates(start, count, removedDates = []) {
  const dates = [];
  const removed = new Set((removedDates || []).map(safeText).filter(Boolean));
  const cursor = new Date(`${start || today()}T12:00:00`);
  if (Number.isNaN(cursor.getTime())) return workingDates(today(), count, removedDates);
  while (dates.length < Math.max(1, Number(count || 1))) {
    const day = cursor.getDay();
    const value = cursor.toISOString().slice(0, 10);
    if (day !== 4 && day !== 5 && !removed.has(value)) dates.push(value);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function normalizeSettings(settings = {}) {
  const stages = Array.isArray(settings.stages) ? settings.stages : cloneDefaultStages();
  const subjectsFromStages = stages.flatMap((stage) => (stage.grades || []).flatMap((grade) => grade.subjects || []));
  return {
    maxDailyExams: Number(settings.maxDailyExams || 1),
    roomsEnabled: settings.roomsEnabled !== false,
    proctorsEnabled: settings.proctorsEnabled !== false,
    printNotes: safeText(settings.printNotes || "يرجى الحضور قبل موعد الاختبار بوقت كاف."),
    subjectsCatalog: uniqueList(settings.subjectsCatalog || subjectsFromStages || defaultSubjects),
    stages,
  };
}

function stageRowsFromSettings(settings = {}, schoolId = "", user = null) {
  return normalizeSettings(settings).stages.flatMap((stage, stageIndex) =>
    (stage.grades || []).map((grade, gradeIndex) => ({
      id: grade.cloudId || grade.id || createUuid(),
      school_id: schoolId,
      stage_id: stage.id || `stage-${stageIndex + 1}`,
      stage_name: stage.name || "مرحلة عامة",
      grade_id: grade.id || `grade-${stageIndex + 1}-${gradeIndex + 1}`,
      grade_name: grade.name || "صف",
      sections: grade.sections || [],
      subjects: grade.subjects || [],
      required_count: Number(grade.requiredCount || 1),
      visible: grade.visible !== false,
      sort_order: (stageIndex * 100) + gradeIndex,
      created_by: grade.createdBy || user?.id || null,
      updated_by: user?.id || null,
    })),
  );
}

function settingsFromStageRows(rows = [], fallback = {}) {
  const stageMap = new Map();
  (rows || []).forEach((row) => {
    const stageId = row.stage_id || row.stage_name || "stage-general";
    const stage = stageMap.get(stageId) || { id: stageId, name: row.stage_name || "مرحلة عامة", grades: [] };
    stage.grades.push({
      id: row.grade_id || row.id,
      cloudId: row.id,
      name: row.grade_name || "صف",
      sections: Array.isArray(row.sections) ? row.sections : [],
      subjects: Array.isArray(row.subjects) ? row.subjects : [],
      requiredCount: Number(row.required_count || 1),
      visible: row.visible !== false,
    });
    stageMap.set(stageId, stage);
  });
  const stages = [...stageMap.values()].map((stage) => ({
    ...stage,
    grades: stage.grades.sort((a, b) => String(a.name).localeCompare(String(b.name), "ar")),
  }));
  return normalizeSettings({
    ...fallback,
    stages,
  });
}

function filterStagesByGradeIds(stages = [], gradeIds = []) {
  const selected = new Set(gradeIds || []);
  if (!selected.size) return cloneStages(stages);
  return cloneStages(stages)
    .map((stage) => ({
      ...stage,
      grades: (stage.grades || []).filter((grade) => selected.has(grade.id)),
    }))
    .filter((stage) => stage.grades.length);
}

function normalizePeriod(period = {}, currentUser = null) {
  const startDate = period.startDate || today();
  const approvals = period.approvals || {};
  return {
    id: period.id || createUuid(),
    name: safeText(period.name || "جدول اختبارات جديد"),
    schoolId: period.schoolId || currentUser?.schoolId || "",
    academicYear: safeText(period.academicYear || "1448هـ"),
    term: safeText(period.term || "الفصل الدراسي"),
    type: ["monthly", "midterm", "final", "custom"].includes(period.type) ? period.type : "monthly",
    startDate,
    endDate: period.endDate || startDate,
    extraDays: Math.max(0, Number(period.extraDays || 0)),
    removedDates: Array.isArray(period.removedDates) ? period.removedDates.map(safeText).filter(Boolean) : splitList(period.removedDates),
    hijriLabel: safeText(period.hijriLabel || `${hijriDateLabel(startDate)} - ${hijriDateLabel(period.endDate || startDate)}`),
    status: ["draft", "review", "approval", "approved", "published", "archived"].includes(period.status) ? period.status : "draft",
    approvals: {
      deputy: approvals.deputy || null,
      principal: approvals.principal || null,
    },
    notes: safeText(period.notes || ""),
    preparedBy: period.preparedBy || currentUser?.id || "",
    createdBy: period.createdBy || currentUser?.id || "",
    createdByName: safeText(period.createdByName || currentUser?.name || ""),
    updatedBy: period.updatedBy || currentUser?.id || "",
    updatedByName: safeText(period.updatedByName || currentUser?.name || ""),
    createdAt: period.createdAt || nowTimestamp(),
    updatedAt: period.updatedAt || nowTimestamp(),
    stages: Array.isArray(period.stages) ? period.stages : cloneDefaultStages(),
    slots: Array.isArray(period.slots) ? period.slots.map(normalizeSlot) : [],
    tracking: period.tracking && typeof period.tracking === "object" ? period.tracking : {},
  };
}

function normalizeSlot(slot = {}) {
  return {
    id: slot.id || createUuid(),
    gradeId: slot.gradeId || "",
    subject: safeText(slot.subject || ""),
    subjectOrder: Number(slot.subjectOrder || 0),
    syllabus: safeText(slot.syllabus || ""),
    sections: Array.isArray(slot.sections) ? slot.sections.map(safeText).filter(Boolean) : [],
    date: slot.date || today(),
    startTime: slot.startTime || "",
    endTime: slot.endTime || "",
    room: safeText(slot.room || ""),
    proctors: Array.isArray(slot.proctors) ? slot.proctors.map(safeText).filter(Boolean) : splitList(slot.proctors),
    notes: safeText(slot.notes || ""),
    color: SUBJECT_COLORS.includes(slot.color) ? slot.color : SUBJECT_COLORS[0],
    approvalStatus: ["draft", "approved"].includes(slot.approvalStatus) ? slot.approvalStatus : "approved",
    createdBy: slot.createdBy || "",
    createdByName: safeText(slot.createdByName || ""),
    updatedBy: slot.updatedBy || "",
    updatedByName: safeText(slot.updatedByName || ""),
    createdAt: slot.createdAt || nowTimestamp(),
    updatedAt: slot.updatedAt || nowTimestamp(),
  };
}

function splitList(value) {
  return safeText(value).split(/[\n،,؛;]+/u).map((item) => item.trim()).filter(Boolean);
}

export function createExamScheduleModule(getContext) {
  let cloudLoadKey = "";

  function schoolScopeId() {
    const { state } = getContext();
    if (isGeneralManager(state.currentUser)) return state.activeSchoolId || "all";
    return state.currentUser?.schoolId || "";
  }

  function periodFromCloud(row = {}) {
    const settings = row.settings || {};
    return normalizePeriod({
      id: row.id,
      schoolId: row.school_id,
      name: row.name,
      academicYear: row.academic_year,
      term: row.term,
      type: row.exam_type,
      startDate: row.start_date,
      endDate: row.end_date,
      monthLabel: row.month_label,
      targetGrades: row.target_grades,
      version: row.version,
      extraDays: settings.extraDays,
      removedDates: settings.removedDates,
      hijriLabel: row.hijri_label,
      status: row.status,
      notes: row.notes,
      preparedBy: row.prepared_by,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdByName: settings.createdByName,
      updatedByName: settings.updatedByName,
      stages: settings.stages,
      slots: settings.slots,
      tracking: settings.tracking,
      approvals: settings.approvals,
    }, getContext().state.currentUser);
  }

  function periodToCloud(period) {
    return {
      id: period.id,
      school_id: period.schoolId,
      name: period.name,
      academic_year: period.academicYear,
      term: period.term,
      exam_type: period.type,
      start_date: period.startDate,
      end_date: period.endDate,
      hijri_label: period.hijriLabel || "",
      status: period.status,
      notes: period.notes || "",
      prepared_by: period.preparedBy || null,
      created_by: period.createdBy || null,
      updated_by: period.updatedBy || null,
      created_at: period.createdAt,
      updated_at: period.updatedAt,
      settings: {
        stages: period.stages || [],
        slots: period.slots || [],
        tracking: period.tracking || {},
        approvals: period.approvals || {},
        extraDays: period.extraDays || 0,
        removedDates: period.removedDates || [],
        createdByName: period.createdByName || "",
        updatedByName: period.updatedByName || "",
      },
      month_label: period.monthLabel || "",
      target_grades: period.targetGrades || [],
      version: Number(period.version || 1),
      review_requested_by: period.reviewRequestedBy || null,
      review_requested_at: period.reviewRequestedAt || null,
      approved_by: period.approvals?.principal?.by || period.approvedBy || null,
      approved_at: period.approvals?.principal?.at || period.approvedAt || null,
      published_by: period.publishedBy || null,
      published_at: period.publishedAt || null,
      locked_at: period.status === "approved" || period.status === "published" ? period.lockedAt || period.updatedAt || null : null,
      rejection_note: period.rejectionNote || "",
    };
  }

  async function loadCloudData(force = false) {
    const { state, cloud, render } = getContext();
    if (!cloud.enabled || !cloud.client || !state.currentUser || !canViewExamSchedules()) return;
    const key = `${state.currentUser.id}:${schoolScopeId()}`;
    if (!force && cloudLoadKey === key) return;
    cloudLoadKey = key;
    let query = cloud.client.from("exam_periods").select("*").order("start_date", { ascending: false });
    const scope = schoolScopeId();
    if (scope && scope !== "all") query = query.eq("school_id", scope);
    const { data, error } = await query;
    if (error) {
      console.warn("Exam schedules cloud tables are not ready", error);
      return;
    }
    const byId = new Map((state.examSchedulePeriods || []).map((period) => [period.id, period]));
    (data || []).map(periodFromCloud).forEach((period) => byId.set(period.id, period));
    state.examSchedulePeriods = [...byId.values()].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
    await loadSettingsCloud(scope);
    const { data: logs } = await cloud.client.from("exam_schedule_logs").select("*").order("created_at", { ascending: false }).limit(120);
    if (Array.isArray(logs)) {
      state.examScheduleLogs = logs.map((log) => ({
        id: log.id,
        action: log.action,
        title: log.title,
        details: log.details,
        periodId: log.period_id,
        schoolId: log.school_id,
        actorId: log.actor_id,
        actorName: log.actor_name,
        actorRole: log.actor_role,
        createdAt: log.created_at,
      }));
    }
    persist();
    render();
  }

  async function loadSettingsCloud(scope = schoolScopeId()) {
    const { state, cloud } = getContext();
    if (!cloud.enabled || !cloud.client || !state.currentUser || !canViewExamSchedules()) return;
    const schoolId = scope && scope !== "all" ? scope : state.currentUser?.schoolId;
    if (!schoolId) return;
    const { data, error } = await cloud.client
      .from("exam_grade_settings")
      .select("*")
      .eq("school_id", schoolId)
      .order("sort_order", { ascending: true });
    if (error) {
      console.warn("Exam settings cloud load failed", error);
      return;
    }
    if (Array.isArray(data) && data.length) {
      state.examScheduleSettings = settingsFromStageRows(data, state.examScheduleSettings || {});
    }
  }

  async function savePeriodCloud(period) {
    const { cloud, showToast } = getContext();
    if (!cloud.enabled || !cloud.client) return;
    let row = periodToCloud(period);
    let { error } = await cloud.client.from("exam_periods").upsert(row);
    if (error && String(error.message || "").toLowerCase().includes("schema cache")) {
      const {
        month_label,
        target_grades,
        version,
        review_requested_by,
        review_requested_at,
        approved_by,
        approved_at,
        published_by,
        published_at,
        locked_at,
        rejection_note,
        ...legacyRow
      } = row;
      ({ error } = await cloud.client.from("exam_periods").upsert(legacyRow));
    }
    if (error) {
      console.warn("Exam period cloud save failed", error);
      showToast?.("تم الحفظ في الجهاز، لكن جداول الاختبارات غير جاهزة في قاعدة البيانات.");
    }
  }

  async function saveSettingsCloud(settings) {
    const { state, cloud, showToast } = getContext();
    if (!cloud.enabled || !cloud.client) return;
    const schoolId = isGeneralManager(state.currentUser) && state.activeSchoolId !== "all" ? state.activeSchoolId : state.currentUser?.schoolId;
    if (!schoolId) return;
    const rows = stageRowsFromSettings(settings, schoolId, state.currentUser);
    const { error: deleteError } = await cloud.client.from("exam_grade_settings").delete().eq("school_id", schoolId);
    if (deleteError) {
      console.warn("Exam settings cloud clear failed", deleteError);
      showToast?.("تم حفظ الإعدادات في الجهاز، لكن تعذر تحديثها في قاعدة البيانات.");
      return;
    }
    if (!rows.length) return;
    const { error } = await cloud.client.from("exam_grade_settings").upsert(rows);
    if (error) {
      console.warn("Exam settings cloud save failed", error);
      showToast?.("تم حفظ الإعدادات في الجهاز، لكن تعذر تحديثها في قاعدة البيانات.");
    }
  }

  async function saveLogCloud(log) {
    const { cloud } = getContext();
    if (!cloud.enabled || !cloud.client || !log?.id) return;
    const { error } = await cloud.client.from("exam_schedule_logs").insert({
      id: log.id,
      school_id: log.schoolId,
      period_id: log.periodId || null,
      action: log.action,
      title: log.title,
      details: log.details || "",
      actor_id: log.actorId || null,
      actor_name: log.actorName || "",
      actor_role: log.actorRole || "",
      created_at: log.createdAt,
    });
    if (error) console.warn("Exam schedule log cloud save failed", error);
  }

  async function deletePeriodCloud(periodId) {
    const { cloud } = getContext();
    if (!cloud.enabled || !cloud.client || !periodId) return;
    const { error } = await cloud.client.from("exam_periods").delete().eq("id", periodId);
    if (error) throw error;
  }

  function canViewExamSchedules(user = getContext().state.currentUser) {
    const role = normalizeRole(user?.role, "");
    return !!user && user.active !== false && (examAccessRoles.includes(role) || isPrintingUnitUser(user));
  }

  function canManageExamSchedules(user = getContext().state.currentUser) {
    const role = normalizeRole(user?.role, "");
    if (!user || user.active === false) return false;
    return examScheduleManagerRoles.includes(role) || isPrintingUnitUser(user);
  }

  function canEditFinalExamSchedule(user = getContext().state.currentUser) {
    const role = normalizeRole(user?.role, "");
    return !!user && user.active !== false && examScheduleFinalEditorRoles.includes(role);
  }

  function canDeleteExamPeriod(period, user = getContext().state.currentUser) {
    const role = normalizeRole(user?.role, "");
    if (!period || !user || user.active === false) return false;
    if (isGeneralManager(user)) return true;
    return role === "school_principal" && period.schoolId === user.schoolId;
  }

  function isExamScheduleLocked(period) {
    return !!period && (period.status === "approved" || !!period.approvals?.principal);
  }

  function canEditExamPeriod(period, user = getContext().state.currentUser) {
    if (!canManageExamSchedules(user)) return false;
    return !isExamScheduleLocked(period) || canEditFinalExamSchedule(user);
  }

  function guardExamPeriodEdit(period, message = "تم اعتماد الجدول، ولا يمكن تعديله إلا من مدير المدرسة أو مدير الإدارة العامة.") {
    const { showToast } = getContext();
    if (canEditExamPeriod(period)) return true;
    showToast?.(message);
    return false;
  }

  function canApproveExamSchedules(user = getContext().state.currentUser) {
    const role = normalizeRole(user?.role, "");
    return !!user && user.active !== false && [...centralExamRoles, "school_principal", "deputy_principal"].includes(role);
  }

  function canApproveExamPeriodKind(kind, user = getContext().state.currentUser, period = currentPeriod()) {
    const role = normalizeRole(user?.role, "");
    if (!canApproveExamSchedules(user)) return false;
    if (isExamScheduleLocked(period) && !canEditFinalExamSchedule(user)) return false;
    if (kind === "deputy") return ["deputy_principal", "school_principal", ...centralExamRoles].includes(role);
    if (kind === "principal") return ["school_principal", ...centralExamRoles].includes(role);
    return false;
  }

  function canViewExamReports(user = getContext().state.currentUser) {
    const role = normalizeRole(user?.role, "");
    return !!user && user.active !== false && examReportRoles.includes(role);
  }

  function canActOnTracking(step, user = getContext().state.currentUser) {
    const role = normalizeRole(user?.role, "");
    return !!user && user.active !== false && (role === step.role || ["school_principal", ...centralExamRoles].includes(role));
  }

  function schoolScoped(period) {
    const { state } = getContext();
    if (isGeneralManager(state.currentUser)) {
      return state.activeSchoolId === "all" || !state.activeSchoolId || period.schoolId === state.activeSchoolId;
    }
    return period.schoolId === state.currentUser?.schoolId;
  }

  function load() {
    const { state } = getContext();
    state.examScheduleSettings = normalizeSettings(readJson(SETTINGS_KEY, {}));
    state.examSchedulePeriods = readJson(STORAGE_KEY, []).map((period) => normalizePeriod(period, state.currentUser));
    state.examScheduleLogs = readJson(LOGS_KEY, []);
  }

  function persist() {
    const { state } = getContext();
    writeJson(STORAGE_KEY, state.examSchedulePeriods || []);
    writeJson(SETTINGS_KEY, state.examScheduleSettings || normalizeSettings());
    writeJson(LOGS_KEY, state.examScheduleLogs || []);
  }

  function recordLog(action, title, periodId = currentPeriod()?.id || "", details = "") {
    const { state } = getContext();
    const user = state.currentUser || {};
    const period = (state.examSchedulePeriods || []).find((item) => item.id === periodId);
    const entry = {
      id: createUuid(),
      action,
      title: safeText(title),
      details: safeText(details),
      periodId,
      periodName: period?.name || "",
      schoolId: period?.schoolId || user.schoolId || "",
      actorId: user.id || "",
      actorName: user.name || "مستخدم غير محدد",
      actorRole: user.role || "",
      createdAt: nowTimestamp(),
    };
    state.examScheduleLogs = [entry, ...(state.examScheduleLogs || [])].slice(0, 120);
    return entry;
  }

  function recordDetachedLog(action, title, period, details = "") {
    const { state } = getContext();
    const user = state.currentUser || {};
    const entry = {
      id: createUuid(),
      action,
      title: safeText(title),
      details: safeText(details || period?.name || ""),
      periodId: "",
      periodName: period?.name || "",
      schoolId: period?.schoolId || user.schoolId || "",
      actorId: user.id || "",
      actorName: user.name || "مستخدم غير محدد",
      actorRole: user.role || "",
      createdAt: nowTimestamp(),
    };
    state.examScheduleLogs = [entry, ...(state.examScheduleLogs || [])].slice(0, 120);
    return entry;
  }

  function visibleLogs(periodId = currentPeriod()?.id || "") {
    const { state } = getContext();
    return (state.examScheduleLogs || [])
      .filter((log) => schoolScoped(log))
      .filter((log) => !periodId || log.periodId === periodId)
      .slice(0, 12);
  }

  function visiblePeriods() {
    const { state } = getContext();
    const filters = state.examScheduleFilters || {};
    const search = safeText(filters.search).toLocaleLowerCase("ar");
    return (state.examSchedulePeriods || [])
      .filter(schoolScoped)
      .filter((period) => !filters.status || filters.status === "all" || period.status === filters.status)
      .filter((period) => !search || [period.name, period.academicYear, period.term, period.notes].join(" ").toLocaleLowerCase("ar").includes(search))
      .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  }

  function currentPeriod() {
    const { state } = getContext();
    const list = visiblePeriods();
    const selected = list.find((period) => period.id === state.examScheduleFilters?.periodId);
    return selected || list[0] || null;
  }

  function allGrades(period = currentPeriod()) {
    return (period?.stages || []).flatMap((stage) =>
      (stage.grades || []).filter((grade) => grade.visible !== false).map((grade) => ({ ...grade, stageId: stage.id, stageName: stage.name })),
    );
  }

  function gradeById(period, gradeId) {
    return allGrades(period).find((grade) => grade.id === gradeId);
  }

  function requirementRows(period = currentPeriod()) {
    return allGrades(period).flatMap((grade) =>
      (grade.sections || []).flatMap((section) =>
        (grade.subjects || []).map((subject) => ({
          stageName: grade.stageName,
          gradeId: grade.id,
          gradeName: grade.name,
          section,
          subject,
          required: Number(grade.requiredCount || 1),
          scheduled: (period?.slots || []).filter((slot) => slot.gradeId === grade.id && slot.subject === subject && slot.sections.includes(section)).length,
        })),
      ),
    );
  }

  function trackingKey(slotId, section) {
    return `${slotId}::${safeText(section)}`;
  }

  function trackingItems(period = currentPeriod()) {
    return (period?.slots || []).flatMap((slot) => {
      const grade = gradeById(period, slot.gradeId) || {};
      return (slot.sections || []).map((section) => ({
        key: trackingKey(slot.id, section),
        slot,
        grade,
        section,
        state: period.tracking?.[trackingKey(slot.id, section)] || {},
      }));
    }).sort((a, b) => String(a.slot.date).localeCompare(String(b.slot.date)) || Number(a.slot.subjectOrder || 0) - Number(b.slot.subjectOrder || 0));
  }

  function trackingStats(period = currentPeriod()) {
    const items = trackingItems(period);
    const total = items.length;
    const counts = Object.fromEntries(trackingSteps.map((step) => [step.key, items.filter((item) => item.state?.[step.key]?.done).length]));
    return {
      total,
      counts,
      percent(stepKey) {
        return total ? Math.round(((counts[stepKey] || 0) / total) * 100) : 0;
      },
    };
  }

  function completion(period = currentPeriod()) {
    const rows = requirementRows(period);
    const required = rows.reduce((sum, row) => sum + row.required, 0);
    const scheduled = rows.reduce((sum, row) => sum + Math.min(row.required, row.scheduled), 0);
    const missing = rows.filter((row) => row.scheduled < row.required);
    const completedSectionKeys = new Set(rows.filter((row) => row.scheduled >= row.required).map((row) => `${row.gradeId}.${row.section}.${row.subject}`));
    return {
      required,
      scheduled,
      remaining: Math.max(0, required - scheduled),
      percent: required ? Math.round((scheduled / required) * 100) : 0,
      missing,
      completedRows: completedSectionKeys.size,
      missingRows: missing.length,
    };
  }

  function requiredExamDays(period = currentPeriod()) {
    const grades = allGrades(period);
    const subjectsDays = Math.max(0, ...grades.map((grade) => (grade.subjects || []).length));
    return Math.max(1, subjectsDays) + Number(period?.extraDays || 0);
  }

  function periodDates(period) {
    return workingDates(period?.startDate, requiredExamDays(period), period?.removedDates || []);
  }

  function dateForSubjectOrder(period, order) {
    const dates = periodDates(period);
    const index = Math.max(0, Number(order || 1) - 1);
    return dates[index] || period?.startDate || today();
  }

  function firstExamTime(period) {
    const slot = [...(period?.slots || [])]
      .filter((item) => item.startTime || item.endTime)
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || Number(a.subjectOrder || 0) - Number(b.subjectOrder || 0))[0];
    return { startTime: slot?.startTime || "", endTime: slot?.endTime || "" };
  }

  function subjectOrderOptions(grade, selectedSubject = "", selectedOrder = 0) {
    const { safe } = getContext();
    const subjects = grade?.subjects || [];
    return subjects.map((subject, index) => {
      const order = index + 1;
      const selected = Number(selectedOrder) === order || (!selectedOrder && selectedSubject === subject);
      return `<option value="${order}" data-subject="${safe(subject)}" ${selected ? "selected" : ""}>${safe(order)} - ${safe(subject)}</option>`;
    }).join("");
  }

  function hasTimeOverlap(left, right) {
    if (!left.startTime || !left.endTime || !right.startTime || !right.endTime) return left.date === right.date;
    return left.startTime < right.endTime && right.startTime < left.endTime;
  }

  function findConflicts(period, slot) {
    const conflicts = [];
    const slots = (period.slots || []).filter((item) => item.id !== slot.id);
    if (slot.date < period.startDate || slot.date > period.endDate) conflicts.push("تاريخ الاختبار خارج فترة الجدول.");
    slot.sections.forEach((section) => {
      const sectionSameDay = slots.filter((item) => item.gradeId === slot.gradeId && item.sections.includes(section) && item.date === slot.date);
      if (sectionSameDay.length >= 1) conflicts.push(`الشعبة ${section} لديها اختبار آخر في نفس اليوم.`);
      if (sectionSameDay.some((item) => hasTimeOverlap(item, slot))) conflicts.push(`يوجد تعارض وقت للشعبة ${section}.`);
      if (slots.some((item) => item.gradeId === slot.gradeId && item.subject === slot.subject && item.sections.includes(section))) {
        conflicts.push(`المادة ${slot.subject} مضافة سابقًا للشعبة ${section}.`);
      }
    });
    if (slot.room && slots.some((item) => item.date === slot.date && item.room === slot.room && hasTimeOverlap(item, slot))) conflicts.push(`القاعة ${slot.room} مستخدمة في نفس الوقت.`);
    slot.proctors.forEach((name) => {
      if (slots.some((item) => item.date === slot.date && item.proctors.includes(name) && hasTimeOverlap(item, slot))) conflicts.push(`المراقب ${name} لديه اختبار آخر في نفس الوقت.`);
    });
    return [...new Set(conflicts)];
  }

  function statusLabel(status) {
    return { draft: "مسودة", review: "بانتظار المراجعة", approval: "بانتظار الاعتماد", approved: "معتمد", published: "منشور", archived: "مؤرشف" }[status] || "مسودة";
  }

  function typeLabel(type) {
    return { monthly: "شهري", midterm: "نصف فصل", final: "نهائي", custom: "مخصص" }[type] || "شهري";
  }

  function setFilter(key, value) {
    const { state, render } = getContext();
    state.examScheduleFilters = { ...(state.examScheduleFilters || {}), [key]: value };
    render();
  }

  function resetFilters() {
    const { state, render } = getContext();
    state.examScheduleFilters = { search: "", status: "all", periodId: "" };
    render();
  }

  function openPeriodModal(id = "") {
    const { state, render, showToast } = getContext();
    if (!canManageExamSchedules()) return;
    const existing = id ? (state.examSchedulePeriods || []).find((period) => period.id === id) : null;
    if (existing && !guardExamPeriodEdit(existing)) return;
    state.modal = { type: "exam_period", id };
    render();
  }

  function openSlotModal(date = "", gradeId = "", id = "") {
    const { state, render, showToast } = getContext();
    if (!canManageExamSchedules()) return;
    const period = currentPeriod();
    if (!period) {
      showToast("أنشئ فترة اختبار أولًا.");
      return;
    }
    if (!guardExamPeriodEdit(period)) return;
    state.modal = { type: "exam_slot", periodId: period.id, date: date || period.startDate, gradeId, id };
    render();
  }

  function openStudentCardsModal() {
    const { state, render } = getContext();
    if (!currentPeriod()) return;
    state.modal = { type: "exam_student_cards" };
    render();
  }

  function openSettingsModal() {
    const { state, render } = getContext();
    if (!canManageExamSchedules()) return;
    state.examScheduleSettings = normalizeSettings(state.examScheduleSettings || {});
    state.modal = { type: "exam_settings" };
    render();
  }

  function sectionEditor(sections = []) {
    const { safe } = getContext();
    const cleanSections = uniqueList(sections.length ? sections : ["أ"]);
    return `<div class="field exam-sections-editor">
      <span>الشعب</span>
      <input type="hidden" name="sections" value="${safe(cleanSections.join("، "))}" required />
      <div class="exam-section-chip-list" data-section-list>
        ${cleanSections.map((section) => `<span class="exam-section-chip" data-section-value="${safe(section)}">${safe(section)} <button type="button" onclick="actions.removeExamSectionSetting(this)">×</button></span>`).join("")}
      </div>
      <div class="exam-add-section-line">
        <input type="text" data-new-section placeholder="مثال: ج" />
        <button class="btn secondary" type="button" onclick="actions.addExamSectionSetting(this)">إضافة شعبة</button>
      </div>
    </div>`;
  }

  function addGradeSettingRow(button) {
    const { safe } = getContext();
    const body = button?.closest("form")?.querySelector("[data-exam-grade-settings]");
    const subjects = normalizeSettings(getContext().state.examScheduleSettings || {}).subjectsCatalog.join("، ");
    if (!body) return;
    body.querySelector(".exam-settings-empty")?.remove();
    const row = document.createElement("article");
    row.className = "exam-grade-setting-row";
    row.innerHTML = `
      <label class="field"><span>المرحلة</span><input name="stageName" value="مرحلة جديدة" required /></label>
      <label class="field"><span>الصف</span><input name="gradeName" value="صف جديد" required /></label>
      ${sectionEditor(["أ", "ب"])}
      <label class="field wide"><span>مواد الصف</span><input name="gradeSubjects" value="${safe(subjects)}" required /></label>
      <button class="btn secondary danger-icon exam-delete-grade-btn" type="button" onclick="actions.removeExamGradeSettingRow(this)">حذف الصف</button>
    `;
    body.append(row);
    row.querySelector("input")?.focus();
  }

  function removeGradeSettingRow(button) {
    const row = button?.closest(".exam-grade-setting-row");
    if (row) row.remove();
  }

  function clearGradeSettingRows(button) {
    const body = button?.closest("form")?.querySelector("[data-exam-grade-settings]");
    if (!body) return;
    if (body.children.length && !confirm("هل تريد حذف كل الفصول والشعب من الإعدادات؟")) return;
    body.innerHTML = "";
  }

  function syncSectionInput(row) {
    const hidden = row?.querySelector('input[name="sections"]');
    if (!hidden) return;
    const sections = [...row.querySelectorAll("[data-section-value]")].map((item) => item.dataset.sectionValue).filter(Boolean);
    hidden.value = sections.join("، ");
  }

  function addSectionSetting(button) {
    const row = button?.closest(".exam-grade-setting-row");
    const input = row?.querySelector("[data-new-section]");
    const list = row?.querySelector("[data-section-list]");
    const value = safeText(input?.value);
    if (!row || !list || !value) return;
    const exists = [...list.querySelectorAll("[data-section-value]")].some((item) => item.dataset.sectionValue === value);
    if (!exists) {
      const chip = document.createElement("span");
      chip.className = "exam-section-chip";
      chip.dataset.sectionValue = value;
      chip.innerHTML = `${getContext().safe(value)} <button type="button" onclick="actions.removeExamSectionSetting(this)">×</button>`;
      list.append(chip);
      syncSectionInput(row);
    }
    input.value = "";
    input.focus();
  }

  function removeSectionSetting(button) {
    const row = button?.closest(".exam-grade-setting-row");
    button?.closest("[data-section-value]")?.remove();
    syncSectionInput(row);
  }

  async function saveSettings(event) {
    event.preventDefault();
    const { state, showToast, render } = getContext();
    if (!canManageExamSchedules()) return;
    const form = new FormData(event.currentTarget);
    const subjectCatalog = uniqueList(splitList(form.get("subjectsCatalog")));
    const stageNames = form.getAll("stageName");
    const gradeNames = form.getAll("gradeName");
    const sectionsValues = form.getAll("sections");
    const gradeSubjectsValues = form.getAll("gradeSubjects");
    const stageMap = new Map();
    gradeNames.forEach((gradeNameRaw, index) => {
      const stageName = safeText(stageNames[index] || "مرحلة عامة");
      const gradeName = safeText(gradeNameRaw);
      if (!gradeName) return;
      const stageId = `stage-${stageName.replace(/\s+/g, "-")}`;
      const stage = stageMap.get(stageName) || { id: stageId, name: stageName, grades: [] };
      const gradeSubjects = uniqueList(splitList(gradeSubjectsValues[index])).filter((subject) => !subjectCatalog.length || subjectCatalog.includes(subject));
      stage.grades.push({
        id: `grade-${stage.grades.length + 1}-${gradeName.replace(/\s+/g, "-")}`,
        name: gradeName,
        sections: uniqueList(splitList(sectionsValues[index])),
        subjects: gradeSubjects.length ? gradeSubjects : subjectCatalog.slice(0, 4),
        requiredCount: 1,
        visible: true,
      });
      stageMap.set(stageName, stage);
    });
    const stages = [...stageMap.values()].filter((stage) => stage.grades.length);
    if (!subjectCatalog.length) {
      showToast("أدخل قائمة المواد أولًا.");
      return;
    }
    state.examScheduleSettings = normalizeSettings({
      ...state.examScheduleSettings,
      subjectsCatalog: subjectCatalog,
      stages,
      printNotes: form.get("printNotes"),
    });
    state.modal = null;
    recordLog("settings_updated", "تحديث إعداد الصفوف والشعب والمواد", "", "تم حفظ الإعدادات السنوية");
    persist();
    await saveSettingsCloud(state.examScheduleSettings);
    showToast("تم حفظ إعداد الصفوف والشعب والمواد.");
    render();
  }

  function savePeriod(event) {
    event.preventDefault();
    const { state, showToast, render } = getContext();
    if (!canManageExamSchedules()) return;
    const form = new FormData(event.currentTarget);
    const id = safeText(form.get("id")) || createUuid();
    const existing = (state.examSchedulePeriods || []).find((period) => period.id === id);
    if (existing && !guardExamPeriodEdit(existing)) return;
    const selectedGradeIds = form.getAll("gradeIds").map(safeText).filter(Boolean);
    const annualStages = normalizeSettings(state.examScheduleSettings || {}).stages;
    const periodStages = existing?.stages || filterStagesByGradeIds(annualStages, selectedGradeIds);
    if (!periodStages.some((stage) => (stage.grades || []).length)) {
      showToast("حدد فصلًا واحدًا على الأقل لهذا الجدول.");
      return;
    }
    const period = normalizePeriod({
      ...existing,
      id,
      name: form.get("name"),
      schoolId: form.get("schoolId"),
      academicYear: form.get("academicYear"),
      term: form.get("term"),
      type: form.get("type"),
      startDate: form.get("startDate"),
      endDate: form.get("startDate"),
      extraDays: form.get("extraDays"),
      removedDates: form.get("removedDates"),
      hijriLabel: "",
      status: existing?.status || "draft",
      notes: form.get("notes"),
      stages: periodStages,
      slots: existing?.slots || [],
      tracking: existing?.tracking || {},
      approvals: existing?.approvals || {},
      updatedAt: nowTimestamp(),
      updatedBy: state.currentUser?.id,
      updatedByName: state.currentUser?.name,
      createdBy: existing?.createdBy || state.currentUser?.id,
      createdByName: existing?.createdByName || state.currentUser?.name,
    }, state.currentUser);
    if (period.endDate < period.startDate) {
      showToast("تاريخ نهاية الفترة يجب أن يكون بعد البداية.");
      return;
    }
    const dates = periodDates(period);
    period.endDate = dates.at(-1) || period.startDate;
    period.hijriLabel = `${hijriDateLabel(period.startDate)} - ${hijriDateLabel(period.endDate)}`;
    period.slots = (period.slots || []).map((slot) => normalizeSlot({
      ...slot,
      date: slot.subjectOrder ? dateForSubjectOrder(period, slot.subjectOrder) : slot.date,
    }));
    state.examSchedulePeriods = existing
      ? state.examSchedulePeriods.map((item) => item.id === id ? period : item)
      : [period, ...(state.examSchedulePeriods || [])];
    state.examScheduleFilters = { ...(state.examScheduleFilters || {}), periodId: id };
    state.modal = null;
    const log = recordLog(existing ? "period_updated" : "period_created", existing ? "تعديل فترة اختبار" : "إنشاء فترة اختبار", id, period.name);
    persist();
    savePeriodCloud(period).then(() => saveLogCloud(log));
    showToast(existing ? "تم تحديث فترة الاختبارات." : "تم إنشاء فترة الاختبارات.");
    render();
  }

  function saveSlot(event) {
    event.preventDefault();
    const { state, showToast, render } = getContext();
    if (!canManageExamSchedules()) return;
    const form = new FormData(event.currentTarget);
    const period = currentPeriod();
    if (!period) return;
    if (!guardExamPeriodEdit(period)) return;
    const id = safeText(form.get("id")) || createUuid();
    const existing = (period.slots || []).find((item) => item.id === id);
    const grade = gradeById(period, form.get("gradeId")) || {};
    const subjectOrder = Number(form.get("subjectOrder") || 0);
    const subjectFromOrder = grade.subjects?.[subjectOrder - 1] || form.get("subject");
    const slot = normalizeSlot({
      ...existing,
      id,
      gradeId: form.get("gradeId"),
      subject: subjectFromOrder,
      subjectOrder,
      syllabus: form.get("syllabus"),
      sections: form.getAll("sections"),
      date: dateForSubjectOrder(period, subjectOrder),
      startTime: form.get("startTime"),
      endTime: form.get("endTime"),
      room: form.get("room"),
      proctors: form.get("proctors"),
      notes: form.get("notes"),
      color: form.get("color"),
      approvalStatus: "approved",
      createdBy: existing?.createdBy || state.currentUser?.id,
      createdByName: existing?.createdByName || state.currentUser?.name,
      updatedBy: state.currentUser?.id,
      updatedByName: state.currentUser?.name,
      updatedAt: nowTimestamp(),
    });
    if (!slot.gradeId || !slot.subject || !slot.sections.length) {
      showToast("حدد الصف والمادة وشعبة واحدة على الأقل.");
      return;
    }
    const conflicts = findConflicts(period, slot);
    if (conflicts.length) {
      showToast(conflicts[0]);
      return;
    }
    const slots = period.slots || [];
    period.slots = slots.some((item) => item.id === id) ? slots.map((item) => item.id === id ? slot : item) : [...slots, slot];
    period.updatedAt = nowTimestamp();
    period.updatedBy = state.currentUser?.id;
    period.updatedByName = state.currentUser?.name;
    state.examSchedulePeriods = state.examSchedulePeriods.map((item) => item.id === period.id ? period : item);
    state.modal = null;
    const log = recordLog(existing ? "slot_updated" : "slot_created", existing ? "تعديل موعد اختبار" : "إضافة موعد اختبار", period.id, `${slot.subject} - ${slot.sections.join("، ")}`);
    persist();
    savePeriodCloud(period).then(() => saveLogCloud(log));
    showToast("تم حفظ موعد الاختبار.");
    render();
  }

  function deleteSlot(id) {
    const { state, showToast, render } = getContext();
    const period = currentPeriod();
    if (!period || !canManageExamSchedules() || !guardExamPeriodEdit(period) || !confirm("هل تريد حذف موعد الاختبار؟")) return;
    const deleted = (period.slots || []).find((slot) => slot.id === id);
    period.slots = (period.slots || []).filter((slot) => slot.id !== id);
    Object.keys(period.tracking || {}).forEach((key) => {
      if (key.startsWith(`${id}::`)) delete period.tracking[key];
    });
    period.updatedAt = nowTimestamp();
    period.updatedBy = state.currentUser?.id;
    period.updatedByName = state.currentUser?.name;
    state.examSchedulePeriods = state.examSchedulePeriods.map((item) => item.id === period.id ? period : item);
    const log = recordLog("slot_deleted", "حذف موعد اختبار", period.id, deleted ? `${deleted.subject} - ${deleted.sections.join("، ")}` : "");
    persist();
    savePeriodCloud(period).then(() => saveLogCloud(log));
    showToast("تم حذف الموعد.");
    render();
  }

  function updatePeriodStatus(status) {
    const { state, showToast, render } = getContext();
    const period = currentPeriod();
    if (!period || !canManageExamSchedules() || !guardExamPeriodEdit(period)) return;
    period.status = status;
    period.updatedAt = nowTimestamp();
    period.updatedBy = state.currentUser?.id;
    period.updatedByName = state.currentUser?.name;
    state.examSchedulePeriods = state.examSchedulePeriods.map((item) => item.id === period.id ? period : item);
    const log = recordLog("period_status_updated", "تغيير حالة جدول الاختبارات", period.id, statusLabel(status));
    persist();
    savePeriodCloud(period).then(() => saveLogCloud(log));
    showToast(`تم تغيير حالة الجدول إلى ${statusLabel(status)}.`);
    render();
  }

  function addBulkSubjectSchedule(event) {
    event.preventDefault();
    const { state, showToast, render } = getContext();
    const period = currentPeriod();
    if (!period || !canManageExamSchedules() || !guardExamPeriodEdit(period)) return;
    const form = new FormData(event.currentTarget);
    const gradeIds = form.getAll("gradeIds").map(safeText).filter(Boolean);
    const subject = safeText(form.get("subject"));
    const order = Math.max(1, Number(form.get("subjectOrder") || 1));
    const defaultTime = firstExamTime(period);
    const startTime = safeText(form.get("startTime")) || defaultTime.startTime;
    const endTime = safeText(form.get("endTime")) || defaultTime.endTime;
    if (!gradeIds.length || !subject) {
      showToast("حدد فصلًا واحدًا على الأقل واختر المادة.");
      return;
    }
    let savedCount = 0;
    let skippedCount = 0;
    gradeIds.forEach((gradeId) => {
      const grade = gradeById(period, gradeId);
      if (!grade || !(grade.subjects || []).includes(subject)) {
        skippedCount += 1;
        return;
      }
      const existing = (period.slots || []).find((slot) => slot.gradeId === gradeId && slot.subject === subject);
      const slot = normalizeSlot({
        ...existing,
        id: existing?.id || createUuid(),
        gradeId,
        subject,
        subjectOrder: order,
        syllabus: existing?.syllabus || "",
        sections: grade.sections || [],
        date: dateForSubjectOrder(period, order),
        startTime,
        endTime,
        color: existing?.color || SUBJECT_COLORS[(order - 1) % SUBJECT_COLORS.length],
        approvalStatus: "approved",
        createdBy: existing?.createdBy || state.currentUser?.id,
        createdByName: existing?.createdByName || state.currentUser?.name,
        updatedBy: state.currentUser?.id,
        updatedByName: state.currentUser?.name,
        updatedAt: nowTimestamp(),
      });
      period.slots = existing ? (period.slots || []).map((item) => item.id === existing.id ? slot : item) : [...(period.slots || []), slot];
      savedCount += 1;
    });
    period.updatedAt = nowTimestamp();
    period.updatedBy = state.currentUser?.id;
    period.updatedByName = state.currentUser?.name;
    state.examSchedulePeriods = state.examSchedulePeriods.map((item) => item.id === period.id ? period : item);
    const log = recordLog("subject_order_updated", "ترتيب مادة في جدول الاختبارات", period.id, `${subject} - رقم ${order} - ${savedCount} فصل`);
    persist();
    savePeriodCloud(period).then(() => saveLogCloud(log));
    showToast(skippedCount ? `تمت إضافة ${savedCount} فصل، وتجاوز ${skippedCount} لأن المادة غير موجودة فيها.` : "تم ترتيب المادة وإضافتها للفصول المحددة.");
    render();
  }

  function approveExamPeriod(kind) {
    const { state, showToast, render } = getContext();
    const period = currentPeriod();
    const role = normalizeRole(state.currentUser?.role, "");
    if (!period || !canApproveExamPeriodKind(kind, state.currentUser, period)) return;
    if (kind === "deputy" && !["deputy_principal", "school_principal", ...centralExamRoles].includes(role)) return;
    if (kind === "principal" && !["school_principal", ...centralExamRoles].includes(role)) return;
    period.approvals ||= {};
    period.approvals[kind] = {
      by: state.currentUser?.id || "",
      name: state.currentUser?.name || "",
      at: nowTimestamp(),
    };
    period.status = period.approvals.principal ? "approved" : "approval";
    period.updatedAt = nowTimestamp();
    period.updatedBy = state.currentUser?.id;
    period.updatedByName = state.currentUser?.name;
    state.examSchedulePeriods = state.examSchedulePeriods.map((item) => item.id === period.id ? period : item);
    const log = recordLog(`${kind}_approved`, kind === "deputy" ? "اعتماد الوكيل لجدول الاختبارات" : "اعتماد المدير لجدول الاختبارات", period.id, period.name);
    persist();
    savePeriodCloud(period).then(() => saveLogCloud(log));
    showToast(kind === "deputy" ? "تم اعتماد الجدول من الوكيل." : "تم اعتماد الجدول من المدير.");
    render();
  }

  function toggleExamTracking(slotId, section, stepKey) {
    const { state, showToast, render } = getContext();
    const period = currentPeriod();
    const step = trackingSteps.find((item) => item.key === stepKey);
    if (!period || !step || !canActOnTracking(step)) return;
    const slot = (period.slots || []).find((item) => item.id === slotId);
    if (!slot) return;
    const key = trackingKey(slotId, section);
    period.tracking ||= {};
    const row = { ...(period.tracking[key] || {}) };
    const current = row[stepKey]?.done;
    row[stepKey] = current
      ? null
      : { done: true, by: state.currentUser?.id || "", name: state.currentUser?.name || "", at: nowTimestamp(), role: state.currentUser?.role || "" };
    Object.keys(row).forEach((rowKey) => {
      if (!row[rowKey]) delete row[rowKey];
    });
    period.tracking[key] = row;
    period.updatedAt = nowTimestamp();
    state.examSchedulePeriods = state.examSchedulePeriods.map((item) => item.id === period.id ? period : item);
    const log = recordLog("tracking_updated", step.label, period.id, `${slot.subject} - شعبة ${section}`);
    persist();
    savePeriodCloud(period).then(() => saveLogCloud(log));
    showToast(current ? "تم إلغاء التحديد." : "تم تسجيل العملية.");
    render();
  }

  function renderExamSchedules() {
    const { safe, icons, state, schools, schoolName } = getContext();
    if (!canViewExamSchedules()) return `<section class="empty-state"><h2>لا تملك صلاحية عرض جداول الاختبارات.</h2></section>`;
    state.examScheduleFilters ||= { search: "", status: "all", periodId: "" };
    state.examScheduleSettings ||= normalizeSettings();
    const periods = visiblePeriods();
    const selectedPeriodId = state.examScheduleFilters?.periodId || "";
    const period = selectedPeriodId ? periods.find((item) => item.id === selectedPeriodId) || null : null;
    const stats = period ? completion(period) : { required: 0, scheduled: 0, remaining: 0, percent: 0, missing: [], completedRows: 0, missingRows: 0 };
    const grades = period ? allGrades(period) : [];
    const dates = period ? periodDates(period) : [];
    const canManage = canManageExamSchedules();
    const canEditPeriod = period ? canEditExamPeriod(period) : canManage;
    const tracking = trackingStats(period);
    const titleMetric = period ? `${safe(stats.percent)}%` : `${safe(periods.length)} جدول`;
    loadCloudData().catch((error) => console.warn("Exam schedule cloud load failed", error));
    return `
      <section class="exam-page">
        <div class="exam-hero">
          <div class="exam-mobile-titlebar">
            <strong>جداول الاختبارات</strong>
            <span>${titleMetric}</span>
          </div>
          <div>
            <span>وحدة جداول الاختبارات</span>
            <h2>جداول الاختبارات</h2>
            <p>إعداد جدول الاختبارات، متابعة النواقص، اكتشاف التعارضات، والطباعة من مكان واحد.</p>
          </div>
          <div class="exam-hero-actions">
            ${canManage ? `<button class="btn secondary" type="button" onclick="actions.openExamSettings()">إعداد الصفوف والمواد</button>` : ""}
            ${canManage ? `<button class="btn exam-primary" type="button" onclick="actions.openExamPeriod()">${icons.plus} فترة جديدة</button>` : ""}
            ${period ? `<button class="btn secondary" type="button" onclick="actions.openExamPrintOptions()">${icons.reports} طباعة الجدول</button>` : ""}
            ${period && canViewExamReports() ? `<button class="btn secondary" type="button" onclick="actions.printExamTrackingReport()">${icons.reports} تقرير المتابعة</button>` : ""}
          </div>
        </div>

        <div class="exam-toolbar">
          <label><span>الجدول</span><select onchange="actions.setExamScheduleFilter('periodId', this.value)">
            <option value="" ${!period ? "selected" : ""}>قائمة الجداول</option>
            ${periods.map((item) => `<option value="${safe(item.id)}" ${period?.id === item.id ? "selected" : ""}>${safe(item.name)} - ${safe(schoolName(item.schoolId))}</option>`).join("")}
          </select></label>
          <label><span>بحث سريع</span><input value="${safe(state.examScheduleFilters.search || "")}" placeholder="اسم الجدول أو الفترة" oninput="actions.setExamScheduleFilter('search', this.value)" /></label>
          <label><span>الحالة</span><select onchange="actions.setExamScheduleFilter('status', this.value)">
            <option value="all">كل الحالات</option>
            ${["draft", "review", "approval", "approved", "published", "archived"].map((status) => `<option value="${status}" ${state.examScheduleFilters.status === status ? "selected" : ""}>${safe(statusLabel(status))}</option>`).join("")}
          </select></label>
          <button class="btn secondary" type="button" onclick="actions.resetExamScheduleFilters()">مسح الفلاتر</button>
        </div>

        ${!period && periods.length ? renderPeriodDirectory(periods) : ""}
        ${period ? `
          <div class="exam-period-strip">
            <div><strong>${safe(period.name)}</strong><span>${safe(typeLabel(period.type))} - ${safe(period.academicYear)} - ${safe(period.term)}${period.updatedByName ? ` - آخر تعديل: ${safe(period.updatedByName)}` : ""}</span></div>
            <div><strong>${safe(formatArabicDate(period.startDate))}</strong><span>إلى ${safe(formatArabicDate(period.endDate))} - ${safe(period.hijriLabel || "")}</span></div>
            <span class="exam-status exam-status-${safe(period.status)}">${safe(statusLabel(period.status))}</span>
            <button class="btn secondary exam-back-to-list" type="button" onclick="actions.setExamScheduleFilter('periodId', '')">رجوع للقائمة</button>
            ${canDeleteExamPeriod(period) ? `<button class="btn danger exam-delete-period" type="button" onclick="actions.deleteExamPeriod('${safe(period.id)}')">${icons.trash} حذف الجدول</button>` : ""}
          </div>
        ${renderCompletion(stats)}
        ${renderApprovalPanel(period)}
        ${grades.length ? `
          ${canEditPeriod ? renderBulkSubjectScheduler(period) : `<section class="exam-panel exam-lock-note"><strong>تم اعتماد الجدول</strong><span>التعديل مقفل الآن، ولا يفتح إلا لمدير المدرسة أو مدير الإدارة العامة.</span></section>`}
          ${renderMobileSchedule(period, dates, grades)}
          ${renderDesktopSchedule(period, dates, grades)}
          ${renderTrackingWorkspace(period)}
          ${canViewExamReports() ? renderTrackingReports(period, tracking) : ""}
          ${renderMissingReport(period, stats)}
          ${renderCharts(period, stats)}
        ` : `<section class="exam-empty exam-no-grades">
          <h3>لا توجد فصول في هذا الجدول</h3>
          <p>افتح إعدادات الصفوف والمواد وأضف الفصول والشعب، ثم أنشئ فترة جديدة أو عدل هذه الفترة.</p>
          ${canManage ? `<button class="btn exam-primary" type="button" onclick="actions.openExamSettings()">إضافة الفصول والشعب</button>` : ""}
        </section>`}
        ${renderActivityLog(period)}
        ${renderExports(period)}
        ${renderExamFooter()}
        ` : !periods.length ? `
          <section class="exam-empty">
            <h3>لا توجد فترة اختبارات بعد</h3>
            <p>ابدأ بإنشاء فترة اختبار، ثم أضف المواعيد حسب الصفوف والشعب.</p>
            ${canManage ? `<button class="btn exam-primary" type="button" onclick="actions.openExamPeriod()">${icons.plus} إنشاء أول فترة</button>` : ""}
          </section>
        ` : ""}
      </section>
    `;
  }

  function renderPeriodDirectory(periods) {
    const { safe } = getContext();
    return `<section class="exam-panel exam-period-directory">
      <div class="exam-section-head">
        <div>
          <h3>أسماء جداول الاختبارات</h3>
          <p>اختر الشهر أو اسم الجدول لفتح التفاصيل الخاصة به.</p>
        </div>
      </div>
      <div class="exam-period-grid">
        ${periods.map((item) => {
          const displayName = safeText(item.term || item.name || "جدول اختبارات");
          const subtitle = safeText(item.name || "") && safeText(item.name) !== displayName ? safeText(item.name) : "";
          return `<button class="exam-period-card exam-period-name-card" type="button" onclick="actions.setExamScheduleFilter('periodId', '${safe(item.id)}')">
            <strong>${safe(displayName)}</strong>
            ${subtitle ? `<small>${safe(subtitle)}</small>` : ""}
            <b>فتح الجدول</b>
          </button>`;
        }).join("")}
      </div>
    </section>`;
  }

  function renderApprovalPanel(period) {
    const { safe, icons } = getContext();
    const deputy = period.approvals?.deputy;
    const principal = period.approvals?.principal;
    const locked = isExamScheduleLocked(period);
    return `<section class="exam-panel exam-approval-panel">
      <div class="exam-section-head"><div><h3>اعتماد جدول الاختبارات</h3><p>يتم اعتماد الجدول من الوكيل ثم المدير.</p></div></div>
      <div class="exam-approval-grid">
        <article class="${deputy ? "done" : ""}"><span>اعتماد الوكيل</span><strong>${safe(deputy?.name || "بانتظار الاعتماد")}</strong><small>${safe(deputy?.at ? formatArabicDate(deputy.at.slice(0, 10)) : "")}</small>${canApproveExamPeriodKind("deputy", undefined, period) ? `<button class="btn secondary" type="button" onclick="actions.approveExamPeriod('deputy')">${icons.check} اعتماد الوكيل</button>` : ""}</article>
        <article class="${principal ? "done" : ""}"><span>اعتماد المدير</span><strong>${safe(principal?.name || "بانتظار الاعتماد")}</strong><small>${safe(principal?.at ? formatArabicDate(principal.at.slice(0, 10)) : "")}</small>${canApproveExamPeriodKind("principal", undefined, period) ? `<button class="btn secondary" type="button" onclick="actions.approveExamPeriod('principal')">${icons.check} اعتماد المدير</button>` : ""}</article>
      </div>
      ${locked ? `<div class="exam-lock-note inline"><strong>الجدول معتمد ومقفل</strong><span>آخر تعديل: ${safe(period.updatedByName || principal?.name || deputy?.name || "غير محدد")}</span></div>` : ""}
    </section>`;
  }

  function renderBulkSubjectScheduler(period) {
    const { safe, icons } = getContext();
    const grades = allGrades(period);
    const subjects = uniqueList(grades.flatMap((grade) => grade.subjects || []));
    const defaultTime = firstExamTime(period);
    const maxOrder = Math.max(1, requiredExamDays(period));
    const usedOrders = new Set((period.slots || []).map((slot) => Number(slot.subjectOrder || 0)).filter(Boolean));
    const nextOrder = Array.from({ length: maxOrder }, (_, index) => index + 1).find((order) => !usedOrders.has(order)) || Math.min(maxOrder + 1, usedOrders.size + 1);
    const quickRows = Array.from((period.slots || []).reduce((map, slot) => {
      const key = [slot.subjectOrder || 0, slot.subject || "", slot.startTime || "", slot.endTime || ""].join("|");
      const row = map.get(key) || {
        order: Number(slot.subjectOrder || 0),
        subject: slot.subject || "",
        startTime: slot.startTime || "",
        endTime: slot.endTime || "",
        date: slot.date || "",
        gradeNames: [],
      };
      const grade = gradeById(period, slot.gradeId);
      row.gradeNames.push(grade ? `${grade.stageName} - ${grade.name}` : slot.gradeId);
      map.set(key, row);
      return map;
    }, new Map()).values()).sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.subject).localeCompare(String(b.subject), "ar"));
    return `<section class="exam-panel exam-builder-panel">
      <div class="exam-section-head"><div><h3>إضافة مادة للفصول</h3><p>حدد فصلًا أو أكثر، اختر المادة، ضع رقم ترتيبها ووقت الاختبار، ثم سيضعها النظام في تاريخها تلقائيًا.</p></div></div>
      <div class="exam-builder-days">
        <span>أيام الجدول: ${safe(periodDates(period).length)}</span>
        <span>حسب المواد: ${safe(Math.max(0, ...grades.map((grade) => (grade.subjects || []).length)))}</span>
        <span>أيام إضافية: ${safe(period.extraDays || 0)}</span>
      </div>
      ${quickRows.length ? `<div class="exam-entry-list">
        ${quickRows.map((row) => `<article class="exam-entry-row">
          <b>${safe(row.order || "-")}</b>
          <div>
            <strong>${safe(row.subject)}</strong>
            <span>${safe(row.gradeNames.join("، "))}</span>
            <small>${safe(formatArabicDate(row.date))} ${safe([row.startTime, row.endTime].filter(Boolean).join(" - ") || "بدون وقت")} - المقرر يضاف بعد اكتمال الجدول</small>
          </div>
        </article>`).join("")}
      </div>` : ""}
      <form class="exam-bulk-scheduler" onsubmit="actions.addExamBulkSubjectSchedule(event)">
        <div class="exam-bulk-scheduler-title">
          <strong>المربع التالي</strong>
          <span>بعد الحفظ سيظهر مربع جديد تلقائيًا لإكمال بقية المواد.</span>
        </div>
        <div class="exam-grade-pick-list">
          ${grades.map((grade) => `<label><input type="checkbox" name="gradeIds" value="${safe(grade.id)}" /> <span>${safe(grade.stageName)} - ${safe(grade.name)}</span></label>`).join("") || `<div class="empty">أضف الفصول أولًا من إعدادات الصفوف والمواد.</div>`}
        </div>
        <label><span>المادة</span><select name="subject" required><option value="">اختر المادة</option>${subjects.map((subject) => `<option value="${safe(subject)}">${safe(subject)}</option>`).join("")}</select></label>
        <label><span>رقم المادة</span><input name="subjectOrder" type="number" min="1" max="${safe(maxOrder + 10)}" value="${safe(nextOrder)}" required /></label>
        <label><span>من الساعة</span><input name="startTime" type="time" value="${safe(defaultTime.startTime)}" /></label>
        <label><span>إلى الساعة</span><input name="endTime" type="time" value="${safe(defaultTime.endTime)}" /></label>
        <button class="btn exam-primary" type="submit">${icons.check} إضافة وترتيب</button>
      </form>
    </section>`;
  }

  function renderCompletion(stats) {
    const { safe } = getContext();
    return `<section class="exam-progress-card">
      <div class="exam-progress-head"><div><small>نسبة تعبئة الجدول</small><strong>${safe(stats.scheduled)} / ${safe(stats.required)}</strong></div><span>${safe(stats.percent)}%</span></div>
      <div class="exam-progress-track"><i style="width:${Math.min(100, stats.percent)}%"></i></div>
      <div class="exam-metrics">
        <article><span>المطلوب</span><strong>${safe(stats.required)}</strong></article>
        <article><span>المجدول</span><strong>${safe(stats.scheduled)}</strong></article>
        <article><span>المتبقي</span><strong>${safe(stats.remaining)}</strong></article>
        <article><span>النواقص</span><strong>${safe(stats.missingRows)}</strong></article>
      </div>
    </section>`;
  }

  function slotCards(period, date, grade) {
    const { safe, icons } = getContext();
    const canEditPeriod = canEditExamPeriod(period);
    const slots = (period.slots || []).filter((slot) => slot.date === date && slot.gradeId === grade.id);
    if (!slots.length) {
      return canEditPeriod
        ? `<button class="exam-empty-cell" type="button" onclick="actions.openExamSlot('${safe(date)}','${safe(grade.id)}')">${icons.plus} إضافة</button>`
        : `<span class="exam-no-slot">لا يوجد</span>`;
    }
    return slots.map((slot) => `<article class="exam-subject-card ${canEditPeriod ? "" : "locked"}" style="--subject-color:${safe(slot.color)}" ${canEditPeriod ? `onclick="actions.openExamSlot('${safe(date)}','${safe(grade.id)}','${safe(slot.id)}')"` : ""}>
      <strong>${slot.subjectOrder ? `${safe(slot.subjectOrder)} - ` : ""}${safe(slot.subject)}</strong>
      <span>${safe(slot.sections.join("، "))}</span>
      ${slot.syllabus ? `<span>المقرر: ${safe(slot.syllabus)}</span>` : ""}
      <small>${safe([slot.startTime, slot.endTime].filter(Boolean).join(" - ") || "بدون وقت")}</small>
    </article>`).join("");
  }

  function renderTrackingStepButton(item, step) {
    const { safe } = getContext();
    const value = item.state?.[step.key];
    const allowed = canActOnTracking(step);
    return `<button class="exam-track-step ${value?.done ? "done" : ""}" style="--step-color:${safe(step.color)}" type="button" ${allowed ? `onclick="actions.toggleExamTracking('${safe(item.slot.id)}','${safe(item.section)}','${safe(step.key)}')"` : "disabled"}>
      <strong>${safe(step.label)}</strong>
      <span>${value?.done ? `تم - ${safe(value.name || "")}` : "لم يتم"}</span>
    </button>`;
  }

  function renderTrackingWorkspace(period) {
    const { safe, state } = getContext();
    const role = normalizeRole(state.currentUser?.role, "");
    const title = role === "deputy_principal"
      ? "استلام كشوف الدرجات"
      : role === "computer_unit"
        ? "إدخال كشوف الدرجات"
        : role === "printing_unit"
          ? "متابعة استلام وطباعة الاختبارات"
          : "لوحة متابعة أعمال الاختبارات";
    const items = trackingItems(period);
    const visibleSteps = trackingSteps.filter((step) => canActOnTracking(step) || canViewExamReports());
    return `<section class="exam-panel exam-tracking-panel">
      <div class="exam-section-head"><div><h3>${safe(title)}</h3><p>اضغط على المادة والشعبة لتسجيل إنجاز المهمة الخاصة بك.</p></div></div>
      <div class="exam-tracking-list">
        ${items.map((item) => `<article class="exam-tracking-card">
          <div class="exam-tracking-main">
            <span>${safe(formatArabicDate(item.slot.date))} - ${safe(hijriDateLabel(item.slot.date))}</span>
            <strong>${item.slot.subjectOrder ? `${safe(item.slot.subjectOrder)} - ` : ""}${safe(item.slot.subject)}</strong>
            <small>${safe(item.grade.stageName || "")} / ${safe(item.grade.name || "")} / شعبة ${safe(item.section)}${item.slot.syllabus ? ` - المقرر: ${safe(item.slot.syllabus)}` : ""}</small>
          </div>
          <div class="exam-tracking-actions">${visibleSteps.map((step) => renderTrackingStepButton(item, step)).join("")}</div>
        </article>`).join("") || `<div class="empty">لا توجد مواد مجدولة للمتابعة بعد.</div>`}
      </div>
    </section>`;
  }

  function renderTrackingReports(period, stats) {
    const { safe } = getContext();
    return `<section class="exam-panel exam-report-panel">
      <div class="exam-section-head"><div><h3>تقارير متابعة الاختبارات</h3><p>تقرير تفصيلي لكل جهة: الوكيل، وحدة الحاسوب، وحدة الطباعة.</p></div><button class="btn secondary" type="button" onclick="actions.printExamTrackingReport()">طباعة التقرير</button></div>
      <div class="exam-report-metrics">
        ${trackingSteps.map((step) => `<article style="--step-color:${safe(step.color)}"><span>${safe(step.label)}</span><strong>${safe(stats.counts[step.key] || 0)} / ${safe(stats.total)}</strong><div><i style="width:${safe(stats.percent(step.key))}%"></i></div><small>${safe(stats.percent(step.key))}%</small></article>`).join("")}
      </div>
      <div class="exam-report-bars">
        ${trackingSteps.map((step) => `<div><span>${safe(step.label)}</span><b>${safe(stats.percent(step.key))}%</b><i style="--step-color:${safe(step.color)}; width:${safe(stats.percent(step.key))}%"></i></div>`).join("")}
      </div>
    </section>`;
  }

  function renderMobileSchedule(period, dates, grades) {
    const { safe } = getContext();
    return `<section class="exam-mobile-board">
      <div class="exam-mobile-schedule-head">
        <div><strong>الجدول اليومي</strong><span>${safe(grades.length)} صفوف - ${safe(dates.length)} أيام</span></div>
        <button class="btn secondary" type="button" onclick="actions.openExamPrintOptions()">طباعة</button>
      </div>
      ${dates.map((date) => `<article class="exam-day-card">
        <div class="exam-day-head">
          <div><strong>${safe(formatArabicDate(date))}</strong><span>${safe(date)} - ${safe(hijriDateLabel(date))}</span></div>
          <b>${safe((period.slots || []).filter((slot) => slot.date === date).length)} اختبار</b>
        </div>
        <div class="exam-day-grades">
          ${grades.map((grade) => `<div class="exam-mobile-grade">
            <div class="exam-mobile-grade-head"><strong>${safe(grade.name)}</strong><span>${safe(grade.stageName)} - ${safe((grade.sections || []).length)} شعب</span></div>
            <div class="exam-mobile-slots">${slotCards(period, date, grade)}</div>
          </div>`).join("")}
        </div>
      </article>`).join("")}
    </section>`;
  }

  function renderDesktopSchedule(period, dates, grades) {
    const { safe } = getContext();
    return `<section class="exam-desktop-board">
      <div class="exam-table" style="--exam-grade-count:${Math.max(1, grades.length)}">
        <div class="exam-table-head exam-sticky-date">اليوم والتاريخ</div>
        ${grades.map((grade) => `<div class="exam-table-head"><span>${safe(grade.stageName)}</span><strong>${safe(grade.name)}</strong><small>${safe((grade.sections || []).join("، "))}</small></div>`).join("")}
        ${dates.map((date) => `
          <div class="exam-date-cell exam-sticky-date"><strong>${safe(formatArabicDate(date))}</strong><span>${safe(date)}</span><small>${safe(hijriDateLabel(date))}</small></div>
          ${grades.map((grade) => `<div class="exam-slot-cell">${slotCards(period, date, grade)}</div>`).join("")}
        `).join("")}
      </div>
    </section>`;
  }

  function renderMissingReport(period, stats) {
    const { safe } = getContext();
    return `<section class="exam-panel">
      <div class="exam-section-head"><div><h3>تقرير النواقص</h3><p>يحسب من المواد والشعب المطلوبة فعليًا.</p></div><button class="btn secondary" onclick="actions.printExamMissingReport()">طباعة النواقص</button></div>
      <div class="exam-missing-list">
        ${stats.missing.slice(0, 18).map((row) => `<article>
          <strong>${safe(row.gradeName)} - شعبة ${safe(row.section)}</strong>
          <span>${safe(row.stageName)} - ${safe(row.subject)}</span>
          <b>${safe(row.scheduled)} / ${safe(row.required)}</b>
        </article>`).join("") || `<div class="empty">لا توجد نواقص في الجدول الحالي.</div>`}
      </div>
    </section>`;
  }

  function renderCharts(period, stats) {
    const { safe } = getContext();
    const dates = periodDates(period);
    const max = Math.max(1, ...dates.map((date) => (period.slots || []).filter((slot) => slot.date === date).length));
    const byStage = (period.stages || []).map((stage) => {
      const gradeIds = new Set((stage.grades || []).map((grade) => grade.id));
      const required = requirementRows(period).filter((row) => gradeIds.has(row.gradeId));
      const done = required.filter((row) => row.scheduled >= row.required).length;
      return [stage.name, required.length ? Math.round((done / required.length) * 100) : 0];
    });
    return `<section class="exam-panel exam-chart-panel">
      <div class="exam-section-head"><div><h3>الإحصائيات</h3><p>نسبة الإنجاز وتوزيع الاختبارات خلال الفترة.</p></div></div>
      <div class="exam-chart-grid">
        <div class="exam-chart-box">
          <h4>الإنجاز حسب المرحلة</h4>
          ${byStage.map(([label, value]) => `<div class="exam-chart-row"><span>${safe(label)}</span><i style="width:${Math.max(6, value)}%"></i><strong>${safe(value)}%</strong></div>`).join("")}
        </div>
        <div class="exam-chart-box">
          <h4>عدد الاختبارات يوميًا</h4>
          ${dates.map((date) => {
            const count = (period.slots || []).filter((slot) => slot.date === date).length;
            return `<div class="exam-chart-row amber"><span>${safe(date)}</span><i style="width:${Math.max(6, Math.round((count / max) * 100))}%"></i><strong>${safe(count)}</strong></div>`;
          }).join("")}
        </div>
      </div>
    </section>`;
  }

  function renderActivityLog(period) {
    const { safe, formatDate } = getContext();
    const logs = visibleLogs(period.id);
    return `<section class="exam-panel">
      <div class="exam-section-head"><div><h3>سجل عمليات جدول الاختبارات</h3><p>يعرض اسم منفذ العملية والتاريخ والتفاصيل.</p></div></div>
      <div class="exam-log-list">
        ${logs.map((log) => `<article>
          <div><strong>${safe(log.title)}</strong><span>${safe(log.details || log.periodName || "")}</span></div>
          <div><b>${safe(log.actorName)}</b><small>${safe(formatDate(log.createdAt))}</small></div>
        </article>`).join("") || `<div class="empty">لا توجد عمليات مسجلة لهذا الجدول بعد.</div>`}
      </div>
    </section>`;
  }

  function renderExports(period) {
    const { icons } = getContext();
    return `<section class="exam-panel exam-export-panel">
      <button class="btn secondary" type="button" onclick="actions.exportExamScheduleCsv()">${icons.reports} CSV</button>
      <button class="btn secondary" type="button" onclick="actions.exportExamScheduleJson()">${icons.database} نسخة JSON</button>
      <button class="btn secondary" type="button" onclick="actions.openExamStudentCards()">${icons.users} بطاقة طالب</button>
      ${canEditExamPeriod(period) ? `<button class="btn secondary" type="button" onclick="document.getElementById('exam-json-import').click()">${icons.upload} استيراد JSON</button><input id="exam-json-import" type="file" accept="application/json,.json" hidden onchange="actions.importExamScheduleJson(event)" />` : ""}
    </section>`;
  }

  function renderExamFooter() {
    const { safe, state } = getContext();
    const principal = state.schoolProfile?.managerName || state.schoolProfile?.principalName || (state.users || []).find((user) => user.schoolId === currentPeriod()?.schoolId && user.role === "school_principal")?.name || "مدير المدرسة";
    return `<footer class="exam-page-footer"><span>${safe(state.schoolProfile?.name || "منصة مهام المدارس")} - للتواصل 772227082</span><strong>${safe(principal)}</strong></footer>`;
  }

  function openPrintOptionsModal() {
    const { state, render } = getContext();
    if (!currentPeriod()) return;
    state.modal = { type: "exam_print_options" };
    render();
  }

  function renderPrintOptionsModal() {
    const { safe, icons } = getContext();
    const period = currentPeriod();
    const grades = allGrades(period);
    const stages = uniqueList(grades.map((grade) => grade.stageName));
    const subjects = uniqueList((period?.slots || []).map((slot) => slot.subject));
    return `<div class="modal"><form class="modal-box exam-modal" onsubmit="actions.printExamSchedule(event)">
      <div class="modal-head"><div><h3>خيارات طباعة جدول الاختبارات</h3><p class="muted">اختر نطاق الطباعة المناسب قبل إنشاء التقرير.</p></div><button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button></div>
      <div class="form-grid">
        <label class="field"><span>نوع الطباعة</span><select name="scope">
          <option value="all">جدول عام لكل المواد والفصول</option>
          <option value="grade">حسب الفصل فقط</option>
          <option value="stage">حسب المرحلة فقط</option>
          <option value="subject">حسب المادة فقط</option>
        </select></label>
        <label class="field"><span>الفصل</span><select name="gradeId"><option value="">كل الفصول</option>${grades.map((grade) => `<option value="${safe(grade.id)}">${safe(grade.stageName)} - ${safe(grade.name)}</option>`).join("")}</select></label>
        <label class="field"><span>المرحلة</span><select name="stageName"><option value="">كل المراحل</option>${stages.map((stage) => `<option value="${safe(stage)}">${safe(stage)}</option>`).join("")}</select></label>
        <label class="field"><span>المادة</span><select name="subject"><option value="">كل المواد</option>${subjects.map((subject) => `<option value="${safe(subject)}">${safe(subject)}</option>`).join("")}</select></label>
      </div>
      <div class="modal-actions"><button class="btn secondary" type="button" onclick="actions.closeModal()">إلغاء</button><button class="btn exam-primary" type="submit">${icons.reports} طباعة</button></div>
    </form></div>`;
  }

  function renderPeriodModal() {
    const { state, safe, schools, schoolName, icons } = getContext();
    const id = state.modal?.id || "";
    const existing = id ? (state.examSchedulePeriods || []).find((period) => period.id === id) : null;
    const period = normalizePeriod(existing || { schoolId: isGeneralManager(state.currentUser) && state.activeSchoolId !== "all" ? state.activeSchoolId : state.currentUser?.schoolId }, state.currentUser);
    const settings = normalizeSettings(state.examScheduleSettings || {});
    const settingsGrades = settings.stages.flatMap((stage) => (stage.grades || []).map((grade) => ({ ...grade, stageName: stage.name })));
    const selectedGradeIds = new Set(existing ? allGrades(period).map((grade) => grade.id) : settingsGrades.map((grade) => grade.id));
    const previewStages = existing?.stages || filterStagesByGradeIds(settings.stages, [...selectedGradeIds]);
    const previewPeriod = normalizePeriod({ ...period, stages: previewStages }, state.currentUser);
    const autoHijri = `${hijriDateLabel(period.startDate)} - ${hijriDateLabel(period.endDate)}`;
    const computedDates = periodDates(previewPeriod);
    const computedEndDate = computedDates.at(-1) || period.endDate;
    const schoolOptions = isGeneralManager(state.currentUser) ? schools : schools.filter((school) => school.id === state.currentUser?.schoolId);
    return `<div class="modal"><form class="modal-box exam-modal" onsubmit="actions.saveExamPeriod(event)">
      <div class="modal-head"><div><h3>${id ? "تعديل فترة اختبار" : "فترة اختبار جديدة"}</h3><p class="muted">يتم تسجيل اسم منفذ العملية ووقت التعديل.</p></div><button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button></div>
      <input type="hidden" name="id" value="${safe(id)}" />
      <div class="form-grid">
        <label class="field wide"><span>اسم الجدول</span><input name="name" value="${safe(period.name)}" required /></label>
        <label class="field"><span>المدرسة</span><select name="schoolId">${schoolOptions.map((school) => `<option value="${safe(school.id)}" ${period.schoolId === school.id ? "selected" : ""}>${safe(school.name || schoolName(school.id))}</option>`).join("")}</select></label>
        <label class="field"><span>العام الدراسي</span><input name="academicYear" value="${safe(period.academicYear)}" required /></label>
        <label class="field"><span>الفصل / الشهر</span><input name="term" value="${safe(period.term)}" required /></label>
        <label class="field"><span>نوع الاختبار</span><select name="type">${["monthly", "midterm", "final", "custom"].map((type) => `<option value="${type}" ${period.type === type ? "selected" : ""}>${safe(typeLabel(type))}</option>`).join("")}</select></label>
        <label class="field"><span>البداية</span><input type="date" name="startDate" value="${safe(period.startDate)}" required /></label>
        <label class="field"><span>أيام إضافية</span><input type="number" min="0" name="extraDays" value="${safe(period.extraDays || 0)}" /></label>
        <label class="field"><span>نهاية الجدول المتوقعة</span><input value="${safe(formatArabicDate(computedEndDate))} - ${safe(hijriDateLabel(computedEndDate))}" readonly /></label>
        <div class="field wide">
          <span>الفصول التي ستدخل الاختبار</span>
          <div class="exam-grade-pick-list exam-period-grade-list">
            ${settingsGrades.map((grade) => `<label><input type="checkbox" name="gradeIds" value="${safe(grade.id)}" ${selectedGradeIds.has(grade.id) ? "checked" : ""} ${existing ? "disabled" : ""} /> <span>${safe(grade.stageName)} - ${safe(grade.name)} (${safe((grade.subjects || []).length)} مواد)</span></label>`).join("") || `<div class="empty">احفظ الفصول والمواد أولًا من إعداد الصفوف والمواد.</div>`}
          </div>
          ${existing ? `<small class="muted">تغيير فصول جدول قائم قد يؤثر على المواعيد، لذلك يتم تثبيتها بعد إنشاء الجدول.</small>` : ""}
        </div>
        <label class="field wide"><span>حذف أيام من الجدول</span><textarea name="removedDates" placeholder="اكتب كل تاريخ ميلادي في سطر مثل 2026-08-20">${safe((period.removedDates || []).join("\n"))}</textarea></label>
        <label class="field wide"><span>ملاحظات عامة</span><textarea name="notes">${safe(period.notes)}</textarea></label>
      </div>
      <div class="exam-auto-note">اختر تاريخ أول يوم فقط. سيحدد النظام بقية الأيام تلقائيًا بعدد مواد أكثر فصل، مع إظهار التاريخ الميلادي والهجري واستبعاد الخميس والجمعة.</div>
      <div class="modal-actions"><button class="btn secondary" type="button" onclick="actions.closeModal()">إلغاء</button><button class="btn exam-primary" type="submit">${icons.save} حفظ الفترة</button></div>
    </form></div>`;
  }

  function renderSettingsModal() {
    const { state, safe, icons } = getContext();
    const settings = normalizeSettings(state.examScheduleSettings || {});
    const grades = settings.stages.flatMap((stage) => (stage.grades || []).map((grade) => ({ ...grade, stageName: stage.name })));
    return `<div class="modal"><form class="modal-box exam-modal exam-settings-modal" onsubmit="actions.saveExamSettings(event)">
      <div class="modal-head"><div><h3>إعداد الصفوف والشعب والمواد</h3><p class="muted">تُحفظ هذه البيانات وتستخدم في صناعة الجداول طوال السنة.</p></div><button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button></div>
      <div class="exam-settings-block">
        <label class="field wide"><span>قائمة المواد العامة</span><textarea name="subjectsCatalog" required>${safe(settings.subjectsCatalog.join("، "))}</textarea></label>
        <label class="field wide"><span>ملاحظات الطباعة وبطاقة الطالب</span><textarea name="printNotes">${safe(settings.printNotes)}</textarea></label>
      </div>
      <div class="exam-section-head exam-settings-head">
        <div><h3>الصفوف والشعب</h3><p>ابدأ بإضافة الفصل، ثم أضف الشعب والمواد الخاصة به من نفس البطاقة.</p></div>
        <button class="btn secondary danger-icon" type="button" onclick="actions.clearExamGradeSettingRows(this)">حذف كل الفصول</button>
      </div>
      <div class="exam-grade-settings" data-exam-grade-settings>
        ${grades.map((grade) => `<article class="exam-grade-setting-row">
          <label class="field"><span>المرحلة</span><input name="stageName" value="${safe(grade.stageName)}" required /></label>
          <label class="field"><span>الصف</span><input name="gradeName" value="${safe(grade.name)}" required /></label>
          ${sectionEditor(grade.sections || [])}
          <label class="field wide"><span>مواد الصف</span><input name="gradeSubjects" value="${safe((grade.subjects || []).join("، "))}" required /></label>
          <button class="btn secondary danger-icon exam-delete-grade-btn" type="button" onclick="actions.removeExamGradeSettingRow(this)">حذف الصف</button>
        </article>`).join("") || `<div class="exam-settings-empty"><strong>لا توجد فصول مضافة</strong><span>اضغط إضافة صف / فصل جديد وابدأ بإدخال المرحلة والصف والشعب.</span></div>`}
      </div>
      <button class="btn exam-primary exam-add-grade-main" type="button" onclick="actions.addExamGradeSettingRow(this)">${icons.plus} إضافة صف / فصل جديد</button>
      <div class="modal-actions"><button class="btn secondary" type="button" onclick="actions.closeModal()">إلغاء</button><button class="btn exam-primary" type="submit">${icons.save} حفظ الإعدادات</button></div>
    </form></div>`;
  }

  function renderSlotModal() {
    const { state, safe, icons } = getContext();
    const period = currentPeriod();
    const existing = period?.slots?.find((slot) => slot.id === state.modal?.id);
    const slot = normalizeSlot(existing || { date: state.modal?.date, gradeId: state.modal?.gradeId });
    const grade = gradeById(period, slot.gradeId) || allGrades(period)[0] || {};
    const grades = allGrades(period);
    const selectedOrder = slot.subjectOrder || Math.max(1, (grade.subjects || []).indexOf(slot.subject) + 1);
    const autoDate = dateForSubjectOrder(period, selectedOrder);
    const defaultTime = firstExamTime(period);
    const startTime = slot.startTime || defaultTime.startTime;
    const endTime = slot.endTime || defaultTime.endTime;
    return `<div class="modal"><form class="modal-box exam-modal" onsubmit="actions.saveExamSlot(event)">
      <div class="modal-head"><div><h3>${existing ? "تعديل موعد اختبار" : "إضافة موعد اختبار"}</h3><p class="muted">سيتم فحص التعارضات قبل الحفظ.</p></div><button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button></div>
      <input type="hidden" name="id" value="${safe(existing?.id || "")}" />
      <div class="form-grid">
        <label class="field"><span>الصف</span><select name="gradeId" onchange="actions.refreshExamSlotForm(this.value)">${grades.map((item) => `<option value="${safe(item.id)}" ${slot.gradeId === item.id ? "selected" : ""}>${safe(item.stageName)} - ${safe(item.name)}</option>`).join("")}</select></label>
        <label class="field"><span>رقم المادة وترتيبها</span><select name="subjectOrder">${subjectOrderOptions(grade, slot.subject, selectedOrder)}</select><input type="hidden" name="subject" value="${safe(slot.subject || grade.subjects?.[selectedOrder - 1] || "")}" /></label>
        <label class="field"><span>التاريخ التلقائي</span><input value="${safe(formatArabicDate(autoDate))} - ${safe(hijriDateLabel(autoDate))}" readonly /></label>
        <label class="field wide"><span>المقرر أمام المادة</span><input name="syllabus" value="${safe(slot.syllabus)}" placeholder="مثال: من صفحة 10 إلى 25" /></label>
        <label class="field"><span>وقت البداية</span><input type="time" name="startTime" value="${safe(startTime)}" /></label>
        <label class="field"><span>وقت النهاية</span><input type="time" name="endTime" value="${safe(endTime)}" /></label>
        <label class="field"><span>القاعة</span><input name="room" value="${safe(slot.room)}" /></label>
        <label class="field"><span>لون البطاقة</span><select name="color">${SUBJECT_COLORS.map((color) => `<option value="${color}" ${slot.color === color ? "selected" : ""}>${color}</option>`).join("")}</select></label>
        <div class="field wide"><span>الشعب</span><div class="exam-section-picker">${(grade.sections || []).map((section) => `<label><input type="checkbox" name="sections" value="${safe(section)}" ${slot.sections.includes(section) ? "checked" : ""} /> ${safe(section)}</label>`).join("")}</div></div>
        <label class="field wide"><span>المراقبون</span><input name="proctors" value="${safe(slot.proctors.join("، "))}" placeholder="اكتب الأسماء مفصولة بفواصل" /></label>
        <label class="field wide"><span>ملاحظات</span><textarea name="notes">${safe(slot.notes)}</textarea></label>
      </div>
      <div class="modal-actions">
        ${existing ? `<button class="btn secondary danger-icon" type="button" onclick="actions.deleteExamSlot('${safe(existing.id)}')">${icons.trash} حذف</button>` : ""}
        <button class="btn secondary" type="button" onclick="actions.closeModal()">إلغاء</button>
        <button class="btn exam-primary" type="submit">${icons.save} حفظ الموعد</button>
      </div>
    </form></div>`;
  }

  function refreshSlotForm(gradeId) {
    const { state, render } = getContext();
    if (state.modal?.type !== "exam_slot") return;
    state.modal.gradeId = gradeId;
    render();
  }

  function renderStudentCardsModal() {
    const { safe, icons } = getContext();
    const period = currentPeriod();
    const grades = allGrades(period);
    return `<div class="modal"><form class="modal-box exam-modal" onsubmit="actions.printExamStudentCards(event)">
      <div class="modal-head"><div><h3>بطاقة اختبار الطالب</h3><p class="muted">طباعة طالب واحد أو أسماء متعددة من نفس الشعبة.</p></div><button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button></div>
      <div class="form-grid">
        <label class="field"><span>الصف</span><select name="gradeId">${grades.map((grade) => `<option value="${safe(grade.id)}">${safe(grade.stageName)} - ${safe(grade.name)}</option>`).join("")}</select></label>
        <label class="field"><span>الشعبة</span><input name="section" placeholder="أ" required /></label>
        <label class="field wide"><span>أسماء الطلاب</span><textarea name="students" placeholder="اكتب كل طالب في سطر منفصل" required></textarea></label>
        <label class="field"><span>عدد البطاقات في الصفحة</span><input type="number" name="perPage" min="1" max="4" value="2" /></label>
      </div>
      <div class="modal-actions"><button class="btn secondary" type="button" onclick="actions.closeModal()">إلغاء</button><button class="btn exam-primary" type="submit">${icons.reports} طباعة البطاقات</button></div>
    </form></div>`;
  }

  function filteredSlots(period, options = {}) {
    return (period?.slots || []).filter((slot) => {
      const grade = gradeById(period, slot.gradeId) || {};
      if (options.scope === "grade" && options.gradeId && slot.gradeId !== options.gradeId) return false;
      if (options.scope === "stage" && options.stageName && grade.stageName !== options.stageName) return false;
      if (options.scope === "subject" && options.subject && slot.subject !== options.subject) return false;
      return true;
    }).sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.subjectOrder || 0) - Number(b.subjectOrder || 0));
  }

  function csvRows(period, options = {}) {
    return [["رقم", "اليوم", "التاريخ الميلادي", "التاريخ الهجري", "المرحلة", "الصف", "الشعب", "المادة", "المقرر", "البداية", "النهاية", "القاعة", "المراقبون"], ...filteredSlots(period, options).map((slot) => {
      const grade = gradeById(period, slot.gradeId) || {};
      return [slot.subjectOrder || "", formatArabicDate(slot.date), slot.date, hijriDateLabel(slot.date), grade.stageName || "", grade.name || "", slot.sections.join("، "), slot.subject, slot.syllabus || "", slot.startTime, slot.endTime, slot.room, slot.proctors.join("، ")];
    })];
  }

  function exportCsv() {
    const { downloadBlob, showToast } = getContext();
    const period = currentPeriod();
    if (!period) return;
    const csv = csvRows(period).map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(",")).join("\n");
    downloadBlob(`${period.name}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
    const log = recordLog("export_csv", "تصدير جدول الاختبارات CSV", period.id, period.name);
    persist();
    saveLogCloud(log);
    showToast("تم تجهيز ملف CSV.");
  }

  function exportJson() {
    const { downloadBlob, showToast } = getContext();
    const period = currentPeriod();
    if (!period) return;
    downloadBlob(`${period.name}.json`, JSON.stringify({ type: "exam_schedule_period", version: 1, period }, null, 2), "application/json");
    const log = recordLog("export_json", "تصدير نسخة JSON", period.id, period.name);
    persist();
    saveLogCloud(log);
    showToast("تم تجهيز نسخة JSON.");
  }

  async function importJson(event) {
    const { state, showToast, render } = getContext();
    const file = event.target?.files?.[0];
    if (!file || !canManageExamSchedules()) return;
    try {
      const payload = JSON.parse(await file.text());
      const period = normalizePeriod(payload.period || payload, state.currentUser);
      const existing = (state.examSchedulePeriods || []).find((item) => item.id === period.id);
      if (existing && !guardExamPeriodEdit(existing)) return;
      period.updatedAt = nowTimestamp();
      period.updatedBy = state.currentUser?.id;
      period.updatedByName = state.currentUser?.name;
      state.examSchedulePeriods = [period, ...(state.examSchedulePeriods || []).filter((item) => item.id !== period.id)];
      state.examScheduleFilters = { ...(state.examScheduleFilters || {}), periodId: period.id };
      const log = recordLog("import_json", "استيراد جدول اختبارات", period.id, period.name);
      persist();
      savePeriodCloud(period).then(() => saveLogCloud(log));
      showToast("تم استيراد جدول الاختبارات.");
      render();
    } catch {
      showToast("تعذر قراءة ملف JSON. تأكد من أنه نسخة صحيحة.");
    } finally {
      event.target.value = "";
    }
  }

  async function deletePeriod(id = currentPeriod()?.id || "") {
    const { state, showToast, render } = getContext();
    const period = (state.examSchedulePeriods || []).find((item) => item.id === id);
    if (!period) return;
    if (!canDeleteExamPeriod(period)) {
      showToast("حذف جدول الاختبارات متاح للمدير العام أو مدير المدرسة فقط.");
      return;
    }
    if (!confirm(`هل تريد حذف جدول الاختبارات: ${period.name}؟`)) return;
    const previousPeriods = [...(state.examSchedulePeriods || [])];
    const previousLogs = [...(state.examScheduleLogs || [])];
    state.examSchedulePeriods = previousPeriods.filter((item) => item.id !== period.id);
    state.examScheduleFilters = { ...(state.examScheduleFilters || {}), periodId: "" };
    const log = recordDetachedLog("period_deleted", "حذف جدول اختبارات", period, period.name);
    persist();
    render();
    try {
      await deletePeriodCloud(period.id);
      await saveLogCloud(log);
      showToast("تم حذف جدول الاختبارات.");
    } catch (error) {
      state.examSchedulePeriods = previousPeriods;
      state.examScheduleLogs = previousLogs;
      state.examScheduleFilters = { ...(state.examScheduleFilters || {}), periodId: period.id };
      persist();
      showToast(`تعذر حذف الجدول من السيرفر: ${error?.message || "تحقق من الاتصال أو الصلاحيات."}`);
      render();
    }
  }

  function openPrintWindow(title, body) {
    const { state, safe } = getContext();
    const principal = state.schoolProfile?.managerName || state.schoolProfile?.principalName || (state.users || []).find((user) => user.schoolId === currentPeriod()?.schoolId && user.role === "school_principal")?.name || "مدير المدرسة";
    const footer = `<footer><span>${safe(state.schoolProfile?.name || "منصة مهام المدارس")} - للتواصل 772227082</span><strong>${safe(principal)}</strong></footer>`;
    const win = window.open("", "_blank", "width=1200,height=820");
    if (!win) {
      getContext().showToast("تعذر فتح نافذة الطباعة.");
      return;
    }
    win.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title><style>
      body{font-family:Arial,Tahoma,sans-serif;margin:0;background:#eef4f8;color:#172033}.page{width:min(1120px,calc(100% - 24px));margin:18px auto;background:white;border-radius:18px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.12)}header{padding:22px;color:white;background:linear-gradient(135deg,#0f766e,#2563eb)}header h1{margin:0 0 8px;font-size:28px}header p{margin:0;opacity:.88}main{padding:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dbeafe;padding:8px;text-align:right;font-size:12px;vertical-align:top}th{background:#ecfeff;color:#164e63}.card{break-inside:avoid;border:1px solid #dbeafe;border-radius:14px;padding:12px;margin:10px 0}.print-action{position:sticky;top:0;text-align:center;padding:10px;background:white;z-index:5}.print-action button{border:0;border-radius:999px;background:#0f766e;color:white;padding:10px 18px;font-weight:900}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}.metric{border:1px solid #dbeafe;border-top:5px solid var(--c,#2563eb);border-radius:14px;padding:12px;background:#f8fafc}.metric span,.metric strong{display:block}.metric span{font-size:12px;color:#64748b}.metric strong{font-size:24px;margin-top:5px}.bar{display:grid;grid-template-columns:170px 1fr 44px;gap:10px;align-items:center;margin:9px 0;font-size:12px;font-weight:900}.bar i{display:block;height:13px;border-radius:999px;background:var(--c,#2563eb)}footer{display:flex;justify-content:space-between;gap:12px;padding:14px 18px;border-top:1px solid #dbeafe;background:#f8fafc;color:#475569;font-weight:900}@media(max-width:760px){.page{width:calc(100% - 12px);margin:6px}.metric-grid{grid-template-columns:repeat(2,1fr)}.bar{grid-template-columns:110px 1fr 38px}th,td{font-size:10px;padding:6px}}@media print{.print-action{display:none}.page{width:100%;margin:0;border-radius:0;box-shadow:none}header,.metric{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body><div class="print-action"><button onclick="window.print()">طباعة / PDF</button></div><section class="page"><header><h1>${title}</h1><p>منصة مهام المدارس - وحدة جداول الاختبارات</p></header><main>${body}</main>${footer}</section></body></html>`);
    win.document.close();
    win.focus();
  }

  function printSchedule(event = null) {
    event?.preventDefault?.();
    const period = currentPeriod();
    if (!period) return;
    const form = event?.currentTarget ? new FormData(event.currentTarget) : null;
    const options = form ? {
      scope: safeText(form.get("scope")),
      gradeId: safeText(form.get("gradeId")),
      stageName: safeText(form.get("stageName")),
      subject: safeText(form.get("subject")),
    } : {};
    const rows = csvRows(period, options).slice(1).map((row) => `<tr>${row.map((cell) => `<td>${getContext().safe(cell)}</td>`).join("")}</tr>`).join("");
    const log = recordLog("print_schedule", "طباعة جدول الاختبارات", period.id, period.name);
    getContext().state.modal = null;
    persist();
    saveLogCloud(log);
    getContext().render();
    openPrintWindow(`جدول الاختبارات - ${period.name}`, `<table><thead><tr>${csvRows(period)[0].map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`);
  }

  function printTrackingReport() {
    const { safe } = getContext();
    const period = currentPeriod();
    if (!period) return;
    const stats = trackingStats(period);
    const items = trackingItems(period);
    const metrics = `<div class="metric-grid">${trackingSteps.map((step) => `<div class="metric" style="--c:${safe(step.color)}"><span>${safe(step.label)}</span><strong>${safe(stats.counts[step.key] || 0)} / ${safe(stats.total)}</strong><small>${safe(stats.percent(step.key))}%</small></div>`).join("")}</div>`;
    const bars = trackingSteps.map((step) => `<div class="bar"><span>${safe(step.label)}</span><i style="--c:${safe(step.color)};width:${safe(stats.percent(step.key))}%"></i><b>${safe(stats.percent(step.key))}%</b></div>`).join("");
    const rows = items.map((item) => `<tr><td>${safe(formatArabicDate(item.slot.date))}<br>${safe(hijriDateLabel(item.slot.date))}</td><td>${safe(item.grade.stageName || "")}</td><td>${safe(item.grade.name || "")}</td><td>${safe(item.section)}</td><td>${safe(item.slot.subject)}</td><td>${safe(item.slot.syllabus || "")}</td>${trackingSteps.map((step) => `<td>${item.state?.[step.key]?.done ? `تم<br>${safe(item.state[step.key].name || "")}` : "لم يتم"}</td>`).join("")}</tr>`).join("");
    const log = recordLog("print_tracking_report", "طباعة تقرير متابعة الاختبارات", period.id, period.name);
    persist();
    saveLogCloud(log);
    openPrintWindow(`تقرير متابعة الاختبارات - ${period.name}`, `${metrics}<section>${bars}</section><table><thead><tr><th>التاريخ</th><th>المرحلة</th><th>الفصل</th><th>الشعبة</th><th>المادة</th><th>المقرر</th>${trackingSteps.map((step) => `<th>${safe(step.label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`);
  }

  function printMissingReport() {
    const period = currentPeriod();
    const stats = completion(period);
    const rows = stats.missing.map((row) => `<tr><td>${row.stageName}</td><td>${row.gradeName}</td><td>${row.section}</td><td>${row.subject}</td><td>${row.scheduled} / ${row.required}</td></tr>`).join("");
    const log = recordLog("print_missing_report", "طباعة تقرير النواقص", period.id, period.name);
    persist();
    saveLogCloud(log);
    openPrintWindow(`تقرير نواقص الاختبارات - ${period.name}`, `<table><thead><tr><th>المرحلة</th><th>الصف</th><th>الشعبة</th><th>المادة</th><th>المجدول</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  function printStudentCards(event) {
    event.preventDefault();
    const { state, safe, schoolName } = getContext();
    const period = currentPeriod();
    const form = new FormData(event.currentTarget);
    const grade = gradeById(period, form.get("gradeId")) || {};
    const section = safeText(form.get("section"));
    const students = safeText(form.get("students")).split(/\n+/).map((name) => name.trim()).filter(Boolean);
    const exams = (period.slots || []).filter((slot) => slot.gradeId === grade.id && slot.sections.includes(section)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const cards = students.map((student) => `<article class="card"><h2>${safe(student)}</h2><p>${safe(schoolName(period.schoolId))} - ${safe(grade.name)} / ${safe(section)}</p><table><thead><tr><th>التاريخ</th><th>المادة</th><th>الوقت</th><th>القاعة</th></tr></thead><tbody>${exams.map((slot) => `<tr><td>${safe(formatArabicDate(slot.date))}<br>${safe(slot.date)}</td><td>${safe(slot.subject)}</td><td>${safe([slot.startTime, slot.endTime].filter(Boolean).join(" - "))}</td><td>${safe(slot.room)}</td></tr>`).join("")}</tbody></table><p>${safe(state.examScheduleSettings?.printNotes || "")}</p></article>`).join("");
    state.modal = null;
    const log = recordLog("print_student_cards", "طباعة بطاقة اختبار طالب", period.id, `${grade.name || ""} - ${section}`);
    persist();
    saveLogCloud(log);
    getContext().render();
    openPrintWindow(`بطاقات اختبار الطلاب - ${period.name}`, cards || "<p>لا توجد أسماء طلاب.</p>");
  }

  return {
    load,
    canViewExamSchedules,
    canManageExamSchedules,
    renderExamSchedules,
    renderPeriodModal,
    renderSettingsModal,
    renderSlotModal,
    renderPrintOptionsModal,
    renderStudentCardsModal,
    setFilter,
    resetFilters,
    openPeriodModal,
    savePeriod,
    openSettingsModal,
    saveSettings,
    addGradeSettingRow,
    removeGradeSettingRow,
    clearGradeSettingRows,
    addSectionSetting,
    removeSectionSetting,
    openSlotModal,
    saveSlot,
    deleteSlot,
    deletePeriod,
    updatePeriodStatus,
    approveExamPeriod,
    toggleExamTracking,
    addBulkSubjectSchedule,
    refreshSlotForm,
    exportCsv,
    exportJson,
    importJson,
    printSchedule,
    printTrackingReport,
    printMissingReport,
    openStudentCardsModal,
    printStudentCards,
    openPrintOptionsModal,
  };
}
