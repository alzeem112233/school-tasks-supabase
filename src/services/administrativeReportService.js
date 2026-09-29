import { createUuid } from "../utils/idUtils.js";
import { linkedSchoolIds, normalizeRole } from "../utils/permissionUtils.js";
import { today as localToday } from "../utils/dateUtils.js";

const REPORTS_KEY = "schoolTasksAdministrativeReportsV1";
const COLORS_KEY = "schoolTasksStageSupervisorColorsV1";
const SUPERVISOR_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#0891b2", "#059669", "#9333ea", "#c7a304"];
const EMPTY_ROW_COUNT = 1;

const sections = [
  {
    id: "teacherPositives",
    title: "إيجابيات المعلمين",
    fields: [
      ["name", "اسم المعلم"],
      ["positives", "الإيجابية"],
      ["reinforcement", "التعزيز"],
    ],
  },
  {
    id: "teacherNotes",
    title: "ملاحظات المعلمين",
    fields: [
      ["teacher", "المعلم"],
      ["subject", "المادة"],
      ["className", "الفصل"],
      ["notes", "الملاحظة"],
      ["action", "الإجراء"],
    ],
  },
  {
    id: "correctionFollowup",
    title: "متابعة التصحيح",
    fields: [
      ["teacher", "المعلم"],
      ["subject", "المادة"],
      ["className", "الفصل"],
      ["students", "عدد الطلاب"],
      ["lastCorrectionDate", "آخر تصحيح"],
      ["followedCount", "عدد المتابعين"],
      ["featuredNotebooks", "الدفاتر المميزة"],
      ["excellentCount", "الدفاتر الغير مميزة"],
    ],
  },
  {
    id: "learnerPositives",
    title: "إيجابيات الطلاب",
    fields: [
      ["name", "اسم الطالب"],
      ["className", "الفصل"],
      ["subject", "المادة"],
      ["positives", "الإيجابية"],
      ["reinforcement", "التعزيز"],
    ],
  },
  {
    id: "learnerViolations",
    title: "مخالفات الطلاب",
    fields: [
      ["name", "اسم الطالب"],
      ["className", "الفصل"],
      ["subject", "المادة"],
      ["notes", "المخالفة"],
      ["action", "الإجراء"],
    ],
  },
  {
    id: "absences",
    title: "الغياب والاستئذان",
    fields: [
      ["className", "الفصل"],
      ["stage", "القسم"],
      ["absent", "الغياب"],
      ["excused", "المستأذنون"],
      ["replied", "الرد"],
      ["notReplied", "لم يرد"],
    ],
  },
  {
    id: "followupNotebooks",
    title: "دفاتر المتابعة",
    fields: [
      ["teacher", "المعلم"],
      ["className", "الفصل"],
      ["issueType", "نوع الملاحظة"],
      ["actions", "الإجراء"],
      ["notes", "ملاحظات"],
    ],
  },
  {
    id: "parentNotes",
    title: "ملاحظات أولياء الأمور",
    fields: [
      ["learnerName", "اسم الطالب"],
      ["className", "الفصل"],
      ["relation", "ولي الأمر"],
      ["notes", "الملاحظة"],
      ["visit", "زيارة"],
      ["call", "اتصال"],
      ["messages", "رسائل"],
      ["followupNotebook", "دفتر متابعة"],
      ["actions", "الإجراء"],
    ],
  },
];

const deputyFields = [
  ["deputyTeacherSummary", "ملخص إيجابيات وملاحظات المعلمين"],
  ["deputyLearnerSummary", "ملخص إيجابيات ومخالفات الطلاب"],
  ["deputyParentSummary", "ملخص ملاحظات أولياء الأمور"],
  ["deputyBuildingSummary", "ملخص البيئة المدرسية"],
  ["deputyRecommendations", "توصيات الوكيل"],
];
const topLevelDigestFields = [
  ["buildingNotes", "ملاحظات البيئة المدرسية"],
  ["suggestions", "مقترحات المشرف"],
  ...deputyFields,
];

