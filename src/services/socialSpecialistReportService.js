import { createUuid } from "../utils/idUtils.js";
import { normalizeRole } from "../utils/permissionUtils.js";
import { isTeacherVisibleFor } from "./teacherDirectoryService.js";

const F = (key, label, type = "text") => ({ key, label, type });
const TYPES = {
  guidance: { title: "موجّهات معالجة الحالات التربوية الفردية", hint: "توثيق الحالة والتوجيه والإجراء المتخذ.", fields: [F("caseType", "نوع الحالة"), F("guidance", "التوجيه المناسب", "textarea"), F("followup", "إجراء المتابعة", "textarea"), F("result", "النتيجة")] },
  incidents: { title: "سجل المواقف اليومية الفردية", hint: "الحالات السريعة والطارئة والإجراءات المتخذة.", fields: [F("student", "اسم الطالب الرباعي"), F("repeat", "التكرار", "number"), F("incidentDate", "تاريخ الموقف", "date"), F("referralTeacherId", "المعلم المحيل", "teacher"), F("summary", "ملخص الموقف", "textarea"), F("action", "الإجراءات المتخذة", "textarea"), F("followup", "إجراءات المتابعة", "textarea")] },
  specialCases: { title: "سجل الحالات الخاصة", hint: "سجل سري يستخدم رمز الطالب لحماية الخصوصية.", confidential: true, fields: [F("studentCode", "رمز الطالب"), F("referralTeacherId", "المعلم المحيل", "teacher"), F("problem", "وصف المشكلة", "textarea"), F("sessionOne", "الجلسة الأولى وتاريخها", "textarea"), F("sessionTwo", "الجلسة الثانية وتاريخها", "textarea"), F("sessionThree", "الجلسة الثالثة وتاريخها", "textarea"), F("diagnosis", "التشخيص النهائي", "textarea"), F("recommendations", "التوصيات النهائية", "textarea")] },
  parentContacts: { title: "سجل زيارات وتواصل أولياء الأمور", hint: "متابعة التواصل السلوكي ونتيجته.", fields: [F("guardian", "اسم ولي الأمر"), F("phone", "رقم الهاتف", "tel"), F("student", "اسم الطالب"), F("relation", "صلة القرابة"), F("contactDate", "تاريخ التواصل", "date"), F("contactType", "نوع التواصل", "select:زيارة,اتصال,رسالة,اجتماع"), F("reason", "سبب التواصل", "textarea"), F("result", "النتيجة", "textarea")] },
  groupGuidance: { title: "سجل الإرشاد الجماعي", hint: "توثيق الأنشطة الإرشادية ونسبة تنفيذها.", fields: [F("activity", "اسم النشاط"), F("objectives", "الأهداف", "textarea"), F("period", "فترة التنفيذ"), F("place", "المكان"), F("target", "الفئة المستهدفة"), F("maleCount", "عدد الطلاب", "number"), F("femaleCount", "عدد الطالبات", "number"), F("methods", "أساليب التنفيذ", "textarea"), F("percentage", "نسبة التنفيذ %", "number"), F("difficulties", "المشكلات والصعوبات", "textarea"), F("solutions", "الحلول المقترحة", "textarea")] },
  delayedStudents: { title: "سجل المتأخرين دراسيًا", hint: "متابعة أسباب التأخر والرعاية والنتيجة.", fields: [F("student", "اسم الطالب الرباعي"), F("period", "فترة المتابعة"), F("contact", "نوع التواصل"), F("subjects", "مواد التأخر الدراسي"), F("reasons", "أسباب التأخر", "textarea"), F("schoolCare", "الرعاية المقدمة من المدرسة", "textarea"), F("guardianFollowup", "المتابعة المقترحة على ولي الأمر", "textarea"), F("result", "النتيجة", "select:تحسن,ثابت,تراجع")] },
  chronicIllness: { title: "سجل الأمراض المزمنة", hint: "متابعة الحالة الصحية وأثرها والرعاية المقدمة.", fields: [F("student", "اسم الطالب"), F("illness", "نوع المرض"), F("meetingDate", "تاريخ المقابلة", "date"), F("effect", "أثر المرض", "textarea"), F("circumstances", "الظروف الاجتماعية والاقتصادية", "textarea"), F("followup", "إجراءات المتابعة", "textarea"), F("care", "الرعاية المقدمة", "textarea"), F("notes", "ملاحظات", "textarea")] },
  idealStudent: { title: "استمارة اختيار الطالب المثالي", hint: "ترشيح الطالب بعد الاختبارات الشهرية وبمشاركة المعلم.", fields: [F("student", "اسم الطالب"), F("teacherId", "المعلم أو رائد الصف المرشح", "teacher"), F("achievement", "التحصيل الدراسي", "number"), F("behavior", "السلوك والانضباط", "number"), F("participation", "المشاركة والأنشطة", "number"), F("attendance", "الحضور والمواظبة", "number"), F("total", "المجموع", "number"), F("notes", "ملاحظات", "textarea")] },
  values: { title: "تقرير تفعيل القيم", hint: "متابعة وسائل تفعيل القيمة المستهدفة.", fields: [F("valueTitle", "القيمة المستهدفة"), F("method", "وسيلة التفعيل", "select:الإذاعة,الملصقات,حصة الريادة,النشرات,المجلة الحائطية,فيديو,برامج الحافلات,دروس الخط والإملاء والتعبير,أخرى"), F("executionDate", "تاريخ التنفيذ", "date"), F("status", "حالة التنفيذ", "select:نُفّذ,لم يُنفّذ"), F("reason", "سبب عدم التنفيذ", "textarea"), F("notes", "ملاحظات", "textarea")] },
  weekly: { title: "التقرير الأسبوعي للأخصائي", hint: "ملخص أعمال الأسبوع والحالات والأنشطة والتواصل.", fields: [F("category", "القسم", "select:حصص الريادة,حالات محالة,أنشطة منفذة,تواصل أولياء الأمور,ملاحظات وتوصيات"), F("title", "البيان أو عنوان النشاط"), F("teacherId", "المعلم المعني", "teacher"), F("planned", "المخطط"), F("executed", "المنفذ"), F("stage", "المرحلة"), F("cause", "السبب", "textarea"), F("treatment", "المعالجة", "textarea"), F("notes", "ملاحظات", "textarea")] },
  monthly: { title: "التقرير الشهري للأخصائي", hint: "تجميع منظم لأعمال الشهر حسب الأسابيع.", fields: [F("week", "الأسبوع", "select:الأول,الثاني,الثالث,الرابع,الخامس"), F("category", "القسم", "select:حصص الريادة,حالات محالة,برامج لم تنفذ,برامج منفذة خارج الخطة,تواصل أولياء الأمور,ملاحظات وتوصيات"), F("title", "البيان أو النشاط"), F("teacherId", "المعلم المعني", "teacher"), F("stage", "المرحلة"), F("cause", "السبب", "textarea"), F("treatment", "الحلول والمعالجات", "textarea"), F("notes", "ملاحظات", "textarea")] },
  unimplemented: { title: "برامج وأنشطة لم تُنفذ خلال العام", hint: "متابعة الترحيل أو الإلغاء وأسباب عدم التنفيذ.", fields: [F("activity", "البرنامج أو النشاط"), F("domain", "المجال"), F("planDate", "موعد التنفيذ حسب الخطة", "date"), F("proposedDate", "الموعد المقترح", "date"), F("cancelled", "إلغاء التنفيذ", "select:لا,نعم"), F("reasons", "الأسباب", "textarea"), F("notes", "ملاحظات", "textarea")] },
  statusRegister: { title: "كشف متابعة سجل بيان الحالة", hint: "متابعة ملاحظات ولي الأمر والرد عليها.", fields: [F("student", "اسم الطالب"), F("guardianNote", "ملاحظة ولي الأمر", "textarea"), F("relation", "صلة القرابة"), F("responderTeacherId", "المعلم المعني بالرد", "teacher"), F("replyStatus", "حالة الرد", "select:تم الرد,لم يتم الرد"), F("notes", "ملاحظات", "textarea")] },
};

