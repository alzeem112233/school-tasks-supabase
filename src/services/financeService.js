import { nowTimestamp, toDateKey, today } from "../utils/dateUtils.js";
import { createUuid } from "../utils/idUtils.js";
import { isGeneralManager, normalizeRole } from "../utils/permissionUtils.js";

const financeStatusLabels = {
  pending: "بانتظار الاستلام",
  received: "قيد إدخال التخفيض",
  completed: "تم إدخال التخفيض",
};

export function createFinanceModule(getContext) {
  let financeSearchRenderTimer = null;

  function normalizeDiscount(discount = {}) {
    const value = (camelKey, databaseKey) => discount[camelKey] ?? discount[databaseKey];
    return {
      id: discount.id || createUuid(),
      schoolId: value("schoolId", "school_id") || "",
      studentName: String(value("studentName", "student_name") || "").trim(),
      studentNumber: String(value("studentNumber", "student_number") || "").trim(),
      className: String(value("className", "class_name") || "").trim(),
      discountType: value("discountType", "discount_type") === "percentage" ? "percentage" : "amount",
      discountValue: Number(value("discountValue", "discount_value") || 0),
      details: String(discount.details || "").trim(),
      status: ["pending", "received", "completed"].includes(discount.status) ? discount.status : "pending",
      assignedTo: value("assignedTo", "assigned_to") || "",
      assignedToName: String(value("assignedToName", "assigned_to_name") || "").trim(),
      receivedBy: value("receivedBy", "received_by") || "",
      receivedByName: String(value("receivedByName", "received_by_name") || "").trim(),
      createdBy: value("createdBy", "created_by") || "",
      createdByName: String(value("createdByName", "created_by_name") || "").trim(),
      receivedAt: value("receivedAt", "received_at") || "",
      completedAt: value("completedAt", "completed_at") || "",
      createdAt: value("createdAt", "created_at") || nowTimestamp(),
      updatedAt: value("updatedAt", "updated_at") || nowTimestamp(),
    };
  }

  function statusLabel(status) {
    return financeStatusLabels[status] || financeStatusLabels.pending;
  }

  function statusClass(status) {
    if (status === "completed") return "finance-status-completed";
    if (status === "received") return "finance-status-received";
    return "finance-status-pending";
  }

  function discountValueLabel(discount) {
    const value = Number(discount.discountValue || 0);
    if (discount.discountType === "percentage") return `${value}%`;
    return `${new Intl.NumberFormat("ar", { maximumFractionDigits: 2 }).format(value)} ريال`;
  }

  function canFinanceAct(discount) {
    const { state } = getContext();
    if (normalizeRole(state.currentUser?.role, "") !== "finance") return false;
    if (discount.schoolId !== state.currentUser?.schoolId || discount.status === "completed") return false;
    if (discount.status === "pending") return !discount.assignedTo || discount.assignedTo === state.currentUser.id;
    return discount.status === "received" && discount.receivedBy === state.currentUser.id;
  }

  function visibleDiscounts(options = {}) {
    const { state, scopedSchoolId } = getContext();
    const filters = state.financeFilters || {};
    const schoolScope = scopedSchoolId();
    const search = String(filters.search || "").trim().toLocaleLowerCase("ar");
    return state.financeDiscounts
      .filter((item) => schoolScope === "all" || item.schoolId === schoolScope)
      .filter((item) => options.ignoreFilters || filters.status === "all" || item.status === filters.status)
      .filter((item) => options.ignoreFilters || filters.assigneeId === "all" || item.receivedBy === filters.assigneeId || item.assignedTo === filters.assigneeId)
      .filter((item) => options.ignoreFilters || !filters.from || toDateKey(item.createdAt) >= filters.from)
      .filter((item) => options.ignoreFilters || !filters.to || toDateKey(item.createdAt) <= filters.to)
      .filter((item) => options.ignoreFilters || !search || [item.studentName, item.studentNumber, item.className, item.details].join(" ").toLocaleLowerCase("ar").includes(search))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function renderFinanceRow(discount) {
    const { state, safe, icons, getUser, schoolName, canManageFinanceDiscounts, formatDate } = getContext();
    const actionBusy = Boolean(state.financeBusy?.[discount.id]);
    const receiver = getUser(discount.receivedBy);
    const assigned = getUser(discount.assignedTo);
    const creator = getUser(discount.createdBy);
    return `
      <article class="finance-row ${statusClass(discount.status)}">
        <div class="finance-student" data-label="الطالب">
          <strong>${safe(discount.studentName)}</strong>
          <span>${safe(discount.studentNumber || "دون رقم")} ${discount.className ? `· ${safe(discount.className)}` : ""}</span>
        </div>
        <div class="finance-discount-value" data-label="التخفيض"><strong>${safe(discountValueLabel(discount))}</strong><span>${safe(discount.details || "لا توجد تفاصيل إضافية")}</span></div>
        <div data-label="الفرع والتاريخ"><strong>${safe(schoolName(discount.schoolId))}</strong><span>${safe(formatDate(discount.createdAt))}</span></div>
        <div data-label="الحالة"><span class="finance-status-pill ${statusClass(discount.status)}">${safe(statusLabel(discount.status))}</span></div>
        <div data-label="المستلم">
          <strong>${safe(receiver?.name || discount.receivedByName || assigned?.name || discount.assignedToName || "لم يستلمها أحد")}</strong>
          <span>${discount.receivedAt ? `استلمت: ${safe(formatDate(discount.receivedAt))}` : `أنشأها: ${safe(creator?.name || discount.createdByName || "الإدارة")}`}</span>
        </div>
        <div data-label="تاريخ الإكمال"><strong>${discount.completedAt ? safe(formatDate(discount.completedAt)) : "-"}</strong></div>
        <div class="finance-row-actions" data-label="الإجراءات">
          ${canFinanceAct(discount) && discount.status === "pending" ? `<button class="btn secondary compact-btn" type="button" ${actionBusy ? "disabled" : ""} onclick="actions.updateFinanceDiscountStatus('${safe(discount.id)}', 'received')">${icons.finance} استلام العملية</button>` : ""}
          ${canFinanceAct(discount) && discount.status === "received" ? `<button class="btn success compact-btn" type="button" ${actionBusy ? "disabled" : ""} onclick="actions.updateFinanceDiscountStatus('${safe(discount.id)}', 'completed')">${icons.check} تم إدخال التخفيض</button>` : ""}
          ${canManageFinanceDiscounts() ? `<button class="icon-btn" type="button" ${actionBusy ? "disabled" : ""} title="تعديل التخفيض" aria-label="تعديل التخفيض" onclick="actions.openFinanceDiscount('${safe(discount.id)}')">${icons.edit}</button>
            <button class="icon-btn danger-icon" type="button" ${actionBusy ? "disabled" : ""} title="حذف السجل" aria-label="حذف السجل" onclick="actions.deleteFinanceDiscount('${safe(discount.id)}')">${icons.trash}</button>` : ""}
        </div>
      </article>
    `;
  }

  function renderFinance() {
    const { state, safe, icons, paginate, renderPagination, canManageFinanceDiscounts, getUser } = getContext();
    state.financeFilters ||= { search: "", status: "all", assigneeId: "all", from: "", to: "" };
    const records = visibleDiscounts();
    const allRecords = visibleDiscounts({ ignoreFilters: true });
    const pageInfo = paginate(records, state.pagination.financePage, 15);
    const financeUsers = state.users.filter((user) => user.active && user.role === "finance");
    return `
      <section class="finance-page">
        <div class="finance-page-head">
          <div>
            <span class="finance-eyebrow">الإدارة المالية</span>
            <h2>سجل تخفيضات الطلاب</h2>
            <p>متابعة طلبات التخفيض من الإدخال حتى التنفيذ المالي.</p>
          </div>
          <div class="actions">
            ${canManageFinanceDiscounts() ? `<button class="btn secondary" type="button" onclick="actions.setReportConfig('type', 'discount'); actions.setView('reports')">${icons.reports} تقرير التخفيضات</button>
              <button class="btn" type="button" onclick="actions.openFinanceDiscount()">${icons.plus} إضافة تخفيض</button>` : ""}
          </div>
        </div>
        <div class="finance-metrics">
          <div class="finance-metric metric-total"><span>إجمالي الطلبات</span><strong>${safe(allRecords.length)}</strong></div>
          <div class="finance-metric metric-pending"><span>بانتظار الاستلام</span><strong>${safe(allRecords.filter((item) => item.status === "pending").length)}</strong></div>
          <div class="finance-metric metric-received"><span>قيد الإدخال</span><strong>${safe(allRecords.filter((item) => item.status === "received").length)}</strong></div>
          <div class="finance-metric metric-completed"><span>تم إدخالها</span><strong>${safe(allRecords.filter((item) => item.status === "completed").length)}</strong></div>
        </div>
        <div class="panel finance-filter-bar">
          <label class="field"><span>بحث عن طالب</span><input value="${safe(state.financeFilters.search)}" placeholder="الاسم أو الرقم أو الصف" oninput="actions.setFinanceFilter('search', this.value)" /></label>
          <label class="field"><span>الحالة</span><select onchange="actions.setFinanceFilter('status', this.value)">
            <option value="all">كل الحالات</option>
            ${Object.entries(financeStatusLabels).map(([value, label]) => `<option value="${value}" ${state.financeFilters.status === value ? "selected" : ""}>${safe(label)}</option>`).join("")}
          </select></label>
          <label class="field"><span>موظف المالية</span><select onchange="actions.setFinanceFilter('assigneeId', this.value)">
            <option value="all">الكل</option>
            ${financeUsers.map((user) => `<option value="${safe(user.id)}" ${state.financeFilters.assigneeId === user.id ? "selected" : ""}>${safe(getUser(user.id)?.name || user.name)}</option>`).join("")}
          </select></label>
          <label class="field"><span>من تاريخ</span><input type="date" value="${safe(state.financeFilters.from)}" onchange="actions.setFinanceFilter('from', this.value)" /></label>
          <label class="field"><span>إلى تاريخ</span><input type="date" value="${safe(state.financeFilters.to)}" onchange="actions.setFinanceFilter('to', this.value)" /></label>
        </div>
        <div class="panel finance-table-panel">
          <div class="finance-table-head"><span>الطالب</span><span>التخفيض</span><span>الفرع والتاريخ</span><span>الحالة</span><span>المستلم</span><span>الإكمال</span><span>الإجراءات</span></div>
          <div class="finance-list">${pageInfo.items.map(renderFinanceRow).join("") || `<div class="empty">لا توجد طلبات تخفيض مطابقة.</div>`}</div>
        </div>
        ${renderPagination(pageInfo, "financePage")}
      </section>
    `;
  }

  function renderFinanceModal(id = "") {
    const { state, safe, icons, schools, schoolName } = getContext();
    const discount = state.financeDiscounts.find((item) => item.id === id) || {};
    const selectedSchoolId = discount.schoolId || (isGeneralManager(state.currentUser) && state.activeSchoolId !== "all" ? state.activeSchoolId : state.currentUser.schoolId || "");
    const schoolOptions = isGeneralManager(state.currentUser) ? schools : schools.filter((school) => school.id === state.currentUser.schoolId);
    const financeUsers = state.users.filter((user) => user.active && user.role === "finance" && (!selectedSchoolId || user.schoolId === selectedSchoolId));
    return `
      <div class="modal">
        <form class="modal-box finance-modal" onsubmit="actions.saveFinanceDiscount(event)">
          <div class="modal-head"><div><h3>${id ? "تعديل طلب التخفيض" : "إضافة طلب تخفيض"}</h3><p class="muted">بيانات الطالب والتخفيض المطلوب</p></div><button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button></div>
          <input type="hidden" name="id" value="${safe(id)}" />
          <div class="form-grid">
            <label class="field"><span>الفرع</span><select name="schoolId" required onchange="actions.filterFinanceAssignees(this.value, this.form)">${schoolOptions.map((school) => `<option value="${safe(school.id)}" ${selectedSchoolId === school.id ? "selected" : ""}>${safe(school.name || schoolName(school.id))}</option>`).join("")}</select></label>
            <label class="field"><span>موظف المالية المحدد</span><select name="assignedTo"><option value="">متاح لجميع موظفي المالية</option>${financeUsers.map((user) => `<option value="${safe(user.id)}" ${discount.assignedTo === user.id ? "selected" : ""}>${safe(user.name)}</option>`).join("")}</select></label>
            <label class="field wide"><span>اسم الطالب</span><input name="studentName" value="${safe(discount.studentName || "")}" required maxlength="200" /></label>
            <label class="field"><span>رقم الطالب</span><input name="studentNumber" value="${safe(discount.studentNumber || "")}" maxlength="80" /></label>
            <label class="field"><span>الصف / المرحلة</span><input name="className" value="${safe(discount.className || "")}" maxlength="120" /></label>
            <label class="field"><span>نوع التخفيض</span><select name="discountType"><option value="amount" ${discount.discountType !== "percentage" ? "selected" : ""}>مبلغ</option><option value="percentage" ${discount.discountType === "percentage" ? "selected" : ""}>نسبة مئوية</option></select></label>
            <label class="field"><span>قيمة التخفيض</span><input name="discountValue" type="number" min="0.01" step="0.01" value="${safe(discount.discountValue || "")}" required /></label>
            <label class="field wide"><span>التفاصيل والملاحظات</span><textarea name="details" maxlength="2000">${safe(discount.details || "")}</textarea></label>
          </div>
          <div class="modal-actions"><button class="btn secondary" type="button" onclick="actions.closeModal()">إلغاء</button><button class="btn" type="submit">${icons.save} حفظ طلب التخفيض</button></div>
        </form>
      </div>
    `;
  }

  function filterFinanceAssignees(schoolId, form) {
    const { state } = getContext();
    const select = form?.querySelector('select[name="assignedTo"]');
    if (!select) return;
    select.innerHTML = `<option value="">متاح لجميع موظفي المالية</option>${state.users.filter((user) => user.active && user.role === "finance" && user.schoolId === schoolId).map((user) => `<option value="${user.id}">${getContext().safe(user.name)}</option>`).join("")}`;
  }

  async function saveFinanceDiscount(event) {
    event.preventDefault();
    const { state, cloud, supabase, canManageFinanceDiscounts, showToast, audit, render } = getContext();
    if (!canManageFinanceDiscounts()) return;
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id") || "") || createUuid();
    const existing = state.financeDiscounts.find((item) => item.id === id);
    const discountValue = Number(form.get("discountValue") || 0);
    const studentName = String(form.get("studentName") || "").trim();
    if (studentName.length < 2 || !Number.isFinite(discountValue) || discountValue <= 0) {
      showToast("أدخل اسم الطالب وقيمة تخفيض صحيحة.");
      return;
    }
    const discount = normalizeDiscount({
      ...existing,
      id,
      schoolId: String(form.get("schoolId") || ""),
      studentName,
      studentNumber: String(form.get("studentNumber") || "").trim(),
      className: String(form.get("className") || "").trim(),
      discountType: String(form.get("discountType") || "amount"),
      discountValue,
      details: String(form.get("details") || "").trim(),
      assignedTo: String(form.get("assignedTo") || ""),
      createdBy: existing?.createdBy || state.currentUser.id,
      createdAt: existing?.createdAt || nowTimestamp(),
      updatedAt: nowTimestamp(),
    });
    state.financeBusy = { ...state.financeBusy, [id]: true };
    render();
    try {
      if (cloud.enabled) await supabase.saveCloudDoc("financeDiscounts", id, discount, Boolean(existing));
      state.financeDiscounts = existing ? state.financeDiscounts.map((item) => item.id === id ? discount : item) : [discount, ...state.financeDiscounts];
      await audit.recordActivity(existing ? "finance_discount_updated" : "finance_discount_created", existing ? "تم تعديل طلب تخفيض" : "تم إنشاء طلب تخفيض", `${studentName} - ${discountValueLabel(discount)}`, discount.schoolId, state.currentUser.id);
      state.modal = null;
      showToast(existing ? "تم تحديث طلب التخفيض." : "تم إرسال طلب التخفيض إلى المالية.");
    } catch (error) {
      console.error(error);
      showToast(supabase.formatCloudError(error, "تعذر حفظ طلب التخفيض."));
    } finally {
      const busy = { ...state.financeBusy };
      delete busy[id];
      state.financeBusy = busy;
      render();
    }
  }

  async function updateFinanceDiscountStatus(id, status) {
    const { state, cloud, supabase, showToast, audit, render } = getContext();
    const discount = state.financeDiscounts.find((item) => item.id === id);
    if (!discount || !canFinanceAct(discount) || !["received", "completed"].includes(status)) return;
    const previousDiscounts = state.financeDiscounts;
    const optimistic = normalizeDiscount({
      ...discount,
      status,
      receivedBy: status === "received" ? state.currentUser.id : discount.receivedBy,
      receivedByName: status === "received" ? state.currentUser.name : discount.receivedByName,
      receivedAt: status === "received" ? new Date().toISOString() : discount.receivedAt,
      completedAt: status === "completed" ? new Date().toISOString() : discount.completedAt,
      updatedAt: new Date().toISOString(),
    });
    state.financeBusy = { ...state.financeBusy, [id]: true };
    state.financeDiscounts = state.financeDiscounts.map((item) => item.id === id ? optimistic : item);
    render();
    try {
      if (!cloud.enabled || !cloud.client) throw new Error("الاتصال بقاعدة البيانات غير متاح حاليًا.");
      if (state.isOffline || navigator.onLine === false) {
        await supabase.saveCloudDoc("financeDiscounts", id, optimistic, true);
        showToast("لا يوجد اتصال. تم حفظ تغيير حالة التخفيض محليا وسيتم إرساله عند المزامنة.");
        return;
      }
      const { data, error } = await cloud.client.from("finance_discounts").update({ status }).eq("id", id).select("*").single();
      if (error) throw error;
      const updated = normalizeDiscount(data);
      state.financeDiscounts = state.financeDiscounts.map((item) => item.id === id ? updated : item);
      await audit.recordActivity(status === "received" ? "finance_discount_received" : "finance_discount_completed", status === "received" ? "تم استلام طلب تخفيض" : "تم إدخال التخفيض", discount.studentName, discount.schoolId, state.currentUser.id);
      showToast(status === "received" ? "تم استلام العملية وتسجيل اسمك ووقت الاستلام." : "تم إنهاء العملية وتسجيل وقت الإكمال.");
    } catch (error) {
      console.error(error);
      state.financeDiscounts = previousDiscounts;
      showToast(supabase.formatCloudError(error, "تعذر تحديث حالة العملية. حاول مرة أخرى."));
    } finally {
      const busy = { ...state.financeBusy };
      delete busy[id];
      state.financeBusy = busy;
      render();
    }
  }

  async function deleteFinanceDiscount(id) {
    const { state, supabase, canManageFinanceDiscounts, showToast, render } = getContext();
    const discount = state.financeDiscounts.find((item) => item.id === id);
    if (!discount || !canManageFinanceDiscounts() || !confirm(`هل تريد حذف طلب تخفيض الطالب ${discount.studentName}؟`)) return;
    state.financeBusy = { ...state.financeBusy, [id]: true };
    render();
    try {
      await supabase.deleteCloudDoc("financeDiscounts", id);
      state.financeDiscounts = state.financeDiscounts.filter((item) => item.id !== id);
      showToast("تم حذف طلب التخفيض.");
    } catch (error) {
      console.error(error);
      showToast(supabase.formatCloudError(error, "تعذر حذف طلب التخفيض. حاول مرة أخرى."));
    } finally {
      const busy = { ...state.financeBusy };
      delete busy[id];
      state.financeBusy = busy;
      render();
    }
  }

  function setFinanceFilter(key, value) {
    const { state, render } = getContext();
    if (!["search", "status", "assigneeId", "from", "to"].includes(key)) return;
    state.financeFilters = { ...state.financeFilters, [key]: value };
    state.pagination.financePage = 1;
    if (key === "search") {
      if (financeSearchRenderTimer) window.clearTimeout(financeSearchRenderTimer);
      financeSearchRenderTimer = window.setTimeout(render, 180);
      return;
    }
    render();
  }

  return {
    normalizeDiscount,
    statusLabel,
    discountValueLabel,
    visibleDiscounts,
    renderFinance,
    renderFinanceModal,
    filterFinanceAssignees,
    saveFinanceDiscount,
    updateFinanceDiscountStatus,
    deleteFinanceDiscount,
    setFinanceFilter,
  };
}