const suggestionFields = new Set(["name", "teacher", "learnerName"]);
const numericReportFields = new Set([
  "correctionFollowup.students",
  "correctionFollowup.followedCount",
  "correctionFollowup.featuredNotebooks",
  "correctionFollowup.excellentCount",
  "absences.absent",
  "absences.excused",
  "absences.replied",
  "absences.notReplied",
]);
const absenceStageLabels = { basic: "أساسي", secondary: "ثانوي" };
const parentContactOptions = [
  ["visit", "زيارة"],
  ["call", "اتصال"],
  ["messages", "رسالة"],
];
const summaryNameFields = {
  teacherPositives: [["name", "أسماء المعلمين في الإيجابيات"]],
  teacherNotes: [["teacher", "أسماء المعلمين في الملاحظات"]],
  correctionFollowup: [["teacher", "أسماء المعلمين في متابعة التصحيح"]],
  learnerPositives: [["name", "أسماء الطلاب في الإيجابيات"]],
  learnerViolations: [["name", "أسماء الطلاب في المخالفات"]],
  followupNotebooks: [["teacher", "أسماء المعلمين في دفاتر المتابعة"]],
  parentNotes: [["learnerName", "أسماء الطلاب في ملاحظات أولياء الأمور"]],
};

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

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeNumberText(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function reportFieldName(sectionId, field) {
  return `${sectionId}.${field}`;
}

function isNumericReportField(sectionId, field) {
  return numericReportFields.has(reportFieldName(sectionId, field));
}

function normalizeAbsenceStage(value) {
  const text = safeText(value);
  if (["secondary", "ثانوي", "الثانوي", "ثانوية"].includes(text)) return "secondary";
  if (["basic", "أساسي", "اساسي", "الأساسي", "الاساسي"].includes(text)) return "basic";
  return "";
}

function normalizeParentContactMethod(row = {}) {
  if (safeText(row.messages) || ["message", "messages", "رسالة", "رسائل"].includes(safeText(row.contactMethod))) return "messages";
  if (safeText(row.call) || ["call", "اتصال"].includes(safeText(row.contactMethod))) return "call";
  if (safeText(row.visit) || ["visit", "زيارة"].includes(safeText(row.contactMethod))) return "visit";
  return "";
}

function isRowFilled(row) {
  return Object.values(row || {}).some((value) => safeText(value));
}

function splitNames(value) {
  return safeText(value)
    .split(/[\n،,؛;]+/u)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function blankSections() {
  return Object.fromEntries(sections.map((section) => [section.id, Array.from({ length: EMPTY_ROW_COUNT }, () => ({}))]));
}

function normalizeSections(report) {
  const nextSections = {
    ...blankSections(),
    ...(report?.sections || {}),
  };
  sections.forEach((section) => {
    nextSections[section.id] = Array.isArray(nextSections[section.id]) && nextSections[section.id].length ? nextSections[section.id] : [{}];
  });

  const correctionRowsAlreadyExist = (nextSections.correctionFollowup || []).some(isRowFilled);
  if (!correctionRowsAlreadyExist) {
    const migratedCorrectionRows = [];
    const teacherNoteRows = [];
    (nextSections.teacherNotes || []).forEach((row) => {
      const hasCorrectionData = ["students", "lastCorrectionDate", "followedCount", "featuredNotebooks", "excellentCount"].some((field) => safeText(row?.[field]));
      const hasTeacherNoteDetails = ["notes", "action"].some((field) => safeText(row?.[field]));
      const cleanTeacherNote = {
        teacher: row?.teacher || "",
        subject: row?.subject || "",
        className: row?.className || "",
        notes: row?.notes || "",
        action: row?.action || "",
      };
      if (hasCorrectionData) {
        migratedCorrectionRows.push({
          teacher: row?.teacher || "",
          subject: row?.subject || "",
          className: row?.className || "",
          students: row?.students || "",
          lastCorrectionDate: row?.lastCorrectionDate || "",
          followedCount: row?.followedCount || "",
          featuredNotebooks: row?.featuredNotebooks || "",
          excellentCount: row?.excellentCount || "",
        });
      }
      if ((hasTeacherNoteDetails || !hasCorrectionData) && isRowFilled(cleanTeacherNote)) teacherNoteRows.push(cleanTeacherNote);
    });
    nextSections.teacherNotes = teacherNoteRows.length ? teacherNoteRows : [{}];
    nextSections.correctionFollowup = migratedCorrectionRows.filter(isRowFilled);
    if (!nextSections.correctionFollowup.length) nextSections.correctionFollowup = [{}];
  }
  sections.forEach((section) => {
    nextSections[section.id] = (nextSections[section.id] || [{}]).map((row) => {
      const nextRow = { ...row };
      section.fields.forEach(([field]) => {
        if (isNumericReportField(section.id, field)) nextRow[field] = safeNumberText(nextRow[field]);
        if (section.id === "absences" && field === "stage") nextRow[field] = normalizeAbsenceStage(nextRow[field]);
      });
      if (section.id === "parentNotes") {
        const contactMethod = normalizeParentContactMethod(nextRow);
        parentContactOptions.forEach(([field, label]) => {
          nextRow[field] = contactMethod === field ? label : "";
        });
      }
      return nextRow;
    });
  });
  return nextSections;
}

function todayIso() {
  return localToday();
}

function validDateIso(value, fallback = todayIso()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : fallback;
}

function monthIso(value = todayIso()) {
  return String(value || todayIso()).slice(0, 7);
}

function reportMatchesPeriod(report, filters = {}) {
  const mode = ["month", "day", "all"].includes(filters.periodMode) ? filters.periodMode : "month";
  const reportDate = validDateIso(report?.date, "");
  if (mode === "all") return true;
  if (!reportDate) return false;
  if (mode === "month") return monthIso(reportDate) === monthIso(filters.month || filters.date || todayIso());
  return reportDate === validDateIso(filters.date, todayIso());
}

function blankReport(currentUser, today) {
  return {
    id: createUuid(),
    type: "daily",
    date: today,
    schoolId: currentUser?.schoolId || "school-1",
    supervisorId: currentUser?.id || "",
    status: "draft",
    sections: blankSections(),
    buildingNotes: "",
    suggestions: "",
    deputyTeacherSummary: "",
    deputyLearnerSummary: "",
    deputyParentSummary: "",
    deputyBuildingSummary: "",
    deputyRecommendations: "",
    submittedAt: "",
    deputyApprovedAt: "",
    deputyApprovedBy: "",
    principalApprovedAt: "",
    principalApprovedBy: "",
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

function normalizeReport(report, currentUser, today) {
  const base = blankReport(currentUser, today);
  const normalized = {
    ...base,
    ...report,
    sections: normalizeSections(report),
  };
  normalized.date = validDateIso(normalized.date, today);
  return normalized;
}

export function createAdministrativeReportsModule(getContext) {
  let reportBackfillInFlight = false;

  function modalBodyScrollTop() {
    if (typeof document === "undefined") return 0;
    return document.querySelector(".admin-report-modal-body")?.scrollTop || 0;
  }

  function openedReportSections(extraSectionId = "") {
    if (typeof document === "undefined") return extraSectionId ? { [extraSectionId]: true } : {};
    const openSections = {};
    document.querySelectorAll(".admin-report-section[data-section-id][open]").forEach((element) => {
      const sectionId = element.getAttribute("data-section-id");
      if (sectionId) openSections[sectionId] = true;
    });
    if (extraSectionId) openSections[extraSectionId] = true;
    return openSections;
  }

  function restoreReportModalPosition(scrollTop, sectionId = "") {
    if (typeof document === "undefined") return;
    requestAnimationFrame(() => {
      const body = document.querySelector(".admin-report-modal-body");
      if (body) body.scrollTop = scrollTop;
      if (!sectionId) return;
      const entries = document.querySelectorAll(`.admin-section-${sectionId}`);
      const entry = entries[entries.length - 1];
      entry?.classList.add("admin-report-entry-added");
      window.setTimeout(() => entry?.classList.remove("admin-report-entry-added"), 900);
    });
  }

  function roleOf(user = getContext().state.currentUser) {
    return normalizeRole(user?.role);
  }

  function canViewAdministrativeReports(user = getContext().state.currentUser) {
    return ["general_manager", "school_principal", "deputy_principal", "stage_supervisor", "tracker"].includes(roleOf(user));
  }

  function canCreateDailyReport(user = getContext().state.currentUser) {
    return ["stage_supervisor", "deputy_principal", "school_principal", "general_manager"].includes(roleOf(user));
  }

  function hasFullAdministrativeControl(user = getContext().state.currentUser) {
    return roleOf(user) === "general_manager";
  }

  function canChooseReportOwner(user = getContext().state.currentUser) {
    return ["deputy_principal", "school_principal", "general_manager"].includes(roleOf(user));
  }

  function canDeputyApprove(user = getContext().state.currentUser) {
    return ["deputy_principal", "general_manager"].includes(roleOf(user));
  }

  function canPrincipalApprove(user = getContext().state.currentUser) {
    return ["school_principal", "general_manager"].includes(roleOf(user));
  }

  function isPrincipalLockedReport(report) {
    return report?.status === "principal_approved" || Boolean(report?.principalApprovedAt || report?.principalApprovedBy);
  }

  function canEditPrincipalLockedReport(report, user = getContext().state.currentUser) {
    return !isPrincipalLockedReport(report) || canPrincipalApprove(user);
  }

  function canDeleteAdministrativeReport(report, user = getContext().state.currentUser) {
    if (!report || !user) return false;
    if (isPrincipalLockedReport(report)) return canPrincipalApprove(user);
    if (hasFullAdministrativeControl(user)) return true;
    const role = roleOf(user);
    if (["school_principal", "deputy_principal"].includes(role)) return report.schoolId === user.schoolId;
    return role === "stage_supervisor" && report.supervisorId === user.id;
  }

  function reports() {
    const { state } = getContext();
    state.administrativeReports = (state.administrativeReports || []).map((report) => normalizeReport(report, state.currentUser, todayIso()));
    return state.administrativeReports;
  }

  function load() {
    const { state } = getContext();
    state.administrativeReports = readJson(REPORTS_KEY, []).map((report) => normalizeReport(report, state.currentUser, todayIso()));
    state.stageSupervisorColors = readJson(COLORS_KEY, {});
  }

  function persist() {
    const { state } = getContext();
    writeJson(REPORTS_KEY, state.administrativeReports || []);
    writeJson(COLORS_KEY, state.stageSupervisorColors || {});
  }

  function supervisorUsers() {
    const { state } = getContext();
    return (state.users || []).filter((user) => normalizeRole(user.role) === "stage_supervisor" && user.status !== "inactive");
  }

  function scopedSchoolIds() {
    const { state } = getContext();
    if (roleOf() === "general_manager") {
      const schoolId = state.administrativeReportFilters?.schoolId || state.activeSchoolId || "all";
      return schoolId === "all" ? null : [schoolId];
    }
    if (roleOf() === "tracker") {
      const ids = linkedSchoolIds(state.currentUser);
      const selected = state.administrativeReportFilters?.schoolId || state.activeSchoolId || "all";
      if (selected !== "all" && ids.includes(selected)) return [selected];
      return ids.length ? ids : [state.currentUser?.schoolId].filter(Boolean);
    }
    return [state.currentUser?.schoolId].filter(Boolean);
  }

  function visibleReports() {
    const { state } = getContext();
    const filters = state.administrativeReportFilters || {};
    const schoolScope = scopedSchoolIds();
    return reports()
      .filter((report) => !schoolScope || schoolScope.includes(report.schoolId))
      .filter((report) => reportMatchesPeriod(report, filters))
      .filter((report) => (filters.supervisorId && filters.supervisorId !== "all" ? report.supervisorId === filters.supervisorId : true))
      .filter((report) => (roleOf() === "stage_supervisor" ? report.supervisorId === state.currentUser?.id : true))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  function scopedSupervisorUsers() {
    const { state } = getContext();
    const filters = state.administrativeReportFilters || {};
    return supervisorUsers().filter((user) => {
      if (roleOf() === "tracker") {
        const ids = linkedSchoolIds(state.currentUser);
        return (ids.length ? ids : [state.currentUser?.schoolId]).includes(user.schoolId);
      }
      if (roleOf() !== "general_manager") return user.schoolId === state.currentUser?.schoolId;
      return !filters.schoolId || filters.schoolId === "all" || user.schoolId === filters.schoolId;
    });
  }

  function effectivePrintSupervisorId(supervisors = scopedSupervisorUsers()) {
    const { state } = getContext();
    const filters = state.administrativeReportFilters || {};
    if (filters.printSupervisorId && filters.printSupervisorId !== "all" && supervisors.some((user) => user.id === filters.printSupervisorId)) {
      return filters.printSupervisorId;
    }
    if (filters.supervisorId && filters.supervisorId !== "all" && supervisors.some((user) => user.id === filters.supervisorId)) {
      return filters.supervisorId;
    }
    return supervisors[0]?.id || "";
  }

  function printScopedReports(reportList) {
    const { state } = getContext();
    const filters = state.administrativeReportFilters || {};
    if ((filters.printScope || "all") !== "supervisor") return reportList;
    const supervisorId = effectivePrintSupervisorId();
    return supervisorId ? reportList.filter((report) => report.supervisorId === supervisorId) : [];
  }

  function isReportPendingSync(reportId) {
    const { state } = getContext();
    return (state.offlineQueue || []).some((entry) =>
      entry.type === "save" &&
      entry.collectionName === "administrativeReports" &&
      entry.docId === reportId
    );
  }

  async function backfillSubmittedReportsToCloud() {
    const { supabase, state } = getContext();
    if (reportBackfillInFlight || !state.currentUser || !supabase?.isCloudEnabled?.()) return;
    const candidates = reports().filter((report) =>
      ["submitted", "deputy_approved", "principal_approved"].includes(report.status) &&
      !isReportPendingSync(report.id) &&
      (roleOf() !== "stage_supervisor" || report.supervisorId === state.currentUser?.id)
    );
    if (!candidates.length) return;
    reportBackfillInFlight = true;
    try {
      for (const report of candidates.slice(0, 8)) {
        const exists = await supabase.verifyCloudDocExists?.("administrativeReports", report.id).catch(() => true);
        if (!exists) await supabase.saveCloudDoc?.("administrativeReports", report.id, report, false);
      }
    } catch (error) {
      console.warn("Administrative report cloud backfill failed", error);
    } finally {
      reportBackfillInFlight = false;
    }
  }

  function missingSupervisors(supervisors, reportList) {
    const reportedSupervisorIds = new Set(reportList.map((report) => report.supervisorId));
    return supervisors.filter((user) => !reportedSupervisorIds.has(user.id));
  }

  function schoolName(id) {
    const { state, safe } = getContext();
    return safe((state.schools || []).find((school) => school.id === id)?.name || "غير محدد");
  }

  function supervisorName(id) {
    const { state, safe } = getContext();
    return safe((state.users || []).find((user) => user.id === id)?.name || "غير محدد");
  }

  function supervisorColor(supervisorId) {
    const { state } = getContext();
    return state.stageSupervisorColors?.[supervisorId] || colorFromId(supervisorId);
  }

  function colorFromId(id = "") {
    const hash = String(id).split("").reduce((total, char) => total + char.charCodeAt(0), 0);
    return SUPERVISOR_COLORS[hash % SUPERVISOR_COLORS.length];
  }

  function statusLabel(status) {
    return {
      draft: "مسودة",
      submitted: "مرفوع للوكيل",
      deputy_approved: "معتمد من الوكيل",
      principal_approved: "معتمد من المدير",
    }[status] || status || "مسودة";
  }

  function statusClass(status) {
    return `admin-status-${String(status || "draft").replaceAll("_", "-")}`;
  }

  function countSection(report, sectionId) {
    return ((report.sections?.[sectionId] || []).filter(isRowFilled)).length;
  }

  function countTotals(report) {
    const absencesRows = (report.sections?.absences || []).filter(isRowFilled);
    return {
      teacherPositives: countSection(report, "teacherPositives"),
      teacherNotes: countSection(report, "teacherNotes"),
      correctionFollowup: countSection(report, "correctionFollowup"),
      learnerPositives: countSection(report, "learnerPositives"),
      learnerViolations: countSection(report, "learnerViolations"),
      parentNotes: countSection(report, "parentNotes"),
      followupNotebooks: countSection(report, "followupNotebooks"),
      absencesRecords: absencesRows.length,
      absentTotal: absencesRows.reduce((sum, row) => sum + numberValue(row.absent), 0),
      excusedTotal: absencesRows.reduce((sum, row) => sum + numberValue(row.excused), 0),
      repliedTotal: absencesRows.reduce((sum, row) => sum + numberValue(row.replied), 0),
      notRepliedTotal: absencesRows.reduce((sum, row) => sum + numberValue(row.notReplied), 0),
    };
  }

  function absenceStageTotals(reportList) {
    const totals = Object.fromEntries(Object.keys(absenceStageLabels).map((stage) => [stage, { records: 0, absent: 0, excused: 0, replied: 0, notReplied: 0 }]));
    reportList.forEach((report) => {
      (report.sections?.absences || []).filter(isRowFilled).forEach((row) => {
        const stage = normalizeAbsenceStage(row.stage);
        if (!stage || !totals[stage]) return;
        totals[stage].records += 1;
        totals[stage].absent += numberValue(row.absent);
        totals[stage].excused += numberValue(row.excused);
        totals[stage].replied += numberValue(row.replied);
        totals[stage].notReplied += numberValue(row.notReplied);
      });
    });
    return totals;
  }

  function suggestionListId(sectionId, field) {
    return `admin-suggestions-${sectionId}-${field}`;
  }

  function suggestionValues(sectionId, field) {
    const values = new Set();
    reports().forEach((report) => {
      (report.sections?.[sectionId] || []).forEach((row) => {
        splitNames(row?.[field]).forEach((name) => values.add(name));
      });
    });
    return [...values].sort((a, b) => a.localeCompare(b, "ar")).slice(0, 80);
  }

  function renderSuggestionLists(section) {
    const { safe } = getContext();
    return section.fields
      .filter(([field]) => suggestionFields.has(field))
      .map(([field]) => {
        const values = suggestionValues(section.id, field);
        if (!values.length) return "";
        return `<datalist id="${safe(suggestionListId(section.id, field))}">${values.map((value) => `<option value="${safe(value)}"></option>`).join("")}</datalist>`;
      })
      .join("");
  }

  function aggregateNameSummaries(reportList) {
    return sections.flatMap((section) =>
      (summaryNameFields[section.id] || []).map(([field, label]) => {
        const counts = new Map();
        reportList.forEach((report) => {
          (report.sections?.[section.id] || []).forEach((row) => {
            splitNames(row?.[field]).forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
          });
        });
        return {
          id: `${section.id}.${field}`,
          title: label,
          rows: [...counts.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ar")),
        };
      }),
    ).filter((group) => group.rows.length);
  }

  function fieldValueForSummary(sectionId, field, value) {
    if (sectionId === "absences" && field === "stage") {
      return absenceStageLabels[normalizeAbsenceStage(value)] || "";
    }
    return safeText(value);
  }

  function aggregateDigestSummaries(reportList) {
    const textGroups = [];
    const numericRows = [];
    sections.forEach((section) => {
      section.fields.forEach(([field, label]) => {
        const fieldName = reportFieldName(section.id, field);
        if (isNumericReportField(section.id, field)) {
          const total = reportList.reduce((sum, report) =>
            sum + (report.sections?.[section.id] || []).filter(isRowFilled).reduce((sectionSum, row) => sectionSum + numberValue(row[field]), 0), 0);
          if (total) numericRows.push({ section: section.title, label, total });
          return;
        }
        const counts = new Map();
        reportList.forEach((report) => {
          (report.sections?.[section.id] || []).filter(isRowFilled).forEach((row) => {
            const value = fieldValueForSummary(section.id, field, row[field]);
            splitNames(value).forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
          });
        });
        const rows = [...counts.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ar"));
        if (rows.length) textGroups.push({ id: fieldName, title: `${section.title} - ${label}`, rows });
      });
    });
    topLevelDigestFields.forEach(([field, label]) => {
      const counts = new Map();
      reportList.forEach((report) => {
        splitNames(report[field]).forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
      });
      const rows = [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ar"));
      if (rows.length) textGroups.push({ id: field, title: label, rows });
    });
    return { textGroups, numericRows };
  }

  function supervisorAbsenceDigest(reportList) {
    const groups = new Map();
    const blankTotals = () => ({
      records: 0,
      absent: 0,
      excused: 0,
      replied: 0,
      notReplied: 0,
      basic: { records: 0, absent: 0, excused: 0, replied: 0, notReplied: 0 },
      secondary: { records: 0, absent: 0, excused: 0, replied: 0, notReplied: 0 },
    });
    reportList.forEach((report) => {
      const key = report.supervisorId || `unknown-${report.schoolId || ""}`;
      const group = groups.get(key) || {
        supervisorId: report.supervisorId,
        schoolId: report.schoolId,
        totals: blankTotals(),
      };
      (report.sections?.absences || []).filter(isRowFilled).forEach((row) => {
        const stage = normalizeAbsenceStage(row.stage);
        const absent = numberValue(row.absent);
        const excused = numberValue(row.excused);
        const replied = numberValue(row.replied);
        const notReplied = numberValue(row.notReplied);
        group.totals.records += 1;
        group.totals.absent += absent;
        group.totals.excused += excused;
        group.totals.replied += replied;
        group.totals.notReplied += notReplied;
        if (stage && group.totals[stage]) {
          group.totals[stage].records += 1;
          group.totals[stage].absent += absent;
          group.totals[stage].excused += excused;
          group.totals[stage].replied += replied;
          group.totals[stage].notReplied += notReplied;
        }
      });
      groups.set(key, group);
    });
    return [...groups.values()]
      .filter((group) => group.totals.records || group.totals.absent || group.totals.excused || group.totals.replied || group.totals.notReplied)
      .sort((a, b) => supervisorName(a.supervisorId).localeCompare(supervisorName(b.supervisorId), "ar"));
  }

  function summaryTotals(reportList) {
    return reportList.reduce(
      (total, report) => {
        const reportCounts = countTotals(report);
        Object.entries(reportCounts).forEach(([key, value]) => {
          total[key] = (total[key] || 0) + value;
        });
        total.reports += 1;
        if (report.status === "principal_approved") total.finalApproved += 1;
        else if (report.status === "deputy_approved") total.deputyApproved += 1;
        else if (report.status === "submitted") total.submitted += 1;
        else total.drafts += 1;
        return total;
      },
      {
        reports: 0,
        finalApproved: 0,
        deputyApproved: 0,
        submitted: 0,
        drafts: 0,
        teacherPositives: 0,
        teacherNotes: 0,
        correctionFollowup: 0,
        learnerPositives: 0,
        learnerViolations: 0,
        parentNotes: 0,
        followupNotebooks: 0,
        absencesRecords: 0,
        absentTotal: 0,
        excusedTotal: 0,
        repliedTotal: 0,
        notRepliedTotal: 0,
      },
    );
  }

  function groupedReportsBySupervisor(reportList) {
    const groups = new Map();
    reportList.forEach((report) => {
      const key = report.supervisorId || `unknown-${report.schoolId || "school"}`;
      const group = groups.get(key) || {
        supervisorId: report.supervisorId,
        schoolId: report.schoolId,
        reports: [],
      };
      group.reports.push(report);
      group.schoolId = group.schoolId || report.schoolId;
      groups.set(key, group);
    });
    return [...groups.values()]
      .map((group) => {
        const sortedReports = [...group.reports].sort((a, b) => {
          const byDate = String(b.date || "").localeCompare(String(a.date || ""));
          if (byDate) return byDate;
          return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
        });
        return {
          ...group,
          reports: sortedReports,
          latest: sortedReports[0],
          totals: summaryTotals(sortedReports),
        };
      })
      .sort((a, b) => supervisorName(a.supervisorId).localeCompare(supervisorName(b.supervisorId), "ar"));
  }

  function groupedReportsByDay(reports = []) {
    const groups = new Map();
    reports.forEach((report) => {
      const key = report.date || "بدون تاريخ";
      const group = groups.get(key) || { date: report.date || "", reports: [] };
      group.reports.push(report);
      groups.set(key, group);
    });
    return [...groups.values()].map((group) => {
      const sortedReports = [...group.reports].sort((a, b) =>
        String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
      return {
        ...group,
        reports: sortedReports,
        latest: sortedReports[0],
        totals: summaryTotals(sortedReports),
      };
    }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }

  function mergeReportsForView(reportList = []) {
    const sortedReports = [...reportList].sort((a, b) =>
      String(a.createdAt || a.updatedAt || "").localeCompare(String(b.createdAt || b.updatedAt || "")));
    const base = normalizeReport(sortedReports[0], getContext().state.currentUser, todayIso());
    const mergedSections = blankSections();
    sections.forEach((section) => {
      mergedSections[section.id] = sortedReports
        .flatMap((report) => normalizeReport(report, getContext().state.currentUser, todayIso()).sections?.[section.id] || [])
        .filter(isRowFilled);
      if (!mergedSections[section.id].length) mergedSections[section.id] = [{}];
    });
    const textFields = ["buildingNotes", "suggestions", ...deputyFields.map(([field]) => field)];
    const merged = {
      ...base,
      id: sortedReports.map((report) => report.id).join(","),
      status: "merged",
      sections: mergedSections,
      sourceReportIds: sortedReports.map((report) => report.id),
    };
    textFields.forEach((field) => {
      const values = sortedReports.map((report) => String(report[field] || "").trim()).filter(Boolean);
      merged[field] = [...new Set(values)].join("\n");
    });
    return merged;
  }

  function groupedStatusLabel(group) {
    const totals = group.totals || summaryTotals(group.reports || []);
    if (totals.reports <= 1) return statusLabel(group.latest?.status);
    if (totals.finalApproved === totals.reports) return "كلها معتمدة من المدير";
    if (totals.finalApproved) return "بعضها معتمد من المدير";
    if (totals.deputyApproved === totals.reports) return "كلها معتمدة من الوكيل";
    if (totals.deputyApproved) return "بعضها معتمد من الوكيل";
    if (totals.submitted === totals.reports) return "كلها مرفوعة للوكيل";
    if (totals.submitted) return "بعضها مرفوع للوكيل";
    return "مسودات";
  }

  function groupedStatusClass(group) {
    const totals = group.totals || summaryTotals(group.reports || []);
    if (totals.finalApproved) return statusClass("principal_approved");
    if (totals.deputyApproved) return statusClass("deputy_approved");
    if (totals.submitted) return statusClass("submitted");
    return statusClass("draft");
  }

  function setFilter(key, value) {
    const { state, render } = getContext();
    const previous = state.administrativeReportFilters || {};
    const next = { ...previous, [key]: String(value || "") };
    if (key === "periodMode" && !["month", "day", "all"].includes(next.periodMode)) next.periodMode = "month";
    if (key === "printType") next.periodMode = next.printType === "monthly" ? "month" : "day";
    if (key === "date") next.date = validDateIso(next.date, todayIso());
    if (key === "month") next.month = /^\d{4}-\d{2}$/.test(next.month) ? next.month : monthIso(todayIso());
    if (key === "schoolId") {
      next.schoolId = next.schoolId || "all";
      if (next.supervisorId && next.supervisorId !== "all") {
        const supervisor = supervisorUsers().find((user) => user.id === next.supervisorId);
        if (supervisor && next.schoolId !== "all" && supervisor.schoolId !== next.schoolId) next.supervisorId = "all";
      }
      next.printSupervisorId = "";
    }
    if (key === "supervisorId" && next.supervisorId !== "all" && !scopedSupervisorUsers().some((user) => user.id === next.supervisorId)) next.supervisorId = "all";
    if (key === "printScope" && next.printScope !== "supervisor") next.printSupervisorId = "";
    state.administrativeReportFilters = next;
    render();
  }

  function setTab(tab) {
    const { state, render } = getContext();
    state.administrativeReportFilters = { ...(state.administrativeReportFilters || {}), tab };
    render();
  }

  function setSupervisorColor(supervisorId, color) {
    const { state, showToast, render } = getContext();
    if (!canDeputyApprove() || !supervisorId || !SUPERVISOR_COLORS.includes(color)) return;
    state.stageSupervisorColors = { ...(state.stageSupervisorColors || {}), [supervisorId]: color };
    persist();
    showToast?.("تم تحديث لون المشرف.");
    render();
  }

  function metricCard(label, value, tone = "blue") {
    const { safe } = getContext();
    return `<article class="admin-report-metric ${tone}"><span>${safe(label)}</span><strong>${safe(value)}</strong></article>`;
  }

  function renderAdministrativeReports() {
    const { state, safe, icons } = getContext();
    const currentDay = todayIso();
    if (!canViewAdministrativeReports()) {
      return `<section class="empty-state"><h2>لا تملك صلاحية عرض تقارير الإشراف.</h2></section>`;
    }

    state.administrativeReportFilters = {
      date: currentDay,
      month: monthIso(currentDay),
      periodMode: "month",
      supervisorId: "all",
      schoolId: ["general_manager", "tracker"].includes(roleOf()) ? "all" : state.activeSchoolId || "all",
      tab: "daily",
      printType: "daily",
      printMode: "both",
      printScope: "all",
      printSupervisorId: "",
      ...(state.administrativeReportFilters || {}),
    };

    const filters = state.administrativeReportFilters;
    const schools = state.schools || [];
    const supervisors = scopedSupervisorUsers();
    const reportList = visibleReports();
    const totals = summaryTotals(reportList);
    const missing = missingSupervisors(supervisors, reportList);
    const tab = filters.tab || "daily";
    backfillSubmittedReportsToCloud();

    return `
      <section class="admin-report-page">
        <div class="admin-report-hero">
          <div>
            <span>مهام المدارس</span>
            <h2>تقرير الإشراف الإداري</h2>
          </div>
          ${canCreateDailyReport() ? `<button class="btn admin-new-report-btn" type="button" onclick="actions.openAdministrativeReport('', 'new')">${icons.plus || "+"} تقرير جديد</button>` : ""}
        </div>

        <div class="admin-report-filters">
          ${
            ["general_manager", "tracker"].includes(roleOf())
              ? `<label><span>الفرع</span><select onchange="actions.setAdministrativeReportFilter('schoolId', this.value)"><option value="all">${roleOf() === "tracker" ? "كل الفروع المرتبطة" : "كل الفروع"}</option>${schools.filter((school) => roleOf() !== "tracker" || linkedSchoolIds(state.currentUser).includes(school.id)).map((school) => `<option value="${safe(school.id)}" ${filters.schoolId === school.id ? "selected" : ""}>${safe(school.name)}</option>`).join("")}</select></label>`
              : ""
          }
          <label><span>الفترة</span><select onchange="actions.setAdministrativeReportFilter('periodMode', this.value)"><option value="month" ${(filters.periodMode || "month") === "month" ? "selected" : ""}>شهر محدد</option><option value="day" ${filters.periodMode === "day" ? "selected" : ""}>يوم محدد</option><option value="all" ${filters.periodMode === "all" ? "selected" : ""}>كل التقارير</option></select></label>
          <label><span>اليوم</span><input type="date" value="${safe(filters.date || currentDay)}" onchange="actions.setAdministrativeReportFilter('date', this.value)" /></label>
          <label><span>الشهر</span><input type="month" value="${safe(filters.month || monthIso(currentDay))}" onchange="actions.setAdministrativeReportFilter('month', this.value)" /></label>
          <label><span>المشرف</span><select onchange="actions.setAdministrativeReportFilter('supervisorId', this.value)"><option value="all">كل المشرفين</option>${supervisors.map((user) => `<option value="${safe(user.id)}" ${filters.supervisorId === user.id ? "selected" : ""}>${safe(user.name)}</option>`).join("")}</select></label>
        </div>

        <div class="admin-report-tabs">
          ${["daily", "monthly", "missing", "colors", "print"].map((item) => `<button type="button" class="${tab === item ? "active" : ""}" onclick="actions.setAdministrativeReportTab('${item}')">${safe({ daily: "اليومي", monthly: "الشهري", missing: "من لم يفعلوا", colors: "تقرير التفعيل", print: "الطباعة" }[item])}</button>`).join("")}
        </div>

        <div class="admin-report-metrics">
          ${metricCard("التقارير", totals.reports, "blue")}
          ${metricCard("اعتماد المدير", totals.finalApproved, "green")}
          ${metricCard("اعتماد الوكيل", totals.deputyApproved, "teal")}
          ${metricCard("لم يرفعوا التقرير", missing.length, "amber")}
        </div>

        ${tab === "daily" ? renderDailyList(reportList) : ""}
        ${tab === "monthly" ? renderMonthlySummary(reportList, missing, filters) : ""}
        ${tab === "missing" ? renderMissingSupervisorsTab(missing, filters) : ""}
        ${tab === "colors" ? renderColorSettings(supervisors) : ""}
        ${tab === "print" ? renderPrintPanel(reportList, totals) : ""}
      </section>
    `;
  }
  function renderMissingSupervisors(missing, filters) {
    const { safe } = getContext();
    const periodLabel = filters.periodMode === "all" ? "كل الفترات" : (filters.periodMode || "month") === "month" ? `شهر ${safe(filters.month || "")}` : `يوم ${safe(filters.date || "")}`;
    if (!missing.length) {
      return `<section class="admin-missing-supervisors complete"><strong>مكتمل</strong><span>كل مشرفي المرحلة رفعوا تقرير الإشراف في ${periodLabel}.</span></section>`;
    }
    return `<section class="admin-missing-supervisors">
      <div>
        <strong>من لم يفعل تقرير الإشراف</strong>
        <span>${periodLabel}</span>
      </div>
      <div class="admin-missing-list">
        ${missing.map((user) => `<span style="--supervisor-color:${supervisorColor(user.id)}">${safe(user.name)} <small>${schoolName(user.schoolId)}</small></span>`).join("")}
      </div>
    </section>`;
  }

  function renderMissingSupervisorsReportField(missing, filters) {
    const { safe } = getContext();
    const periodLabel = filters.periodMode === "all" ? "كل الفترات" : (filters.periodMode || "month") === "month" ? `شهر ${safe(filters.month || "")}` : `يوم ${safe(filters.date || "")}`;
    return `<article class="admin-report-missing-field ${missing.length ? "" : "complete"}">
      <div>
        <span>من لم يفعل تقرير الإشراف</span>
        <strong>${safe(missing.length)}</strong>
      </div>
      <p>${safe(periodLabel)}</p>
      <div class="admin-report-missing-names">
        ${missing.length
          ? missing.map((user) => `<span style="--supervisor-color:${supervisorColor(user.id)}">${safe(user.name)} <small>${safe(schoolName(user.schoolId))}</small></span>`).join("")
          : `<span class="complete">كل المشرفين فعلوا تقرير الإشراف.</span>`}
      </div>
    </article>`;
  }

  function renderMissingSupervisorsTab(missing, filters) {
    return `<section class="admin-monthly-summary admin-missing-supervisors-tab">
      <h3>من لم يفعلوا تقرير الإشراف</h3>
      ${renderMissingSupervisorsReportField(missing, filters)}
    </section>`;
  }

  function renderDailyList(reportList) {
    const { safe, formatDate, icons } = getContext();
    if (!reportList.length) {
      return `<section class="empty-state"><h2>لا توجد تقارير حسب الفلترة الحالية.</h2><p>اختر الشهر الحالي أو كل التقارير، وإذا كان التقرير من جهاز آخر فاضغط مزامنة في ذلك الجهاز.</p></section>`;
    }
    return `<section class="admin-report-list">${groupedReportsBySupervisor(reportList).map((group) => {
      const counts = group.totals;
      const pendingSync = group.reports.some((report) => isReportPendingSync(report.id));
      const dailyGroups = groupedReportsByDay(group.reports);
      return `
        <article class="admin-report-card ${pendingSync ? "admin-report-card-pending-sync" : ""}" style="--supervisor-color:${supervisorColor(group.supervisorId)}">
          <div class="admin-report-card-head">
            <div>
              <h3>${supervisorName(group.supervisorId)}</h3>
              <p>${schoolName(group.schoolId)} - ${safe(group.reports.length)} ${group.reports.length === 1 ? "تقرير" : "تقارير"}</p>
            </div>
            <div class="admin-report-status-stack">
              ${pendingSync ? `<span class="admin-sync-badge">ينتظر المزامنة</span>` : ""}
              <span class="admin-status ${groupedStatusClass(group)}">${safe(groupedStatusLabel(group))}</span>
            </div>
          </div>
          <div class="admin-report-card-stats">
            ${metricCard("إيجابيات", counts.teacherPositives + counts.learnerPositives, "green")}
            ${metricCard("ملاحظات", counts.teacherNotes + counts.learnerViolations + counts.parentNotes, "amber")}
            ${metricCard("تصحيح", counts.correctionFollowup, "teal")}
            ${metricCard("غياب", counts.absentTotal, "blue")}
          </div>
          <div class="admin-report-group-links" aria-label="تقارير ${supervisorName(group.supervisorId)}">
            ${dailyGroups.map((dayGroup) => {
              const reportIds = dayGroup.reports.map((report) => report.id).filter(Boolean);
              const deleteIds = reportIds.join(",");
              const canDeleteGroup = dayGroup.reports.every((report) => canDeleteAdministrativeReport(report));
              const merged = dayGroup.reports.length > 1;
              return `
                <div class="admin-report-group-row">
                  <button class="admin-report-group-link" type="button" onclick="${merged ? `actions.openAdministrativeReportMerged('${safe(deleteIds)}')` : `actions.openAdministrativeReport('${safe(dayGroup.latest?.id || "")}')`}">
                    <span>${safe(merged ? `تقرير مدمج (${dayGroup.reports.length})` : "عرض التقرير")}</span>
                    <small>${safe(formatDate ? formatDate(dayGroup.date) : dayGroup.date)} - ${safe(groupedStatusLabel(dayGroup))}</small>
                  </button>
                  ${canDeleteGroup ? `<button class="admin-report-delete-mini" type="button" onclick="actions.deleteAdministrativeReportGroup('${safe(deleteIds)}')" title="حذف التقرير" aria-label="حذف التقرير">${icons.trash || "حذف"}</button>` : ""}
                </div>
              `;
            }).join("")}
          </div>
        </article>
      `;
    }).join("")}</section>`;
  }

  function renderMonthlySummary(reportList, missing = [], filters = {}) {
    const { safe } = getContext();
    const totals = summaryTotals(reportList);
    const stageTotals = absenceStageTotals(reportList);
    const chartItems = [
      ["إيجابيات المعلمين", totals.teacherPositives, "green"],
      ["ملاحظات المعلمين", totals.teacherNotes, "amber"],
      ["متابعة التصحيح", totals.correctionFollowup, "teal"],
      ["إيجابيات الطلاب", totals.learnerPositives, "blue"],
      ["مخالفات الطلاب", totals.learnerViolations, "teal"],
      ["ملاحظات أولياء الأمور", totals.parentNotes, "violet"],
    ];
    return `<section class="admin-monthly-summary">
      <h3>ملخص شهري من التقارير اليومية</h3>
      ${renderMissingSupervisorsReportField(missing, filters)}
      <div class="admin-report-chart">${chartItems.map(([label, value, tone]) => {
        const total = Math.max(1, chartItems.reduce((sum, [, current]) => sum + current, 0));
        return `<div class="admin-chart-row ${tone}"><span>${label}</span><i style="width:${Math.max(6, Math.round((value / total) * 100))}%"></i><strong>${value}</strong></div>`;
      }).join("")}</div>
      <div class="admin-absence-stage-summary">
        ${Object.entries(absenceStageLabels).map(([stage, label]) => {
          const item = stageTotals[stage] || {};
          return `<article>
            <h4>${safe(label)}</h4>
            <div><span>الغياب</span><strong>${safe(item.absent || 0)}</strong></div>
            <div><span>المستأذنون</span><strong>${safe(item.excused || 0)}</strong></div>
            <div><span>الرد</span><strong>${safe(item.replied || 0)}</strong></div>
            <div><span>لم يرد</span><strong>${safe(item.notReplied || 0)}</strong></div>
          </article>`;
        }).join("")}
      </div>
    </section>`;
  }

  function renderColorSettings(supervisors) {
    const { safe } = getContext();
    if (!canDeputyApprove()) {
      return `<section class="empty-state"><h2>تغيير الألوان متاح للوكيل ومدير الإدارة العامة.</h2></section>`;
    }
    return `<section class="admin-color-grid">${supervisors.map((user) => `
      <article class="admin-color-card">
        <strong>${safe(user.name)}</strong>
        <span>${schoolName(user.schoolId)}</span>
        <div class="admin-color-options">
          ${SUPERVISOR_COLORS.map((color) => `<button type="button" style="background:${color}" class="${supervisorColor(user.id) === color ? "active" : ""}" onclick="actions.setStageSupervisorColor('${safe(user.id)}','${color}')" aria-label="تغيير لون المشرف"></button>`).join("")}
        </div>
      </article>
    `).join("")}</section>`;
  }

  function renderPrintPanel(reportList, totals) {
    const { state, safe, icons } = getContext();
    const filters = state.administrativeReportFilters || {};
    const supervisors = scopedSupervisorUsers();
    const selectedSupervisorId = effectivePrintSupervisorId(supervisors);
    const printableReports = printScopedReports(reportList);
    const printableTotals = summaryTotals(printableReports);
    return `<section class="admin-print-panel">
      <label><span>نوع التقرير</span><select onchange="actions.setAdministrativeReportFilter('printType', this.value)"><option value="daily" ${filters.printType === "daily" ? "selected" : ""}>تقرير يومي</option><option value="monthly" ${filters.printType === "monthly" ? "selected" : ""}>تقرير شهري</option></select></label>
      <label><span>محتوى الطباعة</span><select onchange="actions.setAdministrativeReportFilter('printMode', this.value)"><option value="both" ${filters.printMode === "both" ? "selected" : ""}>الأرقام والبيانات</option><option value="digest" ${filters.printMode === "digest" ? "selected" : ""}>تقرير الخلاصة</option><option value="summary" ${filters.printMode === "summary" ? "selected" : ""}>الأرقام والبيانات ملخص</option><option value="numbers" ${filters.printMode === "numbers" ? "selected" : ""}>الأرقام فقط</option><option value="data" ${filters.printMode === "data" ? "selected" : ""}>البيانات كاملة</option></select></label>
      <label><span>نطاق الطباعة</span><select onchange="actions.setAdministrativeReportFilter('printScope', this.value)"><option value="all" ${(filters.printScope || "all") === "all" ? "selected" : ""}>كل المشرفين حسب الفلاتر</option><option value="supervisor" ${filters.printScope === "supervisor" ? "selected" : ""}>تقرير مشرف فقط</option></select></label>
      <label><span>المشرف للطباعة</span><select onchange="actions.setAdministrativeReportFilter('printSupervisorId', this.value)" ${filters.printScope === "supervisor" ? "" : "disabled"}>${supervisors.map((user) => `<option value="${safe(user.id)}" ${selectedSupervisorId === user.id ? "selected" : ""}>${safe(user.name)}</option>`).join("") || `<option value="">لا يوجد مشرفون</option>`}</select></label>
      <button class="btn admin-official-print-btn" type="button" onclick="actions.printAdministrativeReports()">${icons.print || icons.download || ""} طباعة رسمية PDF</button>
      <div class="admin-print-preview">
        <strong>جاهز للطباعة</strong>
        <span>${safe(printableReports.length)} تقرير - ${safe(printableTotals.finalApproved)} معتمد نهائيا</span>
      </div>
    </section>`;
  }

  function openReport(id = "", mode = "edit") {
    const { state, render } = getContext();
    const currentDay = todayIso();
    if (!canViewAdministrativeReports()) return;
    const existing = id ? reports().find((report) => report.id === id) : null;
    if (!existing && !canCreateDailyReport()) return;
    const draft = existing || blankReport(state.currentUser, currentDay);
    if (!existing && canChooseReportOwner()) {
      const firstSupervisor = supervisorUsers()[0];
      if (firstSupervisor) {
        draft.supervisorId = firstSupervisor.id;
        draft.schoolId = firstSupervisor.schoolId;
      }
    }
    state.modal = { type: "administrative_report", id, mode, report: normalizeReport(draft, state.currentUser, currentDay), openSections: {} };
    render();
  }

  function openMergedReport(idsText = "") {
    const { state, render } = getContext();
    const ids = String(idsText || "").split(",").map((id) => id.trim()).filter(Boolean);
    const selectedReports = reports().filter((report) => ids.includes(report.id));
    if (!selectedReports.length || !canViewAdministrativeReports()) return;
    state.modal = {
      type: "administrative_report",
      id: "",
      mode: "merged",
      report: mergeReportsForView(selectedReports),
      openSections: Object.fromEntries(sections.map((section) => [section.id, true])),
    };
    render();
  }

  function parseRows(form, section) {
    const maxRows = Math.max(...section.fields.map(([field]) => form.getAll(`${section.id}.${field}`).length), 0);
    const rows = [];
    for (let index = 0; index < maxRows; index += 1) {
      const row = {};
      section.fields.forEach(([field]) => {
        const value = form.getAll(`${section.id}.${field}`)[index];
        row[field] = isNumericReportField(section.id, field) ? safeNumberText(value) : safeText(value);
        if (section.id === "absences" && field === "stage") row[field] = normalizeAbsenceStage(value);
      });
      if (section.id === "parentNotes") {
        const contactMethod = normalizeParentContactMethod(row);
        parentContactOptions.forEach(([field, label]) => {
          row[field] = contactMethod === field ? label : "";
        });
      }
      if (isRowFilled(row)) rows.push(row);
    }
    return rows.length ? rows : [{}];
  }

  function parseReportFromForm(event, submit = false) {
    const { state } = getContext();
    const currentDay = todayIso();
    const formElement = event.currentTarget?.tagName === "FORM" ? event.currentTarget : event.currentTarget?.form;
    if (!formElement) return null;
    const form = new FormData(formElement);
    const existing = state.modal?.report || blankReport(state.currentUser, currentDay);
    const fullControl = hasFullAdministrativeControl();
    const ownerControl = canChooseReportOwner();
    const editableBySupervisor = fullControl || canCreateDailyReport();
    const editableByDeputy = fullControl || canDeputyApprove();
    const report = normalizeReport(existing, state.currentUser, currentDay);

    if (editableBySupervisor) {
      report.date = validDateIso(safeText(form.get("date")) || report.date, currentDay);
      if (ownerControl) {
        if (fullControl) report.schoolId = safeText(form.get("schoolId")) || report.schoolId;
        report.supervisorId = safeText(form.get("supervisorId")) || report.supervisorId;
        const selectedSupervisor = supervisorUsers().find((user) => user.id === report.supervisorId);
        if (selectedSupervisor && !fullControl) report.schoolId = selectedSupervisor.schoolId;
      }
      report.sections = Object.fromEntries(sections.map((section) => [section.id, parseRows(form, section)]));
      report.buildingNotes = safeText(form.get("buildingNotes"));
      report.suggestions = safeText(form.get("suggestions"));
    }

    if (editableByDeputy) {
      deputyFields.forEach(([field]) => {
        report[field] = safeText(form.get(field));
      });
    }

    if (submit) {
      report.status = "submitted";
      report.submittedAt = report.submittedAt || new Date().toISOString();
    }
    report.updatedAt = new Date().toISOString();
    return report;
  }

  async function saveReportFromEvent(event, submit = false, closeModal = true) {
    event.preventDefault();
    const { state, showToast, render, supabase } = getContext();
    const report = parseReportFromForm(event, submit);
    if (!report) return null;
    const existingReport = reports().find((item) => item.id === report.id);
    if (isPrincipalLockedReport(existingReport) && !canEditPrincipalLockedReport(existingReport)) {
      showToast?.("تم اعتماد التقرير من المدير، ولا يمكن تعديله إلا من المدير.");
      return null;
    }
    const nextReports = reports().filter((item) => item.id !== report.id);
    state.administrativeReports = [report, ...nextReports];
    persist();
    if (supabase?.isCloudEnabled?.()) {
      try {
        const saveResult = await supabase.saveCloudDoc?.("administrativeReports", report.id, report, false);
        if (saveResult?.queued) {
          if (closeModal) state.modal = null;
          showToast?.("تم حفظ التقرير محليا ولم يصل للوكيل بعد. اضغط مزامنة عند توفر الإنترنت.");
          render();
          return report;
        }
        if (saveResult?.id && saveResult.id !== report.id) {
          report.id = saveResult.id;
          persist();
        }
        const savedOnServer = await supabase.verifyCloudDocExists?.("administrativeReports", report.id);
        if (!savedOnServer) {
          state.offlineQueue = [
            ...(state.offlineQueue || []),
            { id: createUuid(), type: "save", collectionName: "administrativeReports", docId: report.id, data: report, merge: false, createdAt: new Date().toISOString() },
          ];
          localStorage.setItem(getContext().OFFLINE_QUEUE_KEY, JSON.stringify(state.offlineQueue));
          if (closeModal) state.modal = null;
          showToast?.("لم يتم تأكيد وصول التقرير للسيرفر. تم وضعه في المزامنة، اضغط زر مزامنة ثم تحديث.");
          render();
          return report;
        }
        await supabase.refreshCloudData?.(false, { deferSecondary: true, secondaryDelay: 250 });
      } catch (error) {
        showToast?.(`تم حفظ التقرير في هذا الجهاز، لكن لم يتم رفعه للسيرفر: ${supabase.formatCloudError?.(error, "تحقق من الاتصال أو الصلاحيات ثم اضغط مزامنة.") || "تحقق من الاتصال أو الصلاحيات ثم اضغط مزامنة."}`);
        render();
        return report;
      }
    }
    if (closeModal) state.modal = null;
    showToast?.(submit ? "تم حفظ التقرير ورفعه للوكيل." : "تم حفظ التقرير بنجاح.");
    render();
    return report;
  }

  async function saveReport(event, submit = false) {
    await saveReportFromEvent(event, submit, true);
  }

  async function approveByDeputy(id) {
    const { state, showToast, render, supabase } = getContext();
    if (!canDeputyApprove()) return;
    const report = reports().find((item) => item.id === id);
    if (!report) return;
    if (!canEditPrincipalLockedReport(report)) {
      showToast?.("تم اعتماد التقرير من المدير، ولا يمكن تعديله إلا من المدير.");
      return;
    }
    report.status = "deputy_approved";
    report.deputyApprovedAt = new Date().toISOString();
    report.deputyApprovedBy = state.currentUser?.id || "";
    report.updatedAt = new Date().toISOString();
    persist();
    if (supabase?.isCloudEnabled?.()) await supabase.saveCloudDoc?.("administrativeReports", report.id, report, false);
    state.modal = null;
    showToast?.("تم اعتماد التقرير من الوكيل.");
    render();
  }

  async function saveAndApproveByDeputy(event, id) {
    const saved = await saveReportFromEvent(event, false, false);
    if (saved) await approveByDeputy(saved.id || id);
  }

  async function approveByPrincipal(id) {
    const { state, showToast, render, supabase } = getContext();
    if (!canPrincipalApprove()) return;
    const report = reports().find((item) => item.id === id);
    if (!report) return;
    report.status = "principal_approved";
    report.principalApprovedAt = new Date().toISOString();
    report.principalApprovedBy = state.currentUser?.id || "";
    report.updatedAt = new Date().toISOString();
    persist();
    if (supabase?.isCloudEnabled?.()) await supabase.saveCloudDoc?.("administrativeReports", report.id, report, false);
    state.modal = null;
    showToast?.("تم اعتماد التقرير من المدير.");
    render();
  }

  async function deleteAdministrativeReportGroup(idsText = "") {
    const { state, showToast, render, supabase, OFFLINE_QUEUE_KEY } = getContext();
    const ids = String(idsText || "").split(",").map((id) => id.trim()).filter(Boolean);
    if (!ids.length) return;
    const selectedReports = reports().filter((report) => ids.includes(report.id));
    if (!selectedReports.length) return;
    if (!selectedReports.every((report) => canDeleteAdministrativeReport(report))) {
      showToast?.("لا تملك صلاحية حذف هذا التقرير.");
      return;
    }
    const merged = selectedReports.length > 1;
    const confirmed = window.confirm(merged ? "سيتم حذف التقارير المدمجة لهذا اليوم. هل تريد المتابعة؟" : "هل تريد حذف تقرير الإشراف؟");
    if (!confirmed) return;
    state.administrativeReports = reports().filter((report) => !ids.includes(report.id));
    persist();
    if (supabase?.isCloudEnabled?.()) {
      for (const id of ids) {
        try {
          await supabase.deleteCloudDoc?.("administrativeReports", id);
        } catch (error) {
          state.offlineQueue = [
            ...(state.offlineQueue || []),
            { id: createUuid(), type: "delete", collectionName: "administrativeReports", docId: id, createdAt: new Date().toISOString() },
          ];
          localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(state.offlineQueue));
        }
      }
      await supabase.refreshCloudData?.(false, { deferSecondary: true, secondaryDelay: 250 }).catch(() => {});
    }
    state.modal = null;
    showToast?.(merged ? "تم حذف التقارير المدمجة." : "تم حذف التقرير.");
    render();
  }

  function addSectionRow(event, sectionId) {
    const { state, render } = getContext();
    const scrollTop = modalBodyScrollTop();
    const openSections = openedReportSections(sectionId);
    const report = parseReportFromForm(event, false);
    if (!report?.sections?.[sectionId]) return;
    if (!canEditPrincipalLockedReport(report)) return;
    report.sections[sectionId].push({});
    state.modal = { ...(state.modal || {}), report, openSections };
    render();
    restoreReportModalPosition(scrollTop, sectionId);
  }

  function renderRows(section, report, editable) {
    const { safe } = getContext();
    const rows = report.sections?.[section.id] || [{}];
    return `
      <div class="admin-report-row-list">
        ${rows.map((row, index) => `
          <div class="admin-report-entry admin-section-${safe(section.id)}">
            <strong>${index + 1}</strong>
            <div class="admin-report-fields">
              ${section.fields.map(([field, label]) => {
                const numericField = isNumericReportField(section.id, field);
                if (section.id === "parentNotes" && ["call", "messages"].includes(field)) return "";
                if (section.id === "parentNotes" && field === "visit") {
                  const selectedContact = normalizeParentContactMethod(row);
                  return `
                    <label class="admin-field-parent-contact admin-parent-contact-field">
                      <span>طريقة التواصل</span>
                      ${parentContactOptions.map(([value, text]) => `<input type="hidden" name="${safe(section.id)}.${safe(value)}" value="${safe(selectedContact === value ? text : "")}" />`).join("")}
                      <span class="admin-parent-contact-toggle" role="group" aria-label="اختيار طريقة التواصل مع ولي الأمر">
                        ${parentContactOptions.map(([value, text]) => `
                          <button
                            type="button"
                            class="${selectedContact === value ? "active" : ""}"
                            ${editable ? "" : "disabled"}
                            onclick="const holder=this.closest('.admin-parent-contact-field'); holder.querySelectorAll('input[type=hidden]').forEach((input)=>{ input.value = input.name.endsWith('.${safe(value)}') ? '${safe(text)}' : ''; }); holder.querySelectorAll('button').forEach((btn)=>btn.classList.toggle('active', btn===this));"
                          >${safe(text)}</button>
                        `).join("")}
                      </span>
                    </label>
                  `;
                }
                if (section.id === "absences" && field === "stage") {
                  const selectedStage = normalizeAbsenceStage(row[field]);
                  return `
                    <label class="admin-field-stage admin-stage-field">
                      <span>${safe(label)}</span>
                      <input type="hidden" name="${safe(section.id)}.${safe(field)}" value="${safe(selectedStage)}" />
                      <span class="admin-stage-toggle" role="group" aria-label="اختيار القسم">
                        ${Object.entries(absenceStageLabels).map(([value, text]) => `
                          <button
                            type="button"
                            class="${selectedStage === value ? "active" : ""}"
                            ${editable ? "" : "disabled"}
                            onclick="const holder=this.closest('.admin-stage-field'); holder.querySelector('input').value='${safe(value)}'; holder.querySelectorAll('button').forEach((btn)=>btn.classList.toggle('active', btn===this));"
                          >${safe(text)}</button>
                        `).join("")}
                      </span>
                    </label>
                  `;
                }
                return `
                <label class="admin-field-${safe(field)}">
                  <span>${safe(label)}</span>
                  <input
                    type="${numericField ? "number" : "text"}"
                    name="${safe(section.id)}.${safe(field)}"
                    value="${safe(numericField ? safeNumberText(row[field]) : row[field])}"
                    ${numericField ? `inputmode="numeric" pattern="[0-9]*" min="0" step="1" oninput="this.value=this.value.replace(/[^0-9]/g,'')"` : ""}
                    ${suggestionFields.has(field) ? `list="${safe(suggestionListId(section.id, field))}" autocomplete="off"` : ""}
                    ${editable ? "" : "readonly"}
                  />
                </label>
              `;
              }).join("")}
            </div>
          </div>
        `).join("")}
        ${renderSuggestionLists(section)}
        ${editable ? `<button type="button" class="admin-add-row-btn" onclick="actions.addAdministrativeReportSectionRow(event,'${safe(section.id)}')">+ إضافة جزء جديد</button>` : ""}
      </div>
    `;
  }

  function renderReportModal() {
    const { state, safe, icons } = getContext();
    const report = normalizeReport(state.modal?.report, state.currentUser, todayIso());
    const isNewReport = state.modal?.mode === "new" && !state.modal?.id;
    const isMergedReport = state.modal?.mode === "merged";
    const openSections = state.modal?.openSections || {};
    const sectionOpenAttribute = (sectionId) => (!isNewReport || openSections[sectionId] ? "open" : "");
    const fullControl = hasFullAdministrativeControl();
    const ownerControl = canChooseReportOwner();
    const baseSupervisorEditable = !isMergedReport && (fullControl || ownerControl || (canCreateDailyReport() && report.supervisorId === state.currentUser?.id && !["deputy_approved", "principal_approved"].includes(report.status)));
    const supervisorEditable = baseSupervisorEditable && canEditPrincipalLockedReport(report);
    const deputyEditable = !isMergedReport && (fullControl || canDeputyApprove()) && canEditPrincipalLockedReport(report);
    const schools = state.schools || [];
    const supervisors = supervisorUsers().filter((user) => fullControl || user.schoolId === state.currentUser?.schoolId);

    return `
      <div class="modal">
      <form class="modal-box admin-report-modal ${isNewReport ? "admin-report-modal-new" : ""}" onsubmit="actions.saveAdministrativeReport(event, false)">
        <button type="button" class="icon-btn admin-modal-close" onclick="actions.closeModal()" aria-label="إغلاق">${icons.close || "×"}</button>
        <div class="modal-head">
          <div>
            <span class="eyebrow">تقرير الإشراف الإداري</span>
            <h3>${supervisorName(report.supervisorId)} - ${isMergedReport ? "تقرير مدمج" : statusLabel(report.status)}</h3>
          </div>
        </div>
        <div class="admin-report-modal-body">
          ${ownerControl && !isMergedReport ? `<div class="admin-report-owner-grid">
            ${fullControl ? `<label class="field"><span>الفرع</span><select name="schoolId">${schools.map((school) => `<option value="${safe(school.id)}" ${report.schoolId === school.id ? "selected" : ""}>${safe(school.name)}</option>`).join("")}</select></label>` : `<input type="hidden" name="schoolId" value="${safe(report.schoolId)}" />`}
            <label class="field"><span>المشرف</span><select name="supervisorId">${supervisors.map((user) => `<option value="${safe(user.id)}" ${report.supervisorId === user.id ? "selected" : ""}>${safe(user.name)} - ${schoolName(user.schoolId)}</option>`).join("")}</select></label>
          </div>` : ""}
          <label class="field"><span>التاريخ</span><input type="date" name="date" value="${safe(report.date)}" ${supervisorEditable ? "" : "readonly"} /></label>
          ${isMergedReport ? `<div class="admin-merged-report-note">تم دمج ${safe(report.sourceReportIds?.length || 0)} تقارير لهذا المشرف في نفس اليوم للعرض فقط.</div>` : ""}
          ${sections.map((section) => `
            <details class="admin-report-section" data-section-id="${safe(section.id)}" ${sectionOpenAttribute(section.id)}>
              <summary>${safe(section.title)} <span>${countSection(report, section.id)}</span></summary>
              ${renderRows(section, report, supervisorEditable)}
            </details>
          `).join("")}
          <details class="admin-report-section" data-section-id="generalNotes" ${sectionOpenAttribute("generalNotes")}>
            <summary>ملاحظات عامة</summary>
            <label><span>ملاحظات البيئة المدرسية</span><textarea name="buildingNotes" ${supervisorEditable ? "" : "readonly"}>${safe(report.buildingNotes)}</textarea></label>
            <label><span>مقترحات المشرف</span><textarea name="suggestions" ${supervisorEditable ? "" : "readonly"}>${safe(report.suggestions)}</textarea></label>
          </details>
          <details class="admin-report-section" data-section-id="deputySummary" ${deputyEditable || openSections.deputySummary ? "open" : ""}>
            <summary>ملخص الوكيل</summary>
            ${deputyFields.map(([field, label]) => `<label><span>${safe(label)}</span><textarea name="${safe(field)}" ${deputyEditable ? "" : "readonly"}>${safe(report[field])}</textarea></label>`).join("")}
          </details>
        </div>
        <div class="admin-report-sticky-actions">
          <button type="button" class="btn secondary" onclick="actions.closeModal()">إغلاق</button>
          ${supervisorEditable ? `<button type="submit" class="btn">${icons.save || ""} حفظ</button><button type="button" class="btn" onclick="actions.saveAdministrativeReport(event, true)">${icons.upload || ""} حفظ ورفع للوكيل</button>` : ""}
          ${deputyEditable ? `<button type="button" class="btn" onclick="actions.saveAndApproveAdministrativeReportAsDeputy(event,'${safe(report.id)}')">${icons.approval || ""} اعتماد الوكيل</button>` : ""}
        </div>
      </form>
      </div>
    `;
  }

  function reportRowsForPrint(report, mode) {
    const { safe } = getContext();
    if (mode === "numbers" || mode === "summary") return "";
    const cellValue = (sectionId, field, row) => (sectionId === "absences" && field === "stage" ? absenceStageLabels[normalizeAbsenceStage(row[field])] || "" : row[field]);
    return sections.map((section) => {
      const rows = (report.sections?.[section.id] || []).filter(isRowFilled);
      if (!rows.length) return "";
      return `<h3>${safe(section.title)}</h3><table><thead><tr><th>#</th>${section.fields.map(([, label]) => `<th>${safe(label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td>${section.fields.map(([field]) => `<td>${safe(cellValue(section.id, field, row))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }).join("");
  }

  function summaryRowsForPrint(reportList) {
    const { safe } = getContext();
    const groups = aggregateNameSummaries(reportList);
    if (!groups.length) return "";
    return `<article class="print-report-card print-summary-card">
      <div class="print-report-head">
        <div><h2>ملخص الأسماء المكررة</h2><p>يظهر كل اسم مرة واحدة مع عدد مرات وروده في التقارير المحددة.</p></div>
        <div class="print-badges"><span>ملخص</span><span>${safe(groups.reduce((sum, group) => sum + group.rows.length, 0))} اسم</span></div>
      </div>
      <section class="print-data print-summary-grid">
        ${groups.map((group) => `
          <div class="print-summary-table">
            <h3>${safe(group.title)}</h3>
            <table>
              <thead><tr><th>الاسم</th><th>العدد</th></tr></thead>
              <tbody>${group.rows.map((row) => `<tr><td>${safe(row.name)}</td><td>${safe(row.count)}</td></tr>`).join("")}</tbody>
            </table>
          </div>
        `).join("")}
      </section>
    </article>`;
  }

  function absenceStageRowsForPrint(reportList) {
    const { safe } = getContext();
    const stageTotals = absenceStageTotals(reportList);
    const rows = Object.entries(absenceStageLabels).map(([stage, label]) => ({ label, ...(stageTotals[stage] || {}) }));
    if (!rows.some((row) => row.records || row.absent || row.excused || row.replied || row.notReplied)) return "";
    return `<article class="print-report-card print-summary-card">
      <div class="print-report-head">
        <div><h2>ملخص الغياب والاستئذان حسب القسم</h2><p>تجميع إجمالي لكل المشرفين حسب الأساسي والثانوي.</p></div>
      </div>
      <section class="print-data">
        <table>
          <thead><tr><th>القسم</th><th>عدد السجلات</th><th>الغياب</th><th>المستأذنون</th><th>الرد</th><th>لم يرد</th></tr></thead>
          <tbody>${rows.map((row) => `<tr><td>${safe(row.label)}</td><td>${safe(row.records || 0)}</td><td>${safe(row.absent || 0)}</td><td>${safe(row.excused || 0)}</td><td>${safe(row.replied || 0)}</td><td>${safe(row.notReplied || 0)}</td></tr>`).join("")}</tbody>
        </table>
      </section>
    </article>`;
  }

  function missingSupervisorsRowsForPrint(reportList) {
    const { state, safe } = getContext();
    const filters = state.administrativeReportFilters || {};
    const supervisors = (filters.printScope || "all") === "supervisor"
      ? scopedSupervisorUsers().filter((user) => user.id === effectivePrintSupervisorId())
      : scopedSupervisorUsers();
    const missing = missingSupervisors(supervisors, reportList);
    const periodLabel = filters.periodMode === "all" ? "كل الفترات" : (filters.periodMode || "month") === "month" ? `شهر ${filters.month || ""}` : `يوم ${filters.date || ""}`;
    return `<article class="print-report-card print-summary-card">
      <div class="print-report-head">
        <div><h2>من لم يفعل تقرير الإشراف</h2><p>${safe(periodLabel)}</p></div>
        <div class="print-badges"><span>${safe(missing.length)} مشرف</span></div>
      </div>
      <section class="print-data">
        ${
          missing.length
            ? `<table><thead><tr><th>#</th><th>المشرف</th><th>الفرع</th></tr></thead><tbody>${missing.map((user, index) => `<tr><td>${safe(index + 1)}</td><td>${safe(user.name)}</td><td>${safe(schoolName(user.schoolId))}</td></tr>`).join("")}</tbody></table>`
            : `<p>كل المشرفين فعلوا تقرير الإشراف في الفترة المحددة.</p>`
        }
      </section>
    </article>`;
  }

  function digestRowsForPrint(reportList) {
    const { safe } = getContext();
    const digest = aggregateDigestSummaries(reportList);
    const stageTotals = absenceStageTotals(reportList);
    const supervisorRows = supervisorAbsenceDigest(reportList);
    const stageRows = Object.entries(absenceStageLabels).map(([stage, label]) => ({ label, ...(stageTotals[stage] || {}) }));
    const numericArticle = digest.numericRows.length ? `<article class="print-report-card print-summary-card">
      <div class="print-report-head">
        <div><h2>خلاصة الأرقام المدخلة</h2><p>مجموع كل الخانات الرقمية في التقارير المحددة.</p></div>
      </div>
      <section class="print-data">
        <table>
          <thead><tr><th>القسم</th><th>الخانة</th><th>المجموع</th></tr></thead>
          <tbody>${digest.numericRows.map((row) => `<tr><td>${safe(row.section)}</td><td>${safe(row.label)}</td><td>${safe(row.total)}</td></tr>`).join("")}</tbody>
        </table>
      </section>
    </article>` : "";
    const absenceArticle = `<article class="print-report-card print-summary-card">
      <div class="print-report-head">
        <div><h2>خلاصة الغياب حسب القسم</h2><p>إجمالي الغياب والاستئذان والردود في الأساسي والثانوي.</p></div>
      </div>
      <section class="print-data">
        <table>
          <thead><tr><th>القسم</th><th>عدد السجلات</th><th>الغياب</th><th>المستأذنون</th><th>الرد</th><th>لم يرد</th></tr></thead>
          <tbody>${stageRows.map((row) => `<tr><td>${safe(row.label)}</td><td>${safe(row.records || 0)}</td><td>${safe(row.absent || 0)}</td><td>${safe(row.excused || 0)}</td><td>${safe(row.replied || 0)}</td><td>${safe(row.notReplied || 0)}</td></tr>`).join("")}</tbody>
        </table>
      </section>
    </article>`;
    const supervisorArticle = `<article class="print-report-card">
      <div class="print-report-head">
        <div><h2>خلاصة الغياب حسب المشرف</h2><p>كل مشرف في جدول مستقل مع المجموع الكامل والأساسي والثانوي والردود.</p></div>
      </div>
      <section class="print-data print-supervisor-digest-grid">
        ${supervisorRows.length ? supervisorRows.map((group) => {
          const rows = [
            ["إجمالي سجلات الغياب", group.totals.records],
            ["إجمالي الغياب", group.totals.absent],
            ["غياب الأساسي", group.totals.basic.absent],
            ["غياب الثانوي", group.totals.secondary.absent],
            ["المستأذنون", group.totals.excused],
            ["الرد", group.totals.replied],
            ["لم يرد", group.totals.notReplied],
          ];
          return `<div class="print-supervisor-digest">
            <h3>${safe(supervisorName(group.supervisorId))}</h3>
            <p>${safe(schoolName(group.schoolId))}</p>
            <table>
              <thead><tr><th>البند</th><th>العدد</th></tr></thead>
              <tbody>${rows.map(([label, value]) => `<tr><td>${safe(label)}</td><td>${safe(value || 0)}</td></tr>`).join("")}</tbody>
            </table>
          </div>`;
        }).join("") : `<p>لا توجد بيانات غياب حسب خيارات التصفية الحالية.</p>`}
      </section>
    </article>`;
    const textArticle = digest.textGroups.length ? `<article class="print-report-card">
      <div class="print-report-head">
        <div><h2>حصر البنود المتكررة في التقرير</h2><p>كل خانة مدخلة تم تجميعها مع عدد مرات تكرارها.</p></div>
        <div class="print-badges"><span>${safe(digest.textGroups.length)} خانة</span></div>
      </div>
      <section class="print-data print-summary-grid">
        ${digest.textGroups.map((group) => `
          <div class="print-summary-table">
            <h3>${safe(group.title)}</h3>
            <table>
              <thead><tr><th>البيان</th><th>عدد التكرار</th></tr></thead>
              <tbody>${group.rows.map((row) => `<tr><td>${safe(row.name)}</td><td>${safe(row.count)}</td></tr>`).join("")}</tbody>
            </table>
          </div>
        `).join("")}
      </section>
    </article>` : "";
    return `${missingSupervisorsRowsForPrint(reportList)}${absenceArticle}${supervisorArticle}${numericArticle}${textArticle}`;
  }

  function printAdministrativeReports() {
    const { state, safe, showToast } = getContext();
    const type = state.administrativeReportFilters?.printType || "daily";
    const mode = state.administrativeReportFilters?.printMode || "both";
    const list = printScopedReports(type === "monthly" ? visibleReports() : visibleReports());
    const totals = summaryTotals(list);
    const title = mode === "digest" ? "تقرير خلاصة الإشراف الإداري" : `تقرير الإشراف الإداري ${type === "monthly" ? "الشهري" : "اليومي"}`;
    const modeLabel = { both: "الأرقام والبيانات", digest: "تقرير الخلاصة", summary: "الأرقام والبيانات ملخص", numbers: "الأرقام فقط", data: "البيانات كاملة" }[mode] || "الأرقام والبيانات";
    const printedAt = new Date().toLocaleString("ar-SA");
    const metricCards = (items) => items.map(([label, value, tone]) => `<div class="print-metric ${tone || ""}"><span>${safe(label)}</span><strong>${safe(value || 0)}</strong></div>`).join("");
    const chartRows = [
      ["إيجابيات المعلمين", totals.teacherPositives, "#2563eb"],
      ["ملاحظات المعلمين", totals.teacherNotes, "#d97706"],
      ["متابعة التصحيح", totals.correctionFollowup, "#0f766e"],
      ["إيجابيات الطلاب", totals.learnerPositives, "#0f766e"],
      ["مخالفات الطلاب", totals.learnerViolations, "#7c3aed"],
      ["ملاحظات أولياء الأمور", totals.parentNotes, "#0891b2"],
    ];
    const chartTotal = Math.max(1, chartRows.reduce((sum, [, value]) => sum + value, 0));
    const summaryArticle = mode === "summary" ? `${missingSupervisorsRowsForPrint(list)}${absenceStageRowsForPrint(list)}${summaryRowsForPrint(list)}` : "";
    const digestArticle = mode === "digest" ? digestRowsForPrint(list) : "";
    const reportArticles = mode === "summary" ? summaryArticle : mode === "digest" ? digestArticle : list.map((report) => {
      const reportCounts = countTotals(report);
      const numbers = mode !== "data" ? `<section class="print-metrics compact">${metricCards([
        ["إيجابيات المعلمين", reportCounts.teacherPositives, "blue"],
        ["ملاحظات المعلمين", reportCounts.teacherNotes, "amber"],
        ["متابعة التصحيح", reportCounts.correctionFollowup, "teal"],
        ["إيجابيات الطلاب", reportCounts.learnerPositives, "green"],
        ["ملاحظات أولياء الأمور", reportCounts.parentNotes, "teal"],
      ])}</section>` : "";
      const dataRows = reportRowsForPrint(report, mode);
      return `<article class="print-report-card">
        <div class="print-report-head">
          <div><h2>${supervisorName(report.supervisorId)}</h2><p>${schoolName(report.schoolId)}</p></div>
          <div class="print-badges"><span>${safe(report.date)}</span><span>${safe(statusLabel(report.status))}</span></div>
        </div>
        ${numbers}
        ${dataRows ? `<section class="print-data">${dataRows}</section>` : ""}
        ${mode !== "numbers" ? `<section class="print-summary"><h3>ملخص الوكيل</h3><p>${safe(report.deputyRecommendations || "لا توجد توصيات مسجلة.")}</p></section>` : ""}
      </article>`;
    }).join("");

    const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safe(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    html { background: #e5edf4; }
    body { margin: 0; color: #172033; font-family: Arial, Tahoma, sans-serif; line-height: 1.45; }
    .print-action { position: sticky; top: 0; z-index: 5; display: flex; justify-content: center; padding: 12px; background: rgba(255,255,255,.92); box-shadow: 0 10px 26px rgba(15,23,42,.12); }
    .print-action button { border: 0; border-radius: 999px; padding: 12px 22px; background: #0f766e; color: white; font-weight: 900; font-size: 15px; cursor: pointer; }
    .print-page { width: 210mm; min-height: 297mm; margin: 14px auto 34px; background: #fff; overflow: hidden; box-shadow: 0 18px 48px rgba(15,23,42,.18); }
    header { display: grid; grid-template-columns: 24mm 1fr 52mm; gap: 12px; align-items: center; padding: 12mm 12mm 10mm; color: #fff; background: linear-gradient(135deg,#0f766e,#2563eb); }
    header img { width: 20mm; height: 20mm; border-radius: 5mm; background: #fff; object-fit: contain; padding: 2mm; }
    h1, h2, h3, p { margin: 0; }
    header h1 { font-size: 22px; margin-bottom: 3px; }
    header p { color: rgba(255,255,255,.84); font-size: 12px; }
    .print-meta { display: grid; gap: 6px; min-width: 170px; }
    .print-meta span, .print-badges span { display: flex; justify-content: space-between; gap: 10px; padding: 5px 8px; border-radius: 999px; background: rgba(255,255,255,.16); font-size: 10.5px; font-style: normal; }
    .print-meta em { font-style: normal; font-weight: 800; }
    main { padding: 9mm 10mm 8mm; }
    .print-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10mm; }
    .print-metrics.compact { margin: 5mm 0 4mm; }
    .print-metric { border: 1px solid #dbeafe; border-top: 3px solid #2563eb; border-radius: 10px; padding: 8px 9px; background: #f8fafc; min-height: 58px; }
    .print-metric.amber { border-top-color: #d97706; } .print-metric.green { border-top-color: #0f766e; } .print-metric.teal { border-top-color: #0891b2; }
    .print-metric span { display: block; color: #64748b; font-size: 10.5px; font-weight: 800; }
    .print-metric strong { display: block; margin-top: 3px; color: #172033; font-size: 22px; }
    .print-chart { display: grid; gap: 7px; margin-bottom: 7mm; padding: 9px; border: 1px solid #dbeafe; border-radius: 10px; background: #fff; }
    .print-chart-row { display: grid; grid-template-columns: 38mm 1fr 12mm; align-items: center; gap: 8px; font-size: 10.5px; font-weight: 800; }
    .print-chart-row div { height: 9px; border-radius: 999px; overflow: hidden; background: #e5e7eb; }
    .print-chart-row i { display: block; height: 100%; border-radius: inherit; }
    .print-report-card { border: 1px solid #dbeafe; border-radius: 10px; margin-top: 7mm; overflow: hidden; background: #fff; }
    .print-summary-card { break-inside: avoid-page; page-break-inside: avoid; }
    .print-report-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 9px 11px; background: #f8fafc; border-bottom: 1px solid #dbeafe; }
    .print-report-head { break-after: avoid; page-break-after: avoid; }
    .print-report-head h2 { font-size: 16px; color: #0f766e; }
    .print-report-head p { color: #64748b; font-size: 11px; }
    .print-badges { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .print-badges span { background: #e0f2fe; color: #075985; font-weight: 900; }
    .print-data, .print-summary { padding: 0 10px 10px; }
    .print-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding-top: 10px; }
    .print-summary-table { break-inside: avoid; }
    .print-supervisor-digest-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding-top: 10px; }
    .print-supervisor-digest { break-inside: avoid-page; page-break-inside: avoid; border: 1px solid #e8eef6; border-radius: 8px; padding: 8px; background: #fbfdff; }
    .print-supervisor-digest h3 { margin: 0 0 2px; color: #0f766e; font-size: 13px; }
    .print-supervisor-digest p { margin: 0 0 6px; color: #64748b; font-size: 10.5px; font-weight: 800; }
    .print-supervisor-digest table { margin-bottom: 0; }
    .print-summary { padding-top: 10px; border-top: 1px solid #eef2f7; }
    .print-summary h3, .print-data h3 { margin: 10px 0 6px; color: #172033; font-size: 13px; }
    table { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 6px 0 10px; border: 1px solid #dbeafe; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { padding: 6px 7px; text-align: right; vertical-align: top; border-bottom: 1px solid #e8eef6; border-inline-start: 1px solid #e8eef6; font-size: 10.5px; overflow-wrap: anywhere; word-break: break-word; }
    th { background: #ecfeff; color: #164e63; font-weight: 900; }
    tr:last-child td { border-bottom: 0; }
    footer { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10mm; color: #64748b; background: #f8fafc; border-top: 1px solid #dbeafe; font-size: 10.5px; }
    @media print {
      html, body { width: 210mm; background: #fff; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-action { display: none; }
      .print-page { width: 190mm; min-height: auto; margin: 0; border-radius: 0; box-shadow: none; overflow: visible; }
      header { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      main { padding: 8mm 0; }
      footer { padding-inline: 0; }
      .print-summary-grid, .print-supervisor-digest-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .print-summary-card, .print-chart, .print-metric, .print-summary-table { break-inside: avoid-page; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="print-action"><button type="button" onclick="window.print()">طباعة رسمية / PDF</button></div>
  <section class="print-page">
    <header>
      <img src="/school-tasks-logo.jpeg" alt="" />
      <div><h1>${safe(title)}</h1><p>تقرير رسمي من منصة مهام المدارس</p></div>
      <div class="print-meta"><span><b>تاريخ الطباعة</b><em>${safe(printedAt)}</em></span><span><b>المحتوى</b><em>${safe(modeLabel)}</em></span><span><b>عدد التقارير</b><em>${safe(totals.reports)}</em></span></div>
    </header>
    <main>
      <section class="print-metrics">${metricCards([
        ["إجمالي التقارير", totals.reports, "blue"],
        ["اعتماد المدير", totals.finalApproved, "green"],
        ["اعتماد الوكيل", totals.deputyApproved, "teal"],
        ["قيد المراجعة", totals.submitted + totals.drafts, "amber"],
      ])}</section>
      <section class="print-chart">${chartRows.map(([label, value, color]) => `<div class="print-chart-row"><span>${safe(label)}</span><div><i style="width:${Math.max(5, Math.round((value / chartTotal) * 100))}%;background:${color}"></i></div><strong>${safe(value || 0)}</strong></div>`).join("")}</section>
      ${reportArticles || `<article class="print-report-card"><div class="print-summary"><h3>لا توجد بيانات</h3><p>لم يتم العثور على تقارير حسب خيارات التصفية الحالية.</p></div></article>`}
    </main>
    <footer><span>منصة مهام المدارس</span><span>${safe(title)}</span></footer>
  </section>
</body>
</html>`;
    const printWindow = window.open("", "_blank", "width=1200,height=820");
    if (!printWindow) {
      showToast?.("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  }

  return {
    load,
    normalizeReport: (report) => normalizeReport(report, getContext().state.currentUser, todayIso()),
    canViewAdministrativeReports,
    renderAdministrativeReports,
    renderReportModal,
    openReport,
    openMergedReport,
    saveReport,
    approveByDeputy,
    saveAndApproveByDeputy,
    deleteAdministrativeReportGroup,
    addSectionRow,
    approveByPrincipal,
    setFilter,
    setTab,
    setSupervisorColor,
    printAdministrativeReports,
  };
}
