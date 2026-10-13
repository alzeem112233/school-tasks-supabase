import { nowTimestamp } from "../utils/dateUtils.js";
import { createUuid } from "../utils/idUtils.js";

function legacyHiddenTeacherIds(currentUserId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(`staffEvaluationHiddenTeachers:${currentUserId || "anonymous"}`) || "[]"));
  } catch {
    return new Set();
  }
}

export function isTeacherVisibleFor(state, teacherId, evaluatorId) {
  const teacher = (state.teacherDirectory || []).find((item) => item.id === teacherId);
  if (!teacher || teacher.active === false) return false;
  const link = (state.teacherEvaluatorLinks || []).find((item) => item.teacherId === teacherId && item.evaluatorId === evaluatorId);
  if (link) return link.isVisible !== false;
  if (evaluatorId === state.currentUser?.id && legacyHiddenTeacherIds(evaluatorId).has(teacherId)) return false;
  return true;
}

export function visibleTeachersFor(state, evaluatorId, schoolId) {
  return (state.teacherDirectory || [])
    .filter((teacher) => teacher.schoolId === schoolId && teacher.active !== false)
    .filter((teacher) => isTeacherVisibleFor(state, teacher.id, evaluatorId));
}

export function teacherDetailsFor(state, teacherId, fallback = {}) {
  const teacher = (state.teacherDirectory || []).find((item) => item.id === teacherId);
  return {
    teacherName: teacher?.teacherName || fallback.teacherName || "",
    subjectName: teacher?.subjectName || fallback.subjectName || "",
    className: teacher?.className || fallback.className || "",
  };
}

function csvRows(text) {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.split(/[,;\t]/).map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
}

