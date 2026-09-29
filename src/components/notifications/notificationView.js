export function createNotificationView(getContext, { visibleNotifications, getUnreadCount, typeLabel }) {
  function renderMessagingStatus() {
    const { state, cloud, safe, icons } = getContext();
    const label = state.messagingStatus === "enabled" ? "مفعلة لهذا الجهاز عند وصول مهمة أو رسالة أو تعميم جديد" : state.messagingStatus === "unsupported" ? "المتصفح لا يدعم تنبيهات الهاتف" : state.messagingStatus === "blocked" ? "تم حظر التنبيهات من إعدادات المتصفح" : "فعّلها مرة واحدة ليظهر إشعار الهاتف عند توفر الإنترنت";
    return `<div class="panel"><div class="section-title"><h2>تنبيهات الهاتف</h2><p class="muted">${safe(label)}</p></div><div class="actions" style="margin-top:14px;"><button class="btn secondary" onclick="actions.enableNotifications()" ${!cloud.enabled ? "disabled" : ""}>${icons.bell} تفعيل تنبيهات الهاتف</button></div></div>`;
  }

  function renderNotificationCard(item, compact = false) {
    const { safe, icons, formatDate } = getContext();
    const linked = ["administrative_circular", "meeting_invite"].includes(item.type);
    return `<article class="notification-item ${item.read ? "" : "notification-unread"}"><div class="notification-copy"><div class="notification-meta-line"><span class="role-pill">${safe(typeLabel(item.type))}</span>${item.read ? `<span class="muted">مقروء</span>` : `<span class="nav-badge">جديد</span>`}</div><strong>${safe(item.title)}</strong><p>${safe(item.message)}</p><span class="muted">${safe(formatDate(item.createdAt))}</span></div><div class="actions">${item.taskId ? `<button class="btn secondary" onclick="actions.openNotificationTask('${safe(item.id)}', '${safe(item.taskId)}')">${icons.tasks} عرض المهمة</button>` : ""}${linked ? `<button class="btn secondary" onclick="actions.openNotificationLink('${safe(item.id)}')">${icons.reports} عرض</button>` : ""}${compact || item.read ? "" : `<button class="btn secondary" onclick="actions.markNotificationRead('${safe(item.id)}')">تحديد كمقروء</button>`}</div></article>`;
  }

  function renderNotificationPreview() {
    const recent = visibleNotifications().slice(0, 5);
    return `<div class="panel"><div class="section-title"><h2>مركز التنبيهات</h2><p class="muted">تنبيهات داخل التطبيق للإسناد والتذكير والمهام المتأخرة والاعتمادات وتغييرات الصلاحيات.</p></div><div class="notification-preview-head"><span class="nav-badge">${getUnreadCount()} غير مقروء</span></div><div class="notification-list">${recent.length ? recent.map((item) => renderNotificationCard(item, true)).join("") : `<div class="empty">لا توجد تنبيهات بعد.</div>`}</div></div>`;
  }

  function renderNotifications() {
    const { paginate, renderPagination, icons, cloud, state, canSendNotifications } = getContext();
    const pageInfo = paginate(visibleNotifications(), state.pagination.notificationsPage, 8);
    return `<div class="topbar"><div class="section-title"><h2>مركز التنبيهات</h2><p class="muted">تنبيهات داخل التطبيق وعلى الهاتف عند إسناد مهمة أو وصول رسالة أو تعميم جديد.</p></div><div class="actions"><span class="nav-badge">${getUnreadCount()} غير مقروء</span>${canSendNotifications() ? `<button class="btn" onclick="actions.openNotificationComposer()">${icons.message} إرسال إشعار</button>` : ""}<button class="btn secondary" onclick="actions.markAllNotificationsRead()">تحديد الكل كمقروء</button><button class="btn secondary" onclick="actions.enableNotifications()" ${!cloud.enabled ? "disabled" : ""}>${icons.bell} تفعيل تنبيهات الهاتف</button></div></div><div class="panel notification-panel">${pageInfo.items.length ? pageInfo.items.map((item) => renderNotificationCard(item)).join("") : `<div class="empty">لا توجد تنبيهات بعد.</div>`}${renderPagination(pageInfo, "notificationsPage")}</div>`;
  }

  function renderNotificationModal() {
    const { state, safe, icons, roleLabel, schoolName } = getContext();
    const currentUser = state.currentUser;
    const isGeneralManager = currentUser.role === "general_manager";
    const users = state.users
      .filter((user) => user.active)
      .filter((user) => isGeneralManager || user.schoolId === currentUser.schoolId)
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
    const schoolOptions = state.schools
      .filter((school) => school.status !== "inactive")
      .map((school) => `<option value="${safe(school.id)}" ${state.activeSchoolId === school.id ? "selected" : ""}>${safe(school.name)}</option>`)
      .join("");
    return `
      <div class="modal">
        <form class="modal-box" onsubmit="actions.sendManualNotification(event)">
          <div class="modal-head"><h3>إرسال إشعار</h3><button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button></div>
          <div class="form-grid">
            <label class="field">
              <span>الجمهور</span>
              <select name="audience" onchange="const schoolField = this.form.elements.schoolScope; if (schoolField) schoolField.disabled = this.value !== 'school'; this.form.recipientId.disabled = this.value !== 'user'">
                ${isGeneralManager ? `<option value="all">كل النظام</option>` : ""}
                <option value="school">نطاق المدرسة</option>
                <option value="user">مستخدم محدد</option>
              </select>
            </label>
            ${isGeneralManager ? `
              <label class="field">
                <span>المدرسة</span>
                <select name="schoolScope" disabled>${schoolOptions}</select>
              </label>
            ` : ""}
            <label class="field">
              <span>المستخدم</span>
              <select name="recipientId" disabled>
                ${users.map((user) => `<option value="${safe(user.id)}">${safe(user.name)} - ${safe(roleLabel(user.role))} - ${safe(schoolName(user.schoolId))}</option>`).join("")}
              </select>
            </label>
            <label class="field wide"><span>العنوان</span><input name="title" maxlength="120" required /></label>
            <label class="field wide"><span>الرسالة</span><textarea name="message" rows="5" maxlength="1000" required></textarea></label>
          </div>
          <div class="actions" style="margin-top:14px;"><button class="btn" type="submit">${icons.message} إرسال</button></div>
        </form>
      </div>`;
  }

  return { renderMessagingStatus, renderNotificationCard, renderNotificationPreview, renderNotifications, renderNotificationModal };
}