const managerRoles = ["superadmin", "general_manager", "branch_manager", "development_supervision_manager", "general_secretary", "school_principal"];
const role = (user) => normalizeRole(user?.role, "");
const canManage = (user) => managerRoles.includes(role(user));
const emptyRow = (type) => Object.fromEntries(type.fields.flatMap((field) => field.type === "teacher" ? [[field.key, ""], [`${field.key}Name`, ""], [`${field.key}Subject`, ""], [`${field.key}Class`, ""]] : [[field.key, ""]]));
const blankData = (key) => ({ meta: { month: "", grade: "", section: "", recommendations: "" }, rows: [emptyRow(TYPES[key]), emptyRow(TYPES[key]), emptyRow(TYPES[key])] });

export function createSocialSpecialistReportModule(getContext) {
  const ctx = () => getContext();
  const allReports = () => (ctx().state.administrativeReports || []).filter((item) => String(item.reportKind || "").startsWith("social_specialist_"));
  function canView(user = ctx().state.currentUser) { return canManage(user) || role(user) === "specialist_supervisor"; }
  function canCreate(user = ctx().state.currentUser) { return role(user) === "specialist_supervisor" || canManage(user); }
  function canEditReport(report, user = ctx().state.currentUser) {
    return Boolean(report && canCreate(user) && report.status !== "principal_approved" && (report.specialistId === user?.id || canManage(user)));
  }
  function reportType(report) { return report?.socialType || String(report?.reportKind || "").replace("social_specialist_", "") || "guidance"; }
  function teacherDirectory(schoolId) { const { state } = ctx(); return (state.teacherDirectory || []).filter((item) => item.active !== false && item.schoolId === schoolId && isTeacherVisibleFor(state, item.id, state.currentUser?.id || "")).sort((a, b) => String(a.teacherName || "").localeCompare(String(b.teacherName || ""), "ar")); }
  function statusLabel(status) { return status === "principal_approved" ? "معتمد" : status === "submitted" ? "مرفوع للمدير" : "مسودة"; }
  function scopedReports() { const { state } = ctx(); return allReports().filter((item) => canManage() || item.schoolId === state.currentUser?.schoolId).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))); }

  function persist(report) {
    const { state, cloud, showToast, render } = ctx();
    state.administrativeReports = [report, ...(state.administrativeReports || []).filter((item) => item.id !== report.id)];
    localStorage.setItem("schoolTasksAdministrativeReportsV1", JSON.stringify(state.administrativeReports));
    if (cloud?.enabled && cloud.client) {
      const payload = { ...report, type: report.reportKind, supervisorId: report.specialistId, sections: { socialSpecialist: { socialType: report.socialType, data: report.data, specialistName: report.specialistName } } };
      cloud.client.rpc("save_social_specialist_report", { p_report: payload }).then(({ error }) => { if (error) throw error; }).catch((error) => showToast(error?.message || "تعذر رفع تقرير الأخصائي"));
    }
    state.modal = null; render();
  }

  function openReport(typeKey, id = "") {
    const { state, render } = ctx();
    const existing = allReports().find((item) => item.id === id);
    const key = existing ? reportType(existing) : typeKey;
    if (!TYPES[key]) return;
    state.modal = { type: "social_specialist_report", socialSpecialistReport: existing || { id: createUuid(), reportKind: `social_specialist_${key}`, socialType: key, date: new Date().toISOString().slice(0, 10), schoolId: state.currentUser?.schoolId || "", specialistId: state.currentUser?.id || "", specialistName: state.currentUser?.name || "", status: "draft", data: blankData(key), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
    render();
  }

  function collect(form, oldData) {
    const data = JSON.parse(JSON.stringify(oldData));
    for (const input of form.querySelectorAll("[data-field]")) {
      const path = input.dataset.field.split("."); let target = data;
      for (const part of path.slice(0, -1)) target = target[part];
      target[path.at(-1)] = input.value;
    }
    return data;
  }

  function formFromEvent(event) { return event?.currentTarget?.tagName === "FORM" ? event.currentTarget : event?.currentTarget?.form; }
  function saveReport(event, submit = false) {
    event.preventDefault(); const { state, showToast } = ctx(); const form = formFromEvent(event); const old = state.modal?.socialSpecialistReport; if (!form || !old || !canEditReport(old)) { showToast?.("لا يمكن تعديل التقرير بعد اعتماده، أو لغير صاحب التقرير."); return; }
    const data = collect(form, old.data); const date = new FormData(form).get("date") || old.date;
    persist({ ...old, date, data, status: submit ? "submitted" : "draft", submittedAt: submit ? new Date().toISOString() : old.submittedAt || "", updatedAt: new Date().toISOString() });
  }
  function approveReport(id) { const report = allReports().find((item) => item.id === id) || ctx().state.modal?.socialSpecialistReport; if (!report || !canManage()) return; persist({ ...report, status: "principal_approved", principalApprovedAt: new Date().toISOString(), principalApprovedBy: ctx().state.currentUser?.id || "", updatedAt: new Date().toISOString() }); }
  function updateRows(event, index = -1) { event.preventDefault(); const { state, render } = ctx(); const form = formFromEvent(event); const report = state.modal?.socialSpecialistReport; if (!form || !report || !canEditReport(report)) return; report.data = collect(form, report.data); const type = TYPES[reportType(report)]; if (index < 0) report.data.rows.push(emptyRow(type)); else if (report.data.rows.length > 1) report.data.rows.splice(index, 1); render(); }

  function renderPage() {
    const { safe, icons, schoolName } = ctx(); if (!canView()) return `<section class="empty-state"><h2>لا تملك صلاحية عرض تقارير الأخصائي.</h2></section>`;
    const reports = scopedReports();
    const cards = Object.entries(TYPES).map(([key, type], index) => { const history = reports.filter((report) => reportType(report) === key); return `<article class="social-report-card tone-${index % 4}"><header><span>${index + 1}</span><div><h3>${type.title}</h3><p>${type.hint}</p></div></header><div class="social-card-stats"><b>${history.length}</b> محفوظ <i></i><b>${history.filter((item) => item.status === "principal_approved").length}</b> معتمد</div><button type="button" class="btn" onclick="actions.openSocialSpecialistReport('${key}')">${icons.plus || "+"} إنشاء تقرير</button><div class="social-report-history">${history.slice(0, 4).map((item) => `<button type="button" onclick="actions.openSocialSpecialistReport('${key}','${safe(item.id)}')"><span>${safe(item.date)} · ${safe(schoolName(item.schoolId))}</span><b>${statusLabel(item.status)}</b></button>`).join("") || `<small>لا توجد سجلات محفوظة بعد.</small>`}</div></article>`; }).join("");
    return `<section class="admin-report-page social-report-page"><div class="social-report-hero"><div><span>تقارير الأخصائي الاجتماعي</span><h2>السجلات والمتابعة الطلابية</h2><p>نماذج مستقلة، واضحة على الهاتف، ومحفوظة حسب الفرع والصلاحية.</p></div><b>${reports.length}<small>تقرير محفوظ</small></b></div><div class="social-report-grid">${cards}</div></section>`;
  }

  function inputField(field, value, path, rowIndex) {
    const { safe, state } = ctx();
    if (field.type === "textarea") return `<label class="field social-wide"><span>${field.label}</span><textarea data-field="${path}">${safe(value)}</textarea></label>`;
    if (field.type.startsWith("select:")) { const options = field.type.slice(7).split(","); return `<label class="field"><span>${field.label}</span><select data-field="${path}"><option value="">اختر</option>${options.map((option) => `<option value="${safe(option)}" ${value === option ? "selected" : ""}>${safe(option)}</option>`).join("")}</select></label>`; }
    if (field.type === "teacher") {
      const teachers = teacherDirectory(state.modal.socialSpecialistReport.schoolId); const row = state.modal.socialSpecialistReport.data.rows[rowIndex] || {}; const selected = value || "";
      return `<label class="field social-wide"><span>${field.label}</span><select data-field="${path}" data-teacher-key="${field.key}" data-row-index="${rowIndex}" onchange="actions.selectSocialSpecialistTeacher(this)"><option value="">اختر من معلمي الفرع</option>${teachers.map((teacher) => `<option value="${safe(teacher.id)}" ${selected === teacher.id ? "selected" : ""}>${safe(teacher.teacherName)} · ${safe(teacher.subjectName || "بدون مادة")} ${teacher.className ? `· ${safe(teacher.className)}` : ""}</option>`).join("")}</select><input type="hidden" data-field="rows.${rowIndex}.${field.key}Name" value="${safe(row[`${field.key}Name`] || "")}"><input type="hidden" data-field="rows.${rowIndex}.${field.key}Subject" value="${safe(row[`${field.key}Subject`] || "")}"><input type="hidden" data-field="rows.${rowIndex}.${field.key}Class" value="${safe(row[`${field.key}Class`] || "")}"></label>`;
    }
    return `<label class="field"><span>${field.label}</span><input type="${field.type}" data-field="${path}" value="${safe(value)}" ${field.type === "number" ? "min=\"0\"" : ""}></label>`;
  }

  function renderModal() {
    const { state, safe, icons, schoolName } = ctx(); const report = state.modal?.socialSpecialistReport; if (!report) return ""; const key = reportType(report); const type = TYPES[key]; const data = report.data || blankData(key); const editable = canEditReport(report);
    const rows = data.rows.map((row, index) => `<article class="social-entry-card"><header><span>${index + 1}</span><strong>${type.title}</strong>${editable ? `<button type="button" class="icon-btn" title="حذف السجل" onclick="actions.removeSocialSpecialistRow(event,${index})">${icons.trash || "×"}</button>` : ""}</header><div class="social-entry-grid">${type.fields.map((field) => inputField(field, row[field.key] || "", `rows.${index}.${field.key}`, index)).join("")}</div></article>`).join("");
    return `<div class="modal"><form class="modal-box admin-report-modal social-report-modal" onsubmit="actions.saveSocialSpecialistReport(event)"><button type="button" class="icon-btn admin-modal-close" onclick="actions.closeModal()">${icons.close || "×"}</button><div class="social-modal-head"><div><span>تقرير الأخصائي الاجتماعي</span><h2>${type.title}</h2><p>${safe(schoolName(report.schoolId))} · ${safe(report.specialistName || "الأخصائي الاجتماعي")}</p></div><label><span>التاريخ</span><input type="date" name="date" value="${safe(report.date)}" ${editable ? "" : "readonly"}></label></div><fieldset class="admin-report-modal-body" ${editable ? "" : "disabled"}><div class="social-meta-grid"><label class="field"><span>الشهر</span><input data-field="meta.month" value="${safe(data.meta?.month || "")}"></label><label class="field"><span>الصف</span><input data-field="meta.grade" value="${safe(data.meta?.grade || "")}"></label><label class="field"><span>الشعبة</span><input data-field="meta.section" value="${safe(data.meta?.section || "")}"></label></div>${type.confidential ? `<div class="social-privacy-note">هذا السجل سري. استخدم رمز الطالب بدل الاسم.</div>` : ""}<div class="social-entry-list">${rows}</div>${editable ? `<button type="button" class="btn secondary social-add-row" onclick="actions.addSocialSpecialistRow(event)">${icons.plus || "+"} إضافة سجل جديد</button>` : ""}<label class="field social-recommendations"><span>التوصيات العامة</span><textarea data-field="meta.recommendations">${safe(data.meta?.recommendations || "")}</textarea></label></fieldset><div class="admin-report-sticky-actions social-actions"><button type="button" class="btn secondary" onclick="actions.closeModal()">إغلاق</button><button type="button" class="btn secondary" onclick="actions.printSocialSpecialistReport('${safe(report.id)}')">${icons.print || ""} طباعة</button>${editable ? `<button type="submit" class="btn">${icons.save || ""} حفظ مسودة</button><button type="button" class="btn" onclick="actions.saveSocialSpecialistReport(event,true)">${icons.upload || ""} رفع للمدير</button>` : ""}${canManage() && report.status !== "principal_approved" ? `<button type="button" class="btn success" onclick="actions.approveSocialSpecialistReport('${safe(report.id)}')">اعتماد</button>` : ""}</div></form></div>`;
  }

  function selectTeacher(input) {
    const { state } = ctx(); const report = state.modal?.socialSpecialistReport; if (!report) return; const teacher = teacherDirectory(report.schoolId).find((item) => item.id === input.value); const form = input.form; const index = input.dataset.rowIndex; const key = input.dataset.teacherKey;
    const set = (suffix, value) => { const field = form.querySelector(`[data-field="rows.${index}.${key}${suffix}"]`); if (field) field.value = value || ""; };
    set("Name", teacher?.teacherName); set("Subject", teacher?.subjectName); set("Class", teacher?.className);
  }

  function printReport(id = "", section = "all") {
    const { state, safe, schoolName, showToast } = ctx(); const report = allReports().find((item) => item.id === id) || state.modal?.socialSpecialistReport; if (!report) return showToast("لم يتم العثور على التقرير"); const key = reportType(report); const type = TYPES[key]; if (section !== "all" && section !== key) return showToast("اختر القسم المطابق لنوع الملف"); const data = report.data || blankData(key);
    const display = (row, field) => field.type === "teacher" ? row[`${field.key}Name`] || "-" : row[field.key] || "-";
    const table = `<table><thead><tr><th>#</th>${type.fields.map((field) => `<th>${safe(field.label)}</th>`).join("")}</tr></thead><tbody>${data.rows.map((row, index) => `<tr><td>${index + 1}</td>${type.fields.map((field) => `<td>${safe(display(row, field))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const win = window.open("", "_blank", "width=1100,height=800"); if (!win) return showToast("اسمح بالنوافذ المنبثقة لطباعة التقرير");
    win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${safe(type.title)}</title><style>@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{margin:0;color:#172554;font-family:Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{padding:6px}.head{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:14px 16px;margin-bottom:10px;border:2px solid #0f766e;background:#ecfdf5}.head h1{margin:0 0 6px;font-size:20px}.head p{margin:0;color:#475569;font-size:11px}.badge{padding:8px 12px;background:#0f766e;color:#fff;font-weight:700}.meta{display:flex;gap:8px;margin-bottom:9px}.meta span{padding:6px 9px;border:1px solid #cbd5e1;background:#f8fafc;font-size:10px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #94a3b8;padding:5px;text-align:right;vertical-align:top;font-size:8.5px;line-height:1.4;overflow-wrap:anywhere}th{background:#ccfbf1;color:#134e4a}tbody tr:nth-child(even){background:#f8fafc}.notes{margin-top:9px;padding:8px;border:1px solid #cbd5e1;font-size:10px}.foot{display:flex;justify-content:space-between;margin-top:8px;font-size:9px;color:#64748b}.print{position:fixed;left:14px;bottom:14px;border:0;background:#0f766e;color:white;padding:10px 16px;font:700 13px Tahoma}@media print{.print{display:none}tr{break-inside:avoid}.sheet{padding:0}}</style></head><body><main class="sheet"><header class="head"><div><h1>${safe(type.title)}</h1><p>${safe(schoolName(report.schoolId))} · إعداد ${safe(report.specialistName || "الأخصائي الاجتماعي")}</p></div><div class="badge">${safe(report.date)}</div></header><div class="meta"><span>الشهر: ${safe(data.meta?.month || "-")}</span><span>الصف: ${safe(data.meta?.grade || "-")}</span><span>الشعبة: ${safe(data.meta?.section || "-")}</span></div>${table}<div class="notes"><b>التوصيات العامة:</b> ${safe(data.meta?.recommendations || "-")}</div><footer class="foot"><span>تقارير الأخصائي الاجتماعي - منصة مهام المدارس</span><span>${statusLabel(report.status)}</span></footer></main><button class="print" onclick="window.print()">طباعة / PDF</button><script>addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body></html>`); win.document.close();
  }

  return { canView, canCreate, renderPage, renderModal, openReport, saveReport, approveReport, addRow: (event) => updateRows(event), removeRow: updateRows, selectTeacher, printReport };
}
