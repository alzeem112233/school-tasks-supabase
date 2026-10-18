import { createVicePrincipalReportModule as createBaseVicePrincipalReportModule } from "./vicePrincipalReportCleanService.js";
import { normalizeRole } from "../utils/permissionUtils.js";

const managerRoles = new Set(["superadmin", "general_manager", "branch_manager", "development_supervision_manager", "general_secretary", "school_principal"]);
const dailySections = [
  { key: "staffHighlights", title: "إيجابيات الكادر", fields: [["اسم الموظف", "name"], ["أبرز الإيجابيات", "positive"], ["التعزيز", "reinforcement"]], blank: () => ({ name: "", positive: "", reinforcement: "" }) },
  { key: "staffNotes", title: "ملاحظات الكادر", fields: [["اسم الموظف", "name"], ["أبرز الملاحظات", "note"], ["الإجراء", "action"]], blank: () => ({ name: "", note: "", action: "" }) },
  { key: "correction", title: "متابعة التصحيح", fields: [["المرحلة", "stage"], ["مصحح", "corrected", "number"], ["متأخر", "late", "number"], ["غير مصحح", "notCorrected", "number"], ["الإجمالي", "total", "number"], ["ملاحظات", "notes"]], blank: () => ({ stage: "", corrected: "", late: "", notCorrected: "", total: "", notes: "" }) },
  { key: "studentHighlights", title: "إيجابيات الطلاب", fields: [["اسم المتعلم", "name"], ["الفصل", "className"], ["أبرز الإيجابيات", "positive"], ["التعزيز", "reinforcement"]], blank: () => ({ name: "", className: "", positive: "", reinforcement: "" }) },
  { key: "studentViolations", title: "مخالفات الطلاب", fields: [["اسم المتعلم", "name"], ["الفصل", "className"], ["المخالفة", "violation"], ["الإجراء", "action"]], blank: () => ({ name: "", className: "", violation: "", action: "" }) },
  { key: "absenceContacts", title: "الغياب والاستئذان", fields: [["المرحلة", "stage"], ["عدد الغائبين", "absentCount", "number"], ["تم الرد", "answered", "number"], ["لم يرد", "noAnswer", "number"]], blank: () => ({ stage: "", absentCount: "", answered: "", noAnswer: "" }) },
  { key: "cumulativeAbsence", title: "الغياب التراكمي", fields: [["المرحلة", "stage"], ["اسم المتعلم", "name"], ["الفصل", "className"], ["عدد الأيام", "days", "number"], ["سبب الغياب", "reason"], ["الإجراء", "action"]], blank: () => ({ stage: "", name: "", className: "", days: "", reason: "", action: "" }) },
  { key: "teacherNotebooks", title: "تفعيل دفاتر المعلمين", fields: [["اسم المعلم", "teacher"], ["الفصل", "className"], ["أهم الملاحظات", "notes"], ["الإجراءات والمعالجات", "action"]], blank: () => ({ teacher: "", className: "", notes: "", action: "" }) },
  { key: "parentNotes", title: "ملاحظات أولياء الأمور", fields: [["المرحلة", "stage"], ["الملاحظات", "note"], ["المعالجات", "action"], ["ملاحظات عامة", "general"]], blank: () => ({ stage: "", note: "", action: "", general: "" }) },
  { key: "facilities", title: "مرافق مصادر التعلم", fields: [["اسم المرفق", "facility"], ["التفعيل", "activation"], ["الإيجابيات", "positives"], ["الملاحظات", "notes"]], blank: () => ({ facility: "", activation: "", positives: "", notes: "" }) },
];

const hasValue = (row, section) => section.fields.some(([, key]) => String(row?.[key] || "").trim());

