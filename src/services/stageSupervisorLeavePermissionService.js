import { createUuid } from "../utils/idUtils.js";
import { normalizeRole } from "../utils/permissionUtils.js";
import { today as localToday } from "../utils/dateUtils.js";

const REPORT_TYPE = "stage_supervisor_leave_permissions";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const REQUIRED_FIELDS = ["studentName", "className", "date", "reason", "releasedTo", "relation", "guardianPhone"];

function text(value) {
  return String(value || "").trim();
}

function validDate(value, fallback = localToday()) {
  return DATE_PATTERN.test(String(value || "")) ? String(value) : fallback;
}

function dayForDate(value) {
  const date = validDate(value, "");
  if (!date) return "";
  const utcDate = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(utcDate.getTime()) ? "" : DAY_NAMES[utcDate.getUTCDay()];
}

function blankEntry(date = localToday()) {
  return {
    id: createUuid(),
    studentName: "",
    className: "",
    date: validDate(date),
    day: dayForDate(date),
    reason: "",
    releasedTo: "",
    relation: "",
    guardianPhone: "",
  };
}
function normalizeEntry(entry = {}, fallbackDate = localToday()) {
  const date = validDate(entry.date, fallbackDate);
  return {
    id: text(entry.id) || createUuid(),
    studentName: text(entry.studentName),
    className: text(entry.className),
    date,
    day: dayForDate(date),
    reason: text(entry.reason),
    releasedTo: text(entry.releasedTo),
    relation: text(entry.relation),
    guardianPhone: text(entry.guardianPhone),
  };
}

function entriesOf(report) {
  const entries = report?.sections?.leavePermissions?.entries;
  return Array.isArray(entries) ? entries.map((entry) => normalizeEntry(entry)) : [];
}