export function createTeacherDirectoryModule(getContext) {
  const currentSchoolId = () => {
    const { state, scopedSchoolId } = getContext();
    const selected = scopedSchoolId();
    if (selected && selected !== "all" && selected !== "11111111-1111-4111-8111-111111111111") return selected;
    if (state.currentUser?.role !== "superadmin") return state.currentUser?.schoolId || "";
    return "";
  };
  const canEdit = () => ["superadmin", "general_manager", "school_principal", "deputy_principal", "school_secretary", "computer_unit"].includes(String(getContext().state.currentUser?.role || ""));
  const currentEvaluatorId = () => getContext().state.currentUser?.id || "";
  const allTeachers = () => (getContext().state.teacherDirectory || [])
    .filter((teacher) => teacher.schoolId === currentSchoolId() && teacher.active !== false)
    .sort((a, b) => String(a.teacherName || "").localeCompare(String(b.teacherName || ""), "ar"));

  function openEditor(id = "") {
    const { state, render, showToast } = getContext();
    const teacher = id ? (state.teacherDirectory || []).find((item) => item.id === id) : null;
    if (!canEdit() || (id && (!teacher || teacher.schoolId !== currentSchoolId()))) {
      showToast("لا تملك صلاحية تعديل بيانات المعلمين في هذا الفرع");
      return;
    }
    state.modal = { type: "teacher_directory_edit", id };
    render();
  }

  function renderModal(id = "") {
    const { state, safe, icons } = getContext();
    const teacher = id ? (state.teacherDirectory || []).find((item) => item.id === id) : {};
    if (!canEdit() || (id && (!teacher || teacher.schoolId !== currentSchoolId()))) return "";
    return `<div class="modal-backdrop"><section class="modal-card teacher-editor-modal"><header><div><span class="eyebrow">دليل المعلمين</span><h2>${id ? "تعديل بيانات المعلم" : "إضافة معلم"}</h2><small>هذه البيانات هي المصدر الموحد للتقييم والتقارير والنماذج.</small></div><button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close || "×"}</button></header><form onsubmit="actions.saveTeacherDirectoryEntry(event); return false;"><input type="hidden" name="id" value="${safe(teacher?.id || "")}"><div class="form-grid"><label class="field"><span>اسم المعلم</span><input name="teacherName" value="${safe(teacher?.teacherName || "")}" maxlength="120" autocomplete="off" required></label><label class="field"><span>المادة التي يدرسها</span><input name="subjectName" value="${safe(teacher?.subjectName || "")}" maxlength="120" autocomplete="off" required></label><label class="field field-wide"><span>الصف أو الصفوف</span><input name="className" value="${safe(teacher?.className || "")}" maxlength="160" placeholder="مثال: السابع، الثامن"></label></div><footer><button class="btn secondary" type="button" onclick="actions.closeModal()">إلغاء</button><button class="btn" type="submit">${icons.save || ""} حفظ المعلم</button></footer></form></section></div>`;
  }

  async function saveTeacher(event) {
    event.preventDefault();
    const { state, supabase, render, showToast } = getContext();
    if (!canEdit()) return showToast("لا تملك صلاحية حفظ بيانات المعلمين");
    const schoolId = currentSchoolId();
    if (!schoolId) return showToast("اختر فرعًا محددًا أولًا");
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id") || "").trim() || createUuid();
    const previous = (state.teacherDirectory || []).find((item) => item.id === id) || null;
    const teacherName = String(form.get("teacherName") || "").trim();
    const subjectName = String(form.get("subjectName") || "").trim();
    const className = String(form.get("className") || "").trim();
    if (teacherName.length < 2 || subjectName.length < 2) return showToast("أدخل اسم المعلم والمادة بصورة صحيحة");
    const duplicate = (state.teacherDirectory || []).some((item) => item.id !== id && item.schoolId === schoolId && item.active !== false && item.teacherName.trim() === teacherName && item.subjectName.trim() === subjectName);
    if (duplicate) return showToast("هذا المعلم مسجل مسبقًا بنفس المادة في الفرع");
    const stamp = nowTimestamp();
    const next = { id, schoolId, teacherName, subjectName, className, active: true, createdBy: previous?.createdBy || state.currentUser?.id || "", createdAt: previous?.createdAt || stamp, updatedAt: stamp };
    const affectedEvaluations = (state.staffEvaluations || []).filter((item) => item.teacherId === id);
    state.teacherDirectory = previous ? state.teacherDirectory.map((item) => item.id === id ? next : item) : [...state.teacherDirectory, next];
    state.staffEvaluations = (state.staffEvaluations || []).map((item) => item.teacherId === id ? { ...item, teacherName, subjectName } : item);
    state.modal = null;
    render();
    try {
      await supabase.saveCloudDoc("teacherDirectory", id, next, Boolean(previous));
      showToast(previous ? "تم تحديث بيانات المعلم" : "تمت إضافة المعلم");
    } catch (error) {
      console.error(error);
      state.teacherDirectory = previous ? state.teacherDirectory.map((item) => item.id === id ? previous : item) : state.teacherDirectory.filter((item) => item.id !== id);
      state.staffEvaluations = (state.staffEvaluations || []).map((item) => item.teacherId === id ? affectedEvaluations.find((old) => old.id === item.id) || item : item);
      render();
      showToast("تعذر حفظ بيانات المعلم في السحابة");
    }
  }

  async function toggleVisibility(teacherId) {
    const { state, supabase, render, showToast } = getContext();
    const teacher = (state.teacherDirectory || []).find((item) => item.id === teacherId && item.schoolId === currentSchoolId());
    if (!teacher) return;
    const evaluatorId = currentEvaluatorId();
    const existing = (state.teacherEvaluatorLinks || []).find((item) => item.teacherId === teacherId && item.evaluatorId === evaluatorId);
    const wasVisible = isTeacherVisibleFor(state, teacherId, evaluatorId);
    const stamp = nowTimestamp();
    const next = { id: existing?.id || createUuid(), schoolId: teacher.schoolId, evaluatorId, teacherId, isVisible: !wasVisible, updatedBy: evaluatorId, createdAt: existing?.createdAt || stamp, updatedAt: stamp };
    state.teacherEvaluatorLinks = [...(state.teacherEvaluatorLinks || []).filter((item) => !(item.teacherId === teacherId && item.evaluatorId === evaluatorId)), next];
    const legacy = legacyHiddenTeacherIds(evaluatorId);
    legacy.delete(teacherId);
    localStorage.setItem(`staffEvaluationHiddenTeachers:${evaluatorId}`, JSON.stringify([...legacy]));
    render();
    try {
      await supabase.saveCloudDoc("teacherEvaluatorLinks", next.id, next, Boolean(existing));
      showToast(next.isVisible ? "تم ربط المعلم بحسابك" : "تم إخفاء المعلم من تقييماتك وتقاريرك");
    } catch (error) {
      console.error(error);
      state.teacherEvaluatorLinks = (state.teacherEvaluatorLinks || []).filter((item) => item.id !== next.id);
      if (existing) state.teacherEvaluatorLinks.push(existing);
      render();
      showToast("تعذر حفظ ربط المعلم في السحابة");
    }
  }

  function setFilter(key, value) {
    const { state, render } = getContext();
    if (!['search', 'visibility'].includes(key)) return;
    state.teacherDirectoryFilters = { ...(state.teacherDirectoryFilters || {}), [key]: String(value || "") };
    render();
  }

  async function rowsFromFile(file) {
    if (/\.xlsx$/i.test(file.name)) {
      const { readSheet } = await import("read-excel-file/browser");
      return readSheet(file);
    }
    if (/\.xls$/i.test(file.name)) throw new Error("صيغة XLS القديمة غير مدعومة. احفظ الملف بصيغة XLSX ثم أعد الاستيراد.");
    return csvRows(await file.text());
  }

  async function importTeachers(file) {
    const { state, supabase, render, showToast } = getContext();
    if (!file || !canEdit()) return;
    const schoolId = currentSchoolId();
    if (!schoolId) return showToast("اختر فرعًا محددًا قبل الاستيراد");
    try {
      const rows = await rowsFromFile(file);
      const header = (rows[0] || []).map((value) => String(value || "").trim().toLowerCase());
      const hasHeader = header.some((value) => /اسم المعلم|teacher/.test(value));
      const source = hasHeader ? rows.slice(1) : rows;
      const existingByKey = new Map((state.teacherDirectory || []).filter((item) => item.schoolId === schoolId).map((item) => [`${item.teacherName.trim()}::${item.subjectName.trim()}`, item]));
      const pending = new Map();
      source.forEach((row) => {
        const teacherName = String(row?.[0] || "").trim();
        const subjectName = String(row?.[1] || "").trim();
        const className = String(row?.[2] || "").trim();
        if (teacherName.length < 2 || subjectName.length < 2) return;
        pending.set(`${teacherName}::${subjectName}`, { teacherName, subjectName, className });
      });
      if (!pending.size) return showToast("لم يتم العثور على صفوف صالحة في الملف");
      const stamp = nowTimestamp();
      const items = [...pending.entries()].map(([key, row]) => {
        const old = existingByKey.get(key);
        return { id: old?.id || createUuid(), schoolId, ...row, active: true, createdBy: old?.createdBy || state.currentUser?.id || "", createdAt: old?.createdAt || stamp, updatedAt: stamp, exists: Boolean(old) };
      });
      for (const item of items) {
        const { exists, ...data } = item;
        await supabase.saveCloudDoc("teacherDirectory", data.id, data, exists);
        state.teacherDirectory = state.teacherDirectory.some((teacher) => teacher.id === data.id) ? state.teacherDirectory.map((teacher) => teacher.id === data.id ? data : teacher) : [...state.teacherDirectory, data];
        state.staffEvaluations = (state.staffEvaluations || []).map((evaluation) => evaluation.teacherId === data.id ? { ...evaluation, teacherName: data.teacherName, subjectName: data.subjectName } : evaluation);
      }
      render();
      showToast(`تم استيراد وتحديث ${items.length} معلمًا بنجاح`);
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر قراءة ملف المعلمين");
    }
  }

  function exportTemplate() {
    getContext().downloadBlob("نموذج_استيراد_المعلمين.csv", "\uFEFFاسم المعلم,اسم المادة,الصف أو الصفوف\n", "text/csv;charset=utf-8");
  }

  function renderPage() {
    const { state, safe, icons, schools, schoolName } = getContext();
    const schoolId = currentSchoolId();
    if (!schoolId) return `<main class="teacher-directory-page page-shell"><div class="page-heading"><div><span class="eyebrow">قاعدة البيانات</span><h1>المعلمون</h1><p>اختر فرعًا محددًا من القائمة الجانبية لإدارة معلميه دون خلط بيانات الفروع.</p></div></div><section class="teacher-empty-state"><strong>يلزم اختيار فرع</strong><span>قاعدة المعلمين مستقلة لكل فرع.</span><select class="input" onchange="actions.setActiveSchool(this.value)"><option value="">اختر الفرع</option>${schools.filter((school) => school.id !== "11111111-1111-4111-8111-111111111111").map((school) => `<option value="${safe(school.id)}">${safe(school.name)}</option>`).join("")}</select></section></main>`;
    const filters = state.teacherDirectoryFilters || { search: "", visibility: "all" };
    const evaluatorId = currentEvaluatorId();
    const teachers = allTeachers();
    const linkedCount = teachers.filter((teacher) => isTeacherVisibleFor(state, teacher.id, evaluatorId)).length;
    const visibleRows = teachers.filter((teacher) => {
      const linked = isTeacherVisibleFor(state, teacher.id, evaluatorId);
      if (filters.visibility === "linked" && !linked) return false;
      if (filters.visibility === "hidden" && linked) return false;
      return !filters.search || `${teacher.teacherName} ${teacher.subjectName} ${teacher.className || ""}`.toLowerCase().includes(filters.search.toLowerCase());
    });
    return `<main class="teacher-directory-page page-shell"><div class="page-heading"><div><span class="eyebrow">قاعدة البيانات</span><h1>المعلمون</h1><p>${safe(schoolName(schoolId))} · مصدر موحد للأسماء والمواد والصفوف في جميع النماذج.</p></div>${canEdit() ? `<button class="btn" type="button" onclick="actions.openTeacherDirectoryEditor()">${icons.plus || "+"} إضافة معلم</button>` : ""}</div><section class="teacher-stats"><div><span>إجمالي المعلمين</span><b>${teachers.length}</b></div><div><span>مرتبطون بحسابي</span><b>${linkedCount}</b></div><div><span>غير مرتبطين</span><b>${teachers.length - linkedCount}</b></div></section><section class="teacher-toolbar"><label class="field teacher-search"><span>البحث</span><input value="${safe(filters.search || "")}" placeholder="اسم المعلم أو المادة أو الصف" oninput="actions.setTeacherDirectoryFilter('search',this.value)"></label><div class="teacher-segments" role="group" aria-label="حالة الربط">${[["all","الكل"],["linked","مربوط بي"],["hidden","غير مربوط"]].map(([value,label]) => `<button type="button" class="${filters.visibility === value ? "active" : ""}" onclick="actions.setTeacherDirectoryFilter('visibility','${value}')">${label}</button>`).join("")}</div>${canEdit() ? `<div class="teacher-import-actions"><button class="btn secondary" type="button" onclick="actions.exportTeacherTemplate()">${icons.save || ""} نموذج Excel</button><label class="btn secondary teacher-file-button">${icons.upload || ""} استيراد ملف<input type="file" accept=".xlsx,.csv,text/csv" hidden onchange="actions.importTeacherDirectory(this.files[0]);this.value=''"></label></div>` : ""}</section><section class="teacher-grid">${visibleRows.length ? visibleRows.map((teacher) => { const linked = isTeacherVisibleFor(state, teacher.id, evaluatorId); return `<article class="teacher-card ${linked ? "is-linked" : "is-hidden"}"><div class="teacher-card-index">${safe(teacher.teacherName.slice(0, 1))}</div><div class="teacher-card-copy"><strong>${safe(teacher.teacherName)}</strong><span>${safe(teacher.subjectName)}</span><small>${safe(teacher.className || "لم يحدد الصف")}</small></div><div class="teacher-card-actions"><button class="teacher-link-toggle ${linked ? "linked" : "hidden"}" type="button" onclick="actions.toggleStaffEvaluationTeacher('${teacher.id}')" aria-pressed="${linked}">${linked ? `${icons.check || ""}<span>مربوط بي</span>` : `${icons.plus || "+"}<span>إظهار وربط</span>`}</button>${canEdit() ? `<button class="icon-btn" type="button" title="تعديل المعلم" aria-label="تعديل المعلم" onclick="actions.openTeacherDirectoryEditor('${teacher.id}')">${icons.edit || "✎"}</button>` : ""}</div></article>`; }).join("") : `<div class="teacher-empty-state"><strong>لا توجد نتائج</strong><span>غيّر البحث أو حالة الربط، أو أضف معلمًا جديدًا.</span></div>`}</section></main>`;
  }

  return { renderPage, renderModal, openEditor, saveTeacher, toggleVisibility, setFilter, importTeachers, exportTemplate };
}
