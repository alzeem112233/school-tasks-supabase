import { createUuid } from "../utils/idUtils.js";
import { normalizeRole } from "../utils/permissionUtils.js";

const TYPES = {
  grades: { kind: "vice_principal_grade_register", title: "ط§ظ„ظƒط´ظپ ط§ظ„ط£ط³ط¨ظˆط¹ظٹ ظ„ظ…طھط§ط¨ط¹ط© ط³ط¬ظ„ ط§ظ„ط¯ط±ط¬ط§طھ" },
  absence: { kind: "vice_principal_absence", title: "ظ…ظ„ط­ظ‚ ط§ظ„طھظ‚ط±ظٹط± ط§ظ„ظٹظˆظ…ظٹ ظ„ظ„ط؛ظٹط§ط¨ ط§ظ„طھط±ط§ظƒظ…ظٹ" },
  correction: { kind: "vice_principal_correction", title: "طھظ‚ط±ظٹط± ط­ظ…ظ„ط© ط§ظ„طھطµط­ظٹط­ ط§ظ„ط¯ظˆط±ظٹط©" },
  delayed: { kind: "vice_principal_delayed_students", title: "ط³ط¬ظ„ ط§ظ„ظ…طھط£ط®ط±ظٹظ† ط¯ط±ط§ط³ظٹط§ظ‹" },
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
    supabase?.isCloudEnabled?.() && supabase.saveCloudDoc?.("administrativeReports", report.id, report, false).catch((error) => showToast?.(error?.message || "طھط¹ط°ط± ط±ظپط¹ ط§ظ„طھظ‚ط±ظٹط±"));
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
    const { state, safe, icons, schoolName } = ctx(); if (!canView()) return `<section class="empty-state"><h2>ظ„ط§ طھظ…ظ„ظƒ طµظ„ط§ط­ظٹط© ط¹ط±ط¶ طھظ‚ط§ط±ظٹط± ط§ظ„ظˆظƒظٹظ„.</h2></section>`;
    const list = reports().filter((item) => canManage() || item.schoolId === state.currentUser?.schoolId); const cards = Object.entries(TYPES).map(([key, type]) => { const items = list.filter((item) => item.reportKind === type.kind); return `<article class="vice-report-card"><div><span class="eyebrow">طھظ‚ط±ظٹط± ط§ظ„ظˆظƒظٹظ„</span><h3>${type.title}</h3><p>${items.length} طھظ‚ط±ظٹط± ظ…ط­ظپظˆط¸ آ· ${items.filter((item) => item.status === "principal_approved").length} ظ…ط¹طھظ…ط¯</p></div><button class="btn" onclick="actions.openVicePrincipalReport('${key}','')">${icons.plus || "+"} ظپطھط­ طھظ‚ط±ظٹط±</button><div class="vice-report-history">${items.slice(0, 5).map((item) => `<button type="button" class="vice-history-row" onclick="actions.openVicePrincipalReport('${key}','${safe(item.id)}')"><span>${safe(item.date)} آ· ${safe(schoolName(item.schoolId))}</span><b>${item.status === "principal_approved" ? "ظ…ط¹طھظ…ط¯" : item.status === "submitted" ? "ظ…ط±ظپظˆط¹" : "ظ…ط³ظˆط¯ط©"}</b></button>`).join("") || `<small>ظ„ط§ طھظˆط¬ط¯ طھظ‚ط§ط±ظٹط± ظ…ط­ظپظˆط¸ط©.</small>`}</div></article>`; }).join("");
    return `<section class="admin-report-page vice-report-page"><div class="admin-report-hero"><div><span>طھظ‚ط§ط±ظٹط± ط§ظ„ظˆظƒظٹظ„</span><h2>ظ…طھط§ط¨ط¹ط© ط§ظ„ط³ط¬ظ„ط§طھ ظˆط§ظ„طھظ‚ط§ط±ظٹط±</h2><p>ظƒظ„ ظ†ظ…ظˆط°ط¬ ظ…ط³طھظ‚ظ„طŒ ظ…ط­ظپظˆط¸ ظپظٹ ط§ظ„ط³ط­ط§ط¨ط©طŒ ظˆظ…ظ‡ظٹط£ ظ„ظ„ط¥ط¯ط®ط§ظ„ ظ…ظ† ط§ظ„ظ‡ط§طھظپ.</p></div></div><div class="vice-report-grid">${cards}</div></section>`;
  }
  function field(label, name, value, type = "text") { return `<label class="field"><span>${label}</span><input type="${type}" data-field="${name}" value="${ctx().safe(value)}" /></label>`; }
  function renderGrades(data) { return `<h4>ظ…طھط§ط¨ط¹ط© ط³ط¬ظ„ ط§ظ„ط¯ط±ط¬ط§طھ ظ„ظƒظ„ ط£ط³ط¨ظˆط¹</h4><div class="vice-mobile-list">${data.weeks.map((row, i) => `<article class="vice-form-card"><strong>ط§ظ„ط£ط³ط¨ظˆط¹ ${i + 1}</strong>${field("ظ…", `weeks.${i}.m`, row.m)}${field("ط¬", `weeks.${i}.j`, row.j)}${field("ظ„", `weeks.${i}.l`, row.l)}${field("ظ…ظ„ط§ط­ط¸ط§طھ", `weeks.${i}.notes`, row.notes)}</article>`).join("")}</div>`; }
  function renderAbsence(data) { const facilities = ["ط§ظ„ظ…ظƒطھط¨ط©", "ظ…ط¹ظ…ظ„ ط§ظ„ظƒظ…ط¨ظٹظˆطھط±", "ظ…ط¹ظ…ظ„ ط§ظ„ط¹ظ„ظˆظ…", "ط§ظ„ط´ط§ط´ط© ط§ظ„ط°ظƒظٹط©", "ط§ظ„ظˆط³ط§ط¦ظ„", "ط§ظ„ظ…ظ‚طµظپ"]; return `<h4>ط§ظ„ط؛ظٹط§ط¨ ط§ظ„طھط±ط§ظƒظ…ظٹ ط­ط³ط¨ ط§ظ„ط£ط³ط§ط¨ظٹط¹</h4><div class="vice-mobile-list">${data.weeks.map((week, wi) => `<article class="vice-form-card"><strong>ط§ظ„ط£ط³ط¨ظˆط¹ ${wi + 1}</strong>${week.map((row, ri) => `<div class="vice-subcard"><b>ط§ظ„ط³ط¬ظ„ ${ri + 1}</b>${field("ط§ط³ظ… ط§ظ„ظ…طھط¹ظ„ظ…", `weeks.${wi}.${ri}.name`, row.name)}${field("ط§ظ„ظپطµظ„", `weeks.${wi}.${ri}.className`, row.className)}${field("ط¹ط¯ط¯ ط§ظ„ط£ظٹط§ظ…", `weeks.${wi}.${ri}.days`, row.days, "number")}${field("ط³ط¨ط¨ ط§ظ„ط؛ظٹط§ط¨", `weeks.${wi}.${ri}.reason`, row.reason)}${field("ط§ظ„ط¥ط¬ط±ط§ط،", `weeks.${wi}.${ri}.action`, row.action)}</div>`).join("")}</article>`).join("")}</div><h4>ظ…طھط§ط¨ط¹ط© ظ…ط±ط§ظپظ‚ ط§ظ„ظ…ط¯ط±ط³ط©</h4><div class="vice-mobile-list">${data.facilities.map((row, i) => `<article class="vice-form-card"><strong>${facilities[i]}</strong>${field("ط§ظ„طھظپط¹ظٹظ„", `facilities.${i}.activation`, row.activation)}${field("ط§ظ„ط¥ظٹط¬ط§ط¨ظٹط§طھ", `facilities.${i}.positives`, row.positives)}${field("ط§ظ„ظ…ظ„ط§ط­ط¸ط§طھ", `facilities.${i}.notes`, row.notes)}</article>`).join("")}</div>`; }
  function renderCorrection(data) { return `<h4>ط­ظ…ظ„ط© ط§ظ„طھطµط­ظٹط­ ط§ظ„ط¯ظˆط±ظٹط©</h4><div class="vice-mobile-list">${data.items.map((row, i) => `<article class="vice-form-card"><strong>ط§ظ„ظ…ط¹ظ„ظ… ${i + 1}</strong>${field("ط§ط³ظ… ط§ظ„ظ…ط¹ظ„ظ…", `items.${i}.teacher`, row.teacher)}${field("ط§ظ„ظ…ط§ط¯ط©", `items.${i}.subject`, row.subject)}${field("ط§ظ„طµظپ", `items.${i}.className`, row.className)}${field("ط§ظ„طھظ‚ظٹظٹظ… ظˆظپظ‚ طھط§ط±ظٹط® ط§ظ„طھطµط­ظٹط­", `items.${i}.dateRating`, row.dateRating)}${field("ط§ظ„طھظ‚ظٹظٹظ… ظˆظپظ‚ ط¹ط¨ط§ط±ط§طھ ط§ظ„طھط´ط¬ظٹط¹ ظˆط§ظ„طھظˆط¬ظٹظ‡", `items.${i}.phraseRating`, row.phraseRating)}${field("ط£ط¨ط±ط² ط§ظ„ظ…ظ„ط§ط­ط¸ط§طھ", `items.${i}.notes`, row.notes)}</article>`).join("")}</div>`; }
  function renderDelayed(data) { return `<h4>ط³ط¬ظ„ ط§ظ„ظ…طھط£ط®ط±ظٹظ† ط¯ط±ط§ط³ظٹط§ظ‹</h4><div class="vice-mobile-list">${data.students.map((row, i) => `<article class="vice-form-card"><strong>ط§ظ„ظ…طھط¹ظ„ظ… ${i + 1}</strong>${field("ط§ظ„طµظپ", `students.${i}.grade`, row.grade)}${field("ط§ظ„ط´ط¹ط¨ط©", `students.${i}.section`, row.section)}${field("ط§ط³ظ… ط§ظ„ظ…طھط¹ظ„ظ… ط§ظ„ط«ظ„ط§ط«ظٹ ظ…ط¹ ط§ظ„ظ„ظ‚ط¨", `students.${i}.name`, row.name)}${field("ظپطھط±ط© ط§ظ„ظ…طھط§ط¨ط¹ط© ظˆظ†ظˆط¹ ط§ظ„طھظˆط§طµظ„", `students.${i}.contact`, row.contact)}${field("ظ…ظˆط§ط¯ ط§ظ„طھط£ط®ط± ط§ظ„ط¯ط±ط§ط³ظٹ", `students.${i}.subjects`, row.subjects)}${field("ط£ط³ط¨ط§ط¨ ط§ظ„طھط£ط®ط± ط§ظ„ط¯ط±ط§ط³ظٹ", `students.${i}.reasons`, row.reasons)}${field("ط§ظ„ط­ظ„ظˆظ„ ظˆط·ط±ظ‚ ط§ظ„ط¹ظ„ط§ط¬", `students.${i}.solutions`, row.solutions)}${field("ظ†طھط§ط¦ط¬ ط§ظ„ظ…طھط§ط¨ط¹ط©", `students.${i}.result`, row.result)}${field("ط§ظ„ط±ط¹ط§ظٹط© ط§ظ„ظ…ظ‚ط¯ظ…ط© ظ…ظ† ط§ظ„ظ…ط¯ط±ط³ط©", `students.${i}.care`, row.care)}${field("ط§ظ„ظ…طھط§ط¨ط¹ط© ط§ظ„ظ…ظ‚طھط±ط­ط© ط¹ظ„ظ‰ ظˆظ„ظٹ ط§ظ„ط£ظ…ط±", `students.${i}.parentFollowup`, row.parentFollowup)}</article>`).join("")}</div>`; }
  function renderModal() {
    const { state, safe, icons, schoolName } = ctx(); const report = state.modal?.vicePrincipalReport; if (!report) return ""; const type = TYPES[report.viceType]; const editable = canCreate() && report.status !== "principal_approved" && (report.authorId === state.currentUser?.id || canManage());
    const body = report.viceType === "grades" ? renderGrades(report.data) : report.viceType === "absence" ? renderAbsence(report.data) : report.viceType === "correction" ? renderCorrection(report.data) : renderDelayed(report.data);
    return `<div class="modal"><form class="modal-box admin-report-modal vice-report-modal" onsubmit="actions.saveVicePrincipalReport(event)"><button type="button" class="icon-btn admin-modal-close" onclick="actions.closeModal()">${icons.close || "أ—"}</button><div class="modal-head"><div><span class="eyebrow">${type.title}</span><h3>${safe(schoolName(report.schoolId))}</h3></div></div><div class="admin-report-modal-body">${field("ط§ظ„طھط§ط±ظٹط®", "date", report.date, "date")}${body}<input type="hidden" name="payload" id="viceReportPayload" /></div><div class="admin-report-sticky-actions"><button type="button" class="btn secondary" onclick="actions.closeModal()">ط¥ط؛ظ„ط§ظ‚</button>${editable ? `<button type="submit" class="btn">${icons.save || ""} ط­ظپط¸ ظ…ط³ظˆط¯ط©</button><button type="button" class="btn" onclick="actions.saveVicePrincipalReport(event,true)">${icons.upload || ""} ط­ظپط¸ ظˆط±ظپط¹ ظ„ظ„ظ…ط¯ظٹط±</button>` : ""}${canManage() && report.status !== "principal_approved" ? `<button type="button" class="btn" onclick="actions.approveVicePrincipalReport('${safe(report.id)}')">ط§ط¹طھظ…ط§ط¯ ط§ظ„طھظ‚ط±ظٹط±</button>` : ""}</div></form></div>`;
  }
  function collectPayload(form, old) { const data = JSON.parse(JSON.stringify(old)); for (const input of form.querySelectorAll("[data-field]")) { const path = input.dataset.field.split("."); let target = data; path.slice(0, -1).forEach((part) => { target = target[part]; }); target[path[path.length - 1]] = input.value; } return data; }
  function saveReportFromForm(event, submit = false) { event.preventDefault(); const { state } = ctx(); const form = event.currentTarget; form.querySelector('[name="payload"]').value = JSON.stringify(collectPayload(form, state.modal.vicePrincipalReport.data)); saveReport(event, submit); }
  return { canView, canCreate, renderPage, renderModal, openReport, saveReport: saveReportFromForm, approveReport };
}