function blankReport(user) {
  const entry = blankEntry();
  return {
    id: createUuid(),
    type: REPORT_TYPE,
    date: entry.date,
    schoolId: user?.schoolId || "",
    supervisorId: user?.id || "",
    status: "draft",
    sections: { leavePermissions: { entries: [entry] } },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeReport(report, user) {
  const base = blankReport(user);
  const entries = entriesOf(report);
  const firstDate = entries.map((entry) => entry.date).sort()[0] || validDate(report?.date, localToday());
  return {
    ...base,
    ...report,
    type: REPORT_TYPE,
    date: validDate(report?.date, firstDate),
    schoolId: text(report?.schoolId) || base.schoolId,
    supervisorId: text(report?.supervisorId) || base.supervisorId,
    sections: { leavePermissions: { entries: entries.length ? entries : [blankEntry(firstDate)] } },
  };
}

function normalizeName(value) {
  return text(value).replace(/\s+/g, " ").toLocaleLowerCase("ar");
}

function isEntryFilled(entry) {
  return REQUIRED_FIELDS.some((field) => text(entry?.[field]));
}

function hasAllRequiredFields(entry) {
  return REQUIRED_FIELDS.every((field) => text(entry?.[field]));
}

function formattedDateRange(filters) {
  return filters.mode === "period" ? `من ${filters.startDate} إلى ${filters.endDate}` : `يوم ${filters.date}`;
}

export function createStageSupervisorLeavePermissionModule(getContext) {
  function roleOf(user = getContext().state.currentUser) {
    return normalizeRole(user?.role);
  }

  function canManage(user = getContext().state.currentUser) {
    return roleOf(user) === "superadmin";
  }

  function canView(user = getContext().state.currentUser) {
    return ["superadmin", "stage_supervisor", "deputy_principal", "school_principal", "general_manager"].includes(roleOf(user));
  }

  function canCreate(user = getContext().state.currentUser) {
    return canManage(user) || roleOf(user) === "stage_supervisor";
  }

  function filters() {
    const { state } = getContext();
    const defaults = { mode: "day", date: localToday(), startDate: localToday(), endDate: localToday() };
    state.stageSupervisorLeavePermissionFilters = { ...defaults, ...(state.stageSupervisorLeavePermissionFilters || {}) };
    const current = state.stageSupervisorLeavePermissionFilters;
    current.mode = current.mode === "period" ? "period" : "day";
    current.date = validDate(current.date);
    current.startDate = validDate(current.startDate);
    current.endDate = validDate(current.endDate);
    if (current.startDate > current.endDate) [current.startDate, current.endDate] = [current.endDate, current.startDate];
    return current;
  }

  function allReports() {
    const { state } = getContext();
    return (state.administrativeReports || [])
      .filter((report) => report?.type === REPORT_TYPE || report?.reportKind === REPORT_TYPE)
      .map((report) => normalizeReport(report, state.currentUser));
  }

  function scopedReports() {
    const { state } = getContext();
    const role = roleOf();
    return allReports()
      .filter((report) => {
        if (role === "stage_supervisor") return report.supervisorId === state.currentUser?.id;
        if (["deputy_principal", "school_principal"].includes(role)) return report.schoolId === state.currentUser?.schoolId;
        return true;
      })
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  function entryMatchesFilters(entry, activeFilters = filters()) {
    if (activeFilters.mode === "period") return entry.date >= activeFilters.startDate && entry.date <= activeFilters.endDate;
    return entry.date === activeFilters.date;
  }

  function filteredEntries(activeFilters = filters()) {
    return scopedReports().flatMap((report) => entriesOf(report).map((entry) => ({ ...entry, reportId: report.id, schoolId: report.schoolId, supervisorId: report.supervisorId })))
      .filter((entry) => entryMatchesFilters(entry, activeFilters))
      .sort((a, b) => a.date.localeCompare(b.date) || a.studentName.localeCompare(b.studentName, "ar"));
  }

  function studentSuggestions() {
    const names = new Map();
    scopedReports().flatMap(entriesOf).forEach((entry) => {
      const name = text(entry.studentName);
      if (name) names.set(normalizeName(name), name);
    });
    return [...names.values()].sort((a, b) => a.localeCompare(b, "ar"));
  }

  function setFilter(key, value) {
    const current = filters();
    current[key] = String(value || "");
    if (key === "mode") current.mode = value === "period" ? "period" : "day";
    if (["date", "startDate", "endDate"].includes(key)) current[key] = validDate(value);
    if (current.startDate > current.endDate) {
      if (key === "startDate") current.endDate = current.startDate;
      else current.startDate = current.endDate;
    }
    getContext().render();
  }

  function openReport(id = "") {
    const { state, render, showToast } = getContext();
    const existing = scopedReports().find((report) => report.id === id);
    if (id && !existing) return showToast?.("تعذر العثور على سجل الأذونات.");
    if (!existing && !canCreate()) return showToast?.("إضافة سجلات الأذونات متاحة لمشرف المرحلة فقط.");
    state.modal = { type: "stage_supervisor_leave_permissions", report: existing || blankReport(state.currentUser) };
    render();
  }

  function draftFromForm(form, currentReport) {
    const count = Math.max(0, Number(form?.dataset?.entryCount || 0));
    const entries = Array.from({ length: count }, (_, index) => normalizeEntry({
      id: form.elements[`entry-${index}-id`]?.value,
      studentName: form.elements[`entry-${index}-studentName`]?.value,
      className: form.elements[`entry-${index}-className`]?.value,
      date: form.elements[`entry-${index}-date`]?.value,
      reason: form.elements[`entry-${index}-reason`]?.value,
      releasedTo: form.elements[`entry-${index}-releasedTo`]?.value,
      relation: form.elements[`entry-${index}-relation`]?.value,
      guardianPhone: form.elements[`entry-${index}-guardianPhone`]?.value,
    }));
    const report = normalizeReport(currentReport, getContext().state.currentUser);
    if (canManage()) {
      report.schoolId = text(form.elements.schoolId?.value) || report.schoolId;
      report.supervisorId = text(form.elements.supervisorId?.value) || report.supervisorId;
    }
    report.sections = { leavePermissions: { entries } };
    report.date = entries.map((entry) => entry.date).sort()[0] || report.date;
    return report;
  }

  function addEntry(event) {
    event.preventDefault();
    const { state, render } = getContext();
    const form = event.currentTarget?.form || event.target?.closest("form");
    const draft = draftFromForm(form, state.modal?.report);
    const currentEntries = entriesOf(draft);
    const latestDate = currentEntries[currentEntries.length - 1]?.date || localToday();
    draft.sections.leavePermissions.entries.push(blankEntry(latestDate));
    state.modal = { type: "stage_supervisor_leave_permissions", report: draft, focusEntry: currentEntries.length };
    render();
  }

  function removeEntry(event, index) {
    event.preventDefault();
    const { state, render, showToast } = getContext();
    const form = event.currentTarget?.form || event.target?.closest("form");
    const draft = draftFromForm(form, state.modal?.report);
    const currentEntries = entriesOf(draft);
    if (currentEntries.length <= 1) return showToast?.("يجب أن تحتوي السجل على بطاقة إذن واحدة على الأقل.");
    draft.sections.leavePermissions.entries = currentEntries.filter((_, itemIndex) => itemIndex !== Number(index));
    state.modal = { type: "stage_supervisor_leave_permissions", report: draft, focusEntry: Math.max(0, Number(index) - 1) };
    render();
  }

  function updateEntryDate(input) {
    const card = input.closest("[data-leave-entry]");
    const day = dayForDate(input.value);
    const output = card?.querySelector("[data-leave-day]");
    if (output) output.textContent = day || "-";
  }

  async function saveReport(event) {
    event.preventDefault();
    const { state, supabase, showToast, render } = getContext();
    if (!canCreate()) return showToast?.("لا تملك صلاحية تعديل سجل الأذونات.");
    const current = normalizeReport(state.modal?.report, state.currentUser);
    const draft = draftFromForm(event.currentTarget || event.target, current);
    const entries = entriesOf(draft).filter(isEntryFilled);
    if (!entries.length) return showToast?.("أضف بطاقة إذن واحدة على الأقل قبل الحفظ.");
    if (entries.some((entry) => !hasAllRequiredFields(entry))) return showToast?.("أكمل جميع بيانات بطاقة الإذن قبل الحفظ.");

    const report = {
      ...draft,
      type: REPORT_TYPE,
      date: entries.map((entry) => entry.date).sort()[0],
      schoolId: canManage() ? draft.schoolId : (state.currentUser?.schoolId || draft.schoolId),
      supervisorId: canManage() ? draft.supervisorId : (state.currentUser?.id || draft.supervisorId),
      status: "draft",
      sections: { leavePermissions: { entries } },
      updatedAt: new Date().toISOString(),
    };
    const remainder = (state.administrativeReports || []).filter((item) => item.id !== report.id);
    state.administrativeReports = [report, ...remainder];

    if (supabase?.isCloudEnabled?.()) {
      try {
        const result = await supabase.saveCloudDoc?.("administrativeReports", report.id, report, false);
        if (result?.queued) {
          state.modal = null;
          showToast?.("تم حفظ السجل محلياً وسيُرفع تلقائياً عند عودة الاتصال.");
          render();
          return;
        }
        if (result?.id && result.id !== report.id) report.id = result.id;
        await supabase.refreshCloudData?.(false, { deferSecondary: true, secondaryDelay: 250 });
      } catch (error) {
        showToast?.(`حُفظ السجل محلياً، لكن تعذر رفعه: ${supabase.formatCloudError?.(error, "تحقق من الاتصال أو الصلاحيات.") || "تحقق من الاتصال أو الصلاحيات."}`);
        render();
        return;
      }
    }
    state.modal = null;
    showToast?.("تم حفظ سجل أذونات الخروج بنجاح.");
    render();
  }

  function reportOwnerName(report) {
    const { state } = getContext();
    return state.users?.find((user) => user.id === report.supervisorId)?.name || "مشرف المرحلة";
  }

  function renderHistoryCard(report) {
    const { safe, icons } = getContext();
    const entries = entriesOf(report);
    const dates = [...new Set(entries.map((entry) => entry.date))].sort();
    return `<article class="leave-history-card">
      <div>
        <span>سجل ${safe(dates[0] || report.date)}${dates.length > 1 ? ` - ${safe(dates[dates.length - 1])}` : ""}</span>
        <h3>${safe(entries.length)} بطاقة إذن</h3>
        <p>${safe(reportOwnerName(report))}</p>
      </div>
      <button class="btn secondary" type="button" onclick="actions.openStageSupervisorLeavePermissionReport('${safe(report.id)}')">${icons.edit || ""} فتح السجل</button>
    </article>`;
  }

  function renderPage() {
    const { safe, icons } = getContext();
    if (!canView()) return `<section class="empty-state"><h2>لا تملك صلاحية عرض أذونات خروج المتعلمين.</h2></section>`;
    const activeFilters = filters();
    const entries = filteredEntries(activeFilters);
    const history = scopedReports();
    return `<section class="leave-permissions-page">
      <header class="leave-permissions-hero">
        <div><span>مشرف المرحلة</span><h2>أذونات خروج المتعلمين</h2><p>سجل منظم للإذن، بمعلومات ولي الأمر ومتاح للطباعة اليومية أو للفترة.</p></div>
        <b>${safe(entries.length)}<small>إذن ضمن النطاق</small></b>
      </header>
      <section class="leave-permissions-toolbar">
        <label><span>نطاق التقرير</span><select onchange="actions.setStageSupervisorLeavePermissionFilter('mode', this.value)"><option value="day" ${activeFilters.mode === "day" ? "selected" : ""}>يوم محدد</option><option value="period" ${activeFilters.mode === "period" ? "selected" : ""}>فترة زمنية</option></select></label>
        ${activeFilters.mode === "day"
          ? `<label><span>التاريخ</span><input type="date" value="${safe(activeFilters.date)}" onchange="actions.setStageSupervisorLeavePermissionFilter('date', this.value)"></label>`
          : `<label><span>من تاريخ</span><input type="date" value="${safe(activeFilters.startDate)}" onchange="actions.setStageSupervisorLeavePermissionFilter('startDate', this.value)"></label><label><span>إلى تاريخ</span><input type="date" value="${safe(activeFilters.endDate)}" onchange="actions.setStageSupervisorLeavePermissionFilter('endDate', this.value)"></label>`}
        <button class="btn secondary" type="button" onclick="actions.printStageSupervisorLeavePermissions()">${icons.print || ""} طباعة ${activeFilters.mode === "period" ? "تقرير الفترة" : "تقرير اليوم"}</button>
        ${canCreate() ? `<button class="btn" type="button" onclick="actions.openStageSupervisorLeavePermissionReport()">${icons.plus || "+"} إضافة سجل أذونات</button>` : ""}
      </section>
      <section class="leave-permissions-summary">
        <article><span>الفترة المعروضة</span><strong>${safe(formattedDateRange(activeFilters))}</strong></article>
        <article><span>عدد الأذونات</span><strong>${safe(entries.length)}</strong></article>
        <article><span>المتعلمون</span><strong>${safe(new Set(entries.map((entry) => normalizeName(entry.studentName))).size)}</strong></article>
      </section>
      <section class="leave-history-list">
        <div class="leave-section-head"><div><span>السجلات المحفوظة</span><h3>بطاقات إذن قابلة للفتح والإغلاق داخل كل سجل</h3></div><small>${safe(history.length)} سجل</small></div>
        ${history.map(renderHistoryCard).join("") || `<div class="empty-state compact"><h3>لا توجد سجلات محفوظة بعد.</h3><p>أضف سجل أذونات لبدء التوثيق والطباعة.</p></div>`}
      </section>
    </section>`;
  }

  function renderEntry(entry, index, editable, open) {
    const { safe, icons } = getContext();
    return `<details class="leave-entry-card" data-leave-entry ${open ? "open" : ""}>
      <summary><span class="leave-entry-number">${index + 1}</span><div><b>${safe(entry.studentName || "بطاقة إذن جديدة")}</b><small>${safe(entry.className || "أدخل اسم المتعلم والفصل")}</small></div><em>${safe(dayForDate(entry.date) || "-")} · ${safe(entry.date || "-")}</em></summary>
      <div class="leave-entry-fields">
        <input type="hidden" name="entry-${index}-id" value="${safe(entry.id)}">
        <label class="leave-field-wide"><span>اسم المتعلم</span><input name="entry-${index}-studentName" list="stage-leave-student-suggestions" value="${safe(entry.studentName)}" placeholder="اكتب الاسم أو اختر من الأسماء السابقة" ${editable ? "required" : "readonly"}></label>
        <label><span>الفصل</span><input name="entry-${index}-className" value="${safe(entry.className)}" placeholder="مثال: أول أ" ${editable ? "required" : "readonly"}></label>
        <label><span>التاريخ</span><input type="date" name="entry-${index}-date" value="${safe(entry.date)}" onchange="actions.updateStageSupervisorLeavePermissionDate(this)" ${editable ? "required" : "readonly"}></label>
        <label class="leave-day-output"><span>اليوم</span><output data-leave-day>${safe(dayForDate(entry.date) || "-")}</output></label>
        <label class="leave-field-wide"><span>سبب الاستئذان</span><input name="entry-${index}-reason" value="${safe(entry.reason)}" placeholder="سبب خروج المتعلم" ${editable ? "required" : "readonly"}></label>
        <label><span>اسم المستأذن له</span><input name="entry-${index}-releasedTo" value="${safe(entry.releasedTo)}" placeholder="الاسم الكامل" ${editable ? "required" : "readonly"}></label>
        <label><span>صلة القرابة</span><input name="entry-${index}-relation" value="${safe(entry.relation)}" placeholder="مثل: ولي الأمر" ${editable ? "required" : "readonly"}></label>
        <label class="leave-field-wide"><span>التواصل الهاتفي / موافقة ولي الأمر</span><input name="entry-${index}-guardianPhone" value="${safe(entry.guardianPhone)}" placeholder="رقم التواصل أو توثيق الموافقة" ${editable ? "required" : "readonly"}></label>
      </div>
      ${editable ? `<footer><button class="btn danger subtle" type="button" onclick="actions.removeStageSupervisorLeavePermissionEntry(event, ${index})">${icons.trash || ""} حذف البطاقة</button></footer>` : ""}
    </details>`;
  }

  function renderModal() {
    const { state, safe, icons, schoolName } = getContext();
    const report = normalizeReport(state.modal?.report, state.currentUser);
    const editable = canManage() || (canCreate() && report.supervisorId === state.currentUser?.id);
    const suggestions = studentSuggestions();
    const focusEntry = Number(state.modal?.focusEntry ?? -1);
    const managerMode = canManage();
    const supervisorOptions = (state.users || []).filter((user) => normalizeRole(user.role) === "stage_supervisor" && user.active !== false);
    const schoolOptions = state.schools || [];
    return `<div class="modal"><form class="modal-box leave-permissions-modal" data-entry-count="${entriesOf(report).length}" onsubmit="actions.saveStageSupervisorLeavePermissionReport(event)">
      <button type="button" class="icon-btn admin-modal-close" onclick="actions.closeModal()" aria-label="إغلاق">${icons.close || "×"}</button>
      <header class="leave-modal-head"><div><span>سجل مشرف المرحلة</span><h2>أذونات خروج المتعلمين</h2><p>${safe(schoolName(report.schoolId))} · اليوم مرتبط تلقائياً بالتاريخ المختار.</p></div><b>${safe(entriesOf(report).length)}<small>بطاقة</small></b></header>
      <datalist id="stage-leave-student-suggestions">${suggestions.map((name) => `<option value="${safe(name)}"></option>`).join("")}</datalist>
      <div class="leave-permissions-modal-body">
        ${managerMode ? `<section class="leave-manager-controls"><label><span>الفرع</span><select name="schoolId" ${editable ? "required" : "disabled"} onchange="this.form.querySelector('[name=supervisorId]').value='';"><option value="">اختر الفرع</option>${schoolOptions.map((school) => `<option value="${safe(school.id)}" ${school.id === report.schoolId ? "selected" : ""}>${safe(school.name)}</option>`).join("")}</select></label><label><span>مشرف المرحلة</span><select name="supervisorId" ${editable ? "required" : "disabled"}><option value="">اختر مشرف المرحلة</option>${supervisorOptions.map((user) => `<option value="${safe(user.id)}" ${user.id === report.supervisorId ? "selected" : ""}>${safe(user.name)} · ${safe(schoolName(user.schoolId))}</option>`).join("")}</select></label><p>للحساب الرئيسي صلاحية الاطلاع والتعديل على جميع سجلات الفروع.</p></section>` : ""}
        ${entriesOf(report).map((entry, index) => renderEntry(entry, index, editable, index === focusEntry || (focusEntry < 0 && index === 0))).join("")}
      </div>
      <footer class="leave-modal-actions">
        <button type="button" class="btn secondary" onclick="actions.closeModal()">إغلاق</button>
        ${editable ? `<button type="button" class="btn secondary" onclick="actions.addStageSupervisorLeavePermissionEntry(event)">${icons.plus || "+"} إضافة بطاقة</button><button type="submit" class="btn">${icons.save || ""} حفظ السجل</button>` : ""}
      </footer>
    </form></div>`;
  }

  function groupedPeriodRows(entries) {
    const groups = new Map();
    entries.forEach((entry) => {
      const key = `${normalizeName(entry.studentName)}|${normalizeName(entry.className)}`;
      if (!groups.has(key)) groups.set(key, { studentName: entry.studentName, className: entry.className, entries: [] });
      groups.get(key).entries.push(entry);
    });
    return [...groups.values()].sort((a, b) => a.studentName.localeCompare(b.studentName, "ar"));
  }

  function uniqueValues(values) {
    return [...new Set(values.map(text).filter(Boolean))];
  }

  function printStageSupervisorLeavePermissions() {
    const { safe, schoolName, showToast, state } = getContext();
    const activeFilters = filters();
    const entries = filteredEntries(activeFilters);
    if (!entries.length) return showToast?.("لا توجد أذونات ضمن النطاق المحدد للطباعة.");
    const isPeriod = activeFilters.mode === "period";
    const headers = isPeriod
      ? ["م", "اسم المتعلم", "الفصل", "عدد الأذونات", "التواريخ والأيام", "الأسباب", "المستأذن له وصلة القرابة", "التواصل / موافقة ولي الأمر"]
      : ["م", "اسم المتعلم", "الفصل", "اليوم", "التاريخ", "سبب الاستئذان", "المستأذن له", "صلة القرابة", "التواصل / موافقة ولي الأمر"];
    const rows = isPeriod
      ? groupedPeriodRows(entries).map((group, index) => {
          const itemEntries = group.entries;
          return [
            index + 1,
            group.studentName,
            group.className,
            itemEntries.length,
            uniqueValues(itemEntries.map((item) => `${item.date} - ${item.day}`)).join("<br>"),
            uniqueValues(itemEntries.map((item) => item.reason)).join("<br>"),
            uniqueValues(itemEntries.map((item) => `${item.releasedTo} (${item.relation})`)).join("<br>"),
            uniqueValues(itemEntries.map((item) => item.guardianPhone)).join("<br>"),
          ];
        })
      : entries.map((entry, index) => [index + 1, entry.studentName, entry.className, entry.day, entry.date, entry.reason, entry.releasedTo, entry.relation, entry.guardianPhone]);
    const table = `<table><thead><tr>${headers.map((header) => `<th>${safe(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell).includes("<br>") ? String(cell).split("<br>").map((item) => safe(item)).join("<br>") : safe(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const school = schoolName(state.currentUser?.schoolId || entries[0]?.schoolId);
    const title = isPeriod ? "تقرير أذونات خروج المتعلمين للفترة" : "تقرير أذونات خروج المتعلمين اليومي";
    const note = isPeriod ? "يظهر اسم كل متعلم مرة واحدة مع تجميع أذوناته ضمن الفترة المحددة." : "سجل الأذونات لليوم المحدد.";
    const win = window.open("", "_blank", "width=1200,height=850");
    if (!win) return showToast?.("اسمح بالنوافذ المنبثقة لطباعة التقرير.");
    win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${safe(title)}</title><style>@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{margin:0;color:#172554;font-family:Tahoma,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{padding:3px}.head{display:flex;justify-content:space-between;gap:20px;align-items:center;border:2px solid #0f766e;background:#f0fdfa;padding:13px 16px;margin-bottom:10px}.head h1{margin:0 0 5px;font-size:20px}.head p{margin:0;color:#475569;font-size:11px}.badge{padding:8px 12px;background:#0f766e;color:#fff;font-weight:700;text-align:center}.note{margin:0 0 8px;color:#475569;font-size:10px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #94a3b8;padding:5px 6px;text-align:right;vertical-align:top;font-size:8.5px;line-height:1.45;overflow-wrap:anywhere}th{background:#ccfbf1;color:#134e4a;font-weight:700}tbody tr:nth-child(even){background:#f8fafc}.foot{margin-top:8px;display:flex;justify-content:space-between;color:#64748b;font-size:8px}.print{position:fixed;left:14px;bottom:14px;border:0;background:#0f766e;color:#fff;padding:10px 16px;font:700 13px Tahoma}@media print{.print{display:none}.sheet{padding:0}tr{break-inside:avoid}}</style></head><body><main class="sheet"><header class="head"><div><h1>${safe(title)}</h1><p>${safe(school)} · ${safe(formattedDateRange(activeFilters))}</p></div><div class="badge">${safe(entries.length)} إذن<br>${isPeriod ? `${safe(rows.length)} متعلم` : ""}</div></header><p class="note">${safe(note)}</p>${table}<footer class="foot"><span>منصة مهام المدارس · أذونات خروج المتعلمين</span><span>تمت الطباعة: ${safe(new Date().toLocaleDateString("ar-SA"))}</span></footer></main><button class="print" onclick="window.print()">طباعة / حفظ PDF</button><script>addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body></html>`);
    win.document.close();
  }

  return {
    canView,
    canManage,
    renderPage,
    renderModal,
    openReport,
    saveReport,
    addEntry,
    removeEntry,
    updateEntryDate,
    setFilter,
    printStageSupervisorLeavePermissions,
  };
}
