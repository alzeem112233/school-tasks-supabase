import { createUuid } from "../utils/idUtils.js";
import { normalizeRole } from "../utils/permissionUtils.js";

const TYPES = {
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
  if (key === "grades") return { weeks: rows(5, () => ({ m: "", j: "", l: "", notes: "" })) };
  if (key === "absence") return { weeks: rows(4, () => rows(6, () => ({ name: "", className: "", days: "", reason: "", action: "" }))), facilities: rows(6, () => ({ activation: "", positives: "", notes: "" })) };
  if (key === "correction") return { items: rows(10, () => ({ teacher: "", subject: "", className: "", dateRating: "", phraseRating: "", notes: "" })) };
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
  function replaceAndSave(report) {
    const { state, supabase, showToast, render } = ctx();
    state.administrativeReports = [report, ...(state.administrativeReports || []).filter((item) => item.id !== report.id)];
    localStorage.setItem("schoolTasksAdministrativeReportsV1", JSON.stringify(state.administrativeReports));
    supabase?.isCloudEnabled?.() && supabase.saveCloudDoc?.("administrativeReports", report.id, report, false).catch((error) => showToast?.(error?.message || "تعذر رفع التقرير"));
    state.modal = null; render();
  }
  function openReport(type, id = "") {
    const { state, render } = ctx(); const existing = reports().find((item) => item.id === id);
    const key = existing?.viceType || type; const today = new Date().toISOString().slice(0, 10);
    state.modal = { type: "vice_principal_report", vicePrincipalReport: existing || { id: createUuid(), reportKind: TYPES[key].kind, viceType: key, date: today, schoolId: state.currentUser?.schoolId || "", authorId: state.currentUser?.id || "", authorName: state.currentUser?.name || "", status: "draft", data: blankData(key), updatedAt: new Date().toISOString() } }; render();
  }
  function saveReport(event, submit = false) {
    event.preventDefault(); const { state } = ctx(); const form = new FormData(event.currentTarget); const old = state.modal.vicePrincipalReport; const key = old.viceType; const data = JSON.parse(form.get("payload") || "{}");
    replaceAndSave({ ...old, date: filled(form.get("date")) || old.date, status: submit ? "submitted" : "draft", data, updatedAt: new Date().toISOString(), submittedAt: submit ? new Date().toISOString() : old.submittedAt || "" });
  }
  function approveReport(id) { const report = reports().find((item) => item.id === id); if (!report || !canManage()) return; replaceAndSave({ ...report, status: "principal_approved", approvedAt: new Date().toISOString(), approvedBy: ctx().state.currentUser?.id || "" }); }
  function renderPage() {
    const { state, safe, icons, schoolName } = ctx(); if (!canView()) return `<section class="empty-state"><h2>لا تملك صلاحية عرض تقارير الوكيل.</h2></section>`;
    const list = reports().filter((item) => canManage() || item.schoolId === state.currentUser?.schoolId); const cards = Object.entries(TYPES).map(([key, type]) => { const items = list.filter((item) => item.reportKind === type.kind); return `<article class="vice-report-card"><div><span class="eyebrow">تقرير الوكيل</span><h3>${type.title}</h3><p>${items.length} تقرير محفوظ · ${items.filter((item) => item.status === "principal_approved").length} معتمد</p></div><button class="btn" onclick="actions.openVicePrincipalReport('${key}','')">${icons.plus || "+"} فتح تقرير</button><div class="vice-report-history">${items.slice(0, 5).map((item) => `<button type="button" class="vice-history-row" onclick="actions.openVicePrincipalReport('${key}','${safe(item.id)}')"><span>${safe(item.date)} · ${safe(schoolName(item.schoolId))}</span><b>${item.status === "principal_approved" ? "معتمد" : item.status === "submitted" ? "مرفوع" : "مسودة"}</b></button>`).join("") || `<small>لا توجد تقارير محفوظة.</small>`}</div></article>`; }).join("");
    return `<section class="admin-report-page vice-report-page"><div class="admin-report-hero"><div><span>تقارير الوكيل</span><h2>متابعة السجلات والتقارير</h2><p>كل نموذج مستقل، محفوظ في السحابة، ومهيأ للإدخال من الهاتف.</p></div></div><div class="vice-report-grid">${cards}</div></section>`;
  }
  function field(label, name, value, type = "text") { return `<label class="field"><span>${label}</span><input type="${type}" data-field="${name}" value="${ctx().safe(value)}" /></label>`; }
  function renderGrades(data) { return `<h4>متابعة سجل الدرجات لكل أسبوع</h4><div class="vice-mobile-list">${data.weeks.map((row, i) => `<article class="vice-form-card"><strong>الأسبوع ${i + 1}</strong>${field("م", `weeks.${i}.m`, row.m)}${field("ج", `weeks.${i}.j`, row.j)}${field("ل", `weeks.${i}.l`, row.l)}${field("ملاحظات", `weeks.${i}.notes`, row.notes)}</article>`).join("")}</div>`; }
  function renderAbsence(data) { const facilities = ["المكتبة", "معمل الكمبيوتر", "معمل العلوم", "الشاشة الذكية", "الوسائل", "المقصف"]; return `<h4>الغياب التراكمي حسب الأسابيع</h4><div class="vice-mobile-list">${data.weeks.map((week, wi) => `<article class="vice-form-card"><strong>الأسبوع ${wi + 1}</strong>${week.map((row, ri) => `<div class="vice-subcard"><b>السجل ${ri + 1}</b>${field("اسم المتعلم", `weeks.${wi}.${ri}.name`, row.name)}${field("الفصل", `weeks.${wi}.${ri}.className`, row.className)}${field("عدد الأيام", `weeks.${wi}.${ri}.days`, row.days, "number")}${field("سبب الغياب", `weeks.${wi}.${ri}.reason`, row.reason)}${field("الإجراء", `weeks.${wi}.${ri}.action`, row.action)}</div>`).join("")}</article>`).join("")}</div><h4>متابعة مرافق المدرسة</h4><div class="vice-mobile-list">${data.facilities.map((row, i) => `<article class="vice-form-card"><strong>${facilities[i]}</strong>${field("التفعيل", `facilities.${i}.activation`, row.activation)}${field("الإيجابيات", `facilities.${i}.positives`, row.positives)}${field("الملاحظات", `facilities.${i}.notes`, row.notes)}</article>`).join("")}</div>`; }
  function renderCorrection(data) { return `<h4>حملة التصحيح الدورية</h4><div class="vice-mobile-list">${data.items.map((row, i) => `<article class="vice-form-card"><strong>المعلم ${i + 1}</strong>${field("اسم المعلم", `items.${i}.teacher`, row.teacher)}${field("المادة", `items.${i}.subject`, row.subject)}${field("الصف", `items.${i}.className`, row.className)}${field("التقييم وفق تاريخ التصحيح", `items.${i}.dateRating`, row.dateRating)}${field("التقييم وفق عبارات التشجيع والتوجيه", `items.${i}.phraseRating`, row.phraseRating)}${field("أبرز الملاحظات", `items.${i}.notes`, row.notes)}</article>`).join("")}</div>`; }
  function renderDelayed(data) { return `<h4>سجل المتأخرين دراسياً</h4><div class="vice-mobile-list">${data.students.map((row, i) => `<article class="vice-form-card"><strong>المتعلم ${i + 1}</strong>${field("الصف", `students.${i}.grade`, row.grade)}${field("الشعبة", `students.${i}.section`, row.section)}${field("اسم المتعلم الثلاثي مع اللقب", `students.${i}.name`, row.name)}${field("فترة المتابعة ونوع التواصل", `students.${i}.contact`, row.contact)}${field("مواد التأخر الدراسي", `students.${i}.subjects`, row.subjects)}${field("أسباب التأخر الدراسي", `students.${i}.reasons`, row.reasons)}${field("الحلول وطرق العلاج", `students.${i}.solutions`, row.solutions)}${field("نتائج المتابعة", `students.${i}.result`, row.result)}${field("الرعاية المقدمة من المدرسة", `students.${i}.care`, row.care)}${field("المتابعة المقترحة على ولي الأمر", `students.${i}.parentFollowup`, row.parentFollowup)}</article>`).join("")}</div>`; }
  function renderModal() {
    const { state, safe, icons, schoolName } = ctx(); const report = state.modal?.vicePrincipalReport; if (!report) return ""; const type = TYPES[report.viceType]; const editable = canCreate() && report.status !== "principal_approved" && (report.authorId === state.currentUser?.id || canManage());
    const body = report.viceType === "grades" ? renderGrades(report.data) : report.viceType === "absence" ? renderAbsence(report.data) : report.viceType === "correction" ? renderCorrection(report.data) : renderDelayed(report.data);
    return `<div class="modal"><form class="modal-box admin-report-modal vice-report-modal" onsubmit="actions.saveVicePrincipalReport(event)"><button type="button" class="icon-btn admin-modal-close" onclick="actions.closeModal()">${icons.close || "×"}</button><div class="modal-head"><div><span class="eyebrow">${type.title}</span><h3>${safe(schoolName(report.schoolId))}</h3></div></div><div class="admin-report-modal-body">${field("التاريخ", "date", report.date, "date")}${body}<input type="hidden" name="payload" id="viceReportPayload" /></div><div class="admin-report-sticky-actions"><button type="button" class="btn secondary" onclick="actions.closeModal()">إغلاق</button>${editable ? `<button type="submit" class="btn">${icons.save || ""} حفظ مسودة</button><button type="button" class="btn" onclick="actions.saveVicePrincipalReport(event,true)">${icons.upload || ""} حفظ ورفع للمدير</button>` : ""}${canManage() && report.status !== "principal_approved" ? `<button type="button" class="btn" onclick="actions.approveVicePrincipalReport('${safe(report.id)}')">اعتماد التقرير</button>` : ""}</div></form></div>`;
  }
  function collectPayload(form, old) { const data = JSON.parse(JSON.stringify(old)); for (const input of form.querySelectorAll("[data-field]")) { const path = input.dataset.field.split("."); let target = data; path.slice(0, -1).forEach((part) => { target = target[part]; }); target[path[path.length - 1]] = input.value; } return data; }
  function saveReportFromForm(event, submit = false) { event.preventDefault(); const { state } = ctx(); const form = event.currentTarget; form.querySelector('[name="payload"]').value = JSON.stringify(collectPayload(form, state.modal.vicePrincipalReport.data)); saveReport(event, submit); }
  return { canView, canCreate, renderPage, renderModal, openReport, saveReport: saveReportFromForm, approveReport };
}

