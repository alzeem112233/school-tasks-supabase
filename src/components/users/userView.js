import { userStatusLabel } from "./userPresentation.js";
import { isGeneralSchoolId } from "../../utils/schoolUtils.js";

export function createUserView(getContext) {
  function linkedSchoolsLabel(user) {
    const { schoolName } = getContext();
    const ids = Array.isArray(user.linkedSchoolIds) && user.linkedSchoolIds.length ? user.linkedSchoolIds : [user.schoolId].filter(Boolean);
    return ids.map((id) => schoolName(id)).join("، ");
  }

  function filteredUsers() {
    const { state, roleLabel, schoolName, schools, roles, canViewUser } = getContext();
    const filters = state.userFilters;
    const query = filters.query.trim().toLowerCase();
    const schoolRank = new Map(schools.map((school, index) => [school.id, index]));
    const roleRank = new Map(roles.map((role, index) => [role, index]));
    return state.users
      .filter((user) => canViewUser(user))
      .filter((user) => user.active)
      .filter((user) => filters.role === "all" || user.role === filters.role)
      .filter((user) => filters.schoolId === "all" || user.schoolId === filters.schoolId)
      .filter((user) => !query || [user.name, user.email, roleLabel(user.role), schoolName(user.schoolId), linkedSchoolsLabel(user)].join(" ").toLowerCase().includes(query))
      .sort((a, b) => {
        const schoolCompare = (schoolRank.get(a.schoolId) ?? 999) - (schoolRank.get(b.schoolId) ?? 999);
        if (schoolCompare) return schoolCompare;
        const roleCompare = (roleRank.get(a.role) ?? 999) - (roleRank.get(b.role) ?? 999);
        if (roleCompare) return roleCompare;
        return a.name.localeCompare(b.name, "ar");
      });
  }

  function renderUsers() {
    const { state, safe, roleLabel, icons, cloud, schoolName, schools, roles, canCreateUsers, canEditUser, paginate, renderPagination, dashboard } = getContext();
    const users = filteredUsers();
    const visibleUsers = state.users.filter((user) => user.active && getContext().canViewUser(user));
    const pageInfo = paginate(users, state.pagination.usersPage, 10);
    const filters = state.userFilters;
    return `
      <div class="topbar">
        <div class="section-title">
          <h2>المستخدمون والصلاحيات</h2>
          <p class="muted">إدارة الحسابات النشطة وتعيين الفرع والدور والصلاحيات.</p>
        </div>
        <div class="actions">
          ${state.currentUser.role === "general_manager" ? `<button class="btn secondary" onclick="actions.openSchool()">${icons.plus} فرع مدرسة جديد</button>` : ""}
          ${canCreateUsers() ? `<button class="btn" onclick="actions.openUser()">${icons.plus} مستخدم جديد</button>` : ""}
        </div>
      </div>

      <div class="grid metrics">
        ${dashboard.metric("نتائج البحث", users.length)}
        ${dashboard.metric("إجمالي الحسابات النشطة", visibleUsers.length)}
      </div>

      ${state.currentUser.role === "general_manager" ? `
        <div class="panel" style="margin-bottom:16px;">
          <div class="section-title" style="margin-bottom:12px;">
            <h3>الإدارة العامة والفروع</h3>
            <p class="muted">الإدارة العامة هي الحساب الأساسي، ومنها تتم إضافة الفروع أو حذف الفروع غير المرتبطة بحسابات وبيانات.</p>
          </div>
          <div class="log-list">
            ${schools.map((school) => `
              <article class="log-item">
                <div>
                  <strong>${safe(school.name)}</strong>
                  <p class="muted">${isGeneralSchoolId(school.id) ? "الحساب الأساسي للإدارة العامة" : "فرع مستقل بحساباته ومهامه"}</p>
                </div>
                <div class="actions">
                  <span class="role-pill">${isGeneralSchoolId(school.id) ? "أساسي" : "فرع"}</span>
                  ${isGeneralSchoolId(school.id) ? "" : `
                    <button class="icon-btn" title="تعديل الفرع" aria-label="تعديل الفرع" type="button" onclick="actions.openSchool('${safe(school.id)}')">${icons.edit}</button>
                    <button class="icon-btn danger-icon" title="حذف الفرع" aria-label="حذف الفرع" type="button" onclick="actions.deleteSchool('${safe(school.id)}')">${icons.trash}</button>
                  `}
                </div>
              </article>
            `).join("")}
          </div>
        </div>
      ` : ""}

      <div class="panel" style="margin-bottom:16px;">
        <div class="toolbar user-filter-toolbar">
          <form class="actions" onsubmit="actions.searchUsers(event)">
            <label class="field"><span>البحث</span><input name="query" value="${safe(filters.query)}" placeholder="الاسم أو البريد أو الفرع" /></label>
            <button class="btn secondary" type="submit">${icons.search} بحث</button>
          </form>
          ${state.currentUser.role === "general_manager" ? `<label class="field user-filter-branch"><span>الفرع</span><select onchange="actions.setUserFilter('schoolId', this.value)"><option value="all">كل الفروع</option>${schools.map((school) => `<option value="${safe(school.id)}" ${filters.schoolId === school.id ? "selected" : ""}>${safe(school.name)}</option>`).join("")}</select></label>` : `<label class="field user-filter-branch"><span>الفرع</span><select disabled><option>${safe(schoolName(state.currentUser.schoolId))}</option></select></label>`}
          <label class="field user-filter-role"><span>المنصب</span><select onchange="actions.setUserFilter('role', this.value)"><option value="all">كل المناصب</option>${roles.map((role) => `<option value="${role}" ${filters.role === role ? "selected" : ""}>${safe(roleLabel(role))}</option>`).join("")}</select></label>
          <button class="btn secondary" type="button" onclick="actions.resetUserFilters()">إعادة الضبط</button>
        </div>
      </div>

      <div class="panel">
        <table class="responsive-table">
          <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الدور</th><th>الفرع</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
          <tbody>${pageInfo.items.length ? pageInfo.items.map((user) => `
            <tr>
              <td data-label="الاسم">${safe(user.name)}</td>
              <td data-label="البريد الإلكتروني">${safe(user.email)}</td>
              <td data-label="الدور"><span class="role-pill">${safe(roleLabel(user.role))}</span></td>
              <td data-label="الفرع">${safe(user.role === "tracker" ? linkedSchoolsLabel(user) : schoolName(user.schoolId))}</td>
              <td data-label="الحالة"><span class="status-pill status-completed">${safe(userStatusLabel(user))}</span></td>
              <td data-label="الإجراءات">${canEditUser(user) ? `
                <button class="icon-btn" title="تعديل المستخدم" aria-label="تعديل المستخدم" onclick="actions.openUser('${safe(user.id)}')">${icons.edit}</button>
                ${user.id !== state.currentUser.id ? `<button class="icon-btn danger-icon" title="حذف المستخدم نهائيًا" aria-label="حذف المستخدم نهائيًا" onclick="actions.deleteUser('${safe(user.id)}')">${icons.trash}</button>` : ""}
              ` : ""}</td>
            </tr>`).join("") : `<tr><td colspan="6"><div class="empty">لا توجد حسابات مطابقة للبحث والفلاتر الحالية.</div></td></tr>`}</tbody>
        </table>
        ${renderPagination(pageInfo, "usersPage")}
      </div>`;
  }

  function renderUserModal(id) {
    const { state, safe, roleLabel, icons, cloud, schools, canChangeUserRole, canAssignUserRole, canEditUser } = getContext();
    const user = state.users.find((item) => item.id === id) || {};
    const editing = Boolean(id);
    const mayChangeRole = canChangeUserRole();
    const availableRoles = getContext().roles.filter((role) => canAssignUserRole(role, editing ? user.role : null));
    const selectedRole = user.role || (availableRoles.includes("school_secretary") ? "school_secretary" : availableRoles[0] || "");
    const roleOptions = availableRoles.map((role) => `<option value="${role}" ${selectedRole === role ? "selected" : ""}>${safe(roleLabel(role))}</option>`).join("");
    const canManageTrackerAccounts = state.currentUser.role === "general_manager";
    const roleField = editing && !mayChangeRole
      ? `<input value="${safe(roleLabel(user.role))}" readonly /><input type="hidden" name="role" value="${safe(user.role)}" />`
      : `<select name="role" required>${roleOptions}</select>`;
    const selectedSchoolId = user.schoolId || (state.activeSchoolId !== "all" ? state.activeSchoolId : "");
    const schoolOptions = `<option value="">اختر الفرع</option>${schools.map((school) => `<option value="${safe(school.id)}" ${selectedSchoolId === school.id ? "selected" : ""}>${safe(school.name)}</option>`).join("")}`;
    const linkedSchoolIds = new Set(Array.isArray(user.linkedSchoolIds) && user.linkedSchoolIds.length ? user.linkedSchoolIds : [selectedSchoolId].filter(Boolean));
    const linkedSchoolOptions = schools
      .filter((school) => !isGeneralSchoolId(school.id))
      .map((school) => `<label><input type="checkbox" name="linkedSchoolIds" value="${safe(school.id)}" ${linkedSchoolIds.has(school.id) ? "checked" : ""} /><span>${safe(school.name)}</span></label>`)
      .join("");
    const accessValue = (key) => user.accessFlags?.[key] === true ? "allow" : user.accessFlags?.[key] === false ? "deny" : "inherit";
    const accessSelect = (name, label, key) => `
      <label class="field">
        <span>${label}</span>
        <select name="${name}">
          <option value="inherit" ${accessValue(key) === "inherit" ? "selected" : ""}>حسب المنصب</option>
          <option value="allow" ${accessValue(key) === "allow" ? "selected" : ""}>سماح</option>
          <option value="deny" ${accessValue(key) === "deny" ? "selected" : ""}>إلغاء</option>
        </select>
      </label>`;
    const passwordField = editing
      ? (state.currentUser.role === "general_manager" || (state.currentUser.role === "computer_unit" && canEditUser(user)))
        ? `<label class="field"><span>كلمة مرور جديدة</span><input name="password" type="password" autocomplete="new-password" minlength="6" placeholder="اتركها فارغة إذا لم ترغب بتغييرها" /></label>`
        : ""
      : `<label class="field"><span>كلمة المرور</span><input name="password" type="password" autocomplete="new-password" minlength="6" required /></label>`;
    return `
      <div class="modal">
        <form class="modal-box" onsubmit="actions.saveUser(event)">
          <div class="modal-head"><h3>${editing ? "تعديل مستخدم" : "إنشاء مستخدم"}</h3><button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button></div>
          <input type="hidden" name="id" value="${safe(user.id || "")}" />
          <div class="form-grid">
            <label class="field"><span>الاسم الكامل</span><input name="name" value="${safe(user.name || "")}" required /></label>
            <label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" value="${safe(user.email || "")}" ${editing && cloud.enabled ? "readonly" : ""} required /></label>
            <label class="field"><span>الدور</span>${roleField}</label>
            <label class="field"><span>الفرع / النطاق</span>${state.currentUser.role === "general_manager" ? `<select name="schoolId">${schoolOptions}</select>` : `<input name="schoolId" value="${safe(user.schoolId || state.currentUser.schoolId || "")}" readonly required />`}</label>
            ${passwordField}
          </div>
          ${canManageTrackerAccounts ? `<div class="access-panel tracker-branch-panel">
            <div class="section-title">
              <h3>فروع المتعقب</h3>
              <p class="muted">تستخدم فقط عند اختيار دور متعقب، وتحدد الفروع التي يستطيع الاطلاع عليها دون تعديل.</p>
            </div>
            <div class="user-linked-schools">${linkedSchoolOptions || `<p class="muted">لا توجد فروع متاحة للربط.</p>`}</div>
          </div>` : ""}
          <div class="access-panel">
            <div class="section-title">
              <h3>صلاحيات الإضافة</h3>
              <p class="muted">اختر حسب المنصب للإبقاء على القواعد الحالية، أو سماح/إلغاء لهذا المستخدم فقط.</p>
            </div>
            <div class="form-grid">
              ${accessSelect("accessCreateUser", "إضافة موظف", "createUser")}
              ${accessSelect("accessCreateTask", "إضافة مهمة", "createTask")}
              ${accessSelect("accessCreateNotebook", "إضافة دفتر المهام", "createNotebook")}
            </div>
          </div>
          <div class="actions" style="margin-top:14px;"><button class="btn" type="submit">${icons.save} حفظ المستخدم</button></div>
        </form>
      </div>`;
  }

  function renderSchoolModal(id) {
    const { state, safe, icons, schools } = getContext();
    const school = schools.find((item) => item.id === id) || {};
    const editing = Boolean(id);
    const isGeneralSchool = school.id === "11111111-1111-4111-8111-111111111111";
    return `
      <div class="modal">
        <form class="modal-box" onsubmit="actions.saveSchool(event)">
          <div class="modal-head"><h3>${editing ? "تعديل فرع مدرسة" : "إضافة فرع مدرسة"}</h3><button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button></div>
          <input type="hidden" name="id" value="${safe(school.id || "")}" />
          <div class="form-grid">
            <label class="field"><span>اسم الفرع</span><input name="name" value="${safe(school.name || "")}" required ${isGeneralSchool ? "readonly" : ""} /></label>
            <label class="field"><span>اختصار الفرع</span><input name="shortName" maxlength="4" value="${safe(school.shortName || "")}" ${isGeneralSchool ? "readonly" : ""} /></label>
          </div>
          <div class="actions" style="margin-top:14px;">
            <button class="btn" type="submit" ${isGeneralSchool ? "disabled" : ""}>${icons.save} حفظ الفرع</button>
            ${editing && !isGeneralSchool ? `<button class="btn danger" type="button" onclick="actions.deleteSchool('${safe(school.id)}')">${icons.trash} حذف الفرع</button>` : ""}
          </div>
        </form>
      </div>`;
  }

  function renderProfileModal() {
    const { state, safe, icons, roleLabel, schoolName } = getContext();
    const user = state.currentUser || {};
    return `
      <div class="modal">
        <form class="modal-box" onsubmit="actions.saveMyProfile(event)">
          <div class="modal-head"><h3>الملف الشخصي</h3><button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button></div>
          <div class="profile-editor">
            <div class="avatar-preview">${user.avatarUrl ? `<img src="${safe(user.avatarUrl)}" alt="${safe(user.name)}" />` : `<span>${safe((user.name || "م").slice(0, 1))}</span>`}</div>
            <div>
              <strong>${safe(user.name)}</strong>
              <p class="muted">${safe(roleLabel(user.role))} - ${safe(schoolName(user.schoolId))}</p>
            </div>
          </div>
          <div class="form-grid">
            <label class="field"><span>الاسم</span><input name="name" value="${safe(user.name || "")}" required /></label>
            <label class="field"><span>الصورة الشخصية</span><input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" /></label>
            <label class="field"><span>كلمة مرور جديدة</span><input name="password" type="password" autocomplete="new-password" minlength="6" placeholder="اتركها فارغة إذا لم ترغب بتغييرها" /></label>
          </div>
          <div class="actions" style="margin-top:14px;"><button class="btn" type="submit">${icons.save} حفظ الملف الشخصي</button></div>
        </form>
      </div>`;
  }

  return { filteredUsers, renderUsers, renderUserModal, renderSchoolModal, renderProfileModal };
}
