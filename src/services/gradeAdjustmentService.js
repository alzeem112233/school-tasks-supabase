import { nowTimestamp, toDateKey } from "../utils/dateUtils.js";
import { createUuid } from "../utils/idUtils.js";
import { isGeneralManager, normalizeRole } from "../utils/permissionUtils.js";

const statusLabels = { pending: "بانتظار الاستلام", received: "قيد التعديل", completed: "تم تعديل الدرجة" };
const monthOptions = ["محرم (يوليو)", "صفر (أغسطس)", "نهاية الفصل الأول", "جمادى الأولى (نوفمبر)", "جمادى الآخرة (ديسمبر)", "نهاية الفصل الثاني"];
const gradeSectionOptions = ["تحريري", "شفوي", "واجبات", "مواظبة"];
const fallbackClasses = ["الصف الأول", "الصف الثاني", "الصف الثالث", "الصف الرابع", "الصف الخامس", "الصف السادس", "الصف السابع", "الصف الثامن", "الصف التاسع", "الأول الثانوي", "الثاني الثانوي", "الثالث الثانوي"];
const fallbackSubjects = ["قرآن كريم", "لغة عربية", "رياضيات", "علوم", "لغة إنجليزية", "اجتماعيات", "فيزياء", "كيمياء", "أحياء"];

