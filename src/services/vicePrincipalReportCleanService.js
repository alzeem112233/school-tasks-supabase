import { createUuid } from "../utils/idUtils.js";
import { normalizeRole } from "../utils/permissionUtils.js";
import { isTeacherVisibleFor } from "./teacherDirectoryService.js";

const TYPES = {
  daily: { kind: "vice_principal_daily", title: "التقرير اليومي للوكيل" },
  grades: { kind: "vice_principal_grade_register", title: "الكشف الأسبوعي لمتابعة سجل الدرجات" },
  absence: { kind: "vice_principal_absence", title: "ملحق التقرير اليومي للغياب التراكمي" },
  correction: { kind: "vice_principal_correction", title: "تقرير حملة التصحيح الدورية" },
  delayed: { kind: "vice_principal_delayed_students", title: "سجل المتأخرين دراسياً" },
};
const managerRoles = ["superadmin", "general_manager", "branch_manager", "development_supervision_manager", "general_secretary", "school_principal"];
const role = (user) => normalizeRole(user?.role, "");
const canManage = (user) => managerRoles.includes(role(user));
const filled = (value) => String(value || "").trim();
const rows = (count, factory) => Array.from({ length: count }, (_, index) => factory(index));
const blankData = (key) => {
  if (key === "daily") return {
    staffHighlights: rows(3, () => ({ name: "", positive: "", reinforcement: "" })),
    staffNotes: rows(3, () => ({ name: "", note: "", action: "" })),
    correction: rows(2, () => ({ stage: "", corrected: "", late: "", notCorrected: "", total: "", notes: "" })),
    studentHighlights: rows(3, () => ({ name: "", className: "", positive: "", reinforcement: "" })),
    studentViolations: rows(3, () => ({ name: "", className: "", violation: "", action: "" })),
    absenceContacts: ["الأساسي", "الثانوي"].map((stage) => ({ stage, absentCount: "", answered: "", noAnswer: "" })),
    cumulativeAbsence: rows(4, () => ({ stage: "", name: "", className: "", days: "", reason: "", action: "" })),
    teacherNotebooks: rows(4, () => ({ teacherId: "", teacher: "", className: "", notes: "", action: "" })),
    parentNotes: rows(4, () => ({ stage: "", note: "", action: "", general: "" })),
    facilities: rows(6, () => ({ activation: "", positives: "", notes: "" })),
    recommendations: "",
  };
  if (key === "grades") return { weeks: rows(5, () => ({ m: "", j: "", l: "", notes: "" })) };
  if (key === "absence") return { weeks: rows(4, () => rows(6, () => ({ name: "", className: "", days: "", reason: "", action: "" }))), facilities: rows(6, () => ({ activation: "", positives: "", notes: "" })) };
  if (key === "correction") return { items: rows(10, () => ({ teacherId: "", teacher: "", subject: "", className: "", dateRating: "", phraseRating: "", notes: "" })) };
  return { students: rows(10, () => ({ grade: "", section: "", name: "", contact: "", subjects: "", reasons: "", solutions: "", result: "", care: "", parentFollowup: "" })) };
};
const normalizeReport = (report) => {
  const type = Object.entries(TYPES).find(([, value]) => value.kind === report?.reportKind)?.[0] || "grades";
  return { ...report, reportKind: TYPES[type].kind, viceType: type, data: report.data || blankData(type), status: report.status || "draft" };
};

