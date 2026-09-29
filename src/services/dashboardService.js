import { dateRange, isThursdayOrFriday, toDateKey, today } from "../utils/dateUtils.js";
import { renderMetricCard } from "../components/dashboard/metricCard.js";
import { isGeneralManager } from "../utils/permissionUtils.js";

export function createDashboardModule(getContext) {
  const OVERDUE_CLEANUP_DAYS = 30;

  function metric(title, value, meta = "") {
    return renderMetricCard(getContext().safe, title, value, meta);
  }

  function dashboardTasks() {
    return getContext().tasks.reportBaseTasks();
  }

  function taskDelayDays(task) {
    const dueDate = String(task?.dueDate || "").slice(0, 10);
    if (!dueDate) return 0;
    return Math.max(0, Math.ceil((new Date(`${today()}T12:00:00`) - new Date(`${dueDate}T12:00:00`)) / 86400000));
  }

  function staleOverdueTasks(taskList = dashboardTasks()) {
    const { tasks, compareDate } = getContext();
    return taskList
      .filter((task) => tasks.effectiveStatus(task) === "overdue")
      .filter((task) => taskDelayDays(task) > OVERDUE_CLEANUP_DAYS)
      .sort((a, b) => compareDate(a.dueDate, b.dueDate));
  }

  function operationalDashboardTasks(taskList = dashboardTasks()) {
    const staleIds = new Set(staleOverdueTasks(taskList).map((task) => task.id));
    return taskList.filter((task) => !staleIds.has(task.id));
  }

  function remoteDashboardData() {
    return getContext().state.dashboardData || null;
  }

  function dashboardSummary(taskList = dashboardTasks()) {
    const counts = statusCounts(taskList);
    return {
      totalTasks: taskList.length,
      completedTasks: counts.completed || 0,
      pendingTasks: counts.new || 0,
      activeTasks: activeTaskCount(taskList),
      overdueTasks: counts.overdue || 0,
      completionPercentage: completionRate(taskList),
      averageProgress: getContext().tasks.averageProgress(taskList),
    };
  }

  function statusCounts(taskList = dashboardTasks()) {
    const { taskStatuses, tasks } = getContext();
    const counts = Object.fromEntries(taskStatuses.map((status) => [status, 0]));
    for (const task of taskList) {
      const status = tasks.effectiveStatus(task);
      counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
  }

  function completionRate(taskList = dashboardTasks()) {
    if (!taskList.length) return 0;
    const { tasks } = getContext();
    let completed = 0;
    for (const task of taskList) {
      if (tasks.effectiveStatus(task) === "completed") completed += 1;
    }
    return Math.round((completed / taskList.length) * 100);
  }

  function activeTaskCount(taskList = dashboardTasks()) {
    const { tasks } = getContext();
    let active = 0;
    for (const task of taskList) {
      if (!["completed", "archived"].includes(tasks.effectiveStatus(task))) active += 1;
    }
    return active;
  }

  function overdueTasks(taskList = dashboardTasks()) {
    const { tasks, compareDate } = getContext();
    return taskList
      .filter((task) => tasks.effectiveStatus(task) === "overdue")
      .filter((task) => taskDelayDays(task) <= OVERDUE_CLEANUP_DAYS)
      .sort((a, b) => compareDate(a.dueDate, b.dueDate));
  }

  function upcomingDeadlines(taskList = dashboardTasks()) {
    const { tasks, compareDate } = getContext();
    return taskList
      .filter((task) => !["completed", "archived"].includes(tasks.effectiveStatus(task)))
      .filter((task) => compareDate(task.dueDate, today()) >= 0)
      .sort((a, b) => compareDate(a.dueDate, b.dueDate))
      .slice(0, 6);
  }

  function recentActivityItems() {
    return remoteDashboardData()?.recentActivity || getContext().audit.visibleActivityLogs().slice(0, 6);
  }

  function topDepartments(taskList = dashboardTasks()) {
    const grouped = new Map();
    for (const task of taskList) {
      const current = grouped.get(task.department) || { department: task.department, count: 0, progressTotal: 0 };
      current.count += 1;
      current.progressTotal += task.progress;
      grouped.set(task.department, current);
    }
    return [...grouped.values()]
      .map((item) => ({
        ...item,
        averageProgress: item.count ? Math.round(item.progressTotal / item.count) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  function formatDelayText(task) {
    const delayDays = Math.max(1, taskDelayDays(task));
    return `متأخرة ${delayDays} ${delayDays === 1 ? "يوم" : "أيام"}`;
  }

  function daysUntil(dateString) {
    return Math.ceil((new Date(`${String(dateString || "").slice(0, 10)}T12:00:00`) - new Date(`${today()}T12:00:00`)) / 86400000);
  }

  function renderStatusChart(taskList = dashboardTasks()) {
    const { labels, safe, taskStatuses } = getContext();
    const counts = statusCounts(taskList);
    const total = Math.max(1, dashboardSummary(taskList).totalTasks);
    return `
      <div class="panel dashboard-panel">
        <div class="section-title">
          <h2>نظرة عامة على حالات المهام</h2>
          <p class="muted">توزيع مباشر للعمل ضمن نطاق المدرسة الحالي والفلاتر النشطة.</p>
        </div>
        <div class="status-chart">
          ${taskStatuses
            .map((status) => {
              const count = counts[status] || 0;
              const percent = Math.round((count / total) * 100);
              return `
                <div class="status-bar-card">
                  <div class="status-bar-head">
                    <span class="status-pill status-${safe(status)}">${safe(labels[status])}</span>
                    <strong>${safe(count)}</strong>
                  </div>
                  <div class="status-bar-track">
                    <span class="status-bar-fill status-${safe(status)}" style="width:${percent}%"></span>
                  </div>
                  <p class="muted">${safe(percent)}% من المهام الظاهرة</p>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  function renderCompletionCard(taskList = dashboardTasks()) {
    const { safe, tasks } = getContext();
    const summary = dashboardSummary(taskList);
    const rate = completionRate(taskList);
    const avgProgress = Number(summary.averageProgress || 0);
    const notebook = tasks.permanentDailySummary?.() || { total: 0, completed: 0, notDone: 0, pending: 0, rate: 0 };
    const notebookTotal = Math.max(1, Number(notebook.total || 0));
    const notebookCompleted = Math.round((Number(notebook.completed || 0) / notebookTotal) * 100);
    const notebookNotDone = Math.round((Number(notebook.notDone || 0) / notebookTotal) * 100);
    const notebookPending = Math.max(0, 100 - notebookCompleted - notebookNotDone);
    return `
      <div class="panel dashboard-panel completion-panel">
        <div class="section-title">
          <h2>مؤشر الإنجاز</h2>
          <p class="muted">مقارنة بين إنجاز المهام العامة وإنجاز دفتر المهام اليومي.</p>
        </div>
        <div class="completion-layout">
          <div class="completion-ring" style="--completion:${rate}%;">
            <div>
              <strong>${safe(rate)}%</strong>
              <span>مكتمل</span>
            </div>
          </div>
          <div class="completion-copy">
            <div class="dashboard-kpi">
              <strong>${safe(activeTaskCount(taskList))}</strong>
              <span>مهام نشطة قيد العمل</span>
            </div>
            <div class="dashboard-kpi">
              <strong>${safe(avgProgress)}%</strong>
              <span>متوسط الإنجاز في المهام الظاهرة</span>
            </div>
          </div>
        </div>
        <div class="notebook-dashboard-chart">
          <div class="notebook-dashboard-donut" style="--done:${safe(Math.round((Number(notebook.completed || 0) / notebookTotal) * 360))}deg; --not-done:${safe(Math.round((Number(notebook.notDone || 0) / notebookTotal) * 360))}deg;">
            <strong>${safe(notebook.rate)}%</strong>
            <span>دفتر المهام</span>
          </div>
          <div class="notebook-dashboard-bars">
            <div class="notebook-dashboard-stacked" aria-label="إنجاز دفتر المهام">
              <span class="bar-completed" style="width:${safe(notebookCompleted)}%"></span>
              <span class="bar-not-done" style="width:${safe(notebookNotDone)}%"></span>
              <span class="bar-pending" style="width:${safe(notebookPending)}%"></span>
            </div>
            <div class="notebook-dashboard-kpis">
              <span class="status-pill status-completed">تم: ${safe(notebook.completed)}</span>
              <span class="status-pill status-overdue">لم يتم: ${safe(notebook.notDone)}</span>
              <span class="status-pill status-new">غير محدد: ${safe(notebook.pending)}</span>
              <span class="role-pill">الإجمالي: ${safe(notebook.total)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderOverduePanel(taskList = dashboardTasks()) {
    const { safe, getUser, tasks, formatDate } = getContext();
    const overdue = overdueTasks(taskList).slice(0, 4);
    return `
      <div class="panel dashboard-panel compact-dashboard-panel overdue-focus-panel">
        <div class="section-title">
          <h2>المهام المتأخرة</h2>
          <p class="muted">أهم المهام التي تحتاج متابعة عاجلة، مرتبة حسب تاريخ الاستحقاق.</p>
        </div>
        <div class="compact-task-list">
          ${
            overdue.length
              ? overdue
                  .map(
                    (task) => `
                      <article class="compact-task-card overdue-card">
                        <div class="compact-task-date">
                          <strong>${safe(taskDelayDays(task))}</strong>
                          <span>يوم</span>
                        </div>
                        <div class="compact-task-copy">
                          <strong>${safe(task.title)}</strong>
                          <span>${safe(task.assigneeName || getUser(task.assigneeId)?.name || "غير مسندة")} - ${safe(task.department)}</span>
                        </div>
                        <span class="compact-task-pill danger">${safe(formatDate(task.dueDate))}</span>
                        <button class="icon-btn" type="button" title="فتح المهمة" aria-label="فتح المهمة" onclick="actions.openTask('${safe(task.id)}')">${getContext().icons.open || "↗"}</button>
                      </article>
                    `,
                  )
                  .join("")
              : `<div class="empty compact-empty">لا توجد مهام متأخرة في العرض الحالي.</div>`
          }
        </div>
      </div>
    `;
  }

  function renderOverdueCleanupPanel(taskList = dashboardTasks()) {
    const { safe, getUser, formatDate } = getContext();
    const cleanupItems = staleOverdueTasks(taskList).slice(0, 6);
    return `
      <div class="panel dashboard-panel overdue-cleanup-panel">
        <div class="section-title">
          <h2>تنظيف المتأخرات القديمة</h2>
          <p class="muted">مهام تجاوز تأخرها ${safe(OVERDUE_CLEANUP_DAYS)} يومًا، عُزلت عن أرقام اللوحة حتى لا تشوش المتابعة اليومية.</p>
        </div>
        <div class="dashboard-list">
          ${
            cleanupItems.length
              ? cleanupItems
                  .map(
                    (task) => `
                      <article class="dashboard-item cleanup-item">
                        <div>
                          <strong>${safe(task.title)}</strong>
                          <p>${safe(task.assigneeName || getUser(task.assigneeId)?.name || "غير مسندة")} | ${safe(task.department)}</p>
                        </div>
                        <div class="dashboard-item-meta">
                          <span class="status-pill status-overdue">${safe(formatDelayText(task))}</span>
                          <span class="muted">الاستحقاق ${safe(formatDate(task.dueDate))}</span>
                          <button class="btn secondary" type="button" onclick="actions.openTask('${safe(task.id)}')">مراجعة</button>
                        </div>
                      </article>
                    `,
                  )
                  .join("")
              : `<div class="empty">لا توجد متأخرات قديمة تحتاج تنظيفًا.</div>`
          }
        </div>
      </div>
    `;
  }

  function renderUpcomingPanel(taskList = dashboardTasks()) {
    const { safe, getUser, tasks, formatDate } = getContext();
    const upcoming = upcomingDeadlines(taskList).slice(0, 4);
    return `
      <div class="panel dashboard-panel compact-dashboard-panel upcoming-focus-panel">
        <div class="section-title">
          <h2>المواعيد القادمة</h2>
          <p class="muted">أقرب الاستحقاقات بشكل مختصر حتى يتم التحرك قبل التأخير.</p>
        </div>
        <div class="compact-task-list">
          ${
            upcoming.length
              ? upcoming
                  .map((task) => {
                    const remaining = daysUntil(task.dueDate);
                    const status = tasks.effectiveStatus(task);
                    return `
                      <article class="compact-task-card upcoming-card">
                        <div class="compact-task-date">
                          <strong>${safe(Math.max(0, remaining))}</strong>
                          <span>${remaining === 0 ? "اليوم" : "يوم"}</span>
                        </div>
                        <div class="compact-task-copy">
                          <strong>${safe(task.title)}</strong>
                          <span>${safe(task.assigneeName || getUser(task.assigneeId)?.name || "غير مسندة")} - ${safe(task.department)}</span>
                        </div>
                        <span class="compact-task-pill status-${safe(status)}">${safe(formatDate(task.dueDate))}</span>
                      </article>
                    `;
                  })
                  .join("")
              : `<div class="empty compact-empty">لا توجد مواعيد قادمة بعد تطبيق الفلاتر الحالية.</div>`
          }
        </div>
      </div>
    `;
  }

  function renderRecentActivityPanel() {
    const { safe, getUser, schoolName, audit, formatDate } = getContext();
    const items = recentActivityItems();
    return `
      <div class="panel dashboard-panel">
        <div class="section-title">
          <h2>أحدث النشاطات</h2>
          <p class="muted">سجل مباشر لأنشطة المهام والتقارير والاعتمادات والنسخ الاحتياطية.</p>
        </div>
        <div class="dashboard-list">
          ${
            items.length
              ? items
                  .map(
                    (item) => `
                      <article class="dashboard-item">
                        <div>
                          <strong>${safe(item.title)}</strong>
                          <p>${safe(item.description)}</p>
                        </div>
                        <div class="dashboard-item-meta">
                          <span class="role-pill">${safe(audit.activityTypeLabel(item.type))}</span>
                          <span class="muted">${safe(getUser(item.userId)?.name || "النظام")} | ${safe(schoolName(item.schoolId))}</span>
                          <span class="muted">${safe(formatDate(item.createdAt))}</span>
                        </div>
                      </article>
                    `,
                  )
                  .join("")
              : `<div class="empty">لا توجد نشاطات حديثة ضمن هذا النطاق.</div>`
          }
        </div>
      </div>
    `;
  }

  function renderDepartmentPanel(taskList = dashboardTasks()) {
    const { safe } = getContext();
    const departments = topDepartments(taskList);
    return `
      <div class="panel dashboard-panel">
        <div class="section-title">
          <h2>أداء الأقسام</h2>
          <p class="muted">عرض سريع للأقسام الأكثر تحملاً للمهام في الوقت الحالي.</p>
        </div>
        <div class="department-grid">
          ${
            departments.length
              ? departments
                  .map(
                    (item) => `
                      <div class="department-card">
                        <strong>${safe(item.department)}</strong>
                        <p>${safe(item.count)} مهمة</p>
                        <div class="status-bar-track">
                          <span class="status-bar-fill status-approved" style="width:${safe(item.averageProgress)}%"></span>
                        </div>
                        <span class="muted">${safe(item.averageProgress)}% متوسط الإنجاز</span>
                      </div>
                    `,
                  )
                  .join("")
              : `<div class="empty">لا توجد بيانات أقسام متاحة بعد.</div>`
          }
        </div>
      </div>
    `;
  }

  function priorityBreakdown(taskList = dashboardTasks()) {
    const remote = remoteDashboardData()?.byPriority;
    if (remote) return remote;
    return ["high", "medium", "low"].map((priority) => ({
      priority,
      count: taskList.filter((task) => task.priority === priority).length,
    }));
  }

  function assigneeBreakdown(taskList = dashboardTasks()) {
    const remote = remoteDashboardData()?.byAssignee;
    if (remote) return remote;
    const { getUser, tasks } = getContext();
    const grouped = new Map();
    taskList.forEach((task) => {
      const key = task.assigneeId || "unassigned";
      const current = grouped.get(key) || { userId: task.assigneeId || "", name: getUser(task.assigneeId)?.name || "غير مسندة", count: 0, completed: 0, overdue: 0 };
      current.count += 1;
      const status = tasks.effectiveStatus(task);
      if (status === "completed") current.completed += 1;
      if (status === "overdue") current.overdue += 1;
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a, b) => b.count - a.count);
  }

  function renderPriorityPanel(taskList = dashboardTasks()) {
    const { safe, labels } = getContext();
    const total = Math.max(1, dashboardSummary(taskList).totalTasks);
    const priorities = priorityBreakdown(taskList);
    return `
      <div class="panel dashboard-panel">
        <div class="section-title">
          <h2>المهام حسب الأولوية</h2>
          <p class="muted">توزيع مباشر للأعمال حسب مستوى الأهمية.</p>
        </div>
        <div class="status-chart">
          ${priorities.map((item) => {
            const percent = Math.round((Number(item.count || 0) / total) * 100);
            return `<div class="status-bar-card"><div class="status-bar-head"><span class="role-pill">${safe(labels[item.priority] || item.priority)}</span><strong>${safe(item.count)}</strong></div><div class="status-bar-track"><span class="status-bar-fill status-${safe(item.priority === "high" ? "overdue" : item.priority === "medium" ? "under_review" : "approved")}" style="width:${percent}%"></span></div><p class="muted">${safe(percent)}% من المهام</p></div>`;
          }).join("") || `<div class="empty">لا توجد بيانات أولويات.</div>`}
        </div>
      </div>`;
  }

  function renderAssigneePanel(taskList = dashboardTasks()) {
    const { safe } = getContext();
    const total = Math.max(1, dashboardSummary(taskList).totalTasks);
    const assignees = assigneeBreakdown(taskList).slice(0, 6);
    return `
      <div class="panel dashboard-panel assignee-workload-panel">
        <div class="section-title">
          <h2>المهام حسب المكلّف</h2>
          <p class="muted">توزيع العبء على الموظفين مع أرقام الإنجاز والتأخير بوضوح.</p>
        </div>
        <div class="assignee-workload-grid">
          ${assignees.length ? assignees.map((item, index) => {
            const percent = Math.max(4, Math.round((Number(item.count || 0) / total) * 100));
            const completedPercent = item.count ? Math.round((Number(item.completed || 0) / Number(item.count || 1)) * 100) : 0;
            return `
              <article class="assignee-workload-card">
                <div class="assignee-rank">${safe(index + 1)}</div>
                <div class="assignee-workload-copy">
                  <strong>${safe(item.name)}</strong>
                  <div class="assignee-workload-numbers">
                    <span>${safe(item.count)} مهمة</span>
                    <span>${safe(item.completed)} مكتملة</span>
                    <span class="${Number(item.overdue || 0) ? "danger-text" : ""}">${safe(item.overdue || 0)} متأخرة</span>
                  </div>
                  <div class="assignee-workload-track" aria-label="${safe(item.name)}">
                    <span class="assignee-workload-fill" style="width:${safe(percent)}%"></span>
                    <i style="width:${safe(completedPercent)}%"></i>
                  </div>
                </div>
              </article>
            `;
          }).join("") : `<div class="empty">لا توجد مهام مسندة ضمن النطاق.</div>`}
        </div>
      </div>`;
  }

  function reportTypeDescription(type) {
    const descriptions = {
      task: "ملخص شامل للمهام حسب الحالة والمكلف وتاريخ الاستحقاق.",
      employee: "يقارن عبء العمل والإنجاز والتأخير بين الموظفين.",
      department: "يوضح الأقسام الأكثر حملا ونسب الإنجاز داخل كل قسم.",
      delay: "يركز على المهام المتأخرة وأيام التأخير وجهة الإسناد.",
      daily_notebook: "يعرض دفتر المهام اليومي للفترة المحددة مع استبعاد الخميس والجمعة.",
      discount: "يتابع طلبات التخفيض من الإدخال حتى اكتمال إجراء المالية.",
    };
    return descriptions[type] || "تقرير تشغيلي قابل للتصفية والطباعة.";
  }

  function renderReportGuide(availableReportTypes) {
    const { state, reportTypeLabels, safe, icons } = getContext();
    return `
      <div class="report-guide-grid">
        ${availableReportTypes.map((type, index) => `
          <button class="report-guide-card ${state.reportConfig.type === type ? "active" : ""}" type="button" onclick="actions.setReportConfig('type', '${safe(type)}')">
            <span class="report-guide-icon">${icons.reports}</span>
            <strong>${safe(reportTypeLabels[type])}</strong>
            <small>${safe(reportTypeDescription(type))}</small>
            <i style="--guide:${safe(24 + ((index + 1) * 11) % 58)}%"></i>
          </button>
        `).join("")}
      </div>
    `;
  }

  function reportVisualStats(model) {
    if (model.type === "daily_notebook") {
      const totals = model.rows.reduce((acc, row) => ({
        completed: acc.completed + Number(row[2] || 0),
        notDone: acc.notDone + Number(row[3] || 0),
        pending: acc.pending + Number(row[4] || 0),
      }), { completed: 0, notDone: 0, pending: 0 });
      return [
        ["المنجزة", totals.completed, "bar-completed"],
        ["غير المنجزة", totals.notDone, "bar-not-done"],
        ["غير المحددة", totals.pending, "bar-pending"],
      ];
    }
    if (model.type === "discount") {
      const statuses = model.rows.reduce((acc, row) => {
        const label = row[4] || "غير محدد";
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(statuses).map(([label, count], index) => [label, count, ["bar-pending", "bar-extra", "bar-completed"][index % 3]]);
    }
    const statusIndex = model.type === "delay" ? 6 : 5;
    const statuses = model.rows.reduce((acc, row) => {
      const label = row[statusIndex] || "غير محدد";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(statuses).slice(0, 4).map(([label, count], index) => [label, count, ["bar-completed", "bar-extra", "bar-not-done", "bar-pending"][index % 4]]);
  }

  function renderReportInsightPanel(model) {
    const { safe } = getContext();
    const stats = reportVisualStats(model);
    const total = Math.max(1, stats.reduce((sum, item) => sum + Number(item[1] || 0), 0));
    const first = stats[0]?.[1] || 0;
    const second = stats[1]?.[1] || 0;
    const third = Math.max(0, total - first - second);
    return `
      <div class="report-insight-board">
        <div class="report-insight-hero">
          <div>
            <span>لمحة التقرير</span>
            <strong>${safe(model.rows.length)}</strong>
            <small>سجل جاهز للعرض والطباعة</small>
          </div>
          <div class="report-mini-donut" style="--first:${safe(Math.round((first / total) * 360))}deg; --second:${safe(Math.round((second / total) * 360))}deg;">
            <b>${safe(model.columns.length)}</b>
            <em>حقول</em>
          </div>
        </div>
        <div class="report-insight-bars">
          ${stats.length ? stats.map(([label, count, className]) => {
            const width = Math.max(4, Math.round((Number(count || 0) / total) * 100));
            return `
              <div class="report-insight-row">
                <strong>${safe(label)}</strong>
                <div class="report-insight-track"><span class="${safe(className)}" style="width:${safe(width)}%"></span></div>
                <small>${safe(count)}</small>
              </div>
            `;
          }).join("") : `<div class="empty">لا توجد بيانات كافية للرسم التعريفي.</div>`}
        </div>
      </div>
    `;
  }

  function reportColumns(type) {
    if (type === "discount") return ["اسم الطالب", "رقم الطالب", "الصف / المرحلة", "قيمة التخفيض", "الحالة", "منشئ الطلب", "موظف المالية", "تاريخ الإدخال", "تاريخ الاستلام", "تاريخ الإكمال", "الفرع"];
    if (type === "daily_notebook") return ["الموظف", "إجمالي المهام", "المنجزة", "غير المنجزة", "غير المحددة", "المستحدثة", "المعتمدة", "نسبة الإنجاز"];
    if (type === "employee") return ["الموظف", "الدور", "المهام المسندة", "المكتملة", "قيد المراجعة", "المتأخرة", "متوسط الإنجاز"];
    if (type === "department") return ["القسم", "المهام", "المكتملة", "المتأخرة", "قيد المراجعة", "متوسط الإنجاز"];
    if (type === "performance") return ["الموظف", "المكتملة", "المعتمدة", "المتأخرة", "متوسط الإنجاز", "الأداء"];
    if (type === "delay") return ["رقم المهمة", "المهمة", "القسم", "المكلف", "تاريخ الاستحقاق", "أيام التأخير", "الحالة"];
    return ["رقم المهمة", "المهمة", "القسم", "المكلف", "الأولوية", "الحالة", "الإنجاز", "تاريخ الاستحقاق"];
  }

  function selectedReportSchoolId() {
    const { state, scopedSchoolId } = getContext();
    if (isGeneralManager(state.currentUser)) return state.reportConfig.schoolId || "all";
    const scoped = scopedSchoolId();
    if (scoped !== "all") return scoped;
    return state.reportConfig.schoolId || "all";
  }

  function reportSchoolMatches(item) {
    const schoolId = selectedReportSchoolId();
    return schoolId === "all" || item?.schoolId === schoolId;
  }

  function activeReportUser(userId) {
    if (!userId) return null;
    const user = getContext().getUser(userId);
    return user?.active ? user : null;
  }

  function activeReportAssignment(item) {
    return Boolean(activeReportUser(item?.assigneeId || item?.employeeId));
  }

  function reportBaseTasks() {
    return getContext().tasks.reportBaseTasks().filter(reportSchoolMatches).filter(activeReportAssignment);
  }

  function dailyNotebookReportPeriod() {
    const { state } = getContext();
    const fallbackDate = toDateKey(state.permanentTaskDate || today()) || today();
    const rawFrom = toDateKey(state.filters.from || fallbackDate) || fallbackDate;
    const rawTo = toDateKey(state.filters.to || rawFrom) || rawFrom;
    const from = rawFrom <= rawTo ? rawFrom : rawTo;
    const to = rawFrom <= rawTo ? rawTo : rawFrom;
    const dates = dateRange(from, to);
    const workingDates = dates.filter((date) => !isThursdayOrFriday(date));
    const excludedDates = dates.filter(isThursdayOrFriday);
    return { from, to, dates, workingDates, excludedDates };
  }

  function reportRows(type) {
    const { tasks, state, getUser, roleLabel, labels, departments, formatDate, finance, schoolName } = getContext();
    const baseTasks = reportBaseTasks();
    if (type === "discount") {
      const search = String(state.search || "").trim().toLocaleLowerCase("ar");
      return state.financeDiscounts
        .filter(reportSchoolMatches)
        .filter((item) => state.filters.assigneeId === "all" || item.receivedBy === state.filters.assigneeId || item.assignedTo === state.filters.assigneeId)
        .filter((item) => state.filters.status === "all" || item.status === state.filters.status)
        .filter((item) => !state.filters.from || toDateKey(item.createdAt) >= state.filters.from)
        .filter((item) => !state.filters.to || toDateKey(item.createdAt) <= state.filters.to)
        .filter((item) => !search || [item.studentName, item.studentNumber, item.className, item.details].join(" ").toLocaleLowerCase("ar").includes(search))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map((item) => [
          item.studentName,
          item.studentNumber || "-",
          item.className || "-",
          finance.discountValueLabel(item),
          finance.statusLabel(item.status),
          getUser(item.createdBy)?.name || item.createdByName || "الإدارة",
          getUser(item.receivedBy)?.name || item.receivedByName || getUser(item.assignedTo)?.name || item.assignedToName || "لم يستلم",
          formatDate(item.createdAt),
          item.receivedAt ? formatDate(item.receivedAt) : "-",
          item.completedAt ? formatDate(item.completedAt) : "لم يتم",
          schoolName(item.schoolId),
        ]);
    }
    if (type === "daily_notebook") {
      const period = dailyNotebookReportPeriod();
      if (!period.workingDates.length) return [];
      const employeeMap = new Map();
      const ensureEmployee = (employeeId) => {
        const key = employeeId || "unassigned";
        const current = employeeMap.get(key) || { employeeId: key, name: activeReportUser(employeeId)?.name || "غير مسندة", total: 0, completed: 0, notDone: 0, pending: 0, extra: 0, approved: 0 };
        employeeMap.set(key, current);
        return current;
      };
      for (const selectedDate of period.workingDates) {
        const notebookTasks = tasks
          .uniquePermanentTaskRoots(tasks.visibleTasks({ includeSearch: false }))
          .filter((task) => tasks.permanentNotebookActiveOnDate(task, selectedDate))
          .filter(reportSchoolMatches)
          .filter(activeReportAssignment)
          .filter((task) => state.filters.assigneeId === "all" || task.assigneeId === state.filters.assigneeId)
          .filter((task) => state.filters.department === "all" || task.department === state.filters.department);
        notebookTasks.forEach((task) => ensureEmployee(task.assigneeId));
        notebookTasks
          .filter((task) => {
            const outcome = tasks.permanentDailyOutcome(task, selectedDate);
            if (state.filters.status === "all") return true;
            if (state.filters.status === "completed") return outcome === "completed";
            if (state.filters.status === "overdue") return outcome === "not_done";
            if (state.filters.status === "new") return !outcome;
            if (state.filters.status === "approved") return tasks.permanentDailyApproved(task, selectedDate);
            return true;
          })
          .forEach((task) => {
            const outcome = tasks.permanentDailyOutcome(task, selectedDate);
            const item = ensureEmployee(task.assigneeId);
            item.total += 1;
            if (outcome === "completed") item.completed += 1;
            else if (outcome === "not_done") item.notDone += 1;
            else item.pending += 1;
            if (tasks.permanentDailyApproved(task, selectedDate)) item.approved += 1;
          });
        tasks.allDailyExtraTasks(selectedDate, { includeArchived: true })
          .filter(reportSchoolMatches)
          .filter(activeReportAssignment)
          .filter((item) => state.filters.assigneeId === "all" || item.employeeId === state.filters.assigneeId)
          .filter((item) => {
            if (state.filters.status === "all") return true;
            if (state.filters.status === "approved" || state.filters.status === "completed") return Boolean(item.approvedAt);
            if (state.filters.status === "new" || state.filters.status === "under_review") return !item.approvedAt;
            return true;
          })
          .forEach((extraTask) => {
            const item = ensureEmployee(extraTask.employeeId);
            item.extra += 1;
            if (extraTask.approvedAt) item.approved += 1;
          });
      }
      return [...employeeMap.values()]
        .sort((a, b) => a.name.localeCompare(b.name, "ar"))
        .map((item) => {
          const decided = item.completed + item.notDone;
          const rate = decided ? Math.round((item.completed / decided) * 100) : 0;
          return [item.name, item.total, item.completed, item.notDone, item.pending, item.extra, item.approved, `${rate}%`];
        });
    }
    if (type === "daily_notebook") {
      const selectedDate = String(state.permanentTaskDate || today()).slice(0, 10);
      const notebookTasks = tasks
        .uniquePermanentTaskRoots(tasks.visibleTasks({ includeSearch: false }))
        .filter((task) => tasks.permanentNotebookActiveOnDate(task, selectedDate))
        .filter(reportSchoolMatches)
        .filter((task) => state.filters.assigneeId === "all" || task.assigneeId === state.filters.assigneeId)
        .filter((task) => state.filters.department === "all" || task.department === state.filters.department)
        .filter((task) => {
          const outcome = tasks.permanentDailyOutcome(task, selectedDate);
          if (state.filters.status === "all") return true;
          if (state.filters.status === "completed") return outcome === "completed";
          if (state.filters.status === "overdue") return outcome === "not_done";
          if (state.filters.status === "new") return !outcome;
          if (state.filters.status === "approved") return tasks.permanentDailyApproved(task, selectedDate);
          return true;
        });
      const regularRows = notebookTasks.map((task) => {
        const outcome = tasks.permanentDailyOutcome(task, selectedDate);
        const approved = tasks.permanentDailyApproved(task, selectedDate);
        return [
          formatDate(selectedDate),
          getUser(task.assigneeId)?.name || "غير مسندة",
          "مهمة دفتر أساسية",
          tasks.permanentNotebookItemTitle(task),
          outcome === "completed" ? "تم" : outcome === "not_done" ? "لم يتم" : "لم يحدد",
          tasks.permanentDailyNote(task, selectedDate),
          approved ? "معتمدة" : "غير معتمدة",
        ];
      });
      const extraRows = tasks.allDailyExtraTasks(selectedDate)
        .filter(reportSchoolMatches)
        .filter((item) => state.filters.assigneeId === "all" || item.employeeId === state.filters.assigneeId)
        .filter((item) => {
          if (state.filters.status === "all") return true;
          if (state.filters.status === "approved" || state.filters.status === "completed") return Boolean(item.approvedAt);
          if (state.filters.status === "new" || state.filters.status === "under_review") return !item.approvedAt;
          return true;
        })
        .map((item) => [
          formatDate(selectedDate),
          getUser(item.employeeId)?.name || "غير مسندة",
          "مهمة مستحدثة",
          item.title || "مهمة مستحدثة",
          item.approvedAt ? "معتمدة" : "قيد الاعتماد",
          item.text || "",
          item.approvedAt ? "معتمدة" : "غير معتمدة",
        ]);
      return [...regularRows, ...extraRows];
    }
    if (type === "employee") {
      const users = state.users.filter((user) => user.active && baseTasks.some((task) => task.assigneeId === user.id));
      return users.map((user) => {
        const assigned = baseTasks.filter((task) => task.assigneeId === user.id);
        return [
          user.name,
          roleLabel(user.role),
          assigned.length,
          assigned.filter((task) => tasks.effectiveStatus(task) === "completed").length,
          assigned.filter((task) => tasks.effectiveStatus(task) === "under_review").length,
          assigned.filter((task) => tasks.effectiveStatus(task) === "overdue").length,
          `${tasks.averageProgress(assigned)}%`,
        ];
      });
    }
    if (type === "department") {
      return departments
        .map((department) => {
          const deptTasks = baseTasks.filter((task) => task.department === department);
          if (!deptTasks.length) return null;
          return [
            department,
            deptTasks.length,
            deptTasks.filter((task) => tasks.effectiveStatus(task) === "completed").length,
            deptTasks.filter((task) => tasks.effectiveStatus(task) === "overdue").length,
            deptTasks.filter((task) => tasks.effectiveStatus(task) === "under_review").length,
            `${tasks.averageProgress(deptTasks)}%`,
          ];
        })
        .filter(Boolean);
    }
    if (type === "performance") {
      const employees = state.users.filter((user) => user.active && baseTasks.some((task) => task.assigneeId === user.id));
      return employees.map((user) => {
        const assigned = baseTasks.filter((task) => task.assigneeId === user.id);
        const completed = assigned.filter((task) => tasks.effectiveStatus(task) === "completed").length;
        const approved = assigned.filter((task) => tasks.effectiveStatus(task) === "approved").length;
        const overdue = assigned.filter((task) => tasks.effectiveStatus(task) === "overdue").length;
        const progress = tasks.averageProgress(assigned);
        const score = Math.max(0, Math.min(100, completed * 15 + approved * 10 + progress - overdue * 10));
        return [user.name, completed, approved, overdue, `${progress}%`, `${score}%`];
      });
    }
    if (type === "delay") {
      return baseTasks
        .filter((task) => tasks.effectiveStatus(task) === "overdue")
        .map((task) => {
          const delayDays = Math.max(1, Math.ceil((new Date(`${today()}T12:00:00`) - new Date(`${task.dueDate}T12:00:00`)) / 86400000));
          return [
            task.taskNumber,
            task.title,
            task.department,
            getUser(task.assigneeId)?.name || "غير مسندة",
            formatDate(task.dueDate),
            delayDays,
            labels[tasks.effectiveStatus(task)],
          ];
        });
    }
    return baseTasks.map((task) => [
      task.taskNumber,
      task.title,
      task.department,
      getUser(task.assigneeId)?.name || "غير مسندة",
      labels[task.priority],
      labels[tasks.effectiveStatus(task)],
      `${task.progress}%`,
      formatDate(task.dueDate),
    ]);
  }

  function reportSummary(type) {
    let { tasks, state, formatDate } = getContext();
    tasks = { ...tasks, allDailyExtraTasks: (date) => getContext().tasks.allDailyExtraTasks(date).filter(reportSchoolMatches).filter(activeReportAssignment) };
    const baseTasks = reportBaseTasks();
    if (type === "discount") {
      const records = reportRows(type);
      const completed = records.filter((row) => row[4] === getContext().finance.statusLabel("completed")).length;
      return `إجمالي الطلاب: ${records.length} - تم إدخال التخفيض: ${completed} - المتبقي: ${records.length - completed}`;
    }
    if (type === "daily_notebook") {
      const period = dailyNotebookReportPeriod();
      const extraCount = period.workingDates.reduce((sum, date) => sum + tasks.allDailyExtraTasks(date).length, 0);
      if (!period.workingDates.length) return `تقرير دفتر المهام من ${formatDate(period.from)} إلى ${formatDate(period.to)} لا يحتوي أيام عمل، وتم استبعاد الخميس والجمعة.`;
      return `تقرير دفتر المهام من ${formatDate(period.from)} إلى ${formatDate(period.to)} - أيام العمل: ${period.workingDates.length} - المستبعدة: ${period.excludedDates.length} - المهام المستحدثة: ${extraCount}`;
    }
    if (type === "employee") return `عدد الموظفين المشمولين: ${new Set(baseTasks.map((task) => task.assigneeId)).size}`;
    if (type === "department") return `عدد الأقسام المشمولة: ${new Set(baseTasks.map((task) => task.department)).size}`;
    if (type === "performance") return "نظرة عامة على أداء المكلفين النشطين";
    if (type === "delay") return `عدد المهام المتأخرة: ${baseTasks.filter((task) => tasks.effectiveStatus(task) === "overdue").length}`;
    return `عدد المهام المشمولة: ${baseTasks.length}`;
  }

  function buildReportModel() {
    const { state, reportTypeLabels, getSchoolProfile, reportNumber, approvalBlock } = getContext();
    const type = state.reportConfig.type || "task";
    const period = type === "daily_notebook" ? dailyNotebookReportPeriod() : null;
    return {
      type,
      title: reportTypeLabels[type],
      columns: reportColumns(type),
      rows: reportRows(type),
      summary: reportSummary(type),
      period,
      reportNumber: reportNumber(),
      reportDate: getContext().formatDate(today()),
      requestedBy: state.currentUser?.name || "",
      school: getSchoolProfile(),
      approval: approvalBlock(),
      orientation: state.reportConfig.orientation || "portrait",
    };
  }

  function renderReportTable(model) {
    return `
      <table class="report-table">
        <thead>
          <tr>${model.columns.map((column) => `<th>${getContext().safe(column)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${
            model.rows.length
              ? model.rows
                  .map(
                    (row) => `<tr>${row.map((cell, index) => `<td data-label="${getContext().safe(model.columns[index] || "")}">${getContext().safe(cell)}</td>`).join("")}</tr>`,
                  )
                  .join("")
              : `<tr><td colspan="${model.columns.length}" class="empty">لا توجد بيانات متاحة لهذا التقرير.</td></tr>`
          }
        </tbody>
      </table>
    `;
  }

  function renderReportCharts(model) {
    const { safe } = getContext();
    if (!model.rows.length) return "";
    if (model.type === "discount") {
      const labels = ["بانتظار الاستلام", "قيد إدخال التخفيض", "تم إدخال التخفيض"];
      const colors = ["bar-pending", "bar-extra", "bar-completed"];
      const counts = labels.map((label) => model.rows.filter((row) => row[4] === label).length);
      const total = Math.max(1, counts.reduce((sum, count) => sum + count, 0));
      return `
        <div class="panel report-chart-panel">
          <div class="section-title"><h2>مؤشرات التخفيضات</h2><p class="muted">توزيع طلبات الطلاب حسب مرحلة التنفيذ المالي.</p></div>
          <div class="report-bars">
            ${labels.map((label, index) => `<div class="report-bar-row"><strong>${safe(label)}</strong><div class="report-bar-track"><span class="${colors[index]}" style="width:${safe(Math.round((counts[index] / total) * 100))}%"></span></div><small>${safe(counts[index])} من ${safe(total)}</small></div>`).join("")}
          </div>
          <div class="report-chart-legend" aria-label="شرح ألوان التخفيضات">
            <span><i class="legend-pending"></i> بانتظار الاستلام</span><span><i class="legend-extra"></i> قيد الإدخال</span><span><i class="legend-completed"></i> مكتمل</span>
          </div>
        </div>`;
    }
    if (model.type === "daily_notebook") {
      const rows = model.rows.map((row) => ({
        name: row[0],
        total: Number(row[1] || 0),
        completed: Number(row[2] || 0),
        notDone: Number(row[3] || 0),
        pending: Number(row[4] || 0),
        extra: Number(row[5] || 0),
      }));
      const totals = rows.reduce((acc, item) => ({
        total: acc.total + item.total,
        completed: acc.completed + item.completed,
        notDone: acc.notDone + item.notDone,
        pending: acc.pending + item.pending,
        extra: acc.extra + item.extra,
      }), { total: 0, completed: 0, notDone: 0, pending: 0, extra: 0 });
      const decidedTotal = totals.completed + totals.notDone;
      const completionRate = decidedTotal ? Math.round((totals.completed / decidedTotal) * 100) : 0;
      const completionAngle = Math.round((completionRate / 100) * 360);
      const period = model.period || {};
      return `
        <div class="panel report-chart-panel">
          <div class="section-title">
            <h2>مؤشرات دفتر المهام للفترة</h2>
            <p class="muted">ملخص بصري للفترة المحددة مع استبعاد الخميس والجمعة من الحساب.</p>
          </div>
          <div class="notebook-report-hero">
            <div class="notebook-report-donut" style="--rate:${safe(completionAngle)}deg;">
              <strong>${safe(completionRate)}%</strong>
              <span>إنجاز الفترة</span>
            </div>
            <div class="notebook-report-kpis">
              <div><span>أيام العمل</span><strong>${safe(period.workingDates?.length || 0)}</strong></div>
              <div><span>الأيام المستبعدة</span><strong>${safe(period.excludedDates?.length || 0)}</strong></div>
              <div><span>إجمالي البنود</span><strong>${safe(totals.total)}</strong></div>
              <div><span>المستحدثة</span><strong>${safe(totals.extra)}</strong></div>
            </div>
          </div>
          <div class="report-chart-summary">
            <span class="status-pill status-completed">المنجزة: ${safe(totals.completed)}</span>
            <span class="status-pill status-overdue">غير المنجزة: ${safe(totals.notDone)}</span>
            <span class="status-pill status-new">غير المحددة: ${safe(totals.pending)}</span>
            <span class="role-pill">المستحدثة: ${safe(totals.extra)}</span>
          </div>
          <div class="report-bars">
            ${rows.map((item) => {
              const chartTotal = Math.max(1, item.completed + item.notDone + item.pending + item.extra);
              const completedWidth = Math.round((item.completed / chartTotal) * 100);
              const notDoneWidth = Math.round((item.notDone / chartTotal) * 100);
              const pendingWidth = Math.round((item.pending / chartTotal) * 100);
              const extraWidth = Math.max(0, 100 - completedWidth - notDoneWidth - pendingWidth);
              return `
                <div class="report-bar-row">
                  <strong>${safe(item.name)}</strong>
                  <div class="report-bar-track" aria-label="${safe(item.name)}">
                    <span class="bar-completed" style="width:${safe(completedWidth)}%"></span>
                    <span class="bar-not-done" style="width:${safe(notDoneWidth)}%"></span>
                    <span class="bar-pending" style="width:${safe(pendingWidth)}%"></span>
                    <span class="bar-extra" style="width:${safe(extraWidth)}%"></span>
                  </div>
                  <small>تم ${safe(item.completed)} | لم يتم ${safe(item.notDone)} | غير محدد ${safe(item.pending)} | مستحدثة ${safe(item.extra)}</small>
                </div>
              `;
            }).join("")}
          </div>
          <div class="report-chart-legend" aria-label="شرح ألوان الرسم البياني">
            <span><i class="legend-completed"></i> المنجزة</span>
            <span><i class="legend-not-done"></i> غير المنجزة</span>
            <span><i class="legend-pending"></i> غير المحددة</span>
            <span><i class="legend-extra"></i> المستحدثة</span>
          </div>
        </div>
      `;
    }
    return "";
  }

  function renderDashboard() {
    const { tasks, state, roleLabel, canCreateTasks, canCreateUsers, icons, notifications, scopedSchoolId, schoolName, audit } = getContext();
    const allVisible = dashboardTasks();
    const visible = operationalDashboardTasks(allVisible);
    const staleOverdue = staleOverdueTasks(allVisible);
    const summary = dashboardSummary(visible);
    const total = Number(summary.totalTasks || 0);
    const avgProgress = Number(summary.averageProgress || 0);
    const completion = Number(summary.completionPercentage || 0);
    const overdue = Number(summary.overdueTasks || 0);
    const staleCount = staleOverdue.length;
    const pending = Number(summary.pendingTasks || 0);
    const completed = Number(summary.completedTasks || 0);
    const notebookStats = tasks.dailyNotebookStats?.() || { activeEmployees: 0, shortcomingEmployees: 0 };
    const activityCount = remoteDashboardData()?.recentActivity?.length ?? audit.visibleActivityLogs().length;
    return `
      <div class="topbar dashboard-topbar">
        <div class="section-title">
          <h2>لوحة التحكم</h2>
          <p class="muted">مؤشرات مباشرة لتنفيذ المهام والمواعيد والعبء التشغيلي ونشاط المؤسسة ضمن نطاق المدرسة الحالي.</p>
        </div>
        <div class="actions">
          <span class="live-chip"><span class="live-dot"></span>${state.dashboardLoading ? "جارٍ التحديث" : "online"}</span>
          ${canCreateTasks() ? `<button class="btn" onclick="actions.openTask()">${icons.plus} مهمة جديدة</button>` : ""}
          ${canCreateUsers() ? `<button class="btn secondary" onclick="actions.openUser()">${icons.users} مستخدم جديد</button>` : ""}
        </div>
      </div>
      ${state.dashboardError ? `<div class="feedback error"><strong>تعذر جلب مؤشرات Supabase</strong><p class="muted">يُعرض مؤقتًا ملخص محلي حتى يعود الاتصال.</p></div>` : ""}
      <div class="dashboard-hero">
        <div class="dashboard-hero-copy">
          <strong>${getContext().safe(scopedSchoolId() === "all" ? "جميع المدارس" : schoolName(scopedSchoolId()))}</strong>
          <p class="muted">يعرض النظام ${getContext().safe(total)} مهمة تشغيلية بعد تنظيف المتأخرات القديمة، مع ${getContext().safe(notifications.getUnreadCount())} تنبيه غير مقروء و${getContext().safe(activityCount)} نشاط حديث.</p>
        </div>
        <div class="dashboard-hero-metrics">
          <div><span>الاكتمال</span><strong>${getContext().safe(completion)}%</strong></div>
          <div><span>التشغيلية</span><strong>${getContext().safe(total)}</strong></div>
          <div><span>للتنظيف</span><strong>${getContext().safe(staleCount)}</strong></div>
        </div>
      </div>
      <div class="grid metrics dashboard-summary-grid task-dashboard-primary-grid">
        ${metric("مهام تشغيلية", total, "بعد تنظيف المتأخرات القديمة")}
        ${metric("مكتملة", completed, `معدل اكتمال ${completion}%`)}
        ${metric("بانتظار البدء", pending, "لم يبدأ تنفيذها بعد")}
        ${metric("متأخرة للمتابعة", overdue, overdue ? "ضمن آخر 30 يومًا" : "ضمن المسار")}
      </div>
      <div class="grid metrics dashboard-summary-grid" style="margin-bottom:16px;">
        ${metric("المستخدمون ضمن النطاق", state.users.length, "بحسب صلاحيات الدور الحالي")}
        ${metric("المتأخرات القديمة", staleCount, staleCount ? "تحتاج مراجعة أو أرشفة" : "لا توجد متأخرات قديمة")}
        ${metric("الدفاتر المفعلة", notebookStats.activeEmployees, "موظفون لديهم دفتر مهام يومي")}
        ${metric("المقصرين", notebookStats.shortcomingEmployees, "موظفون لم يفعّلوا دفتر المهام")}
      </div>
      <div class="grid dashboard-split">
        ${renderStatusChart(visible)}
        ${renderCompletionCard(visible)}
      </div>
      <div class="grid dashboard-split dashboard-focus-row" style="margin-top:16px;">
        ${renderOverduePanel(visible)}
        ${renderUpcomingPanel(visible)}
      </div>
      <div class="grid dashboard-split dashboard-workload-row" style="margin-top:16px;">
        ${renderAssigneePanel(visible)}
        ${renderPriorityPanel(visible)}
      </div>
      <div class="grid dashboard-split" style="margin-top:16px;">
        ${renderDepartmentPanel(visible)}
        ${notifications.renderNotificationPreview()}
      </div>
      <div class="grid two-column" style="margin-top:16px;">
        ${notifications.renderMessagingStatus()}
        <div class="panel dashboard-panel">
          <div class="section-title">
            <h2>بيانات الحساب</h2>
            <p class="muted">الدور الحالي: ${getContext().safe(roleLabel(state.currentUser.role))}</p>
          </div>
          <span class="live-chip"><span class="live-dot"></span>الأرقام محدثة ومنظفة</span>
        </div>
      </div>
    `;
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes('"') || text.includes("\n")) return `"${text.replaceAll('"', '""')}"`;
    return text;
  }

  function reportFilename(extension) {
    const { state, reportNumber } = getContext();
    return `${reportNumber()}-${state.reportConfig.type}.${extension}`;
  }

  function reportCsvContent(model) {
    const header = model.columns.map(csvEscape).join(",");
    const rows = model.rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    return `${header}\n${rows}`;
  }

  function reportExcelContent(model) {
    return `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8" /></head>
        <body>
          <table border="1">
            <thead><tr>${model.columns.map((column) => `<th>${getContext().safe(column)}</th>`).join("")}</tr></thead>
            <tbody>${model.rows.map((row) => `<tr>${row.map((cell) => `<td>${getContext().safe(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </body>
      </html>
    `;
  }

  function printWindowHtml(model) {
    const { safe } = getContext();
    return `
      <!doctype html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>${safe(model.title)}</title>
          <style>
            @page { size: A4 ${model.orientation}; margin: 14mm; }
            body { font-family: "Cairo", "Tajawal", "Segoe UI", Tahoma, Arial, sans-serif; color: #182033; margin: 0; direction: rtl; }
            .report-page { min-height: calc(297mm - 28mm); display: flex; flex-direction: column; gap: 18px; }
            .report-header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #dfe4ef; padding-bottom: 14px; }
            .report-brand { display: flex; gap: 12px; align-items: center; }
            .report-logo { width: 58px; height: 58px; border-radius: 12px; overflow: hidden; border: 1px solid #dfe4ef; background: white; }
            .report-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .report-brand h1, .report-brand p, .report-meta-box p { margin: 0; }
            .report-meta-box { min-width: 260px; font-size: 12px; line-height: 1.7; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #dfe4ef; padding: 8px; text-align: start; vertical-align: top; }
            th { background: #f6f8fc; }
            .report-signature-area { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 10px; }
            .signature-card { border: 1px solid #dfe4ef; border-radius: 10px; padding: 12px; min-height: 110px; }
            .signature-line { margin-top: 16px; padding-top: 12px; border-top: 1px dashed #94a3b8; font-family: "Segoe Script", "Brush Script MT", cursive; font-size: 20px; }
            .report-footer-strip { margin-top: auto; display: flex; justify-content: space-between; font-size: 11px; border-top: 1px solid #dfe4ef; padding-top: 10px; }
            .page-counter::after { content: "صفحة " counter(page); }
          </style>
        </head>
        <body>
          <div class="report-page">
            <div class="report-header">
              <div class="report-brand">
                <div class="report-logo"><img src="/icon-192.png" alt="منصة المهام المدرسية" /></div>
                <div>
                  <h1>${safe(model.school.name)}</h1>
                  <p>${safe(model.title)}</p>
                </div>
              </div>
              <div class="report-meta-box">
                <p><strong>رقم التقرير:</strong> ${safe(model.reportNumber)}</p>
                <p><strong>تاريخ التقرير:</strong> ${safe(model.reportDate)}</p>
                <p><strong>اسم المستخدم:</strong> ${safe(model.requestedBy)}</p>
                <p><strong>الملخص:</strong> ${safe(model.summary)}</p>
              </div>
            </div>
            ${renderReportTable(model)}
            <div class="report-signature-area">
              <div class="signature-card">
                <strong>الاعتماد الإلكتروني</strong>
                <p>${safe(model.approval.approvalName || "قيد الانتظار")}</p>
                <p>${safe(model.approval.approvalTitle || "")}</p>
              </div>
              <div class="signature-card">
                <strong>التوقيع الإلكتروني</strong>
                <div class="signature-line">${safe(model.approval.signatureText || "غير موقع")}</div>
                <p>${safe(model.approval.notes || "لا توجد ملاحظات")}</p>
              </div>
            </div>
            <div class="report-footer-strip">
              <span>${safe(model.school.footer)}</span>
              <span class="page-counter"></span>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  function printWindowHtmlPretty(model) {
    const { safe } = getContext();
    const chartHtml = renderReportCharts(model).replaceAll('class="panel report-chart-panel"', 'class="report-chart-panel"');
    return `
      <!doctype html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>${safe(model.title)}</title>
          <style>
            @page { size: A4 ${model.orientation}; margin: 12mm; }
            * { box-sizing: border-box; }
            html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { margin: 0; direction: rtl; color: #172033; background: #f8fafc; font-family: "Cairo", "Tajawal", "Segoe UI", Tahoma, Arial, sans-serif; }
            .report-page { min-height: calc(297mm - 24mm); display: flex; flex-direction: column; gap: 12px; }
            .report-header { display: grid; grid-template-columns: 1.25fr 0.9fr; gap: 14px; padding: 14px; border: 1px solid #dbe3f0; border-radius: 14px; background: linear-gradient(135deg, #eff6ff, #f0fdf4); }
            .report-brand { display: flex; gap: 12px; align-items: center; }
            .report-logo { width: 62px; height: 62px; border-radius: 14px; overflow: hidden; border: 1px solid #dfe4ef; background: white; box-shadow: 0 10px 24px rgba(37, 99, 235, 0.14); }
            .report-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .report-brand h1, .report-brand p, .report-meta-box p { margin: 0; }
            .report-brand h1 { font-size: 22px; line-height: 1.35; }
            .report-brand p { color: #475569; font-weight: 800; }
            .report-meta-box { display: grid; gap: 5px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 12px; background: rgba(255, 255, 255, 0.78); font-size: 12px; line-height: 1.7; }
            .report-summary-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
            .summary-card { border: 1px solid #dbe3f0; border-radius: 12px; padding: 10px; background: white; }
            .summary-card span { display: block; color: #64748b; font-size: 11px; font-weight: 800; }
            .summary-card strong { display: block; margin-top: 2px; font-size: 15px; }
            table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; border: 1px solid #dbe3f0; border-radius: 12px; background: white; font-size: 11.5px; }
            th, td { padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: start; vertical-align: top; }
            th { background: #1e293b; color: white; font-weight: 900; }
            tr:nth-child(even) td { background: #f8fafc; }
            tr:last-child td { border-bottom: 0; }
            .report-chart-panel { break-inside: avoid; display: grid; gap: 10px; padding: 12px; border: 1px solid #dbe3f0; border-radius: 14px; background: white; }
            .section-title h2, .section-title p { margin: 0; }
            .section-title h2 { font-size: 17px; }
            .section-title p { color: #64748b; font-size: 11px; }
            .report-chart-summary { display: flex; flex-wrap: wrap; gap: 6px; }
            .notebook-report-hero { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 10px; align-items: center; padding: 10px; border: 1px solid #dbe3f0; border-radius: 12px; background: #f8fafc; }
            .notebook-report-donut { width: 118px; height: 118px; border-radius: 999px; display: grid; place-items: center; justify-self: center; background: conic-gradient(#16a34a 0 var(--rate), #dc2626 var(--rate) 360deg); position: relative; }
            .notebook-report-donut::after { content: ""; position: absolute; inset: 12px; border-radius: inherit; background: white; }
            .notebook-report-donut strong, .notebook-report-donut span { position: relative; z-index: 1; text-align: center; }
            .notebook-report-donut strong { font-size: 24px; line-height: 1; }
            .notebook-report-donut span { margin-top: 28px; color: #64748b; font-size: 9.5px; font-weight: 900; }
            .notebook-report-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
            .notebook-report-kpis div { min-height: 62px; padding: 8px; border: 1px solid #dbe3f0; border-radius: 10px; background: white; display: grid; align-content: center; gap: 3px; }
            .notebook-report-kpis span { color: #64748b; font-size: 9.5px; font-weight: 900; }
            .notebook-report-kpis strong { font-size: 19px; line-height: 1; }
            .status-pill, .role-pill { display: inline-flex; align-items: center; justify-content: center; border: 1px solid #dbe3f0; border-radius: 999px; padding: 4px 9px; background: #f8fafc; font-size: 11px; font-weight: 900; }
            .status-completed { color: #166534; background: #dcfce7; border-color: #bbf7d0; }
            .status-overdue { color: #991b1b; background: #fee2e2; border-color: #fecaca; }
            .status-new { color: #92400e; background: #fef3c7; border-color: #fde68a; }
            .report-bars { display: grid; gap: 8px; }
            .report-bar-row { display: grid; grid-template-columns: minmax(120px, 0.55fr) minmax(220px, 1.4fr) minmax(150px, 0.65fr); gap: 8px; align-items: center; }
            .report-bar-row strong { font-size: 11px; }
            .report-bar-row small { color: #64748b; font-size: 10.5px; font-weight: 800; }
            .report-bar-track { min-height: 22px; overflow: hidden; border: 1px solid #dbe3f0; border-radius: 8px; display: flex; background: #f8fafc; }
            .report-bar-track span { min-width: 0; }
            .bar-completed { background: #16a34a; }
            .bar-not-done { background: #dc2626; }
            .bar-pending { background: #d97706; }
            .bar-extra { background: #2563eb; }
            .report-chart-legend { display: flex; flex-wrap: wrap; gap: 7px 12px; align-items: center; color: #475569; font-size: 10.5px; font-weight: 900; }
            .report-chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
            .report-chart-legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; border: 1px solid rgba(15, 23, 42, 0.12); }
            .legend-completed { background: #16a34a; }
            .legend-not-done { background: #dc2626; }
            .legend-pending { background: #d97706; }
            .legend-extra { background: #2563eb; }
            .report-signature-area { break-inside: avoid; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 4px; }
            .signature-card { min-height: 96px; border: 1px solid #dbe3f0; border-radius: 12px; padding: 12px; background: white; }
            .signature-card p { margin: 6px 0 0; color: #475569; }
            .signature-line { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #94a3b8; color: #172033; font-family: "Segoe Script", "Brush Script MT", cursive; font-size: 18px; }
            .report-footer-strip { margin-top: auto; display: flex; justify-content: space-between; border-top: 1px solid #dbe3f0; padding-top: 8px; color: #64748b; font-size: 10.5px; }
            .page-counter::after { content: "صفحة " counter(page); }
            @media print { body { background: white; } .report-page { gap: 11px; } }
          </style>
        </head>
        <body>
          <div class="report-page">
            <div class="report-header">
              <div class="report-brand">
                <div class="report-logo"><img src="/icon-192.png" alt="منصة المهام المدرسية" /></div>
                <div>
                  <h1>${safe(model.school.name)}</h1>
                  <p>${safe(model.title)}</p>
                </div>
              </div>
              <div class="report-meta-box">
                <p><strong>رقم التقرير:</strong> ${safe(model.reportNumber)}</p>
                <p><strong>تاريخ التقرير:</strong> ${safe(model.reportDate)}</p>
                <p><strong>اسم المستخدم:</strong> ${safe(model.requestedBy)}</p>
                <p><strong>الملخص:</strong> ${safe(model.summary)}</p>
              </div>
            </div>
            <div class="report-summary-strip">
              <div class="summary-card"><span>نوع التقرير</span><strong>${safe(model.title)}</strong></div>
              <div class="summary-card"><span>عدد الصفوف</span><strong>${safe(model.rows.length)}</strong></div>
              <div class="summary-card"><span>الاتجاه</span><strong>${safe(model.orientation === "landscape" ? "أفقي" : "عمودي")}</strong></div>
            </div>
            ${renderReportTable(model)}
            ${chartHtml}
            <div class="report-signature-area">
              <div class="signature-card">
                <strong>الاعتماد الإلكتروني</strong>
                <p>${safe(model.approval.approvalName || "قيد الانتظار")}</p>
                <p>${safe(model.approval.approvalTitle || "")}</p>
              </div>
              <div class="signature-card">
                <strong>التوقيع الإلكتروني</strong>
                <div class="signature-line">${safe(model.approval.signatureText || "غير موقع")}</div>
                <p>${safe(model.approval.notes || "لا توجد ملاحظات")}</p>
              </div>
            </div>
            <div class="report-footer-strip">
              <span>${safe(model.school.footer)}</span>
              <span class="page-counter"></span>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  function openPrintWindow(autoPrint = false) {
    const { showToast } = getContext();
    const model = buildReportModel();
    const popup = window.open("", "_blank", "width=1100,height=900");
    if (!popup) {
      showToast("حظر المتصفح نافذة معاينة الطباعة.");
      return;
    }
    popup.document.open();
    popup.document.write(printWindowHtmlPretty(model));
    popup.document.close();
    if (autoPrint) {
      const printWhenReady = () => {
        const images = Array.from(popup.document.images || []);
        const imagePromises = images.map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                image.onload = resolve;
                image.onerror = resolve;
              }),
        );
        const fontPromise = popup.document.fonts?.ready || Promise.resolve();
        Promise.all([fontPromise, ...imagePromises]).then(() => {
          setTimeout(() => {
            popup.focus();
            popup.print();
          }, 250);
        });
      };
      if (popup.document.readyState === "complete") printWhenReady();
      else popup.addEventListener("load", printWhenReady, { once: true });
    }
  }

  function exportReport(format) {
    const { downloadBlob, showToast, audit, scopedSchoolId } = getContext();
    const model = buildReportModel();
    if (format === "csv") {
      downloadBlob(reportFilename("csv"), reportCsvContent(model), "text/csv;charset=utf-8");
      audit.recordActivity("report_exported", "تم تصدير تقرير", `تم تصدير ${model.title} بصيغة ملف بيانات مجدول.`, scopedSchoolId() === "all" ? "district-hq" : scopedSchoolId());
      showToast("تم تصدير ملف البيانات المجدول.");
      return;
    }
    if (format === "excel") {
      downloadBlob(reportFilename("xls"), reportExcelContent(model), "application/vnd.ms-excel");
      audit.recordActivity("report_exported", "تم تصدير تقرير", `تم تصدير ${model.title} بصيغة ملف إكسل.`, scopedSchoolId() === "all" ? "district-hq" : scopedSchoolId());
      showToast("تم تصدير ملف إكسل.");
      return;
    }
    audit.recordActivity("report_exported", "تم تصدير تقرير", `تم فتح ${model.title} للطباعة بصيغة بي دي إف.`, scopedSchoolId() === "all" ? "district-hq" : scopedSchoolId());
    openPrintWindow(true);
    showToast("تم فتح نسخة الطباعة بصيغة بي دي إف.");
  }

  function renderReports() {
    const { state, tasks, safe, reportTypes, reportTypeLabels, renderPagination, departments, labels, taskStatuses, canViewUser, canManageFinanceDiscounts, icons, schools, scopedSchoolId, schoolName } = getContext();
    if (state.reportConfig.type === "discount" && !canManageFinanceDiscounts()) state.reportConfig.type = "task";
    const availableReportTypes = reportTypes.filter((item) => item !== "discount" || canManageFinanceDiscounts());
    const filtered = reportBaseTasks();
    const model = buildReportModel();
    const reportPage = getContext().paginate(model.rows, state.pagination.reportsPage, 12);
    const pagedModel = { ...model, rows: reportPage.items };
    const visibleDateControls = state.reportConfig.type === "daily_notebook";
    const isDiscountReport = state.reportConfig.type === "discount";
    const reportUsers = isDiscountReport
      ? state.users.filter((user) => user.active && user.role === "finance")
      : state.users.filter((user) => user.active && canViewUser(user));
    const reportStatuses = isDiscountReport
      ? [["pending", "بانتظار الاستلام"], ["received", "قيد إدخال التخفيض"], ["completed", "تم إدخال التخفيض"]]
      : taskStatuses.map((item) => [item, labels[item]]);
    const scopedReportSchoolId = scopedSchoolId();
    const selectedSchoolId = selectedReportSchoolId();
    const generalManagerReportScope = isGeneralManager(state.currentUser);
    const reportSchoolOptions = generalManagerReportScope || scopedReportSchoolId === "all"
      ? schools
      : schools.filter((school) => school.id === scopedReportSchoolId);
    return `
      <div class="topbar">
        <div class="section-title">
          <h2>التقارير</h2>
          <p class="muted">تقارير احترافية تدعم التصدير والطباعة والاعتماد والتوقيع الإلكتروني.</p>
        </div>
        <div class="actions report-top-actions" hidden>
          <button class="btn secondary" onclick="actions.exportReport('csv')">بيانات مجدولة</button>
          <button class="btn secondary" onclick="actions.exportReport('excel')">إكسل</button>
          <button class="btn secondary" onclick="actions.exportReport('pdf')">بي دي إف</button>
          <button class="btn" onclick="actions.printReport()">معاينة الطباعة</button>
        </div>
      </div>
      ${renderReportGuide(availableReportTypes)}
      <div class="panel report-workbench">
        <div class="report-workbench-head">
          <div>
            <strong>${safe(model.title)}</strong>
            <p class="muted">${safe(model.summary)}</p>
          </div>
          <div class="report-chip-row">
            <span class="role-pill">النتائج: ${safe(model.rows.length)}</span>
            <span class="role-pill">الصفحات: ${safe(reportPage.totalPages)}</span>
          </div>
        </div>
        <div class="report-filter-grid">
          <label class="field">
            <span>نوع التقرير</span>
            <select onchange="actions.setReportConfig('type', this.value)">
              ${availableReportTypes.map((item) => `<option value="${item}" ${state.reportConfig.type === item ? "selected" : ""}>${safe(reportTypeLabels[item])}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>الفرع</span>
            <select onchange="actions.setReportConfig('schoolId', this.value)" ${generalManagerReportScope || scopedReportSchoolId === "all" ? "" : "disabled"}>
              ${generalManagerReportScope || scopedReportSchoolId === "all" ? `<option value="all" ${selectedSchoolId === "all" ? "selected" : ""}>كل الفروع</option>` : ""}
              ${reportSchoolOptions.map((school) => `<option value="${safe(school.id)}" ${selectedSchoolId === school.id ? "selected" : ""}>${safe(school.name || schoolName(school.id))}</option>`).join("")}
            </select>
          </label>
          <form class="report-search" onsubmit="actions.searchTasks(event)">
            <label class="field"><span>بحث</span><input name="query" value="${safe(state.search)}" placeholder="${isDiscountReport ? "اسم الطالب أو رقمه أو صفه" : "ابحث في التقارير"}" /></label>
            <button class="btn secondary" type="submit">${icons.search} بحث</button>
          </form>
          <label class="field">
            <span>${isDiscountReport ? "موظف المالية" : "الموظف"}</span>
            <select onchange="actions.setFilter('assigneeId', this.value)">
              <option value="all">الكل</option>
              ${reportUsers.map((user) => `<option value="${safe(user.id)}" ${state.filters.assigneeId === user.id ? "selected" : ""}>${safe(user.name)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>الحالة</span>
            <select onchange="actions.setFilter('status', this.value)">
              <option value="all">الكل</option>
              ${reportStatuses.map(([value, label]) => `<option value="${value}" ${state.filters.status === value ? "selected" : ""}>${safe(label)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>من تاريخ</span>
            <input type="date" value="${safe(visibleDateControls ? state.filters.from || state.permanentTaskDate || today() : state.filters.from)}" onchange="actions.setFilter('from', this.value)" />
          </label>
          <label class="field">
            <span>إلى تاريخ</span>
            <input type="date" value="${safe(visibleDateControls ? state.filters.to || state.filters.from || state.permanentTaskDate || today() : state.filters.to)}" onchange="actions.setFilter('to', this.value)" />
          </label>
          <label class="field ${isDiscountReport ? "report-hidden-control" : ""}">
            <span>القسم</span>
            <select onchange="actions.setFilter('department', this.value)">
              <option value="all">الكل</option>
              ${departments.map((item) => `<option value="${safe(item)}" ${state.filters.department === item ? "selected" : ""}>${safe(item)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>الاتجاه</span>
            <select onchange="actions.setReportConfig('orientation', this.value)">
              <option value="portrait" ${state.reportConfig.orientation === "portrait" ? "selected" : ""}>A4 عمودي</option>
              <option value="landscape" ${state.reportConfig.orientation === "landscape" ? "selected" : ""}>A4 أفقي</option>
            </select>
          </label>
        </div>
        <div class="report-export-row">
          <button class="btn secondary" type="button" onclick="actions.resetFilters()">إعادة ضبط</button>
          <span></span>
          <button class="btn secondary" onclick="actions.exportReport('csv')">بيانات</button>
          <button class="btn secondary" onclick="actions.exportReport('excel')">Excel</button>
          <button class="btn secondary" onclick="actions.exportReport('pdf')">PDF</button>
          <button class="btn" onclick="actions.printReport()">معاينة</button>
        </div>
        <details class="report-advanced">
          <summary>إعدادات الاعتماد والطباعة</summary>
          <div class="report-advanced-grid">
            <label class="field"><span>اسم المدرسة</span><input value="${safe(state.schoolProfile.name)}" onchange="actions.setSchoolProfile('name', this.value)" /></label>
            <label class="field"><span>اسم المعتمد</span><input value="${safe(state.reportConfig.approvalName)}" onchange="actions.setReportConfig('approvalName', this.value)" /></label>
            <label class="field"><span>صفة المعتمد</span><input value="${safe(state.reportConfig.approvalTitle)}" onchange="actions.setReportConfig('approvalTitle', this.value)" /></label>
            <label class="field"><span>التوقيع الإلكتروني</span><input value="${safe(state.reportConfig.signatureText)}" onchange="actions.setReportConfig('signatureText', this.value)" /></label>
            <label class="field wide"><span>التذييل</span><input value="${safe(state.schoolProfile.footer)}" onchange="actions.setSchoolProfile('footer', this.value)" /></label>
            <label class="field wide"><span>ملاحظات الاعتماد</span><textarea onchange="actions.setReportConfig('notes', this.value)">${safe(state.reportConfig.notes)}</textarea></label>
          </div>
        </details>
      </div>
      ${renderReportInsightPanel(model)}
      <div class="panel report-control-panel" hidden>
        <div class="form-grid">
          <label class="field">
            <span>نوع التقرير</span>
            <select onchange="actions.setReportConfig('type', this.value)">
              ${availableReportTypes.map((item) => `<option value="${item}" ${state.reportConfig.type === item ? "selected" : ""}>${safe(reportTypeLabels[item])}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>الاتجاه</span>
            <input type="date" value="${safe(state.permanentTaskDate || today())}" onchange="actions.setPermanentTaskDate(this.value)" />
          </label>
          <label class="field">
            <span>اتجاه التقرير</span>
            <select onchange="actions.setReportConfig('orientation', this.value)">
              <option value="portrait" ${state.reportConfig.orientation === "portrait" ? "selected" : ""}>A4 عمودي</option>
              <option value="landscape" ${state.reportConfig.orientation === "landscape" ? "selected" : ""}>A4 أفقي</option>
            </select>
          </label>
          <label class="field"><span>اسم المدرسة</span><input value="${safe(state.schoolProfile.name)}" onchange="actions.setSchoolProfile('name', this.value)" /></label>
          <label class="field"><span>اختصار الشعار</span><input maxlength="3" value="${safe(state.schoolProfile.logoText)}" onchange="actions.setSchoolProfile('logoText', this.value)" /></label>
          <label class="field"><span>اسم المعتمد</span><input value="${safe(state.reportConfig.approvalName)}" onchange="actions.setReportConfig('approvalName', this.value)" /></label>
          <label class="field"><span>صفة المعتمد</span><input value="${safe(state.reportConfig.approvalTitle)}" onchange="actions.setReportConfig('approvalTitle', this.value)" /></label>
          <label class="field"><span>التوقيع الإلكتروني</span><input value="${safe(state.reportConfig.signatureText)}" onchange="actions.setReportConfig('signatureText', this.value)" /></label>
          <label class="field"><span>التذييل</span><input value="${safe(state.schoolProfile.footer)}" onchange="actions.setSchoolProfile('footer', this.value)" /></label>
          <label class="field wide"><span>ملاحظات الاعتماد</span><textarea onchange="actions.setReportConfig('notes', this.value)">${safe(state.reportConfig.notes)}</textarea></label>
        </div>
      </div>
      <div class="grid metrics" hidden>
        ${metric("النتائج", filtered.length)}
        ${metric("المكتملة", filtered.filter((task) => tasks.effectiveStatus(task) === "completed").length)}
        ${metric("قيد المراجعة", filtered.filter((task) => tasks.effectiveStatus(task) === "under_review").length)}
        ${metric("المتأخرة", filtered.filter((task) => tasks.effectiveStatus(task) === "overdue").length)}
      </div>
      <div class="panel report-preview">
        <div class="report-page ${safe(model.orientation)}">
          <div class="report-header">
            <div class="report-brand">
              <div class="report-logo"><img src="/icon-192.png" alt="منصة المهام المدرسية" /></div>
              <div><h3>${safe(model.school.name)}</h3><p>${safe(model.title)}</p></div>
            </div>
            <div class="report-meta-box">
              <div><strong>رقم التقرير:</strong> ${safe(model.reportNumber)}</div>
              <div><strong>تاريخ التقرير:</strong> ${safe(model.reportDate)}</div>
              <div><strong>اسم المستخدم:</strong> ${safe(model.requestedBy)}</div>
              <div><strong>الملخص:</strong> ${safe(model.summary)}</div>
            </div>
          </div>
          ${renderReportTable(pagedModel)}
          <div class="report-signature-area">
            <div class="signature-card">
              <strong>الاعتماد الإلكتروني</strong>
              <p>${safe(model.approval.approvalName || "قيد الانتظار")}</p>
              <p class="muted">${safe(model.approval.approvalTitle || "")}</p>
            </div>
            <div class="signature-card">
              <strong>التوقيع الإلكتروني</strong>
              <div class="signature-line">${safe(model.approval.signatureText || "غير موقع")}</div>
              <p class="muted">${safe(model.approval.notes || "لا توجد ملاحظات")}</p>
            </div>
          </div>
          <div class="report-footer-strip">
            <span>${safe(model.school.footer)}</span>
            <span>الصفحة ${reportPage.currentPage} من ${reportPage.totalPages}</span>
          </div>
        </div>
      </div>
      ${renderReportCharts(model)}
      ${renderPagination(reportPage, "reportsPage")}
    `;
  }

  return {
    metric,
    buildReportModel,
    renderReportTable,
    renderDashboard,
    renderReports,
    openPrintWindow,
    exportReport,
  };
}
