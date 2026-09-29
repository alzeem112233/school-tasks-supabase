export function createAdminModule(getContext) {
  function navItems() {
    const { canViewUsers, canViewDashboard, canViewAuditLogs, canCreateBackups, canViewReports, canViewFinance, canViewGradeAdjustments, icons, notifications, administrativeReports, examSchedules, circulars, meetings, chat } = getContext();
    const unread = notifications.getUnreadCount();
    const items = [];
    items.push(["home", "الرئيسية", icons.dashboard, unread]);
    items.push(
      ["tasks", "المهام", icons.tasks, 0],
      ["dailyNotebook", "\u062f\u0641\u062a\u0631 \u0627\u0644\u0645\u0647\u0627\u0645", icons.notebook || icons.tasks, 0],
      ...(chat?.canUseChat() ? [["chat", "الدردشة", icons.message, 0]] : []),
      ...(administrativeReports?.canViewAdministrativeReports() ? [["administrativeReports", "تقارير الإشراف", icons.reports, 0]] : []),
      ...(examSchedules?.canViewExamSchedules() ? [["examSchedules", "جداول الاختبارات", icons.calendar || icons.reports, 0]] : []),
      ...(circulars?.canViewCirculars() ? [["circulars", "التعاميم الإدارية", icons.message || icons.reports, 0]] : []),
      ...(meetings?.canViewMeetings() ? [["meetings", "الاجتماعات", icons.users || icons.reports, 0]] : []),
      ["notifications", "التنبيهات", icons.bell, unread],
      ["activity", "السجلات", icons.logs, 0],
    );
    if (canViewUsers()) {
      items.push(["users", "المستخدمون والصلاحيات", icons.users, 0]);
    }
    if (canViewFinance()) items.push(["finance", "المالية والتخفيضات", icons.finance, 0]);
    if (canViewGradeAdjustments()) items.push(["gradeAdjustments", "تعديل الدرجات", icons.grades || icons.edit, 0]);
    if (canViewReports()) items.push(["reports", "التقارير", icons.reports, 0]);
    if (canViewAuditLogs() || canCreateBackups()) items.push(["enterprise", "مركز المؤسسة", icons.database, 0]);
    return items;
  }

  function navGroups(items) {
    const pick = (...ids) => ids.map((id) => items.find((item) => item[0] === id)).filter(Boolean);
    return [
      ["الأعمال اليومية", pick("home", "tasks", "dailyNotebook", "chat", "notifications")],
      ["الاختبارات والتعاميم والاجتماعات", pick("administrativeReports", "examSchedules", "circulars", "meetings")],
      ["الإدارة والمتابعة", pick("users", "finance", "gradeAdjustments")],
      ["التقارير والسجلات", pick("reports", "activity")],
      ["إعدادات النظام", pick("enterprise")],
    ].filter(([, groupItems]) => groupItems.length);
  }

  function syncStatus() {
    const { state, safe, icons } = getContext();
    const offlineCount = state.offlineQueue?.length || 0;
    if (state.syncingOfflineChanges) return { label: "جارٍ المزامنة", className: "syncing", icon: icons.save, action: "" };
    if (state.isOffline) return { label: "غير متصل", className: "offline", icon: icons.database, action: "" };
    if (offlineCount) return { label: `مزامنة (${safe(offlineCount)})`, className: "pending", icon: icons.save, action: `onclick="actions.syncOfflineChanges()"` };
    return { label: "تمت المزامنة", className: "synced", icon: icons.check, action: "" };
  }

  function attentionText(count) {
    const value = Number(count || 0);
    if (value <= 0) return "لا توجد عناصر تحتاج انتباهك الآن";
    if (value === 1) return "عنصر واحد يحتاج انتباهك";
    if (value === 2) return "عنصران يحتاجان انتباهك";
    if (value >= 3 && value <= 10) return `${value} عناصر تحتاج انتباهك`;
    return `${value} عنصرًا يحتاج انتباهك`;
  }

  function renderHome() {
    const { state, safe, icons, formatDate, getUser, tasks, notifications, today } = getContext();
    const currentUserId = state.currentUser?.id || "";
    const todayKey = today();
    const visibleTaskRows = tasks.visibleTasks({ includeSearch: false });
    const myTasks = visibleTaskRows
      .filter((task) => task.assigneeId === currentUserId)
      .filter((task) => task.recurrence !== "permanent")
      .filter((task) => !["completed", "approved", "archived"].includes(tasks.effectiveStatus(task)))
      .slice(0, 6);
    const myNotebookTasks = visibleTaskRows
      .filter((task) => task.assigneeId === currentUserId && task.recurrence === "permanent")
      .filter((task) => tasks.effectiveStatus(task) !== "archived");
    const notebookUpdated = myNotebookTasks.some((task) =>
      (task.comments || []).some((comment) => comment.type === "permanent_daily" && String(comment.date || comment.at || "").slice(0, 10) === todayKey),
    );
    const myCircularRecipients = (state.circularRecipients || []).filter((recipient) => recipient.userId === currentUserId);
    const unreadCirculars = myCircularRecipients
      .filter((recipient) => !recipient.readAt)
      .map((recipient) => ({ recipient, circular: (state.circulars || []).find((item) => item.id === recipient.circularId) }))
      .filter((item) => item.circular && item.circular.status === "published")
      .slice(0, 5);
    const myMeetingPoints = (state.meetingDecisions || [])
      .filter((decision) => decision.ownerId === currentUserId)
      .filter((decision) => !["completed", "cancelled"].includes(decision.status))
      .slice(0, 6);
    const latestNotifications = notifications.visibleNotifications().slice(0, 4);
    const totalAlerts = unreadCirculars.length + myMeetingPoints.length + myTasks.length + (myNotebookTasks.length && !notebookUpdated ? 1 : 0);
    return `
      <section class="home-page">
        <div class="home-hero">
          <div>
            <span>الرئيسية</span>
            <h2>مرحبًا ${safe(state.currentUser?.name || "")}</h2>
            <p>كل ما يخصك اليوم في مكان واحد: التعاميم، نقاط الاجتماعات، دفتر المهام، والمهام المسندة إليك.</p>
          </div>
          <div class="home-hero-counter">
            ${totalAlerts ? `<strong>${safe(totalAlerts)}</strong>` : ""}
            <span>${safe(attentionText(totalAlerts))}</span>
          </div>
        </div>
        <div class="home-quick-grid">
          <button class="home-quick-card urgent" type="button" onclick="actions.setView('circulars')">
            ${icons.message}<span>تعاميم تحتاج اطلاع</span><strong>${safe(unreadCirculars.length)}</strong>
          </button>
          <button class="home-quick-card teal" type="button" onclick="actions.setView('meetings')">
            ${icons.users || icons.reports}<span>نقاط اجتماع عليك</span><strong>${safe(myMeetingPoints.length)}</strong>
          </button>
          <button class="home-quick-card blue" type="button" onclick="actions.setView('dailyNotebook')">
            ${icons.notebook || icons.tasks}<span>دفتر المهام</span><strong>${safe(myNotebookTasks.length ? (notebookUpdated ? "محدث" : "تذكير") : "لا يوجد")}</strong>
          </button>
          <button class="home-quick-card violet" type="button" onclick="actions.setView('tasks')">
            ${icons.tasks}<span>مهامي المفتوحة</span><strong>${safe(myTasks.length)}</strong>
          </button>
        </div>
        <div class="home-feed">
          ${myNotebookTasks.length && !notebookUpdated ? `
            <article class="home-alert-card notebook-reminder">
              <div class="home-alert-icon">${icons.notebook || icons.tasks}</div>
              <div>
                <strong>تذكير دفتر المهام اليومي</strong>
                <p>لديك ${safe(myNotebookTasks.length)} بند في دفتر اليوم. حدّث حالتها قبل وقت الإغلاق.</p>
              </div>
              <button class="btn" type="button" onclick="actions.setView('dailyNotebook')">فتح الدفتر</button>
            </article>` : ""}
          <section class="home-section">
            <div class="section-title"><h2>تعاميم تنتظر اطلاعك</h2><p class="muted">اضغط تأكيد الاطلاع ليظهر ذلك في تقرير التعاميم.</p></div>
            <div class="home-card-list">
              ${unreadCirculars.length ? unreadCirculars.map(({ circular }) => `
                <article class="home-message-card">
                  <div>
                    <span class="role-pill">${safe(circular.number)}</span>
                    <strong>${safe(circular.title)}</strong>
                    <p>${safe(circular.content.slice(0, 120))}${circular.content.length > 120 ? "..." : ""}</p>
                    <small>${safe(formatDate(circular.publishDate))}</small>
                  </div>
                  <div class="home-message-actions">
                    <button class="btn secondary" type="button" onclick="actions.openHomeCircular('${safe(circular.id)}')">عرض</button>
                    <button class="btn success" type="button" onclick="actions.markCircularRead('${safe(circular.id)}')">${icons.check} تأكيد الاطلاع</button>
                  </div>
                </article>`).join("") : `<div class="empty">لا توجد تعاميم جديدة تحتاج اطلاعك.</div>`}
            </div>
          </section>
          <section class="home-section">
            <div class="section-title"><h2>نقاط الاجتماعات الخاصة بك</h2><p class="muted">تابع النقاط المسندة لك وحدث حالتها.</p></div>
            <div class="home-card-list">
              ${myMeetingPoints.length ? myMeetingPoints.map((decision) => {
                const meeting = (state.meetings || []).find((item) => item.id === decision.meetingId);
                return `
                  <article class="home-message-card">
                    <div>
                      <span class="role-pill">${safe(meeting?.number || "اجتماع")}</span>
                      <strong>${safe(decision.title)}</strong>
                      <p>${safe(meeting?.title || "نقطة اجتماع")} - ${safe(decision.dueDate ? formatDate(decision.dueDate) : "بدون تاريخ متابعة")}</p>
                    </div>
                    <button class="btn secondary" type="button" onclick="actions.openHomeMeeting('${safe(decision.meetingId)}')">فتح الاجتماع</button>
                  </article>`;
              }).join("") : `<div class="empty">لا توجد نقاط اجتماع مسندة لك الآن.</div>`}
            </div>
          </section>
          <section class="home-section">
            <div class="section-title"><h2>مهامي</h2><p class="muted">المهام المفتوحة أو المتأخرة المسندة لحسابك.</p></div>
            <div class="home-card-list">
              ${myTasks.length ? myTasks.map((task) => `
                <article class="home-message-card task-home-card">
                  <div>
                    <span class="role-pill">${safe(task.taskNumber)}</span>
                    <strong>${safe(task.title)}</strong>
                    <p>${safe(task.description || "بدون تفاصيل")} - الاستحقاق: ${safe(task.dueDate ? formatDate(task.dueDate) : "غير محدد")}</p>
                  </div>
                  <button class="btn secondary" type="button" onclick="actions.openHomeTask('${safe(task.id)}')">عرض المهمة</button>
                </article>`).join("") : `<div class="empty">لا توجد مهام مفتوحة مسندة إليك.</div>`}
            </div>
          </section>
          <section class="home-section">
            <div class="section-title"><h2>آخر التنبيهات</h2><p class="muted">أحدث الرسائل والتنبيهات من المنصة.</p></div>
            <div class="home-card-list">
              ${latestNotifications.length ? latestNotifications.map((item) => `
                <article class="home-message-card compact">
                  <div>
                    <strong>${safe(item.title)}</strong>
                    <p>${safe(item.message)}</p>
                    <small>${safe(formatDate(item.createdAt))}</small>
                  </div>
                  <button class="btn secondary" type="button" onclick="actions.setView('notifications')">عرض</button>
                </article>`).join("") : `<div class="empty">لا توجد تنبيهات جديدة.</div>`}
            </div>
          </section>
        </div>
      </section>
    `;
  }

  function renderPagination(pageInfo, pageKey) {
    return `
      <div class="pagination-bar">
        <span class="muted">الصفحة ${pageInfo.currentPage} من ${pageInfo.totalPages} - ${pageInfo.totalItems} عنصر</span>
        <div class="actions">
          <button class="btn secondary" ${pageInfo.currentPage <= 1 ? "disabled" : ""} onclick="actions.changePage('${pageKey}', ${pageInfo.currentPage - 1})">السابق</button>
          <button class="btn secondary" ${pageInfo.currentPage >= pageInfo.totalPages ? "disabled" : ""} onclick="actions.changePage('${pageKey}', ${pageInfo.currentPage + 1})">التالي</button>
        </div>
      </div>
    `;
  }

  function renderActivityLog() {
    const { paginate, state, audit, safe, getUser, schoolName, formatDate, canViewAuditLogs, dashboard } = getContext();
    const activityLogs = audit.visibleActivityLogs();
    const auditLogs = audit.visibleAuditLogs();
    const pageInfo = paginate(activityLogs, state.pagination.logsPage, 10);
    const auditPage = paginate(auditLogs, state.pagination.logsPage, 8);
    return `
      <div class="topbar">
        <div class="section-title">
          <h2>السجلات</h2>
          <p class="muted">متابعة مباشرة لحركة المهام ودفتر المهام والاعتمادات والمستخدمين والإجراءات الحساسة.</p>
        </div>
      </div>
      <div class="grid metrics dashboard-summary-grid">
        ${dashboard.metric("سجلات النشاط", activityLogs.length, "الأحداث التشغيلية ضمن النطاق")}
        ${canViewAuditLogs() ? dashboard.metric("سجلات التدقيق", auditLogs.length, "الإجراءات الحساسة والحوكمة") : ""}
      </div>
      <div class="grid two-column">
        <div class="panel">
          <div class="section-title">
            <h2>سجل النشاط</h2>
            <p class="muted">المهام ودفتر المهام والتنبيهات والتقارير وحركة المستخدمين.</p>
          </div>
          <div class="log-list">
            ${
              pageInfo.items.length
                ? pageInfo.items
                    .map(
                      (item) => `
                        <article class="log-item">
                          <div>
                            <strong>${safe(item.title)}</strong>
                            <p>${safe(item.description)}</p>
                            <span class="muted">${safe(getUser(item.userId)?.name || "النظام")} - ${safe(formatDate(item.createdAt))} - ${safe(schoolName(item.schoolId))}</span>
                          </div>
                          <span class="role-pill">${safe(audit.activityTypeLabel(item.type))}</span>
                        </article>`,
                    )
                    .join("")
                : `<div class="empty">لا توجد سجلات نشاط ضمن النطاق الحالي.</div>`
            }
          </div>
          ${renderPagination(pageInfo, "logsPage")}
        </div>
        ${
          canViewAuditLogs()
            ? `<div class="panel">
                <div class="section-title">
                  <h2>سجل التدقيق</h2>
                  <p class="muted">الإجراءات الحساسة مثل المستخدمين والصلاحيات والحذف والنسخ.</p>
                </div>
                <div class="log-list">
                  ${
                    auditPage.items.length
                      ? auditPage.items
                          .map(
                            (item) => `
                              <article class="log-item">
                                <div>
                                  <strong>${safe(audit.auditActionLabel(item.action))}</strong>
                                  <p>${safe(item.details)}</p>
                                  <span class="muted">${safe(getUser(item.actorId)?.name || "النظام")} - ${safe(formatDate(item.createdAt))} - ${safe(audit.auditTargetTypeLabel(item.targetType))}: ${safe(item.targetId)}</span>
                                </div>
                                <span class="priority-pill priority-${item.severity === "high" ? "high" : item.severity === "medium" ? "medium" : "low"}">${safe(audit.severityLabel(item.severity))}</span>
                              </article>`,
                          )
                          .join("")
                      : `<div class="empty">لا توجد سجلات تدقيق ضمن النطاق الحالي.</div>`
                  }
                </div>
              </div>`
            : ""
        }
      </div>
    `;
  }

  function renderEnterprise() {
    const { paginate, state, backup, audit, safe, getUser, schoolName, dashboard, scopedSchoolId, schools, formatDate, canViewAuditLogs, canCreateBackups, canRestoreBackup, icons } = getContext();
    const archived = backup.visibleArchivedTasks();
    const auditPage = paginate(audit.visibleAuditLogs(), state.pagination.logsPage, 8);
    const backupPage = paginate(backup.visibleBackups(), 1, 8);
    return `
      <div class="topbar">
        <div class="section-title">
          <h2>مركز المؤسسة</h2>
          <p class="muted">التدقيق والنسخ الاحتياطي والاستعادة والأرشفة والبحث المتقدم وإدارة المدارس المتعددة.</p>
        </div>
        <div class="actions">
          ${canCreateBackups() ? `<button class="btn" onclick="actions.createBackup()" ${state.backupBusy ? "disabled" : ""}>${icons.database} ${state.backupBusy ? "جارٍ تنفيذ العملية" : "إنشاء وحفظ نسخة كاملة"}</button>` : ""}
          ${backup.visibleBackups().some((item) => canRestoreBackup(item)) ? `<button class="btn secondary" onclick="actions.restoreLatestBackup()" ${state.backupBusy ? "disabled" : ""}>${icons.archive} استعادة آخر نسخة</button>` : ""}
          ${canCreateBackups() ? `<button class="btn secondary" onclick="actions.openBackupFilePicker()" ${state.backupBusy ? "disabled" : ""}>${icons.upload} استعادة من ملف</button>
            <input id="backup-restore-file" type="file" accept=".json,application/json" hidden onchange="actions.restoreBackupFile(event)" />` : ""}
          ${canCreateBackups() ? `<button class="btn secondary" onclick="actions.exportBackup()" ${state.backupBusy ? "disabled" : ""}>${icons.save} حفظ آخر نسخة في الجهاز</button>` : ""}
        </div>
      </div>
      <div class="grid metrics">
        ${canViewAuditLogs() ? dashboard.metric("الأحداث التدقيقية", audit.visibleAuditLogs().length) : ""}
        ${dashboard.metric("النسخ الاحتياطية", backup.visibleBackups().length)}
        ${dashboard.metric("المهام المؤرشفة", archived.length)}
        ${dashboard.metric("المدارس", scopedSchoolId() === "all" ? schools.length : 1)}
      </div>
      <div class="grid two-column">
        ${canViewAuditLogs() ? `<div class="panel">
          <div class="section-title">
          <h2>سجل التدقيق</h2>
          <p class="muted">الإجراءات الحساسة أمنيًا وسجلات الحوكمة.</p>
          </div>
          <div class="log-list">
            ${
              auditPage.items.length
                ? auditPage.items
                    .map(
                      (item) => `
                        <article class="log-item">
                          <div>
                            <strong>${safe(audit.auditActionLabel(item.action))}</strong>
                            <p>${safe(item.details)}</p>
                            <span class="muted">${safe(getUser(item.actorId)?.name || "النظام")} - ${safe(formatDate(item.createdAt))} - ${safe(audit.auditTargetTypeLabel(item.targetType))}: ${safe(item.targetId)}</span>
                          </div>
                          <span class="priority-pill priority-${item.severity === "high" ? "high" : item.severity === "medium" ? "medium" : "low"}">${safe(audit.severityLabel(item.severity))}</span>
                        </article>`,
                    )
                    .join("")
                : `<div class="empty">لا توجد سجلات تدقيق متاحة.</div>`
            }
          </div>
        </div>` : ""}
        <div class="panel">
          <div class="section-title">
            <h2>نظام الأرشفة</h2>
            <p class="muted">تبقى السجلات المؤرشفة قابلة للبحث ومرتبطة بنطاق المدرسة.</p>
          </div>
          <div class="log-list">
            ${
              archived.length
                ? archived
                    .slice(0, 8)
                    .map(
                      (task) => `
                        <article class="log-item">
                          <div>
                            <strong>${safe(task.taskNumber)} - ${safe(task.title)}</strong>
                            <p>${safe(task.description)}</p>
                            <span class="muted">${safe(task.department)} - ${safe(schoolName(task.schoolId))}</span>
                          </div>
                          <span class="status-pill status-archived">مؤرشف</span>
                        </article>`,
                    )
                    .join("")
                : `<div class="empty">لا توجد مهام مؤرشفة ضمن نطاق المدرسة الحالي.</div>`
            }
          </div>
        </div>
      </div>
      <div class="panel" style="margin-top:16px;">
        <div class="section-title">
          <h2>النسخ الاحتياطي والاستعادة</h2>
            <p class="muted">نسخة كاملة لقاعدة بيانات المستخدمين ودفاتر المهام والمهام والتخفيضات والمرفقات والتنبيهات والسجلات والإعدادات. يطلب النظام مكان حفظ الملف، ويمكن استعادته لاحقًا من زر استعادة من ملف.</p>
        </div>
        <div class="log-list">
          ${
            backupPage.items.length
              ? backupPage.items
                  .map(
                    (item) => `
                      <article class="log-item">
                        <div>
                          <strong>${safe(item.label)}</strong>
                          <div class="backup-counts">
                            <span>المستخدمون: ${safe(item.entityCounts.users)}</span>
                            <span>دفاتر ومهام: ${safe(item.entityCounts.tasks)}</span>
                            <span>التخفيضات: ${safe(item.entityCounts.financeDiscounts)}</span>
                            <span>المرفقات: ${safe(item.entityCounts.attachments)}</span>
                            <span>التنبيهات: ${safe(item.entityCounts.notifications)}</span>
                          </div>
                          <span class="muted">${safe(formatDate(item.createdAt))} - ${item.scopeType === "site" ? "الموقع كاملًا" : safe(schoolName(item.schoolId))} - الملفات المحفوظة: ${safe(item.entityCounts.storageFiles)}</span>
                        </div>
                        <div class="actions">
                          ${canRestoreBackup(item) ? `<button class="btn secondary" onclick="actions.restoreBackup('${safe(item.id)}')" ${state.backupBusy ? "disabled" : ""}>${icons.archive} استعادة</button>` : ""}
                          ${canCreateBackups(item) ? `<button class="icon-btn" title="حفظ ملف النسخة" aria-label="حفظ ملف النسخة" onclick="actions.exportBackup('${safe(item.id)}')" ${state.backupBusy ? "disabled" : ""}>${icons.save}</button>` : ""}
                        </div>
                      </article>`,
                  )
                  .join("")
              : `<div class="empty">لا توجد نسخ احتياطية بعد.</div>`
          }
        </div>
      </div>
    `;
  }

  function renderView() {
    const { state, canViewUsers, canViewAuditLogs, canCreateBackups, canViewReports, canViewFinance, canViewGradeAdjustments, users, dashboard, notifications, tasks, finance, gradeAdjustments, administrativeReports, examSchedules, circulars, meetings, chat } = getContext();
    if (state.view === "home" || state.view === "dashboard") return renderHome();
    if (state.view === "users" && canViewUsers()) return users.renderUsers();
    if (state.view === "reports" && canViewReports()) return dashboard.renderReports();
    if (state.view === "notifications") return notifications.renderNotifications();
    if (state.view === "activity") return renderActivityLog();
    if (state.view === "enterprise" && (canViewAuditLogs() || canCreateBackups())) return renderEnterprise();
    if (state.view === "finance" && canViewFinance()) return finance.renderFinance();
    if (state.view === "gradeAdjustments" && canViewGradeAdjustments()) return gradeAdjustments.renderPage();
    if (state.view === "chat" && chat?.canUseChat()) return chat.renderChat();
    if (state.view === "administrativeReports" && administrativeReports?.canViewAdministrativeReports()) return administrativeReports.renderAdministrativeReports();
    if (state.view === "examSchedules" && examSchedules?.canViewExamSchedules()) return examSchedules.renderExamSchedules();
    if (state.view === "circulars" && circulars?.canViewCirculars()) return circulars.renderCirculars();
    if (state.view === "meetings" && meetings?.canViewMeetings()) return meetings.renderMeetings();
    if (state.view === "dailyNotebook") return tasks.renderPermanentDailyTasks();
    if (state.view === "tasks") return tasks.renderTasks();
    return renderHome();
  }

  function renderModal() {
    const { state, users, tasks, notifications, finance, gradeAdjustments, administrativeReports, examSchedules, circulars, meetings } = getContext();
    if (state.modal.type === "profile") return users.renderProfileModal();
    if (state.modal.type === "user") return users.renderUserModal(state.modal.id);
    if (state.modal.type === "school") return users.renderSchoolModal(state.modal.id);
    if (state.modal.type === "notification") return notifications.renderNotificationModal();
    if (state.modal.type === "feedback") return tasks.renderFeedbackModal(state.modal.id);
    if (state.modal.type === "assign_notebook") return tasks.renderNotebookAssignmentModal();
    if (state.modal.type === "finance") return finance.renderFinanceModal(state.modal.id);
    if (state.modal.type === "grade_adjustment") return gradeAdjustments.renderModal(state.modal.id);
    if (state.modal.type === "administrative_report") return administrativeReports.renderReportModal();
    if (state.modal.type === "exam_settings") return examSchedules.renderSettingsModal();
    if (state.modal.type === "exam_period") return examSchedules.renderPeriodModal();
    if (state.modal.type === "exam_slot") return examSchedules.renderSlotModal();
    if (state.modal.type === "exam_print_options") return examSchedules.renderPrintOptionsModal();
    if (state.modal.type === "exam_student_cards") return examSchedules.renderStudentCardsModal();
    if (state.modal.type === "circular") return circulars.renderCircularModal();
    if (state.modal.type === "meeting") return meetings.renderMeetingModal();
    return tasks.renderTaskModal(state.modal.id);
  }

  function renderShell() {
    const { app, state, safe, roleLabel, icons, schools, schoolName, scopedSchoolId, notifications } = getContext();
    const trackerSchoolIds = Array.isArray(state.currentUser.linkedSchoolIds) && state.currentUser.linkedSchoolIds.length ? state.currentUser.linkedSchoolIds : [state.currentUser.schoolId].filter(Boolean);
    const selectableSchools = state.currentUser.role === "tracker"
      ? schools.filter((school) => trackerSchoolIds.includes(school.id))
      : schools;
    const unread = notifications.getUnreadCount();
    const offlineCount = state.offlineQueue?.length || 0;
    const allNavItems = navItems();
    const primaryMobileItems = allNavItems.slice(0, 4);
    const sync = syncStatus();
    const resolvedTheme = state.theme === "system" ? (document.documentElement.getAttribute("data-theme") || "light") : state.theme;
    const themeLabel = state.theme === "system"
      ? `حسب النظام (${resolvedTheme === "dark" ? "داكن" : "فاتح"})`
      : resolvedTheme === "dark" ? "داكن" : "فاتح";
    const schoolScopeLabel = scopedSchoolId() === "all"
      ? (state.currentUser.role === "tracker" ? "كل الفروع المرتبطة" : "جميع الفروع")
      : schoolName(scopedSchoolId());
    app.innerHTML = `
      <section class="shell ${state.mobileNavOpen ? "nav-open" : ""} ${state.modal ? "has-modal" : ""}">
        <header class="mobile-header">
          <button class="icon-btn" type="button" aria-label="فتح القائمة" onclick="actions.toggleMobileNav()">${icons.dashboard}</button>
          <div class="mobile-header-copy">
            <strong><img class="mobile-logo" src="/icon-192.png" alt="" /> مهام المدارس</strong>
            <span>${safe(roleLabel(state.currentUser.role))}</span>
          </div>
          <button class="sync-chip sync-${safe(sync.className)}" type="button" ${sync.action} ${sync.action ? "" : "disabled"} aria-label="${safe(sync.label)}">
            ${sync.icon}<span>${safe(sync.label)}</span>
          </button>
          <button class="icon-btn mobile-notification-button" type="button" aria-label="التنبيهات${unread ? `، ${safe(unread)} غير مقروء` : ""}" onclick="actions.setView('notifications')">${icons.bell}${unread ? `<span class="nav-badge">${safe(unread)}</span>` : ""}</button>
        </header>
        <div class="sidebar-overlay ${state.mobileNavOpen ? "open" : ""}" onclick="actions.toggleMobileNav()"></div>
        <aside class="sidebar ${state.mobileNavOpen ? "open" : ""}" aria-label="القائمة الرئيسية">
          <div class="sidebar-head">
            <div class="brand">
              <div class="brand-mark brand-logo"><img src="/icon-192.png" alt="منصة المهام المدرسية" /></div>
              <div>
                <h1>مهام المدارس</h1>
                <p>${safe(state.currentUser.name)} · ${safe(roleLabel(state.currentUser.role))}</p>
              </div>
            </div>
            <button class="icon-btn sidebar-close" type="button" aria-label="إغلاق القائمة" onclick="actions.toggleMobileNav()">${icons.close}</button>
          </div>
          <section class="sidebar-section account-section">
            <h2>الحساب والمدرسة</h2>
            <div class="account-summary">
              <div>
                <strong>${safe(state.currentUser.name)}</strong>
                <span>${safe(schoolScopeLabel)}</span>
              </div>
              <button class="btn secondary compact-account-btn" type="button" onclick="actions.openProfile()">${icons.users}<span>الملف</span></button>
            </div>
            <button class="sync-chip sync-${safe(sync.className)} sidebar-sync compact-sync" type="button" ${sync.action} ${sync.action ? "" : "disabled"}>
              ${sync.icon}<span>${safe(sync.label)}</span>
            </button>
          </section>
          <section class="sidebar-section">
            <h2>إعدادات العرض</h2>
          ${
            state.currentUser.role === "general_manager" || state.currentUser.role === "tracker"
              ? `<label class="field sidebar-field">
                  <span>نطاق المدرسة</span>
                  <select onchange="actions.setActiveSchool(this.value)">
                    <option value="all" ${state.activeSchoolId === "all" ? "selected" : ""}>${state.currentUser.role === "tracker" ? "كل الفروع المرتبطة" : "جميع المدارس"}</option>
                    ${selectableSchools.map((school) => `<option value="${safe(school.id)}" ${state.activeSchoolId === school.id ? "selected" : ""}>${safe(school.name)}</option>`).join("")}
                  </select>
                </label>`
              : ""
          }
          <label class="field sidebar-field sidebar-search-field">
            <span>البحث المتقدم</span>
            <span class="sidebar-search-box">
              ${icons.search}
              <input value="${safe(state.search)}" placeholder="ابحث في المهام والأرقام والمدارس والمكلفين" oninput="actions.setSearch(this.value)" />
              ${state.search ? `<button class="icon-btn search-clear" type="button" aria-label="مسح البحث" onclick="actions.clearSearch()">${icons.close}</button>` : ""}
            </span>
          </label>
            <div class="theme-setting-row">
              <button class="theme-switch-row" type="button" onclick="actions.toggleTheme()" aria-label="تبديل المظهر">
                <span class="theme-setting-icon">${resolvedTheme === "dark" ? icons.moon : icons.sun}</span>
                <span class="theme-setting-text"><strong>المظهر</strong><small>${safe(themeLabel)}</small></span>
                <span class="theme-switch ${resolvedTheme === "dark" ? "checked" : ""}" aria-hidden="true"><i></i></span>
              </button>
              <select class="theme-mode-select" aria-label="اختيار المظهر" onchange="actions.setThemeMode(this.value)">
                <option value="system" ${state.theme === "system" ? "selected" : ""}>حسب النظام</option>
                <option value="light" ${state.theme === "light" ? "selected" : ""}>فاتح</option>
                <option value="dark" ${state.theme === "dark" ? "selected" : ""}>داكن</option>
              </select>
            </div>
          </section>
          <nav class="nav grouped-nav">
            ${navGroups(allNavItems).map(([groupTitle, groupItems]) => `
              <section class="sidebar-section nav-group">
                <h2>${safe(groupTitle)}</h2>
                ${groupItems.map(([id, label, icon, badge]) => `<button class="${state.view === id ? "active" : ""}" onclick="actions.setView('${id}')">${icon} <span>${safe(label)}</span>${badge ? `<span class="nav-badge">${safe(badge)}</span>` : ""}</button>`).join("")}
              </section>
            `).join("")}
          </nav>
          <button class="logout" onclick="actions.logout()">${icons.close} تسجيل الخروج</button>
        </aside>
        <section class="content">
          ${notifications.renderPhoneNotificationPrompt?.() || ""}
          ${state.isOffline ? `<div class="offline-banner"><strong>لا يوجد اتصال بالإنترنت</strong><span>يمكنك استخدام آخر نسخة محفوظة، وأي تعديل سيتم حفظه في الجهاز حتى تضغط مزامنة.</span></div>` : ""}
          ${offlineCount && !state.isOffline ? `<div class="offline-banner online-sync"><strong>توجد تغييرات غير مرسلة</strong><span>اضغط زر مزامنة لإرسالها إلى السيرفر وظهورها في التقارير.</span></div>` : ""}
          ${renderView()}
        </section>
        <nav class="mobile-nav">
          ${primaryMobileItems
            .map(
              ([id, label, icon, badge]) => `
                <button class="${state.view === id ? "active" : ""}" onclick="actions.setView('${id}')">
                  ${icon}
                  <span>${safe(label)}</span>
                  ${badge ? `<span class="nav-badge">${safe(badge)}</span>` : ""}
                </button>`,
            )
            .join("")}
        </nav>
      </section>
      <button class="floating-refresh" type="button" title="تحديث البيانات" aria-label="تحديث البيانات" ${state.refreshingData ? "disabled" : ""} onclick="actions.refreshData()">
        ${icons.refresh || icons.database}
        <span>${state.refreshingData ? "جارٍ التحديث" : "تحديث"}</span>
      </button>
      ${offlineCount ? `<button class="floating-sync" type="button" title="مزامنة التغييرات" aria-label="مزامنة التغييرات" ${state.syncingOfflineChanges ? "disabled" : ""} onclick="actions.syncOfflineChanges()">
        ${icons.save}
        <span>${state.syncingOfflineChanges ? "جارٍ المزامنة" : `مزامنة (${safe(offlineCount)})`}</span>
      </button>` : ""}
      ${state.modal ? renderModal() : ""}
      ${state.toast ? `<div class="toast">${safe(state.toast)}</div>` : ""}
    `;
  }

  return {
    navItems,
    renderPagination,
    renderActivityLog,
    renderHome,
    renderEnterprise,
    renderView,
    renderModal,
    renderShell,
  };
}