export function createVicePrincipalReportModule(getContext) {
  const ctx = () => getContext();
  const reports = () => (ctx().state.administrativeReports || []).map(normalizeReport).filter((item) => Object.values(TYPES).some((type) => type.kind === item.reportKind));
  function canView(user = ctx().state.currentUser) { return canManage(user) || role(user) === "deputy_principal"; }
  function canCreate(user = ctx().state.currentUser) { return canView(user); }
  function reportSchoolScope(user = ctx().state.currentUser) {
    const { state, scopedSchoolIds } = ctx();
    if (!user) return [];
    if (role(user) === "superadmin") return scopedSchoolIds?.() || (state.schools || []).map((school) => school.id);
    if (Array.isArray(user.linkedSchoolIds) && user.linkedSchoolIds.length) return user.linkedSchoolIds;
    if (user.schoolId && user.schoolId !== "general") return [user.schoolId];
    return canManage(user) ? (state.schools || []).map((school) => school.id) : [];
  }
  function canAccessReport(report, user = ctx().state.currentUser) {
    return Boolean(report && canView(user) && reportSchoolScope(user).includes(report.schoolId));
  }
  function visibleReports(user = ctx().state.currentUser) { return reports().filter((item) => canAccessReport(item, user)); }
  function teacherDirectory(schoolId = "") { const { state } = ctx(); return (state.teacherDirectory || []).filter((teacher) => teacher.active !== false && teacher.schoolId === schoolId && isTeacherVisibleFor(state, teacher.id, state.currentUser?.id || "")).sort((a, b) => String(a.teacherName || "").localeCompare(String(b.teacherName || ""), "ar")); }
  function replaceAndSave(report) {
    const { state, supabase, showToast, render } = ctx();
    state.administrativeReports = [report, ...(state.administrativeReports || []).filter((item) => item.id !== report.id)];
    localStorage.setItem("schoolTasksAdministrativeReportsV1", JSON.stringify(state.administrativeReports));
    supabase?.isCloudEnabled?.() && supabase.saveCloudDoc?.("administrativeReports", report.id, report, false).catch((error) => showToast?.(error?.message || "تعذر رفع التقرير"));
    state.modal = null; render();
  }
  function openReport(type, id = "") {
    const { state, render } = ctx(); const existing = visibleReports().find((item) => item.id === id);
    const key = existing?.viceType || type; const today = new Date().toISOString().slice(0, 10);
    state.modal = { type: "vice_principal_report", vicePrincipalReport: existing || { id: createUuid(), reportKind: TYPES[key].kind, viceType: key, date: today, schoolId: state.currentUser?.schoolId || "", authorId: state.currentUser?.id || "", authorName: state.currentUser?.name || "", status: "draft", data: blankData(key), updatedAt: new Date().toISOString() } }; render();
  }
  function openMonthlyReport(month = "") {
    const { state, render } = ctx();
    const selectedMonth = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
    state.modal = {
      type: "vice_principal_report",
      vicePrincipalReport: {
        id: "",
        reportKind: "vice_principal_monthly",
        viceType: "monthly",
        month: selectedMonth,
        date: `${selectedMonth}-01`,
        schoolId: state.currentUser?.schoolId || "",
        authorName: state.currentUser?.name || "",
        status: "generated",
        data: {},
      },
    };
    render();
  }
  function saveReport(event, submit = false) {
    event.preventDefault(); const { state } = ctx(); const form = new FormData(event.currentTarget); const old = state.modal.vicePrincipalReport; const key = old.viceType; const data = JSON.parse(form.get("payload") || "{}");
    replaceAndSave({ ...old, date: filled(form.get("date")) || old.date, status: submit ? "submitted" : "draft", data, updatedAt: new Date().toISOString(), submittedAt: submit ? new Date().toISOString() : old.submittedAt || "" });
  }
  function approveReport(id) { const report = visibleReports().find((item) => item.id === id); if (!report || !canManage()) return; replaceAndSave({ ...report, status: "principal_approved", approvedAt: new Date().toISOString(), approvedBy: ctx().state.currentUser?.id || "" }); }
  function submittedReportsSection(list) {
    const { safe, schoolName, icons, state } = ctx();
    const submitted = list.filter((item) => ["submitted", "principal_approved"].includes(item.status)).sort((a, b) => String(b.submittedAt || b.updatedAt || b.date || "").localeCompare(String(a.submittedAt || a.updatedAt || a.date || "")));
    const statusLabel = (item) => item.status === "principal_approved" ? "معتمد من المدير" : "مرفوع بانتظار الاطلاع";
    return `<section class="vice-submitted-reports"><div class="vice-submitted-head"><div><span class="eyebrow">سجل المتابعة</span><h3>التقارير المرفوعة للمدير</h3><p>تظهر هنا تقارير الوكيل التي تم رفعها للاطلاع والاعتماد.</p></div><b>${submitted.length} تقرير</b></div>${submitted.length ? `<div class="vice-submitted-list">${submitted.map((item) => { const type = TYPES[item.viceType] || TYPES.grades; const author = item.authorName || state.users?.find((user) => user.id === item.authorId)?.name || "وكيل المدرسة"; return `<article class="vice-submitted-row"><div class="vice-submitted-icon">${icons.reports || "▤"}</div><div class="vice-submitted-copy"><strong>${safe(type.title)}</strong><span>${safe(author)} · ${safe(schoolName(item.schoolId))} · ${safe(item.date)}</span></div><span class="vice-submitted-status ${item.status === "principal_approved" ? "approved" : "waiting"}">${statusLabel(item)}</span><div class="vice-submitted-actions"><button class="button ghost" type="button" onclick="actions.openVicePrincipalReport('${safe(item.viceType)}','${safe(item.id)}')">عرض التقرير</button>${canManage() && item.status !== "principal_approved" ? `<button class="button primary" type="button" onclick="actions.approveVicePrincipalReport('${safe(item.id)}')">اعتماد</button>` : ""}</div></article>`; }).join("")}</div>` : `<div class="vice-submitted-empty">لا توجد تقارير مرفوعة للمدير في هذا الفرع حاليًا.</div>`}</section>`;
  }
  function renderPage() {
    const { state, safe, icons, schoolName } = ctx(); if (!canView()) return `<section class="empty-state"><h2>لا تملك صلاحية عرض تقارير الوكيل.</h2></section>`;
    const list = visibleReports();
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlyCard = `<article class="vice-report-card vice-monthly-card"><div><span class="eyebrow">تجميعي تلقائي</span><h3>التقرير الشهري للوكيل</h3><p>يجمع تلقائيًا جميع بيانات التقارير اليومية المحفوظة خلال الشهر المختار.</p></div><label class="field vice-month-picker"><span>الشهر</span><input id="viceMonthlyMonth" type="month" value="${currentMonth}" /></label><button class="btn" onclick="actions.openVicePrincipalMonthlyReport(document.getElementById('viceMonthlyMonth')?.value)">${icons.reports || icons.print || ""} عرض وطباعة التقرير الشهري</button></article>`;
    const cards = monthlyCard + Object.entries(TYPES).map(([key, type]) => { const items = list.filter((item) => item.reportKind === type.kind); return `<article class="vice-report-card"><div><span class="eyebrow">تقرير الوكيل</span><h3>${type.title}</h3><p>${items.length} تقرير محفوظ · ${items.filter((item) => item.status === "principal_approved").length} معتمد</p></div><button class="btn" onclick="actions.openVicePrincipalReport('${key}','')">${icons.plus || "+"} ${key === "daily" ? "إضافة تقرير يومي" : "فتح تقرير"}</button><div class="vice-report-history">${items.map((item) => `<button type="button" class="vice-history-row" onclick="actions.openVicePrincipalReport('${key}','${safe(item.id)}')"><span>${safe(item.date)} · ${safe(schoolName(item.schoolId))}</span><b>${item.status === "principal_approved" ? "معتمد" : item.status === "submitted" ? "مرفوع" : "مسودة"}</b></button>`).join("") || `<small>لا توجد تقارير محفوظة.</small>`}</div></article>`; }).join("");
    return `<section class="admin-report-page vice-report-page"><div class="admin-report-hero"><div><span>تقارير الوكيل</span><h2>متابعة السجلات والتقارير</h2><p>كل نموذج مستقل، محفوظ في السحابة، ومهيأ للإدخال من الهاتف.</p></div></div><div class="vice-report-grid">${cards}</div>${submittedReportsSection(list)}</section>`;
  }
  function field(label, name, value, type = "text", attributes = "") { return `<label class="field"><span>${label}</span><input type="${type}" data-field="${name}" value="${ctx().safe(value)}" ${attributes}/></label>`; }
  function teacherField(row, index) {
    const { state, safe } = ctx();
    const schoolId = state.modal?.vicePrincipalReport?.schoolId || "";
    const teachers = teacherDirectory(schoolId);
    const selected = row.teacherId || teachers.find((teacher) => teacher.teacherName === row.teacher)?.id || "";
    const legacyOption = row.teacher && !teachers.some((teacher) => teacher.id === selected) ? `<option value="" selected>${safe(row.teacher)} (بيانات سابقة)</option>` : "";
    return `<label class="field"><span>اسم المعلم</span><select data-field="items.${index}.teacherId" data-teacher-index="${index}" onchange="actions.selectVicePrincipalReportTeacher(this)"><option value="">اختر المعلم من قائمة الفرع</option>${legacyOption}${teachers.map((teacher) => `<option value="${safe(teacher.id)}" ${selected === teacher.id ? "selected" : ""}>${safe(teacher.teacherName)} - ${safe(teacher.subjectName)}${teacher.className ? ` - ${safe(teacher.className)}` : ""}</option>`).join("")}</select><input type="hidden" data-field="items.${index}.teacher" value="${safe(row.teacher)}"></label>`;
  }
  function renderGrades(data) { return `<h4>متابعة سجل الدرجات لكل أسبوع</h4><div class="vice-mobile-list">${data.weeks.map((row, i) => `<article class="vice-form-card"><strong>الأسبوع ${i + 1}</strong>${field("م", `weeks.${i}.m`, row.m)}${field("ج", `weeks.${i}.j`, row.j)}${field("ل", `weeks.${i}.l`, row.l)}${field("ملاحظات", `weeks.${i}.notes`, row.notes)}</article>`).join("")}</div>`; }
  function renderAbsence(data) { const facilities = ["المكتبة", "معمل الكمبيوتر", "معمل العلوم", "الشاشة الذكية", "الوسائل", "المقصف"]; return `<h4>الغياب التراكمي حسب الأسابيع</h4><div class="vice-mobile-list">${data.weeks.map((week, wi) => `<article class="vice-form-card"><strong>الأسبوع ${wi + 1}</strong>${week.map((row, ri) => `<div class="vice-subcard"><b>السجل ${ri + 1}</b>${field("اسم المتعلم", `weeks.${wi}.${ri}.name`, row.name)}${field("الفصل", `weeks.${wi}.${ri}.className`, row.className)}${field("عدد الأيام", `weeks.${wi}.${ri}.days`, row.days, "number")}${field("سبب الغياب", `weeks.${wi}.${ri}.reason`, row.reason)}${field("الإجراء", `weeks.${wi}.${ri}.action`, row.action)}</div>`).join("")}</article>`).join("")}</div><h4>متابعة مرافق المدرسة</h4><div class="vice-mobile-list">${data.facilities.map((row, i) => `<article class="vice-form-card"><strong>${facilities[i]}</strong>${field("التفعيل", `facilities.${i}.activation`, row.activation)}${field("الإيجابيات", `facilities.${i}.positives`, row.positives)}${field("الملاحظات", `facilities.${i}.notes`, row.notes)}</article>`).join("")}</div>`; }
  function renderCorrection(data) { return `<h4>حملة التصحيح الدورية</h4><div class="vice-mobile-list">${data.items.map((row, i) => `<article class="vice-form-card" data-teacher-card="${i}"><strong>المعلم ${i + 1}</strong>${teacherField(row, i)}${field("المادة", `items.${i}.subject`, row.subject, "text", "readonly")}${field("الصف", `items.${i}.className`, row.className, "text", "readonly")}${field("التقييم وفق تاريخ التصحيح", `items.${i}.dateRating`, row.dateRating)}${field("التقييم وفق عبارات التشجيع والتوجيه", `items.${i}.phraseRating`, row.phraseRating)}${field("أبرز الملاحظات", `items.${i}.notes`, row.notes)}</article>`).join("")}</div>`; }
  function renderDelayed(data) { return `<h4>سجل المتأخرين دراسياً</h4><div class="vice-mobile-list">${data.students.map((row, i) => `<article class="vice-form-card"><strong>المتعلم ${i + 1}</strong>${field("الصف", `students.${i}.grade`, row.grade)}${field("الشعبة", `students.${i}.section`, row.section)}${field("اسم المتعلم الثلاثي مع اللقب", `students.${i}.name`, row.name)}${field("فترة المتابعة ونوع التواصل", `students.${i}.contact`, row.contact)}${field("مواد التأخر الدراسي", `students.${i}.subjects`, row.subjects)}${field("أسباب التأخر الدراسي", `students.${i}.reasons`, row.reasons)}${field("الحلول وطرق العلاج", `students.${i}.solutions`, row.solutions)}${field("نتائج المتابعة", `students.${i}.result`, row.result)}${field("الرعاية المقدمة من المدرسة", `students.${i}.care`, row.care)}${field("المتابعة المقترحة على ولي الأمر", `students.${i}.parentFollowup`, row.parentFollowup)}</article>`).join("")}</div>`; }
  const dailyFields = (title, rowsData, fields, prefix) => `<section class="vice-daily-section"><h4>${title}</h4><div class="vice-mobile-list">${rowsData.map((row, index) => `<article class="vice-form-card"><strong>السجل ${index + 1}</strong>${fields.map(([label, key, type]) => field(label, `${prefix}.${index}.${key}`, row[key], type || "text")).join("")}</article>`).join("")}</div></section>`;
  function renderDaily(data) {
    const facilities = ["المكتبة", "معمل الكمبيوتر", "معمل العلوم", "الشاشة الذكية", "الوسائل", "المقصف"];
    return `<div class="vice-daily-form">${dailyFields("أ) الكادر الإداري والتعليمي - الإيجابيات", data.staffHighlights, [["اسم الموظف", "name"], ["أبرز الإيجابيات", "positive"], ["التعزيز", "reinforcement"]], "staffHighlights")}${dailyFields("أ) الكادر الإداري والتعليمي - الملاحظات", data.staffNotes, [["اسم الموظف", "name"], ["أبرز الملاحظات", "note"], ["الإجراء", "action"]], "staffNotes")}${dailyFields("متابعة تصويب الدفاتر للمعلمين", data.correction, [["المرحلة", "stage"], ["مصحح", "corrected", "number"], ["متأخر", "late", "number"], ["غير مصحح", "notCorrected", "number"], ["الإجمالي", "total", "number"], ["ملاحظات", "notes"]], "correction")}${dailyFields("ب) المتعلمون - الإيجابيات", data.studentHighlights, [["اسم المتعلم", "name"], ["الفصل", "className"], ["أبرز الإيجابيات", "positive"], ["التعزيز", "reinforcement"]], "studentHighlights")}${dailyFields("ب) المتعلمون - المخالفات", data.studentViolations, [["اسم المتعلم", "name"], ["الفصل", "className"], ["المخالفة", "violation"], ["الإجراء", "action"]], "studentViolations")}${dailyFields("التواصل مع الغائبين", data.absenceContacts, [["المرحلة", "stage"], ["عدد الغائبين", "absentCount", "number"], ["تم الرد", "answered", "number"], ["لم يرد", "noAnswer", "number"]], "absenceContacts")}${dailyFields("الغياب التراكمي الشهري", data.cumulativeAbsence, [["المرحلة", "stage"], ["اسم المتعلم", "name"], ["الفصل", "className"], ["عدد الأيام", "days", "number"], ["سبب الغياب", "reason"], ["الإجراء", "action"]], "cumulativeAbsence")}${dailyFields("تفعيل دفاتر متابعة المعلمين", data.teacherNotebooks, [["اسم المعلم", "teacher"], ["الفصل", "className"], ["أهم الملاحظات", "notes"], ["الإجراءات والمعالجات", "action"]], "teacherNotebooks")}${dailyFields("أبرز ملاحظات أولياء الأمور", data.parentNotes, [["المرحلة", "stage"], ["الملاحظات", "note"], ["المعالجات", "action"], ["ملاحظات عامة", "general"]], "parentNotes")}<section class="vice-daily-section"><h4>متابعة مرافق مصادر التعلم والمرافق الأخرى</h4><div class="vice-mobile-list">${data.facilities.map((row, index) => `<article class="vice-form-card"><strong>${facilities[index]}</strong>${field("التفعيل", `facilities.${index}.activation`, row.activation)}${field("الإيجابيات", `facilities.${index}.positives`, row.positives)}${field("الملاحظات", `facilities.${index}.notes`, row.notes)}</article>`).join("")}</div></section><label class="field vice-wide-field"><span>أبرز الملاحظات والمقترحات</span><textarea data-field="recommendations">${ctx().safe(data.recommendations)}</textarea></label></div>`;
  }
  const populated = (row) => Object.values(row || {}).some((value) => String(value || "").trim());
  function monthlyReports(month) { return visibleReports().filter((item) => item.viceType === "daily" && String(item.date || "").slice(0, 7) === month); }
  function monthlyRows(month, key) { return monthlyReports(month).flatMap((report) => (report.data?.[key] || []).filter(populated).map((row) => ({ ...row, date: report.date }))); }
  function monthlySummary(month) {
    const daily = monthlyReports(month);
    const sections = [["الكادر الإداري والتعليمي - الإيجابيات", "staffHighlights"], ["الكادر الإداري والتعليمي - الملاحظات", "staffNotes"], ["تصويب الدفاتر", "correction"], ["إيجابيات المتعلمين", "studentHighlights"], ["مخالفات المتعلمين", "studentViolations"], ["التواصل مع الغائبين", "absenceContacts"], ["الغياب التراكمي", "cumulativeAbsence"], ["دفاتر متابعة المعلمين", "teacherNotebooks"], ["ملاحظات أولياء الأمور", "parentNotes"]];
    const table = (title, key) => { const rowsData = monthlyRows(month, key); if (!rowsData.length) return `<section class="vice-monthly-section"><h4>${title}</h4><p class="vice-empty-note">لا توجد بيانات مدخلة خلال هذا الشهر.</p></section>`; const columns = Object.keys(rowsData[0]).filter((column) => column !== "date"); return `<section class="vice-monthly-section"><h4>${title}</h4><div class="vice-monthly-table-wrap"><table><thead><tr><th>التاريخ</th>${columns.map((column) => `<th>${column}</th>`).join("")}</tr></thead><tbody>${rowsData.map((row) => `<tr><td>${ctx().safe(row.date)}</td>${columns.map((column) => `<td>${ctx().safe(row[column] || "-")}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`; };
    return `<div class="vice-monthly-content"><div class="vice-monthly-summary"><strong>${daily.length}</strong><span>تقرير يومي محفوظ في ${month}</span></div>${sections.map(([title, key]) => table(title, key)).join("")}<section class="vice-monthly-section"><h4>المرافق والملاحظات والمقترحات</h4>${daily.map((report) => `<article class="vice-monthly-note"><b>${ctx().safe(report.date)}</b><p>${ctx().safe(report.data?.recommendations || "لا توجد ملاحظات.")}</p></article>`).join("") || `<p class="vice-empty-note">لا توجد بيانات مدخلة خلال هذا الشهر.</p>`}</section></div>`;
  }
  function renderModal() {
    const { state, safe, icons, schoolName } = ctx(); const report = state.modal?.vicePrincipalReport; if (!report) return "";
    if (report.viceType === "monthly") return `<div class="modal"><div class="modal-box admin-report-modal vice-report-modal vice-monthly-modal"><button type="button" class="icon-btn admin-modal-close" onclick="actions.closeModal()">${icons.close || "×"}</button><div class="modal-head"><div><span class="eyebrow">تقرير وكيل شهري</span><h3>التقرير الشهري للوكيل - ${safe(report.month)}</h3></div></div><div class="admin-report-modal-body">${monthlySummary(report.month)}</div><div class="admin-report-sticky-actions"><button type="button" class="btn secondary" onclick="actions.closeModal()">إغلاق</button><button type="button" class="btn" onclick="actions.printVicePrincipalReport('','monthly')">${icons.print || ""} طباعة التقرير الشهري</button></div></div></div>`;
    const type = TYPES[report.viceType]; const editable = canCreate() && report.status !== "principal_approved" && (report.authorId === state.currentUser?.id || canManage());
    const body = report.viceType === "daily" ? renderDaily(report.data) : report.viceType === "grades" ? renderGrades(report.data) : report.viceType === "absence" ? renderAbsence(report.data) : report.viceType === "correction" ? renderCorrection(report.data) : renderDelayed(report.data);
    return `<div class="modal"><form class="modal-box admin-report-modal vice-report-modal" onsubmit="actions.saveVicePrincipalReport(event)"><button type="button" class="icon-btn admin-modal-close" onclick="actions.closeModal()">${icons.close || "×"}</button><div class="modal-head"><div><span class="eyebrow">${type.title}</span><h3>${safe(schoolName(report.schoolId))}</h3></div></div><div class="admin-report-modal-body">${field("التاريخ", "date", report.date, "date")}${body}<input type="hidden" name="payload" id="viceReportPayload" /></div><div class="admin-report-sticky-actions"><button type="button" class="btn secondary" onclick="actions.closeModal()">إغلاق</button><button type="button" class="btn secondary" onclick="actions.printVicePrincipalReport('${safe(report.id)}')">${icons.print || ""} طباعة التقرير</button>${editable ? `<button type="submit" class="btn">${icons.save || ""} حفظ مسودة</button><button type="button" class="btn" onclick="actions.saveVicePrincipalReport(event,true)">${icons.upload || ""} حفظ ورفع للمدير</button>` : ""}${canManage() && report.status !== "principal_approved" ? `<button type="button" class="btn" onclick="actions.approveVicePrincipalReport('${safe(report.id)}')">اعتماد التقرير</button>` : ""}</div></form></div>`;
  }
  function selectTeacher(input) {
    const { state } = ctx();
    const teacher = teacherDirectory(state.modal?.vicePrincipalReport?.schoolId || "").find((item) => item.id === input.value);
    const card = input.closest("[data-teacher-card]");
    if (!card) return;
    const index = input.dataset.teacherIndex;
    const set = (name, value) => { const target = card.querySelector(`[data-field="items.${index}.${name}"]`); if (target) target.value = value || ""; };
    set("teacher", teacher?.teacherName);
    set("subject", teacher?.subjectName);
    set("className", teacher?.className);
  }
  function printReport(id = "", section = "all") {
    const { state, safe, schoolName, showToast } = ctx();
    const report = visibleReports().find((item) => item.id === id) || state.modal?.vicePrincipalReport;
    if (!report) { showToast?.("لم يتم العثور على التقرير"); return; }
    if (section === "monthly" || report.viceType === "monthly") {
      const month = report.month || new Date().toISOString().slice(0, 7);
      const win = window.open("", "_blank", "width=1100,height=800");
      if (!win) { showToast?.("اسمح بالنوافذ المنبثقة لطباعة التقرير"); return; }
      win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>التقرير الشهري للوكيل</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#172554;font-family:Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{padding:8px}.head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;margin-bottom:12px;border:2px solid #2563eb;background:#eff6ff}.head h1{margin:0;font-size:22px}.head p{margin:5px 0 0;color:#475569;font-size:12px}.badge{padding:8px 12px;background:#2563eb;color:#fff;font-weight:700}.vice-monthly-content{display:grid;gap:10px}.vice-monthly-summary{display:flex;gap:10px;align-items:center;padding:9px 12px;background:#f0fdf4;border:1px solid #bbf7d0}.vice-monthly-summary strong{font-size:20px;color:#15803d}.vice-monthly-section{break-inside:avoid;margin-bottom:10px}.vice-monthly-section h4{margin:0 0 5px;padding:6px 8px;background:#dbeafe;color:#1e3a8a;font-size:13px}.vice-monthly-table-wrap{overflow:visible}table{width:100%;border-collapse:collapse}th,td{border:1px solid #94a3b8;padding:5px 6px;text-align:right;vertical-align:top;font-size:9px;line-height:1.4;overflow-wrap:anywhere}th{background:#dbeafe;color:#1e3a8a}tbody tr:nth-child(even){background:#f8fafc}.vice-monthly-note{border:1px solid #cbd5e1;padding:7px}.vice-monthly-note p{margin:4px 0}.foot{margin-top:12px;padding-top:7px;border-top:1px solid #cbd5e1;font-size:10px;color:#64748b}@media print{.print{display:none}}</style></head><body><main class="sheet"><header class="head"><div><h1>التقرير الشهري للوكيل</h1><p>${safe(schoolName(report.schoolId))} · تجميع التقارير اليومية</p></div><div class="badge">${safe(month)}</div></header>${monthlySummary(month)}<footer class="foot">منصة مهام المدارس · تقرير وكيل شهري</footer></main><button class="print" onclick="window.print()">طباعة / PDF</button><script>addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body></html>`);
      win.document.close();
      return;
    }
    const type = TYPES[report.viceType] || TYPES.grades;
    if (section !== "all" && section !== report.viceType) { showToast?.("اختر القسم المطابق لنوع الملف"); return; }
    const cell = (value) => `<td>${safe(value || "-")}</td>`;
    let content = "";
    if (report.viceType === "daily") {
      const dailySections = [["الكادر - الإيجابيات", "staffHighlights"], ["الكادر - الملاحظات", "staffNotes"], ["تصويب الدفاتر", "correction"], ["المتعلمون - الإيجابيات", "studentHighlights"], ["المتعلمون - المخالفات", "studentViolations"], ["التواصل مع الغائبين", "absenceContacts"], ["الغياب التراكمي", "cumulativeAbsence"], ["دفاتر متابعة المعلمين", "teacherNotebooks"], ["ملاحظات أولياء الأمور", "parentNotes"]];
      content = dailySections.map(([title, key]) => { const data = (report.data?.[key] || []).filter(populated); if (!data.length) return `<h2>${title}</h2><p>لا توجد بيانات.</p>`; const columns = Object.keys(data[0]); return `<h2>${title}</h2><table><thead><tr>${columns.map((column) => `<th>${column}</th>`).join("")}</tr></thead><tbody>${data.map((row) => `<tr>${columns.map((column) => cell(row[column])).join("")}</tr>`).join("")}</tbody></table>`; }).join("") + `<h2>أبرز الملاحظات والمقترحات</h2><p>${safe(report.data?.recommendations || "-")}</p>`;
    } else if (report.viceType === "grades") content = `<table><thead><tr><th>الأسبوع</th><th>م</th><th>ج</th><th>ل</th><th>الملاحظات</th></tr></thead><tbody>${(report.data.weeks || []).map((row, index) => `<tr>${cell(index + 1)}${cell(row.m)}${cell(row.j)}${cell(row.l)}${cell(row.notes)}</tr>`).join("")}</tbody></table>`;
    else if (report.viceType === "absence") content = `<h2>الغياب التراكمي</h2><table><thead><tr><th>الأسبوع</th><th>اسم المتعلم</th><th>الفصل</th><th>الأيام</th><th>السبب</th><th>الإجراء</th></tr></thead><tbody>${(report.data.weeks || []).flatMap((week, wi) => week.map((row) => `<tr>${cell(wi + 1)}${cell(row.name)}${cell(row.className)}${cell(row.days)}${cell(row.reason)}${cell(row.action)}</tr>`)).join("")}</tbody></table><h2>مرافق المدرسة</h2><table><thead><tr><th>المرفق</th><th>التفعيل</th><th>الإيجابيات</th><th>الملاحظات</th></tr></thead><tbody>${(report.data.facilities || []).map((row, i) => `<tr>${cell(["المكتبة","معمل الكمبيوتر","معمل العلوم","الشاشة الذكية","الوسائل","المقصف"][i])}${cell(row.activation)}${cell(row.positives)}${cell(row.notes)}</tr>`).join("")}</tbody></table>`;
    else if (report.viceType === "correction") content = `<table><thead><tr><th>#</th><th>المعلم</th><th>المادة</th><th>الصف</th><th>تاريخ التصحيح</th><th>التشجيع والتوجيه</th><th>الملاحظات</th></tr></thead><tbody>${(report.data.items || []).map((row, i) => `<tr>${cell(i + 1)}${cell(row.teacher)}${cell(row.subject)}${cell(row.className)}${cell(row.dateRating)}${cell(row.phraseRating)}${cell(row.notes)}</tr>`).join("")}</tbody></table>`;
    else content = `<table><thead><tr><th>#</th><th>الصف</th><th>الشعبة</th><th>اسم المتعلم</th><th>التواصل</th><th>مواد التأخر</th><th>الأسباب</th><th>الحلول</th><th>النتائج</th><th>رعاية المدرسة</th><th>متابعة ولي الأمر</th></tr></thead><tbody>${(report.data.students || []).map((row, i) => `<tr>${cell(i + 1)}${cell(row.grade)}${cell(row.section)}${cell(row.name)}${cell(row.contact)}${cell(row.subjects)}${cell(row.reasons)}${cell(row.solutions)}${cell(row.result)}${cell(row.care)}${cell(row.parentFollowup)}</tr>`).join("")}</tbody></table>`;
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) { showToast?.("اسمح بالنوافذ المنبثقة لطباعة التقرير"); return; }
    win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${safe(type.title)}</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#172554;font-family:Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{width:100%;padding:8px}.head{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:16px 18px;margin-bottom:14px;border:2px solid #2563eb;background:#eff6ff}.head h1{margin:0 0 7px;font-size:22px}.head p{margin:0;color:#475569;font-size:12px}.badge{padding:8px 12px;background:#2563eb;color:#fff;font-weight:700}h2{font-size:15px;margin:16px 0 7px}table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #94a3b8;padding:6px 7px;text-align:right;vertical-align:top;font-size:10px;line-height:1.45;overflow-wrap:anywhere}th{background:#dbeafe;color:#1e3a8a;font-weight:800}tbody tr:nth-child(even){background:#f8fafc}.foot{display:flex;justify-content:space-between;margin-top:12px;padding-top:8px;border-top:1px solid #cbd5e1;font-size:10px;color:#64748b}.print{position:fixed;left:16px;bottom:16px;border:0;background:#2563eb;color:#fff;padding:10px 16px;font:700 13px Tahoma;cursor:pointer}@media print{.print{display:none}.sheet{padding:0}tr{break-inside:avoid}}</style></head><body><main class="sheet"><header class="head"><div><h1>${safe(type.title)}</h1><p>${safe(schoolName(report.schoolId))} · إعداد ${safe(report.authorName || "وكيل المدرسة")}</p></div><div class="badge">${safe(report.date)}</div></header>${content}<footer class="foot"><span>تقارير الوكيل - منصة مهام المدارس</span><span>${report.status === "principal_approved" ? "تقرير معتمد" : report.status === "submitted" ? "مرفوع للمدير" : "مسودة"}</span></footer></main><button class="print" onclick="window.print()">طباعة / PDF</button><script>addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body></html>`);
    win.document.close();
  }
  function collectPayload(form, old) { const data = JSON.parse(JSON.stringify(old)); const collections = new Set(Array.from(form.querySelectorAll("[data-field]")).map((input) => input.dataset.field.split(".")[0]).filter((key) => Array.isArray(data[key]))); collections.forEach((key) => { data[key] = []; }); for (const input of form.querySelectorAll("[data-field]")) { const path = input.dataset.field.split("."); let target = data; path.slice(0, -1).forEach((part, index) => { if (target[part] === undefined) target[part] = /^\\d+$/.test(path[index + 1]) ? [] : {}; target = target[part]; }); target[path[path.length - 1]] = input.value; } return data; }
  function saveReportFromForm(event, submit = false) { event.preventDefault(); const { state } = ctx(); const form = event.currentTarget?.tagName === "FORM" ? event.currentTarget : event.currentTarget?.form; if (!form) return; form.querySelector('[name="payload"]').value = JSON.stringify(collectPayload(form, state.modal.vicePrincipalReport.data)); saveReport({ preventDefault() {}, currentTarget: form }, submit); }
  return { canView, canCreate, renderPage, renderModal, openReport, openMonthlyReport, saveReport: saveReportFromForm, approveReport, selectTeacher, printReport };
}
