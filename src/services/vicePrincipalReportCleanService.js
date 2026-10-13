import { createUuid } from "../utils/idUtils.js";
import { normalizeRole } from "../utils/permissionUtils.js";
import { isTeacherVisibleFor } from "./teacherDirectoryService.js";

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
  function teacherDirectory(schoolId = "") { const { state } = ctx(); return (state.teacherDirectory || []).filter((teacher) => teacher.active !== false && teacher.schoolId === schoolId && isTeacherVisibleFor(state, teacher.id, state.currentUser?.id || "")).sort((a, b) => String(a.teacherName || "").localeCompare(String(b.teacherName || ""), "ar")); }
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
  function renderModal() {
    const { state, safe, icons, schoolName } = ctx(); const report = state.modal?.vicePrincipalReport; if (!report) return ""; const type = TYPES[report.viceType]; const editable = canCreate() && report.status !== "principal_approved" && (report.authorId === state.currentUser?.id || canManage());
    const body = report.viceType === "grades" ? renderGrades(report.data) : report.viceType === "absence" ? renderAbsence(report.data) : report.viceType === "correction" ? renderCorrection(report.data) : renderDelayed(report.data);
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
    const report = reports().find((item) => item.id === id) || state.modal?.vicePrincipalReport;
    if (!report) { showToast?.("لم يتم العثور على التقرير"); return; }
    const type = TYPES[report.viceType] || TYPES.grades;
    if (section !== "all" && section !== report.viceType) { showToast?.("اختر القسم المطابق لنوع الملف"); return; }
    const cell = (value) => `<td>${safe(value || "-")}</td>`;
    let content = "";
    if (report.viceType === "grades") content = `<table><thead><tr><th>الأسبوع</th><th>م</th><th>ج</th><th>ل</th><th>الملاحظات</th></tr></thead><tbody>${(report.data.weeks || []).map((row, index) => `<tr>${cell(index + 1)}${cell(row.m)}${cell(row.j)}${cell(row.l)}${cell(row.notes)}</tr>`).join("")}</tbody></table>`;
    else if (report.viceType === "absence") content = `<h2>الغياب التراكمي</h2><table><thead><tr><th>الأسبوع</th><th>اسم المتعلم</th><th>الفصل</th><th>الأيام</th><th>السبب</th><th>الإجراء</th></tr></thead><tbody>${(report.data.weeks || []).flatMap((week, wi) => week.map((row) => `<tr>${cell(wi + 1)}${cell(row.name)}${cell(row.className)}${cell(row.days)}${cell(row.reason)}${cell(row.action)}</tr>`)).join("")}</tbody></table><h2>مرافق المدرسة</h2><table><thead><tr><th>المرفق</th><th>التفعيل</th><th>الإيجابيات</th><th>الملاحظات</th></tr></thead><tbody>${(report.data.facilities || []).map((row, i) => `<tr>${cell(["المكتبة","معمل الكمبيوتر","معمل العلوم","الشاشة الذكية","الوسائل","المقصف"][i])}${cell(row.activation)}${cell(row.positives)}${cell(row.notes)}</tr>`).join("")}</tbody></table>`;
    else if (report.viceType === "correction") content = `<table><thead><tr><th>#</th><th>المعلم</th><th>المادة</th><th>الصف</th><th>تاريخ التصحيح</th><th>التشجيع والتوجيه</th><th>الملاحظات</th></tr></thead><tbody>${(report.data.items || []).map((row, i) => `<tr>${cell(i + 1)}${cell(row.teacher)}${cell(row.subject)}${cell(row.className)}${cell(row.dateRating)}${cell(row.phraseRating)}${cell(row.notes)}</tr>`).join("")}</tbody></table>`;
    else content = `<table><thead><tr><th>#</th><th>الصف</th><th>الشعبة</th><th>اسم المتعلم</th><th>التواصل</th><th>مواد التأخر</th><th>الأسباب</th><th>الحلول</th><th>النتائج</th><th>رعاية المدرسة</th><th>متابعة ولي الأمر</th></tr></thead><tbody>${(report.data.students || []).map((row, i) => `<tr>${cell(i + 1)}${cell(row.grade)}${cell(row.section)}${cell(row.name)}${cell(row.contact)}${cell(row.subjects)}${cell(row.reasons)}${cell(row.solutions)}${cell(row.result)}${cell(row.care)}${cell(row.parentFollowup)}</tr>`).join("")}</tbody></table>`;
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) { showToast?.("اسمح بالنوافذ المنبثقة لطباعة التقرير"); return; }
    win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${safe(type.title)}</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#172554;font-family:Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{width:100%;padding:8px}.head{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:16px 18px;margin-bottom:14px;border:2px solid #2563eb;background:#eff6ff}.head h1{margin:0 0 7px;font-size:22px}.head p{margin:0;color:#475569;font-size:12px}.badge{padding:8px 12px;background:#2563eb;color:#fff;font-weight:700}h2{font-size:15px;margin:16px 0 7px}table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #94a3b8;padding:6px 7px;text-align:right;vertical-align:top;font-size:10px;line-height:1.45;overflow-wrap:anywhere}th{background:#dbeafe;color:#1e3a8a;font-weight:800}tbody tr:nth-child(even){background:#f8fafc}.foot{display:flex;justify-content:space-between;margin-top:12px;padding-top:8px;border-top:1px solid #cbd5e1;font-size:10px;color:#64748b}.print{position:fixed;left:16px;bottom:16px;border:0;background:#2563eb;color:#fff;padding:10px 16px;font:700 13px Tahoma;cursor:pointer}@media print{.print{display:none}.sheet{padding:0}tr{break-inside:avoid}}</style></head><body><main class="sheet"><header class="head"><div><h1>${safe(type.title)}</h1><p>${safe(schoolName(report.schoolId))} · إعداد ${safe(report.authorName || "وكيل المدرسة")}</p></div><div class="badge">${safe(report.date)}</div></header>${content}<footer class="foot"><span>تقارير الوكيل - منصة مهام المدارس</span><span>${report.status === "principal_approved" ? "تقرير معتمد" : report.status === "submitted" ? "مرفوع للمدير" : "مسودة"}</span></footer></main><button class="print" onclick="window.print()">طباعة / PDF</button><script>addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body></html>`);
    win.document.close();
  }
  function collectPayload(form, old) { const data = JSON.parse(JSON.stringify(old)); for (const input of form.querySelectorAll("[data-field]")) { const path = input.dataset.field.split("."); let target = data; path.slice(0, -1).forEach((part) => { target = target[part]; }); target[path[path.length - 1]] = input.value; } return data; }
  function saveReportFromForm(event, submit = false) { event.preventDefault(); const { state } = ctx(); const form = event.currentTarget?.tagName === "FORM" ? event.currentTarget : event.currentTarget?.form; if (!form) return; form.querySelector('[name="payload"]').value = JSON.stringify(collectPayload(form, state.modal.vicePrincipalReport.data)); saveReport({ preventDefault() {}, currentTarget: form }, submit); }
  return { canView, canCreate, renderPage, renderModal, openReport, saveReport: saveReportFromForm, approveReport, selectTeacher, printReport };
}