export function createGradeAdjustmentsModule(getContext) {
  let searchTimer = null;

  function gradeLimit(section) {
    if (section === "تحريري") return 50;
    if (section === "مواظبة") return 10;
    return 20;
  }

  function applyGradeSectionLimits(section, form) {
    const limit = gradeLimit(section);
    form?.querySelectorAll(".grade-score-input").forEach((input) => {
      if (input.dataset.gradeSection !== section) return;
      input.min = "0.01";
      input.max = String(limit - 0.01);
      input.placeholder = `أكبر من 0 وأصغر من ${limit}`;
      input.title = `يجب أن تكون الدرجة أكبر من 0 وأصغر من ${limit}`;
      input.setCustomValidity("");
      const value = Number(input.value);
      if (input.value !== "" && !(value > 0 && value < limit)) input.setCustomValidity(`أدخل درجة أكبر من 0 وأصغر من ${limit}`);
      const error = input.closest(".grade-score-cell, .field")?.querySelector(".grade-input-error");
      if (error) error.textContent = input.validationMessage;
    });
  }

  function validateGradeInput(input) {
    if (!input?.form) return true;
    const section = input.dataset.gradeSection || input.form.querySelector('input[name="gradeSection"]:checked')?.value || "تحريري";
    const limit = gradeLimit(section);
    const value = Number(input.value);
    const pair = input.closest(".grade-score-tile");
    const pairHasValue = [...(pair?.querySelectorAll(".grade-score-input") || [])].some((field) => String(field.value || "").trim() !== "");
    const required = input.required || pairHasValue;
    const valid = !required || (input.value !== "" && Number.isFinite(value) && value > 0 && value < limit);
    input.setCustomValidity(valid ? "" : `أدخل درجة أكبر من 0 وأصغر من ${limit}`);
    const error = input.closest(".grade-score-cell, .field")?.querySelector(".grade-input-error");
    if (error) error.textContent = valid || input.value === "" ? "" : input.validationMessage;
    return valid;
  }

  function uniqueList(values = []) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function catalogOptions() {
    const { state } = getContext();
    const settings = state.examScheduleSettings || {};
    const stages = Array.isArray(settings.stages) ? settings.stages : [];
    const grades = stages.flatMap((stage) => (stage.grades || []).map((grade) => grade.name));
    const sections = stages.flatMap((stage) => (stage.grades || []).flatMap((grade) => grade.sections || []));
    const subjects = uniqueList([...(settings.subjectsCatalog || []), ...stages.flatMap((stage) => (stage.grades || []).flatMap((grade) => grade.subjects || []))]);
    return {
      classes: uniqueList([...grades, ...fallbackClasses]),
      sections: uniqueList(sections),
      subjects: uniqueList([...subjects, ...fallbackSubjects]),
    };
  }

  function teacherDirectoryForSchool(schoolId = "") {
    const { state } = getContext();
    return (state.teacherDirectory || [])
      .filter((teacher) => teacher.active !== false && teacher.schoolId === schoolId)
      .sort((a, b) => String(a.teacherName || "").localeCompare(String(b.teacherName || ""), "ar"));
  }

  function gradeTeacherOptions(schoolId = "") {
    return teacherDirectoryForSchool(schoolId).map((teacher) => `${teacher.teacherName} - ${teacher.subjectName}`);
  }

  function splitTeacherOption(value = "") {
    const [teacherName, ...subjectParts] = String(value || "").split(" - ");
    return { teacherName: String(teacherName || "").trim(), subjectName: subjectParts.join(" - ").trim() };
  }

  function renderSubjectBlock(subjectIndex, sourceItem = {}, removable = false, previousHint = () => "") {
    const { safe, icons } = getContext();
    const field = (name, label, hint, attrs = "", value = "") => `<label class="field"><span>${label}</span><input name="${name}" value="${safe(value)}" placeholder="${safe(hint)}" title="${safe(hint)}" ${attrs}></label>`;
    const gradeTile = (section, sectionIndex) => {
      const limit = gradeLimit(section);
      const newValue = sourceItem.gradeSection === section && Number.isFinite(sourceItem.newGrade) ? sourceItem.newGrade : "";
      return `<article class="grade-score-tile" data-section="${safe(section)}">
        <input type="hidden" name="gradeSection_${subjectIndex}_${sectionIndex}" value="${safe(section)}">
        <div class="grade-score-title"><strong>${safe(section)}</strong><span>(${safe(limit)})</span></div>
        <label class="grade-score-cell"><span>الدرجة</span><input class="grade-score-input" name="newGrade_${subjectIndex}_${sectionIndex}" value="${safe(newValue)}" type="number" inputmode="decimal" min="0.01" max="${limit-0.01}" step="0.01" data-grade-section="${safe(section)}" placeholder="0" title="أكبر من 0 وأصغر من ${limit}" oninput="actions.validateGradeAdjustmentInput(this)" onblur="actions.validateGradeAdjustmentInput(this)"><small class="grade-input-error" role="alert" aria-live="polite"></small></label>
      </article>`;
    };
    return `<section class="wide grade-subject-entry" data-subject-index="${safe(subjectIndex)}">
      <div class="grade-subject-head"><strong>المادة ${safe(subjectIndex + 1)}</strong>${removable ? `<button class="icon-btn danger-icon" type="button" title="حذف المادة" onclick="actions.removeGradeAdjustmentSubject(this)">${icons.trash}</button>` : ""}</div>
      <div class="grade-subject-fields">
        ${field(`teacherName_${subjectIndex}`,'اسم الأستاذ','اختر الأستاذ من فرع الطالب','minlength="2" maxlength="200" list="grade-teacher-options" onchange="actions.selectGradeAdjustmentTeacher(this)" oninput="actions.selectGradeAdjustmentTeacher(this)"',sourceItem.teacherName)}
        ${field(`subjectName_${subjectIndex}`,'المادة','تظهر تلقائيًا بعد اختيار الأستاذ','minlength="2" maxlength="120" list="grade-subject-options"',sourceItem.subjectName)}
      </div>
      <section class="grade-score-board" aria-label="درجات المادة">
        <div class="grade-score-board-head"><strong>${safe(sourceItem.subjectName || "درجات المادة")}</strong><span>املأ الدرجة الجديدة للقسم المطلوب</span></div>
        <div class="grade-score-grid">${gradeSectionOptions.map(gradeTile).join("")}</div>
        ${sourceItem.gradeSection ? previousHint('القسم المعدل', sourceItem.gradeSection) : ""}
      </section>
    </section>`;
  }

  function normalizeAdjustment(item = {}) {
    const value = (camel, snake) => item[camel] ?? item[snake];
    const nullableNumber = (camel, snake) => {
      const raw = value(camel, snake);
      if (raw === null || raw === undefined || raw === "") return null;
      const number = Number(raw);
      return Number.isFinite(number) ? number : null;
    };
    return {
      id: item.id || createUuid(), schoolId: value("schoolId", "school_id") || "",
      studentName: String(value("studentName", "student_name") || "").trim(),
      studentNumber: String(value("studentNumber", "student_number") || "").trim(),
      month: String(value("month", "adjustment_month") || "").trim(),
      assessmentPeriod: String(value("assessmentPeriod", "assessment_period") || "الفترة الأولى").trim(),
      gradeSection: String(value("gradeSection", "grade_section") || "تحريري").trim(),
      subjectName: String(value("subjectName", "subject_name") || "").trim(),
      teacherName: String(value("teacherName", "teacher_name") || "").trim(),
      className: String(value("className", "class_name") || "").trim(),
      sectionName: String(value("sectionName", "section_name") || "").trim(),
      previousGrade: nullableNumber("previousGrade", "previous_grade"),
      newGrade: Number(value("newGrade", "new_grade")), reason: String(item.reason || "").trim(),
      status: statusLabels[item.status] ? item.status : "pending",
      assignedTo: value("assignedTo", "assigned_to") || "", receivedBy: value("receivedBy", "received_by") || "",
      createdBy: value("createdBy", "created_by") || "", receivedAt: value("receivedAt", "received_at") || "",
      completedAt: value("completedAt", "completed_at") || "", createdAt: value("createdAt", "created_at") || nowTimestamp(),
      updatedAt: value("updatedAt", "updated_at") || nowTimestamp(),
    };
  }

  function visible(options = {}) {
    const { state, scopedSchoolId } = getContext();
    const filters = state.gradeAdjustmentFilters;
    const query = String(filters.search || "").trim().toLocaleLowerCase("ar");
    return state.gradeAdjustments
      .filter((item) => scopedSchoolId() === "all" || item.schoolId === scopedSchoolId())
      .filter((item) => options.all || filters.status === "all" || item.status === filters.status)
      .filter((item) => options.all || !filters.month || item.month === filters.month)
      .filter((item) => options.all || !filters.from || toDateKey(item.createdAt) >= filters.from)
      .filter((item) => options.all || !filters.to || toDateKey(item.createdAt) <= filters.to)
      .filter((item) => options.all || !query || [item.studentName, item.studentNumber, item.subjectName, item.teacherName, item.className, item.sectionName, item.reason].join(" ").toLocaleLowerCase("ar").includes(query))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function canComputerAct(item) {
    const { state } = getContext();
    return normalizeRole(state.currentUser?.role, "") === "computer_unit" && item.schoolId === state.currentUser.schoolId && item.status !== "completed";
  }

  function renderRow(item) {
    const { state, safe, icons, formatDate, schoolName, canManageGradeAdjustments, getUser } = getContext();
    const busy = state.gradeAdjustmentBusy[item.id];
    return `<article class="grade-adjustment-card status-${safe(item.status)}">
      <div class="grade-card-title"><div><strong>${safe(item.studentName)}</strong><span>${safe(item.studentNumber || "دون رقم")} · ${safe(item.className)}${item.sectionName ? ` · شعبة ${safe(item.sectionName)}` : ""}</span></div><span class="finance-status-pill finance-status-${safe(item.status)}">${safe(statusLabels[item.status])}</span></div>
      <div class="grade-card-grid">
        <div><span>المادة</span><strong>${safe(item.subjectName)}</strong></div><div><span>الأستاذ</span><strong>${safe(item.teacherName)}</strong></div>
        <div><span>الشهر</span><strong>${safe(item.month)}</strong></div><div><span>قسم الدرجة</span><strong>${safe(item.gradeSection)}</strong></div><div><span>الفرع</span><strong>${safe(schoolName(item.schoolId))}</strong></div>
      </div>
      <div class="grade-change single"><div><span>الدرجة المطلوبة</span><strong>${safe(item.newGrade)}</strong></div></div>
      <div class="grade-reason"><span>سبب التعديل</span><p>${safe(item.reason)}</p></div>
      <div class="grade-card-meta">أنشأ الطلب: ${safe(getUser(item.createdBy)?.name || "الإدارة")} · ${safe(formatDate(item.createdAt))}</div>
      <div class="grade-card-actions">
        ${canComputerAct(item) && item.status === "pending" ? `<button class="btn secondary" ${busy ? "disabled" : ""} onclick="actions.updateGradeAdjustmentStatus('${safe(item.id)}','received')">استلام الطلب</button>` : ""}
        ${canComputerAct(item) && item.status === "received" ? `<button class="btn success" ${busy ? "disabled" : ""} onclick="actions.updateGradeAdjustmentStatus('${safe(item.id)}','completed')">${icons.check} تم تعديل الدرجة</button>` : ""}
        ${canManageGradeAdjustments() ? `<button class="icon-btn" title="تعديل الطلب" onclick="actions.openGradeAdjustment('${safe(item.id)}')">${icons.edit}</button><button class="icon-btn danger-icon" title="حذف الطلب" onclick="actions.deleteGradeAdjustment('${safe(item.id)}')">${icons.trash}</button>` : ""}
      </div>
    </article>`;
  }

  function renderPage() {
    const { state, safe, icons, paginate, renderPagination, canManageGradeAdjustments } = getContext();
    const records = visible(); const all = visible({ all: true });
    const page = paginate(records, state.pagination.gradeAdjustmentsPage, 12);
    return `<section class="grade-adjustments-page">
      <div class="finance-page-head"><div><span class="finance-eyebrow">السجل الأكاديمي</span><h2>طلبات تعديل الدرجات</h2><p>إرسال الطلب من الإدارة ومتابعة تنفيذه لدى وحدة الحاسوب.</p></div>
      <div class="actions"><button class="btn secondary" onclick="actions.printGradeAdjustmentReport()">${icons.reports} طباعة التقرير</button>${canManageGradeAdjustments() ? `<button class="btn" onclick="actions.openGradeAdjustment()">${icons.plus} إضافة تعديل</button>` : ""}</div></div>
      <div class="finance-metrics"><div class="finance-metric metric-total"><span>كل الطلبات</span><strong>${all.length}</strong></div><div class="finance-metric metric-pending"><span>بانتظار الاستلام</span><strong>${all.filter(x=>x.status==='pending').length}</strong></div><div class="finance-metric metric-received"><span>قيد التعديل</span><strong>${all.filter(x=>x.status==='received').length}</strong></div><div class="finance-metric metric-completed"><span>مكتملة</span><strong>${all.filter(x=>x.status==='completed').length}</strong></div></div>
      <div class="panel grade-filter-bar"><label class="field wide"><span>البحث</span><input value="${safe(state.gradeAdjustmentFilters.search)}" placeholder="اسم الطالب أو المادة أو الأستاذ" oninput="actions.setGradeAdjustmentFilter('search',this.value)"></label><label class="field"><span>الشهر الدراسي</span><select onchange="actions.setGradeAdjustmentFilter('month',this.value)"><option value="">كل الشهور والفصول</option>${monthOptions.map(value=>`<option value="${safe(value)}" ${state.gradeAdjustmentFilters.month===value?'selected':''}>${safe(value)}</option>`).join('')}</select></label><label class="field"><span>الحالة</span><select onchange="actions.setGradeAdjustmentFilter('status',this.value)"><option value="all">كل الحالات</option>${Object.entries(statusLabels).map(([v,l])=>`<option value="${v}" ${state.gradeAdjustmentFilters.status===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field"><span>من تاريخ</span><input type="date" value="${safe(state.gradeAdjustmentFilters.from)}" onchange="actions.setGradeAdjustmentFilter('from',this.value)"></label><label class="field"><span>إلى تاريخ</span><input type="date" value="${safe(state.gradeAdjustmentFilters.to)}" onchange="actions.setGradeAdjustmentFilter('to',this.value)"></label></div>
      <div class="grade-adjustment-list">${page.items.map(renderRow).join('') || '<div class="panel empty">لا توجد طلبات مطابقة.</div>'}</div>${renderPagination(page,"gradeAdjustmentsPage")}
    </section>`;
  }

  function renderModal(id = "") {
    const { state, safe, icons, schools, canManageGradeAdjustments } = getContext();
    if (!canManageGradeAdjustments()) return "";
    const item = state.gradeAdjustments.find(x => x.id === id) || {};
    const schoolId = item.schoolId || (isGeneralManager(state.currentUser) && state.activeSchoolId !== "all" ? state.activeSchoolId : state.currentUser.schoolId);
    const options = isGeneralManager(state.currentUser) ? schools : schools.filter(s => s.id === state.currentUser.schoolId);
    const catalogs = catalogOptions();
    const previousHint = (label, value) => id && String(value ?? "").trim() !== "" ? `<small class="previous-value">${safe(label)} سابقًا: <b>${safe(value)}</b></small>` : "";
    const field = (name, label, hint, attrs = "", value = "") => `<label class="field"><span>${label}</span><input name="${name}" value="${safe(value)}" placeholder="${safe(hint)}" title="${safe(hint)}" ${attrs}>${previousHint('القيمة', value)}</label>`;
    const teacherOptions = gradeTeacherOptions(schoolId);
    const directorySubjects = teacherDirectoryForSchool(schoolId).map((teacher) => teacher.subjectName);
    const datalist = (listId, values) => `<datalist id="${listId}">${uniqueList(values).map(value=>`<option value="${safe(value)}"></option>`).join("")}</datalist>`;
    return `<div class="modal grade-adjustment-overlay"><form class="modal-box grade-adjustment-modal" onsubmit="actions.saveGradeAdjustment(event)" novalidate><header class="modal-head grade-modal-header"><div><h3>${id?'تعديل':'إضافة'} طلب تعديل درجة</h3><p class="muted">اختر بيانات الطالب ثم املأ الأقسام التي تريد تعديلها فقط.</p></div><button class="icon-btn" type="button" aria-label="إغلاق النافذة" onclick="actions.closeModal()">${icons.close}</button></header><input type="hidden" name="id" value="${safe(id)}"><div class="grade-modal-body"><div class="grade-form-grid grade-mobile-form">
      <label class="field"><span>الشهر</span><select name="month" required title="اختر الشهر أو نهاية الفصل"><option value="" disabled ${item.month?'':'selected'}>اختر الشهر أو نهاية الفصل</option>${monthOptions.map(value=>`<option value="${safe(value)}" ${item.month===value?'selected':''}>${safe(value)}</option>`).join('')}</select>${previousHint('الشهر',item.month)}</label>
      ${field('studentName','اسم الطالب','اكتب اسم الطالب كاملاً','required minlength="2" maxlength="200" autocomplete="name"',item.studentName)}
      ${field('studentNumber','رقم الطالب إن وجد','مثال: 1025','maxlength="80" inputmode="numeric"',item.studentNumber)}
      ${field('className','الصف','اختر أو اكتب الصف','required maxlength="100" list="grade-class-options"',item.className)}
      ${field('sectionName','الشعبة إن وجدت','مثال: أ أو 1','maxlength="50" list="grade-section-options"',item.sectionName)}
      <label class="field"><span>الفرع</span><select name="schoolId" required title="اختر فرع الطالب" onchange="actions.refreshGradeAdjustmentTeacherCatalog(this)">${options.map(s=>`<option value="${safe(s.id)}" ${schoolId===s.id?'selected':''}>${safe(s.name)}</option>`).join('')}</select>${previousHint('الفرع', options.find(s=>s.id===item.schoolId)?.name||'')}</label>
      <div class="wide grade-subject-list" data-grade-subject-list>${renderSubjectBlock(0, item, false, previousHint)}</div>
      <button class="btn secondary wide grade-add-subject-btn" type="button" onclick="actions.addGradeAdjustmentSubject(this)">${icons.plus} إضافة مادة أخرى</button>
      <label class="field wide"><span>سبب التعديل</span><textarea name="reason" required minlength="5" maxlength="2000" placeholder="اشرح سبب تعديل الدرجة بوضوح" title="اكتب سبب التعديل بوضوح">${safe(item.reason||'')}</textarea>${previousHint('السبب',item.reason)}</label>
      ${datalist("grade-class-options", catalogs.classes)}${datalist("grade-teacher-options", teacherOptions)}${datalist("grade-subject-options", [...directorySubjects, ...catalogs.subjects])}${datalist("grade-section-options", catalogs.sections)}
      </div></div><footer class="modal-actions grade-modal-footer"><button class="btn secondary" type="button" onclick="actions.closeModal()">إلغاء</button><button class="btn" type="submit">${icons.save} ${id?'حفظ التعديل':'إرسال الطلب'}</button></footer></form></div>`;
  }

  function openAdjustment(id = "") { const { state, canManageGradeAdjustments, render } = getContext(); if (!canManageGradeAdjustments()) return; state.modal = { type: "grade_adjustment", id }; render(); }

  function addSubject(button) {
    const list = button?.closest("form")?.querySelector("[data-grade-subject-list]");
    if (!list) return;
    const nextIndex = Math.max(0, ...[...list.querySelectorAll(".grade-subject-entry")].map((row) => Number(row.dataset.subjectIndex || 0))) + 1;
    list.insertAdjacentHTML("beforeend", renderSubjectBlock(nextIndex, {}, true));
    const added = list.querySelector(`.grade-subject-entry[data-subject-index="${nextIndex}"]`);
    added?.scrollIntoView({ behavior: "smooth", block: "center" });
    added?.querySelector("input")?.focus();
  }

  function removeSubject(button) {
    const entry = button?.closest(".grade-subject-entry");
    const list = entry?.parentElement;
    if (!entry || !list || list.querySelectorAll(".grade-subject-entry").length <= 1) return;
    entry.remove();
  }

  function selectTeacher(input) {
    const entry = input?.closest(".grade-subject-entry");
    const schoolId = input?.form?.elements?.schoolId?.value || "";
    const selected = splitTeacherOption(input?.value);
    const teacher = teacherDirectoryForSchool(schoolId).find((item) =>
      item.teacherName === selected.teacherName && (!selected.subjectName || item.subjectName === selected.subjectName)
    );
    if (!entry || !teacher) return;
    input.value = teacher.teacherName;
    const subjectInput = entry.querySelector(`[name="subjectName_${entry.dataset.subjectIndex}"]`);
    if (subjectInput) {
      subjectInput.value = teacher.subjectName;
      subjectInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const boardTitle = entry.querySelector(".grade-score-board-head strong");
    if (boardTitle) boardTitle.textContent = teacher.subjectName || "درجات المادة";
  }

  function refreshTeacherCatalog(select) {
    const form = select?.form;
    const datalist = form?.querySelector("#grade-teacher-options");
    if (!form || !datalist) return;
    datalist.innerHTML = gradeTeacherOptions(select.value).map((value) => `<option value="${getContext().safe(value)}"></option>`).join("");
    form.querySelectorAll(".grade-subject-entry").forEach((entry) => {
      const teacherInput = entry.querySelector(`[name="teacherName_${entry.dataset.subjectIndex}"]`);
      const subjectInput = entry.querySelector(`[name="subjectName_${entry.dataset.subjectIndex}"]`);
      if (teacherInput) teacherInput.value = "";
      if (subjectInput) subjectInput.value = "";
    });
  }

  async function saveAdjustment(event) {
    event.preventDefault(); const { state, cloud, supabase, canManageGradeAdjustments, showToast, audit, render } = getContext(); if (!canManageGradeAdjustments()) return;
    const form = new FormData(event.currentTarget); const id = String(form.get('id')||'') || createUuid(); const old = state.gradeAdjustments.find(x=>x.id===id);
    const text = name => String(form.get(name)||'').trim();
    const gradeInputs = [...event.currentTarget.querySelectorAll('.grade-score-input')];
    const invalidGrade = gradeInputs.find(input => !validateGradeInput(input));
    const subjectRows = [...event.currentTarget.querySelectorAll(".grade-subject-entry")];
    const scoreEntries = subjectRows.flatMap((row) => {
      const subjectIndex = Number(row.dataset.subjectIndex || 0);
      const subjectName = String(form.get(`subjectName_${subjectIndex}`) || "").trim();
      const teacherName = String(form.get(`teacherName_${subjectIndex}`) || "").trim();
      return gradeSectionOptions.map((section, sectionIndex) => {
        const newRaw = String(form.get(`newGrade_${subjectIndex}_${sectionIndex}`) || "").trim();
        return { subjectIndex, subjectName, teacherName, section, newRaw, previousGrade: null, newGrade: Number(newRaw), hasValue: newRaw !== "" };
      }).filter(entry => entry.hasValue);
    });
    if (!scoreEntries.length) {
      const firstScore = event.currentTarget.querySelector('.grade-score-input');
      firstScore?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstScore?.focus();
      showToast('أدخل درجة لقسم واحد على الأقل.');
      return;
    }
    const incompleteSubject = scoreEntries.find((entry) => entry.subjectName.length < 2 || entry.teacherName.length < 2);
    if (incompleteSubject) {
      const row = event.currentTarget.querySelector(`.grade-subject-entry[data-subject-index="${incompleteSubject.subjectIndex}"]`);
      const target = row?.querySelector(`[name="subjectName_${incompleteSubject.subjectIndex}"],[name="teacherName_${incompleteSubject.subjectIndex}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus();
      showToast('اكتب اسم المادة واسم الأستاذ لكل مادة أدخلت لها درجة.');
      return;
    }
    if (invalidGrade || text('studentName').length<2 || text('reason').length<5 || !event.currentTarget.checkValidity()) { const invalid = invalidGrade || event.currentTarget.querySelector(':invalid'); invalid?.scrollIntoView({behavior:'smooth',block:'center'}); invalid?.focus(); invalid?.reportValidity(); showToast(invalidGrade ? 'راجع حدود الدرجات في الخانات المظللة.' : 'أكمل جميع الحقول المطلوبة بصورة صحيحة.'); return; }
    const baseItem = { schoolId:text('schoolId'), studentName:text('studentName'), studentNumber:text('studentNumber'), month:text('month'), className:text('className'), sectionName:text('sectionName') || "-", reason:text('reason') };
    const items = scoreEntries.map((entry) => {
      const targetId = old && entry.section === old.gradeSection && entry.subjectName === old.subjectName ? id : createUuid();
      const source = targetId === id ? old : null;
      return normalizeAdjustment({ ...source, ...baseItem, id: targetId, subjectName: entry.subjectName, teacherName: entry.teacherName, gradeSection: entry.section, previousGrade: entry.previousGrade, newGrade: entry.newGrade, createdBy:source?.createdBy||state.currentUser.id, createdAt:source?.createdAt||nowTimestamp(), updatedAt:nowTimestamp() });
    });
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const originalSubmitHtml = submitButton?.innerHTML || "";
    if (submitButton) { submitButton.disabled = true; submitButton.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> جارٍ الإرسال...'; }
    state.gradeAdjustmentBusy[id]=true;
    try {
      if (cloud.enabled) {
        for (const item of items) await supabase.saveCloudDoc('gradeAdjustments', item.id, item, Boolean(old && item.id === id));
      }
      const savedIds = new Set(items.map(item => item.id));
      state.gradeAdjustments = [...items, ...state.gradeAdjustments.filter(x => !savedIds.has(x.id))].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
      await audit.recordActivity(old?'grade_adjustment_updated':'grade_adjustment_created', old?'تم تعديل طلب درجة':'تم إنشاء طلب تعديل درجة', `${baseItem.studentName} - ${items.map(item=>`${item.subjectName}/${item.gradeSection}`).join('، ')}`, baseItem.schoolId, state.currentUser.id);
      state.modal=null;
      showToast(items.length > 1 ? `تم إرسال ${items.length} طلبات تعديل إلى وحدة الحاسوب.` : (old?'تم تحديث الطلب.':'تم إرسال الطلب إلى وحدة الحاسوب.'));
    }
    catch(error){ console.error(error); showToast(supabase.formatCloudError(error,'تعذر حفظ طلب تعديل الدرجة.')); } finally { delete state.gradeAdjustmentBusy[id]; if (submitButton?.isConnected) { submitButton.disabled=false; submitButton.innerHTML=originalSubmitHtml; } render(); }
  }

  async function updateStatus(id,status) {
    const { state, cloud, supabase, showToast, render }=getContext(); const item=state.gradeAdjustments.find(x=>x.id===id); if(!item||!canComputerAct(item)||!['received','completed'].includes(status))return;
    state.gradeAdjustmentBusy[id]=true; render(); try { const {data,error}=await cloud.client.from('grade_adjustments').update({status}).eq('id',id).select('*').single(); if(error)throw error; state.gradeAdjustments=state.gradeAdjustments.map(x=>x.id===id?normalizeAdjustment(data):x); showToast(status==='received'?'تم استلام الطلب.':'تم تسجيل إكمال تعديل الدرجة.'); } catch(error){console.error(error);showToast(supabase.formatCloudError(error,'تعذر تحديث حالة الطلب.'));} finally{delete state.gradeAdjustmentBusy[id];render();}
  }

  async function deleteAdjustment(id) { const {state,supabase,canManageGradeAdjustments,showToast,render}=getContext(); const item=state.gradeAdjustments.find(x=>x.id===id); if(!item||!canManageGradeAdjustments()||!confirm(`حذف طلب تعديل درجة ${item.studentName}؟`))return; try{await supabase.deleteCloudDoc('gradeAdjustments',id);state.gradeAdjustments=state.gradeAdjustments.filter(x=>x.id!==id);showToast('تم حذف الطلب.');}catch(error){showToast(supabase.formatCloudError(error,'تعذر حذف الطلب.'));}render(); }
  function setFilter(key,value){const {state,render}=getContext();if(!['search','status','month','from','to'].includes(key))return;state.gradeAdjustmentFilters={...state.gradeAdjustmentFilters,[key]:value};state.pagination.gradeAdjustmentsPage=1;if(key==='search'){clearTimeout(searchTimer);searchTimer=setTimeout(render,180);}else render();}
  function printReport(){const {safe,schoolName,formatDate}=getContext();const rows=visible().map(x=>`<tr><td>${safe(x.studentName)}</td><td>${safe(x.studentNumber || "-")}</td><td>${safe(x.month)}</td><td>${safe(x.gradeSection)}</td><td>${safe(x.subjectName)}</td><td>${safe(x.teacherName)}</td><td>${safe(x.className)}</td><td>${safe(x.sectionName)}</td><td>${safe(x.newGrade)}</td><td>${safe(x.reason)}</td><td>${safe(statusLabels[x.status])}</td><td>${safe(schoolName(x.schoolId))}</td><td>${safe(formatDate(x.createdAt))}</td></tr>`).join('');const win=window.open('','_blank');if(!win)return;win.document.write(`<html dir="rtl"><head><title>تقرير تعديل الدرجات</title><style>body{font-family:Tahoma;padding:24px}h1{text-align:center}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #999;padding:5px;text-align:right}th{background:#eee}@page{size:landscape;margin:8mm}</style></head><body><h1>تقرير طلبات تعديل الدرجات</h1><table><thead><tr>${['الطالب','رقم الطالب','الشهر','قسم الدرجة','المادة','الأستاذ','الصف','الشعبة','الدرجة','السبب','الحالة','الفرع','التاريخ'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows||'<tr><td colspan="13">لا توجد بيانات</td></tr>'}</tbody></table></body></html>`);win.document.close();win.focus();setTimeout(()=>win.print(),250);}

  return { normalizeAdjustment, renderPage, renderModal, openAdjustment, saveAdjustment, updateStatus, deleteAdjustment, setFilter, printReport, applyGradeSectionLimits, validateGradeInput, addSubject, removeSubject, selectTeacher, refreshTeacherCatalog };
}
