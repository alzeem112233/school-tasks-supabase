import { createUuid } from "../utils/idUtils.js";
import { normalizeRole } from "../utils/permissionUtils.js";

const ALLOWED_ROLES = new Set([
  "superadmin",
  "general_manager",
  "branch_manager",
  "finance_manager",
  "development_supervision_manager",
  "school_principal",
  "computer_unit",
]);

export function createNotebookRoleTemplateModule(getContext) {
  const ctx = () => getContext();
  const roleOf = (user = ctx().state.currentUser) => normalizeRole(user?.role, "");
  const canManage = (user = ctx().state.currentUser) => Boolean(user && user.active !== false && ALLOWED_ROLES.has(roleOf(user)));
  const templateFor = (roleKey) => (ctx().state.notebookRoleTemplates || []).find((item) => item.roleKey === roleKey) || { roleKey, items: [] };

  function employeeCount(roleKey) {
    return (ctx().state.users || []).filter((user) => user.active !== false && normalizeRole(user.role, "") === roleKey).length;
  }

  function renderPage() {
    const { state, roles, roleLabel, safe, icons } = ctx();
    if (!canManage()) return `<section class="empty-state"><h2>لا توجد صلاحية لعرض عناوين دفتر المهام.</h2></section>`;
    const configured = (state.notebookRoleTemplates || []).filter((item) => Array.isArray(item.items) && item.items.length).length;
    const employeeTotal = (state.users || []).filter((user) => user.active !== false).length;
    return `
      <section class="notebook-template-page">
        <header class="notebook-template-hero">
          <div>
            <span>الإدارة المركزية للدفاتر</span>
            <h1>عناوين دفتر المهام</h1>
            <p>عدّل بنود كل تسلسل وظيفي مرة واحدة، وسيتم تحديث دفاتر جميع الموظفين التابعين له تلقائيًا.</p>
          </div>
          <div class="notebook-template-stats">
            <b>${safe(configured)}<small>تسلسل مهيأ</small></b>
            <b>${safe(employeeTotal)}<small>موظف نشط</small></b>
          </div>
        </header>
        <div class="notebook-role-grid">
          ${roles.map((roleKey, index) => {
            const template = templateFor(roleKey);
            const items = Array.isArray(template.items) ? template.items : [];
            const employees = employeeCount(roleKey);
            return `
              <article class="notebook-role-card tone-${index % 5}">
                <header>
                  <span class="notebook-role-number">${safe(index + 1)}</span>
                  <div><h2>${safe(roleLabel(roleKey))}</h2><p>${safe(employees)} موظف نشط</p></div>
                  <b>${safe(items.length)}<small>بند</small></b>
                </header>
                <ol>${items.map((item) => `<li>${safe(item.title)}</li>`).join("") || `<li class="is-empty">لم تُحدد عناوين لهذا التسلسل بعد.</li>`}</ol>
                <button class="btn notebook-role-edit" type="button" onclick="actions.openNotebookRoleTemplate('${safe(roleKey)}')">${icons.edit || ""} تعديل عناوين الدفتر</button>
              </article>`;
          }).join("")}
        </div>
      </section>`;
  }

  function openTemplate(roleKey) {
    if (!canManage() || !ctx().roles.includes(roleKey)) return;
    const source = templateFor(roleKey);
    const items = (source.items || []).map((item) => ({ id: item.id || createUuid(), title: item.title || "", description: item.description || "" }));
    ctx().state.modal = { type: "notebook_role_template", roleKey, items: items.length ? items : [{ id: createUuid(), title: "", description: "" }] };
    ctx().render();
  }

  function itemRow(item = {}, index = 0) {
    const { safe, icons } = ctx();
    return `<div class="notebook-template-item" data-template-item>
      <input type="hidden" name="itemId" value="${safe(item.id || createUuid())}">
      <span class="notebook-template-index">${safe(index + 1)}</span>
      <label><span>عنوان المهمة</span><input name="itemTitle" value="${safe(item.title || "")}" maxlength="300" required placeholder="اكتب عنوان المهمة"></label>
      <label><span>التفاصيل</span><textarea name="itemDescription" maxlength="800" placeholder="تفاصيل مختصرة اختيارية">${safe(item.description || "")}</textarea></label>
      <button class="icon-btn danger-icon" type="button" title="حذف البند" aria-label="حذف البند" onclick="actions.removeNotebookRoleTemplateItem(this)">${icons.trash || "×"}</button>
    </div>`;
  }

  function renderModal() {
    const { state, roleLabel, safe, icons } = ctx();
    const modal = state.modal;
    if (modal?.type !== "notebook_role_template" || !canManage()) return "";
    const count = employeeCount(modal.roleKey);
    return `<div class="modal">
      <form class="modal-box notebook-template-modal" onsubmit="actions.saveNotebookRoleTemplate(event)">
        <header class="notebook-template-modal-head">
          <div><span>التسلسل الوظيفي</span><h2>${safe(roleLabel(modal.roleKey))}</h2><p>سيُطبق الحفظ على ${safe(count)} موظف نشط في هذا التسلسل.</p></div>
          <button class="icon-btn" type="button" onclick="actions.closeModal()" aria-label="إغلاق">${icons.close || "×"}</button>
        </header>
        <input type="hidden" name="roleKey" value="${safe(modal.roleKey)}">
        <div class="notebook-template-warning"><strong>حفظ آمن</strong><span>لن تُحذف سجلات الإنجاز السابقة. البنود المحذوفة تتوقف عن الظهور في الدفتر الحالي فقط.</span></div>
        <div class="notebook-template-items" data-template-items>${(modal.items || []).map(itemRow).join("")}</div>
        <button class="btn secondary notebook-add-item" type="button" onclick="actions.addNotebookRoleTemplateItem()">${icons.plus || "+"} إضافة عنوان جديد</button>
        <footer>
          <button class="btn secondary" type="button" onclick="actions.closeModal()">إلغاء</button>
          <button class="btn" type="submit" ${state.notebookTemplateBusy ? "disabled" : ""}>${icons.save || ""} ${state.notebookTemplateBusy ? "جاري التحديث..." : "حفظ وتحديث جميع الدفاتر"}</button>
        </footer>
      </form>
    </div>`;
  }

  function addItem() {
    const { state, render } = ctx();
    if (state.modal?.type !== "notebook_role_template") return;
    state.modal.items = [...(state.modal.items || []), { id: createUuid(), title: "", description: "" }];
    render();
    window.setTimeout(() => document.querySelector("[data-template-item]:last-child input[name='itemTitle']")?.focus(), 0);
  }

  function removeItem(button) {
    const row = button?.closest("[data-template-item]");
    const form = button?.form;
    if (!row || !form) return;
    row.remove();
    [...form.querySelectorAll("[data-template-item] .notebook-template-index")].forEach((item, index) => { item.textContent = String(index + 1); });
  }

  async function saveTemplate(event) {
    event.preventDefault();
    const { state, cloud, supabase, showToast, render } = ctx();
    if (!canManage() || state.notebookTemplateBusy) return;
    const form = new FormData(event.currentTarget);
    const roleKey = String(form.get("roleKey") || "");
    const ids = form.getAll("itemId").map(String);
    const titles = form.getAll("itemTitle").map((value) => String(value || "").trim());
    const descriptions = form.getAll("itemDescription").map((value) => String(value || "").trim());
    const items = titles.map((title, index) => ({ id: ids[index] || createUuid(), title, description: descriptions[index] || "" })).filter((item) => item.title);
    const keys = items.map((item) => item.title.replace(/\s+/g, " ").toLocaleLowerCase("ar"));
    if (new Set(keys).size !== keys.length) return showToast("لا يمكن تكرار عنوان المهمة داخل التسلسل نفسه.");
    if (!cloud.client || navigator.onLine === false) return showToast("تحديث جميع الدفاتر يحتاج اتصالًا بالإنترنت.");
    state.notebookTemplateBusy = true;
    render();
    try {
      const { data, error } = await cloud.client.rpc("save_notebook_role_template", { p_role_key: roleKey, p_items: items });
      if (error) throw error;
      state.modal = null;
      await supabase.refreshCloudData(false, { deferSecondary: true });
      showToast(`تم تحديث ${data?.employees || employeeCount(roleKey)} دفترًا وظيفيًا بنجاح.`);
    } catch (error) {
      console.error(error);
      showToast(supabase.formatCloudError(error, "تعذر تحديث عناوين دفتر المهام."));
    } finally {
      state.notebookTemplateBusy = false;
      render();
    }
  }

  return { canManage, renderPage, renderModal, openTemplate, addItem, removeItem, saveTemplate };
}