export function createVicePrincipalReportModule(getContext) {
  const base = createBaseVicePrincipalReportModule(getContext);
  const ctx = () => getContext();
  const currentReport = () => ctx().state.modal?.vicePrincipalReport;
  const editable = (report) => base.canCreate() && report.status !== "principal_approved" && (report.authorId === ctx().state.currentUser?.id || managerRoles.has(normalizeRole(ctx().state.currentUser?.role, "")));
  const isSuperadmin = () => normalizeRole(ctx().state.currentUser?.role, "") === "superadmin";
  const deputyUsers = (schoolId) => (ctx().state.users || []).filter((user) => user.active !== false && normalizeRole(user.role, "") === "deputy_principal" && (!schoolId || user.schoolId === schoolId));

  function syncDraftFromForm() {
    const form = document.querySelector(".vice-supervision-daily-modal form");
    const report = currentReport();
    if (!form || !report) return;
    const data = { ...(report.data || {}) };
    dailySections.forEach((section) => { data[section.key] = []; });
    form.querySelectorAll("[data-field]").forEach((input) => {
      const [key, indexText, field] = input.dataset.field.split(".");
      const index = Number(indexText);
      if (!key || !Number.isInteger(index) || !field || !dailySections.some((section) => section.key === key)) return;
      data[key][index] ||= {};
      data[key][index][field] = input.value;
    });
    const recommendation = form.querySelector('[data-vice-recommendations]');
    data.recommendations = recommendation?.value || "";
    report.data = data;
    report.viceOpenSections = Array.from(form.querySelectorAll(".vice-supervision-section[open]")).map((section) => section.dataset.sectionKey).filter(Boolean);
    const deputy = form.querySelector("[data-vice-author]");
    if (deputy && isSuperadmin()) {
      const selected = deputyUsers(report.schoolId).find((user) => user.id === deputy.value);
      if (selected) { report.authorId = selected.id; report.authorName = selected.name; }
    }
  }

  function addDailyRecord(key) {
    const section = dailySections.find((item) => item.key === key);
    const report = currentReport();
    if (!section || !report || !editable(report)) return;
    syncDraftFromForm();
    report.data[key] ||= [];
    report.data[key].push(section.blank());
    ctx().render();
  }

  function removeDailyRecord(key, index) {
    const section = dailySections.find((item) => item.key === key);
    const report = currentReport();
    if (!section || !report || !editable(report)) return;
    syncDraftFromForm();
    report.data[key] = (report.data[key] || []).filter((_, rowIndex) => rowIndex !== Number(index));
    ctx().render();
  }

  function toggleDailySection(key, open) {
    const report = currentReport();
    if (!report) return;
    const values = new Set(report.viceOpenSections || []);
    if (open) values.add(key); else values.delete(key);
    report.viceOpenSections = [...values];
  }

  function field(section, row, index, [label, key, type = "text"], canEdit) {
    const safe = ctx().safe;
    const value = row?.[key] || "";
    return `<label class="field"><span>${label}</span><input type="${type}" data-field="${section.key}.${index}.${key}" value="${safe(value)}" ${canEdit ? "" : "readonly"}/></label>`;
  }

  function sectionCard(section, report, canEdit) {
    const safe = ctx().safe;
    const savedRows = (report.data?.[section.key] || []).filter((row) => hasValue(row, section));
    const rows = report.data?.[section.key]?.length ? report.data[section.key] : [section.blank()];
    const opened = (report.viceOpenSections || []).includes(section.key);
    return `<details class="admin-report-section vice-supervision-section" data-section-key="${section.key}" ${opened ? "open" : ""} ontoggle="actions.toggleViceDailySection('${section.key}',this.open)"><summary><span>${section.title}</span><div><b>${savedRows.length}</b>${canEdit ? `<button type="button" class="vice-summary-add" onclick="event.preventDefault();event.stopPropagation();actions.addViceDailyRecord('${section.key}')" aria-label="إضافة سجل" title="إضافة سجل">+</button>` : ""}</div></summary><div class="vice-supervision-records">${rows.map((row, index) => `<article class="admin-report-entry vice-supervision-record"><div class="vice-supervision-record-head"><strong>السجل ${index + 1}</strong>${canEdit ? `<button type="button" class="icon-btn vice-record-delete" onclick="actions.removeViceDailyRecord('${section.key}',${index})" aria-label="حذف السجل" title="حذف السجل">×</button>` : ""}</div><div class="admin-report-fields">${section.fields.map((item) => field(section, row, index, item, canEdit)).join("")}</div></article>`).join("")}</div></details>`;
  }

  function renderDailyModal() {
    const { state, safe, icons, schoolName } = ctx();
    const report = currentReport();
    if (!state.modal.viceDailyPrepared) {
      dailySections.forEach((section) => {
        const entered = (report.data?.[section.key] || []).filter((row) => hasValue(row, section));
        report.data[section.key] = entered.length ? entered : [section.blank()];
      });
      state.modal.viceDailyPrepared = true;
    }
    const canEdit = editable(report);
    const deputies = deputyUsers(report.schoolId);
    const authorField = isSuperadmin() ? `<label class="field vice-deputy-field"><span>الوكيل المسؤول عن التقرير</span><select data-vice-author>${deputies.map((user) => `<option value="${safe(user.id)}" ${report.authorId === user.id ? "selected" : ""}>${safe(user.name)}</option>`).join("") || `<option value="">لا يوجد وكيل في هذا الفرع</option>`}</select></label>` : "";
    return `<div class="modal"><form class="modal-box admin-report-modal vice-report-modal vice-supervision-daily-modal" onsubmit="actions.saveVicePrincipalReport(event)"><button type="button" class="icon-btn admin-modal-close" onclick="actions.closeModal()">${icons.close || "×"}</button><div class="modal-head"><div><span class="eyebrow">تقرير الوكيل اليومي</span><h3>${safe(schoolName(report.schoolId))} - ${report.status === "draft" ? "مسودة" : report.status === "submitted" ? "مرفوع" : "معتمد"}</h3></div></div><div class="admin-report-modal-body"><div class="vice-report-meta"><label class="field vice-daily-date"><span>التاريخ</span><input type="date" name="date" value="${safe(report.date)}" ${canEdit ? "" : "readonly"}/></label>${authorField}</div><div class="vice-supervision-sections">${dailySections.map((section) => sectionCard(section, report, canEdit)).join("")}</div><label class="field vice-wide-field"><span>أبرز الملاحظات والمقترحات</span><textarea data-vice-recommendations ${canEdit ? "" : "readonly"}>${safe(report.data?.recommendations || "")}</textarea></label><input type="hidden" name="payload" /></div><div class="admin-report-sticky-actions"><button type="button" class="btn secondary" onclick="actions.closeModal()">إغلاق</button><button type="button" class="btn secondary" onclick="actions.printVicePrincipalReport('${safe(report.id)}')">${icons.print || ""} طباعة التقرير</button>${canEdit ? `<button type="submit" class="btn">${icons.save || ""} حفظ</button><button type="button" class="btn" onclick="actions.saveVicePrincipalReport(event,true)">${icons.upload || ""} حفظ ورفع للمدير</button>` : ""}${managerRoles.has(normalizeRole(state.currentUser?.role, "")) && report.status !== "principal_approved" ? `<button type="button" class="btn" onclick="actions.approveVicePrincipalReport('${safe(report.id)}')">اعتماد التقرير</button>` : ""}</div></form></div>`;
  }

  function saveReport(event, submit = false) {
    syncDraftFromForm();
    const form = event.currentTarget?.tagName === "FORM" ? event.currentTarget : event.currentTarget?.form;
    if (form?.querySelector('[name="payload"]')) form.querySelector('[name="payload"]').value = JSON.stringify(currentReport()?.data || {});
    return base.saveReport(event, submit);
  }

  return {
    ...base,
    addDailyRecord,
    removeDailyRecord,
    toggleDailySection,
    saveReport,
    renderModal() {
      return currentReport()?.viceType === "daily" ? renderDailyModal() : base.renderModal();
    },
    renderPage() {
      const safe = ctx().safe;
      return base.renderPage().replace(/(<button[^>]*openVicePrincipalReport\('[^']+','([^']+)'\)[^>]*><span>)(.*?)(<\/span>)/g, (match, start, id, label, end) => {
        const report = (ctx().state.administrativeReports || []).find((item) => item.id === id);
        return report?.authorName ? `${start}${label}<small class="vice-report-author">رفع بواسطة: ${safe(report.authorName)}</small>${end}` : match;
      });
    },
  };
}
