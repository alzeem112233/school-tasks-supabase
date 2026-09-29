import { dateRange, nowTimestamp, parseDateKeyToDate, toDateKey, today, toStorageTimestamp } from "../utils/dateUtils.js";
import { validateTaskInput } from "../utils/validationUtils.js";
import { canOverrideManagerApprovalLock, isDeputyPrincipal, isGeneralManager, normalizeRole, roleRank } from "../utils/permissionUtils.js";
import { createUuid } from "../utils/idUtils.js";
import { progressClass, taskDateText } from "../components/tasks/taskPresentation.js";

export function createTasksModule(getContext) {
  let permanentRootsCache = { tasksRef: null, cacheKey: "", roots: [] };

  function createCommentRecord(userId, text, type = "comment") {
    return { id: createUuid(), userId, text, at: today(), type };
  }

  function createNotebookMetaRecord(userId, text, type) {
    return { id: createUuid(), userId, text, at: today(), type };
  }

  function createApprovalRecord(action, user, comment = "") {
    return {
      id: createUuid(),
      action,
      userId: user.id,
      role: user.role,
      comment,
      at: today(),
    };
  }

  function generateTaskNumber(dateString = today(), seed = createUuid()) {
    const compactDate = String(dateString).replaceAll("-", "");
    const suffix = String(seed).replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
    return `TSK-${compactDate}-${suffix}`;
  }

  function taskDepartmentValue(task = {}) {
    const { state, schoolName } = getContext();
    const schoolId = task.schoolId || state.currentUser?.schoolId || "general";
    const branchName = schoolName(schoolId);
    const rawDepartment = String(task.department || "").trim();
    if (schoolId && schoolId !== "general" && branchName && branchName !== "الإدارة العامة") {
      return branchName;
    }
    return rawDepartment || branchName || "الإدارة";
  }

  function normalizeTask(task) {
    const { state, taskCreationStatuses, roleGroups, attachments } = getContext();
    const createdAt = toDateKey(task.createdAtTs || task.createdAt || today());
    const dueDate = toDateKey(task.dueAt || task.dueDate || createdAt);
    const completedAt = task.completedAt ? toStorageTimestamp(task.completedAt) || "" : "";
    const occurrenceDate = task.occurrenceAt || task.occurrenceDate ? toDateKey(task.occurrenceAt || task.occurrenceDate) : "";
    const taskNumber = task.taskNumber || generateTaskNumber(createdAt, task.id || createUuid());
    const schoolId = task.schoolId || state.currentUser?.schoolId || "general";
    const normalizedComments = Array.isArray(task.comments)
      ? task.comments
      : Array.isArray(task.feedback)
        ? task.feedback.map((item) => ({ id: createUuid(), userId: item.userId, text: item.text, at: toDateKey(item.at), type: "feedback" }))
        : [];
    const normalizedApprovals = Array.isArray(task.approvals) ? task.approvals : [];
    return {
      id: task.id,
      taskNumber,
      title: task.title || "",
      description: task.description || "",
      department: taskDepartmentValue({ ...task, schoolId }),
      priority: ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium",
      recurrence: ["once", "daily", "permanent"].includes(task.recurrence) ? task.recurrence : "once",
      status: taskCreationStatuses.includes(task.status) || task.status === "overdue" ? task.status : "new",
      progress: Number.isFinite(Number(task.progress)) ? Math.max(0, Math.min(100, Number(task.progress))) : 0,
      assigneeId: task.assigneeId || "",
      creatorId: task.creatorId || "",
      schoolId,
      dueDate,
      completedAt,
      createdAt,
      occurrenceDate,
      sourceTaskId: task.sourceTaskId || "",
      comments: normalizedComments.map((comment) => ({ ...comment, at: toDateKey(comment.at || createdAt) })),
      feedback: normalizedComments
        .filter((comment) => comment.type !== "permanent_daily")
        .map((comment) => ({ userId: comment.userId, text: comment.text, at: toDateKey(comment.at || createdAt) })),
      attachments: Array.isArray(task.attachments) ? task.attachments.map(attachments.normalizeAttachment) : [],
      approvalRequired: task.approvalRequired !== false,
      approverRole: roleGroups.approveTasks.includes(task.approverRole) ? task.approverRole : "school_principal",
      approvals: normalizedApprovals.map((approval) => ({ ...approval, at: toDateKey(approval.at || createdAt) })),
    };
  }

  function matchesSearch(task) {
    const { state, getUser, labels } = getContext();
    const query = state.search.trim().toLowerCase();
    if (!query) return true;
    const assignee = getUser(task.assigneeId)?.name || "";
    return [
      task.taskNumber,
      task.title,
      task.description,
      task.department,
      assignee,
      task.schoolId,
      labels[effectiveStatus(task)],
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  }

  function seriesRoots(tasks) {
    return tasks.filter((task) => task.recurrence === "daily" && !task.sourceTaskId);
  }

  function generatedTaskId(rootId, occurrenceDate) {
    const seed = `${rootId}:${occurrenceDate}`;
    const hashes = [2166136261, 2246822519, 3266489917, 668265263].map((initial) => {
      let hash = initial >>> 0;
      for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
      return hash.toString(16).padStart(8, "0");
    }).join("");
    return `${hashes.slice(0, 8)}-${hashes.slice(8, 12)}-4${hashes.slice(13, 16)}-8${hashes.slice(17, 20)}-${hashes.slice(20, 32)}`;
  }

  function buildTaskSeries(task, occurrenceDate) {
    return normalizeTask({
      ...task,
      id: generatedTaskId(task.id, occurrenceDate),
      taskNumber: `${task.taskNumber}-${occurrenceDate.replaceAll("-", "")}`,
      sourceTaskId: task.id,
      occurrenceDate,
      createdAt: occurrenceDate,
      dueDate: occurrenceDate,
      status: "new",
      progress: 0,
      completedAt: "",
      comments: [],
      feedback: [],
      attachments: [],
      approvals: [],
    });
  }

  function generateRecurringInstances(tasks) {
    return tasks
      .map(normalizeTask)
      .sort((a, b) => getContext().compareDate(b.occurrenceDate || b.createdAt, a.occurrenceDate || a.createdAt));
  }

  function taskWorkDate(task) {
    return task.occurrenceDate || task.dueDate || task.createdAt;
  }

  function effectiveStatus(task) {
    if (!task) return "new";
    if (["completed", "archived", "approved"].includes(task.status)) return task.status;
    if (["new", "in_progress"].includes(task.status) && task.dueDate && getContext().compareDate(task.dueDate, today()) < 0) return "overdue";
    return task.status;
  }

  function visibleTasks(options = {}) {
    const { state, scopedSchoolId, canReadTask } = getContext();
    const includeSearch = options.includeSearch !== false;
    if (!state.currentUser) return [];
    const schoolScope = scopedSchoolId();
    const base = state.tasks.filter((task) => canReadTask(task));
    return base
      .filter((task) => (schoolScope === "all" ? true : task.schoolId === schoolScope))
      .filter((task) => (includeSearch ? matchesSearch(task) : true));
  }

  function visibleNotebookTasks(options = {}) {
    const { state, canReadTask } = getContext();
    const includeSearch = options.includeSearch !== false;
    if (!state.currentUser) return [];
    const ignoreSchoolScope = state.currentUser.role === "general_manager";
    return state.tasks
      .filter((task) => canReadTask(task))
      .filter((task) => (ignoreSchoolScope ? true : task.schoolId === getContext().scopedSchoolId()))
      .filter((task) => (includeSearch ? matchesSearch(task) : true));
  }

  function workTasks() {
    return visibleTasks().filter((task) => effectiveStatus(task) !== "archived");
  }

  function standardWorkTasks() {
    const currentDate = today();
    return workTasks()
      .filter((task) => task.recurrence !== "permanent")
      .filter((task) => !task.occurrenceDate || getContext().compareDate(task.occurrenceDate, currentDate) <= 0);
  }

  function filteredTasks(tasks = visibleTasks()) {
    const { state } = getContext();
    return tasks.filter((task) => {
      const status = effectiveStatus(task);
      if (state.filters.assigneeId !== "all" && task.assigneeId !== state.filters.assigneeId) return false;
      if (state.filters.priority !== "all" && task.priority !== state.filters.priority) return false;
      if (state.filters.recurrence !== "all" && task.recurrence !== state.filters.recurrence) return false;
      if (state.filters.status !== "all" && status !== state.filters.status) return false;
      if (state.filters.department !== "all" && task.department !== state.filters.department) return false;
      const workDate = task.dueDate || taskWorkDate(task);
      if (state.filters.from && getContext().compareDate(workDate, state.filters.from) < 0) return false;
      if (state.filters.to && getContext().compareDate(workDate, state.filters.to) > 0) return false;
      return true;
    });
  }

  function normalizeNotebookText(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ar");
  }

  function notebookItemIdentity(schoolId, assigneeId, title) {
    return [schoolId, assigneeId, normalizeNotebookText(title)].join("|");
  }

  function notebookTaskIdentity(task) {
    if (effectiveStatus(task) === "archived") return `archived|${task.id}`;
    return notebookItemIdentity(task.schoolId, task.assigneeId, permanentNotebookItemTitle(task));
  }

  function uniqueNotebookItems(items = []) {
    const seen = new Set();
    return items.filter((item) => {
      const key = normalizeNotebookText(item.title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function mergeNotebookRecords(first = [], second = []) {
    const records = new Map();
    for (const record of [...first, ...second]) {
      const key = record?.id || [record?.type, toDateKey(record?.date || record?.at), record?.userId, record?.text].join("|");
      if (!records.has(key)) records.set(key, record);
    }
    return [...records.values()];
  }

  function scheduleTaskAlertSync(notifications, force = true) {
    const run = () => notifications.syncTaskAlerts(force).catch((error) => console.error("Task alert sync failed", error));
    if (typeof window === "undefined") {
      run();
      return;
    }
    window.setTimeout(run, 250);
  }

  async function saveUpdatedTasksOptimistically(updatedTasks, saveTask) {
    const { state, render } = getContext();
    const previousTasks = state.tasks;
    state.tasks = state.tasks.map((item) => updatedTasks.find((updatedTask) => updatedTask.id === item.id) || item);
    render();
    try {
      await Promise.all(updatedTasks.map(saveTask));
    } catch (error) {
      state.tasks = previousTasks;
      render();
      throw error;
    }
  }

  function uniquePermanentTaskRoots(taskList = []) {
    const unique = new Map();
    for (const task of taskList.filter((item) => item.recurrence === "permanent" && !item.sourceTaskId)) {
      const key = notebookTaskIdentity(task);
      const current = unique.get(key);
      if (!current) {
        unique.set(key, task);
        continue;
      }
      unique.set(key, normalizeTask({
        ...current,
        status: effectiveStatus(current) === "archived" && effectiveStatus(task) !== "archived" ? task.status : current.status,
        progress: Math.max(Number(current.progress || 0), Number(task.progress || 0)),
        completedAt: current.completedAt || task.completedAt,
        comments: mergeNotebookRecords(current.comments, task.comments),
        approvals: mergeNotebookRecords(current.approvals, task.approvals),
        attachments: mergeNotebookRecords(current.attachments, task.attachments),
      }));
    }
    return [...unique.values()];
  }

  function permanentTaskDate() {
    const { state } = getContext();
    return toDateKey(state.permanentTaskDate || today());
  }

  function permanentTaskRoots() {
    const { state, scopedSchoolId } = getContext();
    const cacheKey = [
      state.currentUser?.id || "",
      state.currentUser?.role || "",
      state.currentUser?.schoolId || "",
      scopedSchoolId(),
      state.tasks.length,
    ].join("|");
    if (permanentRootsCache.tasksRef === state.tasks && permanentRootsCache.cacheKey === cacheKey) {
      return permanentRootsCache.roots;
    }
    const roots = uniquePermanentTaskRoots(visibleNotebookTasks({ includeSearch: false })).filter((task) => effectiveStatus(task) !== "archived");
    permanentRootsCache = { tasksRef: state.tasks, cacheKey, roots };
    return roots;
  }

  function permanentTaskRootsForDate(date = permanentTaskDate()) {
    const dateKey = toDateKey(date);
    return uniquePermanentTaskRoots(visibleNotebookTasks({ includeSearch: false })).filter((task) => {
      const startDate = toDateKey(task.createdAt || task.occurrenceDate || "");
      if (startDate && dateKey < startDate) return false;
      if (effectiveStatus(task) === "archived") return permanentNotebookActiveOnDate(task, dateKey);
      return true;
    });
  }

  function permanentNotebookTitle(task) {
    return (task.comments || []).find((comment) => comment.type === "notebook_title")?.text || "دفتر المهام اليومية";
  }

  function permanentNotebookNumber(task) {
    return (task.comments || []).find((comment) => comment.type === "notebook_number")?.text || task.taskNumber || "";
  }

  function permanentNotebookItemTitle(task) {
    return (task.comments || []).find((comment) => comment.type === "notebook_item_title")?.text || task.title;
  }

  function permanentNotebookArchivedAt(task) {
    return toDateKey((task.comments || []).find((comment) => comment.type === "notebook_archived_at")?.text || "");
  }

  function permanentNotebookActiveOnDate(task, date) {
    const dateKey = toDateKey(date);
    const startDate = toDateKey(task.createdAt || task.occurrenceDate || "");
    const archiveDate = permanentNotebookArchivedAt(task);
    const endDate = archiveDate || toDateKey(task.dueDate || "");
    if (!dateKey) return true;
    if (startDate && dateKey < startDate) return false;
    if (endDate && dateKey > endDate) return false;
    return true;
  }

  function permanentNotebookEndDate(tasks = []) {
    return tasks.map((task) => toDateKey(task.dueDate || "")).filter(Boolean).sort()[0] || "";
  }

  function renewedPermanentNotebookEndDate(tasks = []) {
    const renewedDate = parseDateKeyToDate(today());
    renewedDate.setUTCDate(renewedDate.getUTCDate() + 60);
    return toDateKey(renewedDate);
  }

  function assignedPermanentNotebookEndDate(tasks = []) {
    const sourceEndDate = permanentNotebookEndDate(tasks);
    return sourceEndDate && sourceEndDate >= today() ? sourceEndDate : `${today().slice(0, 4)}-12-31`;
  }

  function permanentDailyRecord(task, date = permanentTaskDate()) {
    const dateKey = toDateKey(date);
    return (task.comments || []).find((comment) => comment.type === "permanent_daily" && toDateKey(comment.date || comment.at) === dateKey) || null;
  }

  function permanentDailyOutcome(task, date = permanentTaskDate()) {
    const record = permanentDailyRecord(task, date);
    return ["completed", "not_done"].includes(record?.status) ? record.status : "";
  }

  function permanentDailyNote(task, date = permanentTaskDate()) {
    return permanentDailyRecord(task, date)?.text || "";
  }

  function permanentDailyApproved(task, date = permanentTaskDate()) {
    return Boolean(permanentDailyRecord(task, date)?.approvedAt);
  }

  function hasAnyPermanentDailyApproval(task) {
    return (task?.comments || []).some((comment) => comment.type === "permanent_daily" && comment.approvedAt);
  }

  function dailyExtraTasks(task, date = permanentTaskDate()) {
    const dateKey = toDateKey(date);
    return (task.comments || [])
      .filter((comment) => comment.type === "daily_extra_task" && toDateKey(comment.date || comment.at) === dateKey)
      .map((comment) => ({ ...comment, taskId: task.id, employeeId: task.assigneeId, schoolId: task.schoolId }));
  }

  function employeeDailyExtraTasks(group, date = permanentTaskDate()) {
    const seen = new Set();
    return group.tasks
      .flatMap((task) => dailyExtraTasks(task, date))
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((a, b) => String(a.updatedAt || a.at || "").localeCompare(String(b.updatedAt || b.at || "")));
  }

  function allDailyExtraTasks(date = permanentTaskDate(), options = {}) {
    const roots = options.includeArchived
      ? uniquePermanentTaskRoots(visibleTasks({ includeSearch: false })).filter((task) => permanentNotebookActiveOnDate(task, date))
      : filteredPermanentTaskRoots();
    return roots.flatMap((task) => dailyExtraTasks(task, date));
  }

  function dailyExtraTaskArchive({ from = "", to = "", employeeId = "all" } = {}) {
    const { getUser, canReadTask } = getContext();
    const startDate = toDateKey(from || "") || "0000-01-01";
    const endDate = toDateKey(to || "") || "9999-12-31";
    const seen = new Set();
    return uniquePermanentTaskRoots(visibleTasks({ includeSearch: false }))
      .filter((task) => canReadTask(task))
      .flatMap((task) => {
        const employee = getUser(task.assigneeId);
        if (!employee || employee.active === false) return [];
        if (employeeId !== "all" && task.assigneeId !== employeeId) return [];
        return (task.comments || [])
          .filter((comment) => comment.type === "daily_extra_task")
          .map((comment) => ({
            ...comment,
            date: toDateKey(comment.date || comment.at),
            taskId: task.id,
            employeeId: task.assigneeId,
            employeeName: employee.name || "غير مسندة",
            schoolId: task.schoolId,
            sourceTask: task,
          }));
      })
      .filter((item) => item.date && item.date >= startDate && item.date <= endDate)
      .filter((item) => {
        const key = item.id || `${item.taskId}:${item.date}:${item.title}:${item.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName, "ar") || String(a.updatedAt || a.at || "").localeCompare(String(b.updatedAt || b.at || "")));
  }

  function permanentDailyLabel(outcome) {
    if (outcome === "completed") return "تم";
    if (outcome === "not_done") return "لم يتم";
    return "لم يتم التحديد";
  }

  function permanentDailyClass(outcome) {
    if (outcome === "completed") return "status-completed";
    if (outcome === "not_done") return "status-overdue";
    return "status-new";
  }

  function permanentDailySummary(tasks = filteredPermanentTaskRoots(), date = permanentTaskDate()) {
    const completed = tasks.filter((task) => permanentDailyOutcome(task, date) === "completed").length;
    const notDone = tasks.filter((task) => permanentDailyOutcome(task, date) === "not_done").length;
    const pending = Math.max(0, tasks.length - completed - notDone);
    const approved = tasks.filter((task) => permanentDailyApproved(task, date)).length;
    const decided = completed + notDone;
    const rate = decided ? Math.round((completed / decided) * 100) : 0;
    return { total: tasks.length, completed, notDone, pending, approved, rate };
  }

  function dailyNotebookStats(date = permanentTaskDate()) {
    const { state, canViewUser } = getContext();
    const tasks = permanentTaskRoots();
    const activeEmployeeIds = new Set(tasks.map((task) => task.assigneeId).filter(Boolean));
    const eligibleEmployees = state.users.filter((user) => user.active && canViewUser(user) && !["general_manager", "school_principal"].includes(user.role));
    const shortcomingEmployeeIds = new Set(eligibleEmployees.filter((user) => !activeEmployeeIds.has(user.id)).map((user) => user.id));
    return {
      activeEmployees: activeEmployeeIds.size,
      shortcomingEmployees: shortcomingEmployeeIds.size,
      activeNotebooks: activeEmployeeIds.size,
      eligibleEmployees: eligibleEmployees.length,
      notDoneTasks: tasks.filter((task) => permanentDailyOutcome(task, date) === "not_done").length,
    };
  }

  function permanentDailyHistory(tasks = permanentTaskRoots(), days = 7) {
    const dates = dateRange(dateRangeStart(days), today());
    return dates.map((date) => ({ date, ...permanentDailySummary(tasks, date) }));
  }

  function dailyNotebookCutoffTime() {
    const { state } = getContext();
    const value = String(state.schoolProfile?.dailyNotebookCutoffTime || "23:59").trim();
    return /^\d{2}:\d{2}$/.test(value) ? value : "23:59";
  }

  function isAfterDailyNotebookCutoff() {
    const [hour, minute] = dailyNotebookCutoffTime().split(":").map(Number);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return currentMinutes >= hour * 60 + minute;
  }

  function isFullDailyNotebookManager(user) {
    return ["general_manager", "school_principal"].includes(normalizeRole(user?.role, ""));
  }

  function dailyNotebookTargetUserId(target) {
    if (!target) return "";
    if (typeof target === "string") return target;
    return target.assigneeId || target.userId || "";
  }

  function dailyNotebookLockInfo(target = null, date = permanentTaskDate()) {
    const { state, compareDate } = getContext();
    const currentUser = state.currentUser;
    const selectedDate = toDateKey(date || permanentTaskDate());
    const todayKey = today();
    const targetUserId = dailyNotebookTargetUserId(target);
    const cutoffTime = dailyNotebookCutoffTime();
    const targetTasks = target?.recurrence === "permanent"
      ? [target]
      : targetUserId
        ? permanentTaskRootsForDate(selectedDate).filter((task) => task.assigneeId === targetUserId)
        : permanentTaskRootsForDate(selectedDate);
    if (!canOverrideManagerApprovalLock(currentUser) && targetTasks.some((task) => permanentDailyApproved(task, selectedDate))) {
      return { locked: true, cutoffTime, message: "تم اعتماد دفتر المهام من المدير، ولا يمكن تعديله إلا من المدير." };
    }
    if (isFullDailyNotebookManager(currentUser)) {
      return { locked: false, cutoffTime, message: "" };
    }
    if (compareDate(selectedDate, todayKey) < 0) {
      return { locked: true, cutoffTime, message: "هذا تاريخ سابق للعرض فقط. التعديل على الأيام السابقة متاح لمدير المدرسة أو مدير الإدارة العامة فقط." };
    }
    if (compareDate(selectedDate, todayKey) > 0) {
      return { locked: true, cutoffTime, message: "لا يمكن تعديل دفتر مهام تاريخ قادم قبل بداية اليوم." };
    }
    if (isAfterDailyNotebookCutoff()) {
      return { locked: true, cutoffTime, message: `انتهى وقت رفع دفتر المهام لهذا اليوم عند ${cutoffTime}. سيفتح التعديل تلقائيًا مع بداية اليوم الجديد.` };
    }
    if (isDeputyPrincipal(currentUser) && targetUserId && targetUserId !== currentUser.id) {
      return { locked: true, cutoffTime, message: "يمكن للوكيل الاطلاع على دفاتر الموظفين، ولا يحق له تعديل إلا دفتر المهام الخاص به." };
    }
    return { locked: false, cutoffTime, message: "" };
  }

  function isDailyNotebookReadOnly(target = null, date = permanentTaskDate()) {
    return dailyNotebookLockInfo(target, date).locked;
  }

  function permanentDailyEmployeeGroups(tasks = filteredPermanentTaskRoots()) {
    const { getUser, state } = getContext();
    const currentUserId = state.currentUser?.id || "";
    const restrictToDeputyOwnNotebook = isDeputyPrincipal(state.currentUser);
    const groups = new Map();
    for (const task of tasks) {
      if (restrictToDeputyOwnNotebook && task.assigneeId !== currentUserId) continue;
      const key = task.assigneeId || "unassigned";
      const user = getUser(task.assigneeId);
      const group = groups.get(key) || { userId: key, name: user?.name || "غير مسندة", role: user?.role || "", tasks: [] };
      group.tasks.push(task);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => {
      if (restrictToDeputyOwnNotebook) {
        const aIsCurrentUser = a.userId === currentUserId;
        const bIsCurrentUser = b.userId === currentUserId;
        if (aIsCurrentUser !== bIsCurrentUser) return aIsCurrentUser ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "ar");
    });
  }

  function notebookSiblingTasks(task) {
    if (!task?.id || task.recurrence !== "permanent" || task.sourceTaskId) return task ? [task] : [];
    const number = permanentNotebookNumber(task);
    return permanentTaskRoots()
      .filter((item) => item.schoolId === task.schoolId && item.assigneeId === task.assigneeId && permanentNotebookNumber(item) === number)
      .sort((a, b) => permanentNotebookItemTitle(a).localeCompare(permanentNotebookItemTitle(b), "ar"));
  }

  function dateRangeStart(days) {
    const date = new Date(`${today()}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - Math.max(0, days - 1));
    return date.toISOString().slice(0, 10);
  }

  function renderPermanentDailyReport(tasks, selectedDate) {
    const { safe, formatDate } = getContext();
    const summary = permanentDailySummary(tasks, selectedDate);
    const history = permanentDailyHistory(tasks, 7);
    const doneAngle = Math.round((summary.completed / Math.max(1, summary.total)) * 360);
    const notDoneAngle = Math.round((summary.notDone / Math.max(1, summary.total)) * 360);
    return `
      <div class="daily-report-panel">
        <div class="daily-report-copy">
          <span class="role-pill">تقرير ${safe(formatDate(selectedDate))}</span>
          <strong>${safe(summary.rate)}% إنجاز دفتر اليوم</strong>
          <p class="muted">إجمالي المهام اليومية ${safe(summary.total)}، تم تنفيذ ${safe(summary.completed)}، لم يتم ${safe(summary.notDone)}، وغير محدد ${safe(summary.pending)}.</p>
        </div>
        <div class="daily-donut" style="--done:${safe(doneAngle)}deg; --not-done:${safe(notDoneAngle)}deg;">
          <strong>${safe(summary.rate)}%</strong>
          <span>اليوم</span>
        </div>
        <div class="daily-bars" aria-label="رسم متابعة المهام اليومية آخر سبعة أيام">
          ${history.map((item) => {
            const dayTotal = Math.max(1, item.total);
            const completedHeight = Math.round((item.completed / dayTotal) * 100);
            const notDoneHeight = Math.round((item.notDone / dayTotal) * 100);
            const pendingHeight = Math.max(0, 100 - completedHeight - notDoneHeight);
            return `
              <div class="daily-bar-item" title="${safe(formatDate(item.date))}">
                <div class="daily-bar-stack">
                  <span class="bar-completed" style="height:${safe(completedHeight)}%"></span>
                  <span class="bar-not-done" style="height:${safe(notDoneHeight)}%"></span>
                  <span class="bar-pending" style="height:${safe(pendingHeight)}%"></span>
                </div>
                <small>${safe(item.date.slice(5))}</small>
              </div>
            `;
          }).join("")}
        </div>
        <div class="daily-chart-legend" aria-label="شرح ألوان الرسم البياني">
          <span><i class="legend-completed"></i> تم</span>
          <span><i class="legend-not-done"></i> لم يتم</span>
          <span><i class="legend-pending"></i> غير محدد</span>
        </div>
      </div>
    `;
  }

  function renderEmployeeDailyReport(group, selectedDate) {
    const { safe, formatDate } = getContext();
    const summary = permanentDailySummary(group.tasks, selectedDate);
    const doneAngle = Math.round((summary.completed / Math.max(1, summary.total)) * 360);
    const notDoneAngle = Math.round((summary.notDone / Math.max(1, summary.total)) * 360);
    return `
      <div class="employee-daily-report">
        <div>
          <strong>${safe(group.name)}</strong>
          <span class="muted">${safe(formatDate(selectedDate))}</span>
        </div>
        <div class="mini-donut" style="--done:${safe(doneAngle)}deg; --not-done:${safe(notDoneAngle)}deg;"><strong>${safe(summary.rate)}%</strong></div>
        <div class="daily-summary">
          <span class="status-pill status-completed">تم: ${safe(summary.completed)}</span>
          <span class="status-pill status-overdue">لم يتم: ${safe(summary.notDone)}</span>
          <span class="status-pill status-new">غير محدد: ${safe(summary.pending)}</span>
          <span class="status-pill status-approved">معتمد: ${safe(summary.approved)}</span>
        </div>
      </div>
    `;
  }

  function renderDailyExtraEntry(groups) {
    const { state, safe, icons } = getContext();
    const writableTask = groups.flatMap((group) => group.tasks).find((task) => task.assigneeId === state.currentUser?.id);
    if (!writableTask || isDailyNotebookReadOnly(writableTask)) return "";
    return `
      <div class="daily-extra-entry" data-task-id="${safe(writableTask.id)}">
        <div class="daily-extra-entry-head">
          <strong>إضافة مهام مستحدثة</strong>
          <button class="btn secondary compact-btn" type="button" onclick="actions.addDailyExtraTaskRow(this)">${icons.plus} إضافة مهمة أخرى</button>
        </div>
        <div class="daily-extra-input-list" data-daily-extra-rows>
          ${renderDailyExtraInputRow(false)}
        </div>
        <button class="btn daily-extra-save-btn" type="button" onclick="actions.saveDailyExtraTask(this)">${icons.save} حفظ ورفع جميع المهام للمدير</button>
      </div>
    `;
  }

  function renderDailyExtraInputRow(removable = true) {
    const { icons } = getContext();
    return `
      <div class="daily-extra-input-row">
        <label class="field"><span>عنوان المهمة المستحدثة</span><input name="dailyExtraTitle" placeholder="مثال: متابعة ولي أمر / معالجة طلب طارئ" /></label>
        <label class="field"><span>تفاصيل المهمة</span><textarea name="dailyExtraDetails" placeholder="اكتب تفاصيل العمل المستحدث"></textarea></label>
        ${removable ? `<button class="icon-btn danger-icon" type="button" title="حذف هذا السطر" aria-label="حذف هذا السطر" onclick="actions.removeDailyExtraTaskRow(this)">${icons.trash}</button>` : `<span class="daily-extra-row-spacer" aria-hidden="true"></span>`}
      </div>
    `;
  }

  function addDailyExtraTaskRow(button) {
    const container = button?.closest(".daily-extra-entry")?.querySelector("[data-daily-extra-rows]");
    if (!container) return;
    container.insertAdjacentHTML("beforeend", renderDailyExtraInputRow(true));
    container.lastElementChild?.querySelector('input[name="dailyExtraTitle"]')?.focus();
  }

  function removeDailyExtraTaskRow(button) {
    button?.closest(".daily-extra-input-row")?.remove();
  }

  function renderAllDailyExtraTasks(groups, selectedDate) {
    const { state, safe, icons, canApproveTasks, canReadTask, canViewUser, formatDate } = getContext();
    const entries = dailyExtraTaskArchive({ from: selectedDate, to: selectedDate });
    const approvedCount = entries.filter((item) => item.approvedAt).length;
    const pendingCount = entries.length - approvedCount;
    const approvedAngle = Math.round((approvedCount / Math.max(1, entries.length)) * 360);
    const employeeStatsMap = new Map();
    entries.forEach((item) => {
      const stats = employeeStatsMap.get(item.employeeId) || { name: item.employeeName, total: 0, approved: 0 };
      stats.total += 1;
      if (item.approvedAt) stats.approved += 1;
      employeeStatsMap.set(item.employeeId, stats);
    });
    const employeeStats = [...employeeStatsMap.values()];
    const canApproveExtras = !isDailyNotebookReadOnly() && canApproveTasks();
    const bulkBusy = Boolean(state.taskActionBusy?.[`daily-extra-approve-all:${selectedDate}`]);
    const reportFilters = state.dailyExtraReport || { employeeId: "all", from: selectedDate, to: selectedDate };
    const notebookEmployeeIds = new Set(uniquePermanentTaskRoots(visibleTasks({ includeSearch: false })).map((task) => task.assigneeId));
    const reportEmployees = state.users
      .filter((user) => user.active && notebookEmployeeIds.has(user.id) && canViewUser(user))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
    return `
      <section class="panel daily-extra-section daily-extra-overview">
        <div class="daily-extra-head">
          <div>
            <h2>${canApproveExtras ? "المهام المستحدثة لجميع الموظفين" : "مهامي المستحدثة المحفوظة"}</h2>
            <p class="muted">عرض مستقل ومحفوظ حسب تاريخ المهمة: ${safe(formatDate(selectedDate))}.</p>
          </div>
          <div class="daily-extra-actions">
            <span class="role-pill">${safe(entries.length)} مهمة مستحدثة</span>
            ${canApproveExtras ? `<button class="btn success" type="button" ${pendingCount && !bulkBusy ? "" : "disabled"} onclick="actions.approveAllDailyExtraTasks('${safe(selectedDate)}')">${icons.approval} اعتماد كل المهام المستحدثة</button>` : ""}
          </div>
        </div>
        ${
          canApproveExtras
            ? `<div class="daily-extra-print-toolbar">
                <div class="daily-extra-print-title">
                  <strong>طباعة سجل المهام المستحدثة</strong>
                  <span class="muted">اختر موظفًا وفترة، أو اترك الموظف على الكل لطباعة جميع الموظفين.</span>
                </div>
                <label class="field">
                  <span>الموظف</span>
                  <select onchange="actions.setDailyExtraReportFilter('employeeId', this.value)">
                    <option value="all" ${reportFilters.employeeId === "all" ? "selected" : ""}>كل الموظفين</option>
                    ${reportEmployees.map((user) => `<option value="${safe(user.id)}" ${reportFilters.employeeId === user.id ? "selected" : ""}>${safe(user.name)}</option>`).join("")}
                  </select>
                </label>
                <label class="field"><span>من تاريخ</span><input type="date" value="${safe(reportFilters.from || selectedDate)}" onchange="actions.setDailyExtraReportFilter('from', this.value)" /></label>
                <label class="field"><span>إلى تاريخ</span><input type="date" value="${safe(reportFilters.to || selectedDate)}" onchange="actions.setDailyExtraReportFilter('to', this.value)" /></label>
                <button class="btn secondary" type="button" onclick="actions.printDailyExtraTasks()">${icons.reports} طباعة المهام المستحدثة</button>
              </div>`
            : ""
        }
        <div class="daily-extra-chart-panel">
          <div class="daily-extra-donut" style="--extra-approved:${safe(approvedAngle)}deg;">
            <strong>${safe(approvedCount)}</strong>
            <span>معتمدة</span>
          </div>
          <div class="daily-extra-chart-copy">
            <div class="daily-extra-chart-summary">
              <span class="status-pill status-approved">معتمدة: ${safe(approvedCount)}</span>
              <span class="status-pill status-new">قيد الاعتماد: ${safe(pendingCount)}</span>
            </div>
            <div class="daily-extra-employee-bars">
              ${employeeStats.length
                ? employeeStats.map((item) => `
                    <div class="daily-extra-employee-bar">
                      <span>${safe(item.name)}</span>
                      <div class="daily-extra-bar-track">
                        <i class="extra-bar-approved" style="width:${safe(Math.round((item.approved / Math.max(1, item.total)) * 100))}%"></i>
                        <i class="extra-bar-pending" style="width:${safe(Math.max(0, 100 - Math.round((item.approved / Math.max(1, item.total)) * 100)))}%"></i>
                      </div>
                      <strong>${safe(item.approved)}/${safe(item.total)}</strong>
                    </div>
                  `).join("")
                : `<span class="muted">لا توجد بيانات للرسم في هذا التاريخ.</span>`}
            </div>
            <div class="daily-chart-legend" aria-label="شرح ألوان المهام المستحدثة">
              <span><i class="legend-completed"></i> معتمدة</span>
              <span><i class="legend-pending"></i> قيد الاعتماد</span>
            </div>
          </div>
        </div>
        <div class="daily-extra-list">
          ${
            entries.length
              ? entries
                  .map((item) => {
                    const sourceTask = item.sourceTask;
                    const approved = Boolean(item.approvedAt);
                    return `
                      <article class="daily-extra-card">
                        <div>
                          <strong>${safe(item.title || "مهمة مستحدثة")}</strong>
                          ${item.text ? `<p>${safe(item.text)}</p>` : ""}
                          <div class="daily-extra-meta">
                            <span class="role-pill">الموظف: ${safe(item.employeeName)}</span>
                            <span class="muted">${approved ? `معتمدة بتاريخ ${safe(String(item.approvedAt).slice(0, 10))}` : "بانتظار اعتماد الإدارة"}</span>
                          </div>
                        </div>
                        <div class="daily-extra-actions">
                          <span class="status-pill ${approved ? "status-approved" : "status-new"}">${approved ? "معتمدة" : "قيد الاعتماد"}</span>
                          ${
                            canApproveExtras && sourceTask && canReadTask(sourceTask)
                              ? `<button class="btn success compact-btn" type="button" ${approved ? "disabled" : ""} onclick="actions.approveDailyExtraTask('${safe(item.taskId)}', '${safe(item.id)}')">${icons.approval} اعتماد</button>`
                              : ""
                          }
                        </div>
                      </article>
                    `;
                  })
                  .join("")
              : `<div class="empty">لا توجد مهام مستحدثة محفوظة لهذا التاريخ.</div>`
          }
        </div>
        ${renderDailyExtraEntry(groups)}
      </section>
    `;
  }

  function renderEmployeeDailyNotebook(group, selectedDate) {
    const { state, safe, icons, canApproveTasks, canEditTask, canActOnTask, formatDate, compareDate } = getContext();
    const summary = permanentDailySummary(group.tasks, selectedDate);
    const notDoneTasks = group.tasks.filter((task) => permanentDailyOutcome(task, selectedDate) === "not_done");
    const lockInfo = dailyNotebookLockInfo(group.userId, selectedDate);
    const readOnlyDaily = lockInfo.locked;
    const deputyOwnNotebook = isDeputyPrincipal(state.currentUser) && group.userId === state.currentUser?.id;
    const hasDailyRecordsToApprove = group.tasks.some((task) => permanentDailyRecord(task, selectedDate)?.status && !permanentDailyApproved(task, selectedDate));
    const canApproveGroup = !readOnlyDaily && canApproveTasks() && hasDailyRecordsToApprove;
    const notebookTaskNumber = permanentNotebookNumber(group.tasks[0] || {});
    const notebookEndDate = permanentNotebookEndDate(group.tasks);
    const notebookExpired = Boolean(notebookEndDate && compareDate(notebookEndDate, today()) < 0);
    const renewedEndDate = renewedPermanentNotebookEndDate(group.tasks);
    const canManageNotebook = !readOnlyDaily && group.tasks.length > 0 && group.tasks.every((task) => canEditTask(task));
    const lifecycleBusy = Boolean(state.taskActionBusy?.[`permanent-lifecycle:${group.userId}`]);
    return `
      <article class="panel employee-daily-notebook">
        <form class="employee-daily-form" onsubmit="actions.savePermanentDailyEntry(event)">
          <input type="hidden" name="date" value="${safe(selectedDate)}" />
          <input type="hidden" name="employeeId" value="${safe(group.userId)}" />
          <div class="employee-daily-head">
            <div class="employee-daily-title">
              <div class="daily-notebook-meta">
                ${notebookTaskNumber ? `<span class="role-pill">رقم المهمة: ${safe(notebookTaskNumber)}</span>` : ""}
                <span class="role-pill">الموظف المكلف: ${safe(group.name)}</span>
                <span class="role-pill">تاريخ الإنجاز: ${safe(formatDate(selectedDate))}</span>
              </div>
              ${summary.pending ? `<span class="status-pill status-new daily-notebook-pending">لم يتم التحديد: ${safe(summary.pending)}</span>` : ""}
              <span class="role-pill">${safe(permanentNotebookTitle(group.tasks[0] || {}))}</span>
              <strong class="employee-daily-name">${safe(group.name)}</strong>
              <h3>${safe(group.name)}</h3>
              <p class="muted">دفتر رسمي مستقل للموظف، تحفظ حالته بتاريخ اليوم وتبقى تقارير الأيام السابقة محفوظة.</p>
            </div>
            ${renderEmployeeDailyReport(group, selectedDate)}
          </div>
          ${
            notebookExpired
              ? `<div class="notebook-expiry-alert" role="alert">
                  <span class="notebook-expiry-icon">${icons.bell}</span>
                  <div class="notebook-expiry-copy">
                    <strong>انتهت فترة دفتر المهام</strong>
                    <p>انتهى الدفتر بتاريخ ${safe(formatDate(notebookEndDate))}. لم يُحذف الدفتر أو سجلاته السابقة، ويمكن تجديده لمدة 60 يومًا حتى ${safe(formatDate(renewedEndDate))} أو أرشفته.</p>
                  </div>
                  <div class="notebook-expiry-actions">
                    ${
                      canManageNotebook
                        ? `<button class="btn success" type="button" ${lifecycleBusy ? "disabled" : ""} onclick="actions.renewPermanentDailyNotebook('${safe(group.userId)}')">${icons.check} تجديد الفترة</button>
                           <button class="btn secondary" type="button" ${lifecycleBusy ? "disabled" : ""} onclick="actions.archivePermanentDailyNotebook('${safe(group.userId)}')">${icons.archive} أرشفة الدفتر</button>`
                        : `<span class="role-pill">بانتظار إجراء الإدارة</span>`
                    }
                  </div>
                </div>`
              : ""
          }
          <div class="employee-daily-actions">
            ${canManageNotebook ? `<button class="btn secondary" type="button" onclick="actions.openTask('${safe(group.tasks[0].id)}')">${icons.edit} تعديل الدفتر</button>` : ""}
            ${!readOnlyDaily ? `<button class="btn" type="submit">${icons.save} حفظ ورفع دفتر المهام للمدير</button>` : `<span class="role-pill">عرض فقط</span>`}
            ${!readOnlyDaily && canApproveTasks() ? `<button class="btn success" type="button" ${canApproveGroup ? "" : "disabled"} onclick="actions.approvePermanentDailyGroup('${safe(group.userId)}', '${safe(selectedDate)}')">${icons.approval} اعتماد كامل الدفتر</button>` : ""}
            <span class="role-pill">المهام: ${safe(summary.total)}</span>
            <span class="role-pill">المعتمد: ${safe(summary.approved)}</span>
          </div>
          ${lockInfo.message ? `<div class="notebook-lock-alert" role="alert">${safe(lockInfo.message)}</div>` : ""}
          ${
            notDoneTasks.length
              ? `<div class="not-done-panel">
                  <strong>المهام التي لم تنفذ</strong>
                  <div>${notDoneTasks.map((task) => `<span class="status-pill status-overdue">${safe(permanentNotebookItemTitle(task))}</span>`).join("")}</div>
                </div>`
              : ""
          }
          <div class="daily-paper-table daily-notebook-one-page">
            ${group.tasks.map(renderPermanentDailyRow).join("")}
          </div>
        </form>
      </article>
    `;
  }

  function permanentDailyStatusMatches(filterStatus, outcome) {
    if (filterStatus === "all") return true;
    if (filterStatus === "completed") return outcome === "completed";
    if (filterStatus === "overdue") return outcome === "not_done";
    if (filterStatus === "new") return !outcome;
    return false;
  }

  function filteredPermanentTaskRoots() {
    return permanentTaskRoots();
  }

  function taskWithPermanentDailyRecord(task, date, status, note) {
    const { state } = getContext();
    const dateKey = toDateKey(date);
    const currentRecord = permanentDailyRecord(task, dateKey);
    const nextComments = (task.comments || []).filter((comment) => !(comment.type === "permanent_daily" && toDateKey(comment.date || comment.at) === dateKey));
    const recordChanged = currentRecord?.status !== status || (currentRecord?.text || "") !== note;
    nextComments.push({
      id: currentRecord?.id || createUuid(),
      userId: state.currentUser.id,
      type: "permanent_daily",
      status,
      date: dateKey,
      text: note,
      at: dateKey,
      updatedAt: nowTimestamp(),
      approvedBy: recordChanged ? "" : currentRecord?.approvedBy || "",
      approvedAt: recordChanged ? "" : currentRecord?.approvedAt || "",
    });
    return normalizeTask({ ...task, comments: nextComments });
  }

  function taskWithPermanentDailyApproval(task, date) {
    const { state } = getContext();
    const dateKey = toDateKey(date);
    const currentRecord = permanentDailyRecord(task, dateKey);
    if (!currentRecord?.status) return task;
    const nextComments = (task.comments || []).filter((comment) => !(comment.type === "permanent_daily" && toDateKey(comment.date || comment.at) === dateKey));
    nextComments.push({
      ...currentRecord,
      approvedBy: state.currentUser.id,
      approvedAt: nowTimestamp(),
      updatedAt: nowTimestamp(),
    });
    return normalizeTask({ ...task, comments: nextComments });
  }

  function taskWithDailyExtraTask(task, date, title, details) {
    const { state } = getContext();
    const dateKey = toDateKey(date);
    return normalizeTask({
      ...task,
      comments: [
        ...(task.comments || []),
        {
          id: createUuid(),
          userId: state.currentUser.id,
          type: "daily_extra_task",
          title,
          text: details,
          status: "pending",
          date: dateKey,
          at: dateKey,
          updatedAt: nowTimestamp(),
          approvedBy: "",
          approvedAt: "",
        },
      ],
    });
  }

  function taskWithDailyExtraApproval(task, extraId) {
    const { state } = getContext();
    return normalizeTask({
      ...task,
      comments: (task.comments || []).map((comment) =>
        comment.type === "daily_extra_task" && comment.id === extraId
          ? { ...comment, status: "approved", approvedBy: state.currentUser.id, approvedAt: nowTimestamp(), updatedAt: nowTimestamp() }
          : comment,
      ),
    });
  }

  function latestComment(task) {
    return task.comments.filter((comment) => comment.type !== "permanent_daily").at(-1) || null;
  }

  function renderFilters(includeDates) {
    const { state, safe, departments, labels, taskStatuses, icons, canViewUser, schools, scopedSchoolId, schoolName } = getContext();
    const canChooseSchool = isGeneralManager(state.currentUser);
    const currentSchoolScope = scopedSchoolId();
    const filterSchools = canChooseSchool ? schools : schools.filter((school) => school.id === currentSchoolScope);
    return `
      <section class="task-filter-panel ${state.taskFiltersOpen ? "open" : ""}">
        <button class="btn secondary task-filter-panel-toggle" type="button" onclick="actions.toggleTaskFilters()">
          ${icons.search} بحث وفلترة المهام
        </button>
        <div class="toolbar task-filter-toolbar">
        <label class="field task-filter-school">
            <span>&#1575;&#1604;&#1601;&#1585;&#1593;</span>
            <select onchange="actions.setActiveSchool(this.value)" ${canChooseSchool ? "" : "disabled"}>
            ${canChooseSchool ? `<option value="all" ${state.activeSchoolId === "all" ? "selected" : ""}>&#1603;&#1604; &#1575;&#1604;&#1601;&#1585;&#1608;&#1593;</option>` : ""}
            ${
              filterSchools
                .map((school) => `<option value="${safe(school.id)}" ${(canChooseSchool ? state.activeSchoolId : currentSchoolScope) === school.id ? "selected" : ""}>${safe(school.name || schoolName(school.id))}</option>`)
                .join("") || `<option value="${safe(currentSchoolScope)}">${safe(schoolName(currentSchoolScope))}</option>`
            }
          </select>
        </label>
        <form class="actions" onsubmit="actions.searchTasks(event)">
          <label class="field task-filter-search"><span>البحث في المهام</span><input name="query" value="${safe(state.search)}" placeholder="عنوان المهمة أو الوصف" /></label>
          <button class="btn secondary task-filter-search-btn" type="submit">${icons.search} بحث</button>
        </form>
        <label class="field task-filter-assignee">
            <span>المكلف</span>
            <select onchange="actions.setFilter('assigneeId', this.value)">
            <option value="all">الكل</option>
            ${state.users.filter((user) => user.active && canViewUser(user)).map((user) => `<option value="${safe(user.id)}" ${state.filters.assigneeId === user.id ? "selected" : ""}>${safe(user.name)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
            <span>القسم</span>
            <select onchange="actions.setFilter('department', this.value)">
            <option value="all">الكل</option>
            ${departments.map((item) => `<option value="${safe(item)}" ${state.filters.department === item ? "selected" : ""}>${safe(item)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
            <span>الأولوية</span>
            <select onchange="actions.setFilter('priority', this.value)">
            <option value="all">الكل</option>
            ${["high", "medium", "low"].map((item) => `<option value="${item}" ${state.filters.priority === item ? "selected" : ""}>${safe(labels[item])}</option>`).join("")}
          </select>
        </label>
        <label class="field">
            <span>الحالة</span>
            <select onchange="actions.setFilter('status', this.value)">
            <option value="all">الكل</option>
            ${taskStatuses.map((item) => `<option value="${item}" ${state.filters.status === item ? "selected" : ""}>${safe(labels[item])}</option>`).join("")}
          </select>
        </label>
        <label class="field">
            <span>التكرار</span>
            <select onchange="actions.setFilter('recurrence', this.value)">
            <option value="all">الكل</option>
            ${["once", "daily"].map((item) => `<option value="${item}" ${state.filters.recurrence === item ? "selected" : ""}>${safe(labels[item])}</option>`).join("")}
          </select>
        </label>
        ${
            includeDates
            ? `<label class="field"><span>من</span><input type="date" value="${safe(state.filters.from)}" onchange="actions.setFilter('from', this.value)" /></label>
               <label class="field"><span>إلى</span><input type="date" value="${safe(state.filters.to)}" onchange="actions.setFilter('to', this.value)" /></label>`
            : ""
        }
        <button class="btn secondary task-filter-reset" type="button" onclick="actions.resetFilters()">إعادة تعيين الفلاتر</button>
        </div>
      </section>
    `;
  }

  function renderComments(task) {
    const { safe, getUser } = getContext();
    const comments = task.comments.filter((comment) => comment.type !== "permanent_daily").slice(-3).reverse();
    return `
      <div class="feedback task-comments-panel">
        <strong>التعليقات</strong>
        ${
          comments.length
            ? comments
                .map((comment) => `
                  <article class="task-comment-highlight">
                    <div class="task-comment-meta">
                      <strong>${safe(getUser(comment.userId)?.name || "مستخدم")}</strong>
                      <span>${safe(comment.at)}</span>
                    </div>
                    <p>${safe(comment.text)}</p>
                  </article>
                `)
                .join("")
            : `<p class="muted">لا توجد تعليقات بعد.</p>`
        }
      </div>
    `;
  }

  function renderApprovals(task) {
    const { safe, getUser, roleLabel } = getContext();
    const approvals = task.approvals.slice(-3).reverse();
    return `
      <div class="feedback">
        <strong>مسار الاعتماد</strong>
        <p class="muted">مطلوب: ${safe(task.approvalRequired ? "نعم" : "لا")} | دور المعتمد: ${safe(roleLabel(task.approverRole))}</p>
        ${
          approvals.length
            ? approvals
                .map((approval) => `<p><strong>${safe(getUser(approval.userId)?.name || approval.role)}</strong>: ${safe(({ approved: "تم الاعتماد", rejected: "تم الرفض", returned: "أُعيدت للمراجعة" }[approval.action] || "إجراء اعتماد"))} ${approval.comment ? `- ${safe(approval.comment)}` : ""} <span class="muted">(${safe(approval.at)})</span></p>`)
                .join("")
            : `<p class="muted">لا توجد إجراءات اعتماد حتى الآن.</p>`
        }
      </div>
    `;
  }

  function taskDisplayStatus(task) {
    const status = effectiveStatus(task);
    if (["completed", "approved", "under_review"].includes(status)) return { value: "done", label: "تم", className: "status-completed" };
    if (status === "in_progress") return { value: "in_progress", label: "قيد العمل", className: "status-in_progress" };
    return { value: "not_done", label: "لم يتم", className: "status-overdue" };
  }

  function renderTaskRow(task) {
    const { state, getUser, safe, icons, canEditTask, canDeleteTask, canActOnTask, canApproveTask, formatDate } = getContext();
    const assignee = getUser(task.assigneeId);
    const displayStatus = taskDisplayStatus(task);
    const canAct = canActOnTask(task);
    const canEdit = canEditTask(task);
    const canRemove = canDeleteTask(task);
    const canApprove = canApproveTask(task);
    const actionBusy = Boolean(state.taskActionBusy?.[task.id]);
    const hasApproval = (task.approvals || []).some((approval) => approval.action === "approved");
    const approvalControl = !task.approvalRequired
      ? `<span class="status-pill status-new">غير مطلوب</span>`
      : hasApproval
        ? `<span class="status-pill status-approved">معتمد</span>`
        : canApprove
          ? `<button class="btn success compact-btn" type="button" ${actionBusy ? "disabled" : ""} onclick="actions.approveTask('${safe(task.id)}')">${icons.approval} اعتماد</button>`
          : `<span class="status-pill status-under_review">بانتظار الاعتماد</span>`;
    return `
      <div class="task-table-row">
        <div class="task-table-title" data-label="المهمة">
          <strong>${safe(task.title)}</strong>
          <span>${safe(task.taskNumber)} · ${safe(formatDate(task.occurrenceDate || task.dueDate))}</span>
        </div>
        <div class="task-table-assignee" data-label="الموظف">
          <span class="task-assignee-icon" aria-hidden="true">${icons.users}</span>
          <strong>${safe(assignee?.name || "غير مسندة")}</strong>
        </div>
        <div class="task-table-status" data-label="الحالة">
          ${canAct
            ? `<select class="compact-status-select ${displayStatus.className}" aria-label="حالة المهمة" ${actionBusy ? "disabled" : ""} onchange="actions.setTaskDisplayStatus('${safe(task.id)}', this.value)">
                <option value="not_done" ${displayStatus.value === "not_done" ? "selected" : ""}>لم يتم</option>
                <option value="in_progress" ${displayStatus.value === "in_progress" ? "selected" : ""}>قيد العمل</option>
                <option value="done" ${displayStatus.value === "done" ? "selected" : ""}>تم</option>
              </select>`
            : `<span class="status-pill ${displayStatus.className}">${displayStatus.label}</span>`}
        </div>
        <div class="task-table-approval" data-label="الاعتماد">${approvalControl}</div>
        <div class="task-table-actions" data-label="الإجراءات">
          ${canEdit ? `<button class="icon-btn" type="button" ${actionBusy ? "disabled" : ""} title="تعديل المهمة" aria-label="تعديل المهمة" onclick="actions.openTask('${safe(task.id)}')">${icons.edit}</button>` : ""}
          ${canRemove ? `<button class="icon-btn danger-icon" type="button" ${actionBusy ? "disabled" : ""} title="حذف المهمة" aria-label="حذف المهمة" onclick="actions.deleteTask('${safe(task.id)}')">${icons.trash}</button>` : ""}
          ${!canEdit && !canRemove ? `<span class="muted">عرض فقط</span>` : ""}
        </div>
      </div>
    `;
  }

  function renderTaskCard(task) {
    const { state, getUser, labels, safe, icons, canEditTask, canDeleteTask, canActOnTask, canApproveTask, attachments, formatDate } = getContext();
    const assignee = getUser(task.assigneeId);
    const status = effectiveStatus(task);
    const displayStatus = taskDisplayStatus(task);
    const actionBusy = Boolean(state.taskActionBusy?.[task.id]);
    const canEditTaskDefinition = canEditTask(task);
    const canAct = canActOnTask(task);
    const canApprove = canApproveTask(task);
    const canArchive = canEditTask(task) && status !== "archived";
    const canRemoveTask = canDeleteTask(task);
    const hasApproval = (task.approvals || []).some((approval) => approval.action === "approved");
    const approvalLabel = !task.approvalRequired ? "لا يحتاج اعتماد" : hasApproval ? "معتمد" : "بانتظار الاعتماد";
    return `
      <article class="task-card task-card-pro">
        <header class="task-card-pro-head">
          <div class="task-card-title-block">
            <span class="task-card-number">${safe(task.taskNumber)}</span>
            <h3>${safe(task.title)}</h3>
            <p>${safe(task.description || "لا يوجد وصف مضاف.")}</p>
          </div>
          <span class="task-card-status ${displayStatus.className}">${safe(displayStatus.label)}</span>
        </header>
        <div class="task-card-info-grid">
          <div><span>الموظف</span><strong>${safe(assignee?.name || "غير مسندة")}</strong></div>
          <div><span>التاريخ</span><strong>${safe(task.occurrenceDate ? formatDate(task.occurrenceDate) : formatDate(task.dueDate))}</strong></div>
          <div><span>القسم</span><strong>${safe(task.department)}</strong></div>
          <div><span>النوع</span><strong>${safe(labels[task.recurrence])}</strong></div>
        </div>
        <div class="task-card-chip-row">
          <span class="priority-pill priority-${safe(task.priority)}">${safe(labels[task.priority])}</span>
          <span class="status-pill status-${safe(status)}">${safe(labels[status])}</span>
          <span class="role-pill">${safe(approvalLabel)}</span>
        </div>
        <details class="task-card-more">
          <summary>التفاصيل والتعليقات</summary>
          ${renderComments(task)}
          ${attachments.renderAttachments(task)}
          ${renderApprovals(task)}
        </details>
        <div class="card-actions task-card-actions task-card-pro-actions">
          ${
            canAct
              ? `
                <button class="btn secondary" type="button" ${actionBusy || ["in_progress", "under_review", "approved", "completed", "archived"].includes(status) ? "disabled" : ""} onclick="actions.updateStatus('${safe(task.id)}', 'in_progress')">${icons.tasks} بدء</button>
                <button class="btn secondary" type="button" ${actionBusy || ["under_review", "approved", "completed", "archived"].includes(status) ? "disabled" : ""} onclick="actions.updateStatus('${safe(task.id)}', 'under_review')">${icons.approval} إرسال للمراجعة</button>
                <button class="btn success" type="button" ${actionBusy || ["completed", "archived"].includes(status) || task.approvalRequired ? "disabled" : ""} onclick="actions.updateStatus('${safe(task.id)}', 'completed')">${icons.check} إكمال</button>
                ${status === "completed" ? `<button class="btn secondary" type="button" ${actionBusy ? "disabled" : ""} onclick="actions.reopenTask('${safe(task.id)}')">${icons.tasks} إعادة فتح</button>` : ""}
                <button class="btn secondary" type="button" ${actionBusy ? "disabled" : ""} onclick="actions.openFeedback('${safe(task.id)}')">${icons.message} تعليق</button>
              `
              : ""
          }
          ${canApprove ? `<button class="btn success" type="button" ${actionBusy || ["approved", "completed", "archived"].includes(status) ? "disabled" : ""} onclick="actions.approveTask('${safe(task.id)}')">${icons.approval} اعتماد</button>` : ""}
          ${canArchive ? `<button class="btn secondary" type="button" ${actionBusy ? "disabled" : ""} onclick="actions.archiveTask('${safe(task.id)}')">${icons.archive} أرشفة</button>` : ""}
          ${canEditTaskDefinition ? `<button class="icon-btn" type="button" ${actionBusy ? "disabled" : ""} title="تعديل المهمة" aria-label="تعديل المهمة" onclick="actions.openTask('${safe(task.id)}')">${icons.edit}</button>` : ""}
          ${canRemoveTask ? `<button class="icon-btn danger-icon" type="button" ${actionBusy ? "disabled" : ""} title="حذف المهمة" aria-label="حذف المهمة" onclick="actions.deleteTask('${safe(task.id)}')">${icons.trash}</button>` : ""}
        </div>
      </article>
    `;
  }

  function renderPermanentDailyRow(task, index = 0) {
    const { state, safe, canActOnTask } = getContext();
    const selectedDate = permanentTaskDate();
    const outcome = permanentDailyOutcome(task, selectedDate);
    const note = permanentDailyNote(task, selectedDate);
    const approved = permanentDailyApproved(task, selectedDate);
    const busyKey = `permanent:${task.id}:${selectedDate}`;
    const actionBusy = Boolean(state.taskActionBusy?.[busyKey]);
    const readOnlyDaily = isDailyNotebookReadOnly(task, selectedDate);
    const deputyOwnNotebook = isDeputyPrincipal(state.currentUser) && task.assigneeId === state.currentUser?.id;
    const canSave = !readOnlyDaily && canActOnTask(task);
    const statusDisabled = actionBusy || !canSave ? "disabled" : "";
    const noteDisabled = actionBusy || !canSave || deputyOwnNotebook ? "disabled" : "";
    const checked = outcome === "not_done" ? "" : "checked";
    const stateClass = outcome === "not_done" ? "is-not-done" : outcome === "completed" ? "is-completed" : "is-pending";
    const statusText = outcome === "not_done" ? "لم يتم تفعيلها" : outcome === "completed" ? "تم تفعيلها" : "";
    return `
      <div class="permanent-daily-row daily-paper-row notebook-check-row ${stateClass} ${approved ? "is-approved" : ""}">
        <input type="hidden" name="taskId" value="${safe(task.id)}" />
        <input type="hidden" name="note-${safe(task.id)}" value="${safe(note)}" />
        <label class="notebook-check-option" aria-label="${safe(permanentNotebookItemTitle(task))}">
          <span class="notebook-line-number">${safe(index + 1)}</span>
          <input type="checkbox" name="outcome-${safe(task.id)}" value="completed" ${checked} ${statusDisabled} />
          <span class="notebook-check-box" aria-hidden="true"></span>
          <span class="notebook-check-copy">
            <strong>${safe(permanentNotebookItemTitle(task))}</strong>
            ${task.description ? `<small>${safe(task.description)}</small>` : ""}
            ${note ? `<small class="notebook-saved-note">ملاحظة: ${safe(note)}</small>` : ""}
            ${statusText ? `<em>${safe(statusText)}</em>` : ""}
          </span>
        </label>
        ${actionBusy ? `<span class="role-pill">جاري الحفظ...</span>` : ""}
      </div>
    `;
  }

  function renderDailyNotebook(options = {}) {
    const { state, safe, icons, canCreateTasks, canApproveTasks } = getContext();
    const compact = Boolean(options.compact);
    const selectedDate = permanentTaskDate();
    const cutoffTime = dailyNotebookCutoffTime();
    const globalLockInfo = dailyNotebookLockInfo(null, selectedDate);
    const tasks = permanentTaskRootsForDate(selectedDate);
    const allGroups = permanentDailyEmployeeGroups(tasks);
    const selectedEmployeeId = allGroups.some((group) => group.userId === state.dailyNotebookEmployeeId) ? state.dailyNotebookEmployeeId : "all";
    if (state.dailyNotebookEmployeeId !== selectedEmployeeId) state.dailyNotebookEmployeeId = selectedEmployeeId;
    const groups = selectedEmployeeId === "all" ? allGroups : allGroups.filter((group) => group.userId === selectedEmployeeId);
    const visibleTasks = groups.flatMap((group) => group.tasks);
    const summary = permanentDailySummary(visibleTasks, selectedDate);
    const hasNotebooksToApprove = allGroups.some((group) => group.tasks.some((task) => permanentDailyRecord(task, selectedDate)?.status && !permanentDailyApproved(task, selectedDate)));
    const approveAllBusy = Boolean(state.taskActionBusy?.[`permanent-approve-all:${selectedDate}`]);
    return `
      <section class="permanent-daily-section">
        <div class="section-title">
          <h2>دفتر المهام اليومية</h2>
          <p class="muted">يتم إدخال مهام الدفتر مرة واحدة خلال السنة، ثم تظهر يوميًا لكل مستخدم مع متابعة مستقلة حسب التاريخ.</p>
        </div>
        <div class="toolbar daily-toolbar">
          <label class="field"><span>تاريخ المتابعة</span><input type="date" value="${safe(selectedDate)}" onchange="actions.setPermanentTaskDate(this.value)" /></label>
          ${
            canCreateTasks("notebook")
              ? `<label class="field daily-cutoff-field"><span>إغلاق الرفع عند</span><input type="time" value="${safe(cutoffTime)}" onchange="actions.setDailyNotebookCutoffTime(this.value)" /></label>`
              : `<span class="role-pill">إغلاق الرفع: ${safe(cutoffTime)}</span>`
          }
          <div class="daily-summary">
            <span class="status-pill status-completed">تم: ${safe(summary.completed)}</span>
            <span class="status-pill status-overdue">لم يتم: ${safe(summary.notDone)}</span>
            <span class="status-pill status-new">غير محدد: ${safe(summary.pending)}</span>
            <span class="status-pill status-approved">معتمد: ${safe(summary.approved)}</span>
          </div>
          <button class="btn secondary" type="button" onclick="actions.setReportConfig('type', 'daily_notebook'); actions.setView('reports')">${icons.reports} تقرير الدفتر</button>
          ${canApproveTasks() ? `<button class="btn success" type="button" ${hasNotebooksToApprove && !approveAllBusy ? "" : "disabled"} onclick="actions.approveAllPermanentDailyNotebooks('${safe(selectedDate)}')">${icons.approval} اعتماد كل الدفاتر</button>` : ""}
          ${canCreateTasks("notebook") && allGroups.length ? `<button class="btn secondary" type="button" onclick="actions.openNotebookAssignment()">${icons.notebook} إسناد دفتر جاهز</button>` : ""}
          ${canCreateTasks("notebook") ? `<button class="btn" type="button" onclick="actions.openTask('', 'permanent')">${icons.plus} إضافة دفتر المهام اليومية</button>` : ""}
        </div>
        ${globalLockInfo.message ? `<div class="notebook-lock-alert notebook-lock-alert-global" role="alert">${safe(globalLockInfo.message)}</div>` : ""}
        ${
          allGroups.length > 1
            ? `<div class="panel daily-notebook-filter">
                <label class="field">
                  <span>فلترة الدفاتر</span>
                  <select onchange="actions.setDailyNotebookFilter(this.value)">
                    <option value="all" ${selectedEmployeeId === "all" ? "selected" : ""}>كل دفاتر المهام</option>
                    ${allGroups.map((group) => `<option value="${safe(group.userId)}" ${selectedEmployeeId === group.userId ? "selected" : ""}>${safe(group.name)}</option>`).join("")}
                  </select>
                </label>
                <span class="role-pill">المعروض: ${safe(groups.length)} من ${safe(allGroups.length)}</span>
              </div>`
            : ""
        }
        <div class="permanent-daily-list">
          ${groups.length
            ? groups.map((group) => renderEmployeeDailyNotebook(group, selectedDate)).join("")
            : `<div class="panel empty">لا توجد مهام في دفتر المهام اليومية لهذا التاريخ أو الفلاتر.</div>`}
        </div>
        ${renderPermanentDailyReport(visibleTasks, selectedDate)}
        ${renderAllDailyExtraTasks(allGroups, selectedDate)}
      </section>
    `;
  }

  function renderPermanentDailyTasks() {
    return renderDailyNotebook();
  }

  function renderTasks() {
    const { paginate, state, canCreateTasks, icons, renderPagination, safe } = getContext();
    const managerView = ["general_manager", "school_principal"].includes(normalizeRole(state.currentUser?.role, ""));
    const pageInfo = paginate(filteredTasks(standardWorkTasks()), state.pagination.tasksPage, managerView ? 20 : 6);
    const employeeAssignedCount = managerView ? 0 : standardWorkTasks().filter((task) => task.assigneeId === state.currentUser?.id).length;
    return `
      <div class="topbar">
        <div class="section-title">
          <h2>المهام</h2>
          <p class="muted">متابعة المهمة والموظف والحالة والاعتماد في عرض موحد وسريع.</p>
        </div>
        <div class="actions">
          ${canCreateTasks() ? `<button class="btn" onclick="actions.openTask()">${icons.plus} إضافة مهمة</button>` : ""}
        </div>
      </div>
      ${renderFilters(true)}
      ${
        managerView
          ? ""
          : `<div class="task-assignee-banner worker-task-banner">
              <span class="task-assignee-icon" aria-hidden="true">${icons.users}</span>
              <div class="task-assignee-copy">
                <span>المهام المسندة لك</span>
                <strong>${safe(state.currentUser?.name || "الموظف")} - ${safe(employeeAssignedCount)} مهمة نشطة أو متأخرة</strong>
              </div>
            </div>`
      }
      <div class="task-sections">
        <section>
          <div class="section-title">
            <h2>المهام العامة</h2>
            <p class="muted">القسم الحالي للمهام العادية واليومية غير الدائمة.</p>
          </div>
          ${
            `<div class="grid task-list task-card-list ${managerView ? "manager-task-card-list" : "user-task-card-list"}">
              ${pageInfo.items.map(renderTaskCard).join("") || `<div class="panel empty">لا توجد مهام مطابقة للفلاتر المحددة.</div>`}
            </div>`
          }
          ${renderPagination(pageInfo, "tasksPage")}
        </section>
      </div>
    `;
  }

  function initialTaskSchoolId(task = {}) {
    const { state } = getContext();
    if (task.schoolId) return task.schoolId;
    if (isGeneralManager(state.currentUser) && state.activeSchoolId !== "all") return state.activeSchoolId;
    return isGeneralManager(state.currentUser) ? "" : state.currentUser?.schoolId || "";
  }

  function taskAssignableSchools(selectedSchoolId = "") {
    const { schools, canCreateTasks, schoolName } = getContext();
    const visibleSchools = schools.filter((school) => canCreateTasks({ schoolId: school.id }));
    if (selectedSchoolId && !visibleSchools.some((school) => school.id === selectedSchoolId)) {
      visibleSchools.push({ id: selectedSchoolId, name: schoolName(selectedSchoolId) });
    }
    return visibleSchools;
  }

  function taskAssignableUsers(schoolIds, recurrence = "once") {
    const { state, canAssignTask } = getContext();
    const allowedSchools = new Set(schoolIds);
    const schoolOrder = new Map(schoolIds.map((schoolId, index) => [schoolId, index]));
    return state.users
      .filter((user) => user.active && allowedSchools.has(user.schoolId) && canAssignTask({ schoolId: user.schoolId, recurrence }, user))
      .sort((a, b) => {
        const schoolCompare = (schoolOrder.get(a.schoolId) ?? 999) - (schoolOrder.get(b.schoolId) ?? 999);
        if (schoolCompare) return schoolCompare;
        const roleCompare = roleRank(b.role) - roleRank(a.role);
        if (roleCompare) return roleCompare;
        return String(a.name || "").localeCompare(String(b.name || ""), "ar", { sensitivity: "base" });
      });
  }

  function filterTaskAssigneesBySchool(schoolId, form = null) {
    const targetForm = form || document.querySelector("[data-task-form]");
    const assigneeSelect = targetForm?.elements?.assigneeIds || targetForm?.elements?.assigneeId;
    if (!assigneeSelect) return;
    let visibleCount = 0;
    Array.from(assigneeSelect.options).forEach((option) => {
      if (!option.value) {
        option.hidden = false;
        option.disabled = false;
        return;
      }
      const isVisible = option.dataset.schoolId === schoolId;
      option.hidden = !isVisible;
      option.disabled = !isVisible;
      if (isVisible) visibleCount += 1;
    });
    Array.from(assigneeSelect.selectedOptions || []).forEach((selectedOption) => {
      if (selectedOption?.value && selectedOption.dataset.schoolId !== schoolId) selectedOption.selected = false;
    });
    const emptyMessage = targetForm.querySelector("[data-task-assignee-empty]");
    if (emptyMessage) {
      emptyMessage.hidden = visibleCount > 0;
      emptyMessage.textContent = schoolId ? "لا يوجد موظفون نشطون في هذا الفرع." : "اختر الفرع أولًا لعرض الموظفين.";
    }
  }

  function isTaskModalReadOnly(id = "") {
    const { state } = getContext();
    return state.modal?.type === "task" && state.modal?.readOnly === true && (!id || state.modal.id === id);
  }

  function renderTaskModal(id) {
    const { state, safe, roleLabel, icons, departments, labels, taskCreationStatuses, roleGroups, attachments, schoolName } = getContext();
    const task = state.tasks.find((item) => item.id === id) || {};
    const readOnly = isTaskModalReadOnly(id);
    const defaultRecurrence = !id && ["once", "daily", "permanent"].includes(state.modal?.recurrence) ? state.modal.recurrence : "once";
    const isDailyNotebook = defaultRecurrence === "permanent" || task.recurrence === "permanent";
    const yearEndDate = `${today().slice(0, 4)}-12-31`;
    const selectedSchoolId = initialTaskSchoolId(task);
    const assignableSchools = taskAssignableSchools(selectedSchoolId);
    const assignableSchoolIds = assignableSchools.map((school) => school.id);
    const assignableUsers = taskAssignableUsers(assignableSchoolIds, isDailyNotebook ? "permanent" : task.recurrence || defaultRecurrence);
    const visibleAssigneeCount = assignableUsers.filter((user) => user.schoolId === selectedSchoolId).length;
    const schoolOptions = [
      isGeneralManager(state.currentUser) ? `<option value="" ${selectedSchoolId ? "" : "selected"}>اختر الفرع</option>` : "",
      ...assignableSchools.map((school) => `<option value="${safe(school.id)}" ${selectedSchoolId === school.id ? "selected" : ""}>${safe(school.name || schoolName(school.id))}</option>`),
    ].join("");
    const assigneeOptions = assignableUsers
      .map((user) => {
        const visible = user.schoolId === selectedSchoolId;
        return `<option value="${safe(user.id)}" data-school-id="${safe(user.schoolId)}" ${visible ? "" : "hidden disabled"} ${task.assigneeId === user.id ? "selected" : ""}>${safe(user.name)} (${safe(roleLabel(user.role))})</option>`;
      })
      .join("");
    const approvalRoleOptions = roleGroups.approveTasks.map((role) => `<option value="${role}" ${(task.approverRole || "school_principal") === role ? "selected" : ""}>${safe(roleLabel(role))}</option>`).join("");
    const modalTitle = readOnly ? "عرض المهمة" : isDailyNotebook ? (id ? "تعديل دفتر المهام اليومية" : "إضافة دفتر المهام اليومية") : (id ? "تعديل المهمة" : "إنشاء مهمة");
    const notebookEditItems = isDailyNotebook && id ? notebookSiblingTasks(task) : [];
    const notebookBuilderRows = notebookEditItems.length
      ? notebookEditItems.map((item) => `
          <div class="notebook-item-row">
            <input type="hidden" name="notebookTaskId" value="${safe(item.id)}" />
            <label class="field"><span>المهمة</span><input name="notebookItemTitle" value="${safe(permanentNotebookItemTitle(item))}" required /></label>
            <label class="field"><span>تفاصيل المهمة</span><textarea name="notebookItemDescription">${safe(item.description || "")}</textarea></label>
            <button class="icon-btn danger-icon" type="button" title="حذف البند" aria-label="حذف البند" onclick="actions.removeNotebookItemRow(this)">${icons.trash}</button>
          </div>
        `).join("")
      : `<div class="notebook-item-row">
          <input type="hidden" name="notebookTaskId" value="" />
          <label class="field"><span>المهمة</span><input name="notebookItemTitle" required /></label>
          <label class="field"><span>تفاصيل المهمة</span><textarea name="notebookItemDescription"></textarea></label>
          <button class="icon-btn danger-icon" type="button" title="حذف البند" aria-label="حذف البند" onclick="actions.removeNotebookItemRow(this)">${icons.trash}</button>
        </div>`;
    return `
      <div class="modal">
        <form class="modal-box" data-task-form onsubmit="${readOnly ? "event.preventDefault(); return false;" : "actions.saveTask(event)"}">
          <div class="modal-head">
            <h3>${safe(modalTitle)}</h3>
            <button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button>
          </div>
          <input type="hidden" name="id" value="${safe(task.id || "")}" />
          ${readOnly ? `<div class="notice success"><strong>عرض فقط</strong><p>تم فتح هذه المهمة من التنبيهات للاطلاع فقط، ولا يمكن تعديل البيانات من هذه النافذة.</p></div>` : ""}
          <input type="hidden" name="department" value="${safe(taskDepartmentValue({ ...task, schoolId: selectedSchoolId }) || departments[0] || "الإدارة")}" />
          <fieldset class="form-grid task-readonly-fieldset" ${readOnly ? "disabled" : ""}>
            <label class="field"><span>رقم المهمة</span><input name="taskNumber" value="${safe((isDailyNotebook ? permanentNotebookNumber(task) : task.taskNumber) || generateTaskNumber(today(), createUuid()))}" readonly /></label>
            <label class="field"><span>تحديد الفرع</span><select name="schoolId" required onchange="actions.filterTaskAssigneesBySchool(this.value, this.form)">${schoolOptions}</select></label>
            ${isDailyNotebook
              ? `<div class="notebook-builder wide">
                  <label class="field"><span>عنوان الدفتر</span><input name="notebookTitle" value="${safe(id ? permanentNotebookTitle(task) : "دفتر المهام اليومية")}" required /></label>
                  <div class="notebook-items" data-notebook-items>
                    ${notebookBuilderRows}
                  </div>
                  <button class="btn secondary" type="button" onclick="actions.addNotebookItemRow(this)">${icons.plus} إضافة بند جديد</button>
                </div>
                <input type="hidden" name="title" value="دفتر المهام اليومية" />
                <input type="hidden" name="description" value="" />`
              : `<label class="field wide"><span>${isDailyNotebook ? "المهمة" : "عنوان المهمة"}</span><input name="title" value="${safe(permanentNotebookItemTitle(task) || "")}" required /></label>
                <label class="field wide"><span>${isDailyNotebook ? "تفاصيل المهمة" : "الوصف"}</span><textarea name="description">${safe(task.description || "")}</textarea></label>
                ${isDailyNotebook ? `<label class="field wide"><span>عنوان الدفتر</span><input name="notebookTitle" value="${safe(permanentNotebookTitle(task))}" required /></label>` : ""}`}
            ${
              isDailyNotebook
                ? ""
                : `<label class="field">
                    <span>الأولوية</span>
                    <select name="priority">${["high", "medium", "low"].map((item) => `<option value="${item}" ${task.priority === item ? "selected" : ""}>${safe(labels[item])}</option>`).join("")}</select>
                  </label>
                  <label class="field">
                    <span>الحالة</span>
                    <select name="status">${taskCreationStatuses.map((item) => `<option value="${item}" ${(task.status || "new") === item ? "selected" : ""}>${safe(labels[item])}</option>`).join("")}</select>
                  </label>`
            }
            <label class="field">
              <span>التكرار</span>
              ${isDailyNotebook
                ? `<input value="دفتر المهام اليومية السنوي" readonly /><input type="hidden" name="recurrence" value="permanent" />`
                : `<select name="recurrence">${["once", "daily"].map((item) => `<option value="${item}" ${(task.recurrence || defaultRecurrence) === item ? "selected" : ""}>${safe(labels[item])}</option>`).join("")}</select>`}
            </label>
            <label class="field">
              <span>المكلف</span>
              <select name="assigneeIds" required data-task-assignee-select multiple size="6">
                <option value="">اختر موظفًا</option>
                ${assigneeOptions}
              </select>
              <p class="muted">يمكن اختيار أكثر من موظف عند إنشاء المهمة، وسيتم إنشاء مهمة مستقلة لكل موظف.</p>
              <p class="muted" data-task-assignee-empty ${visibleAssigneeCount ? "hidden" : ""}>${selectedSchoolId ? "لا يوجد موظفون نشطون في هذا الفرع." : "اختر الفرع أولًا لعرض الموظفين."}</p>
            </label>
            <label class="field"><span>${isDailyNotebook ? "نهاية سنة الدفتر" : "تاريخ الاستحقاق أو بدء المهمة المستمرة"}</span><input type="date" name="dueDate" value="${safe(task.dueDate || (isDailyNotebook ? yearEndDate : today()))}" required /></label>
            <label class="field">
              <span>يتطلب اعتمادًا</span>
              <select name="approvalRequired">
                <option value="true" ${task.approvalRequired !== false ? "selected" : ""}>نعم</option>
                <option value="false" ${task.approvalRequired === false ? "selected" : ""}>لا</option>
              </select>
            </label>
            <label class="field">
              <span>دور المعتمد</span>
              <select name="approverRole">${approvalRoleOptions}</select>
            </label>
            <label class="field wide">
              <span>المرفقات</span>
              <input type="file" id="task-upload-input" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx" multiple onchange="actions.captureFiles(event)" />
            </label>
          </fieldset>
          ${readOnly ? "" : attachments.renderPendingFiles()}
          ${attachments.renderAttachments(task, { compact: true, allowDelete: !readOnly })}
          <div class="actions" style="margin-top:14px;">
            ${readOnly ? `<button class="btn secondary" type="button" onclick="actions.closeModal()">${icons.close} إغلاق</button>` : `<button class="btn" type="submit">${icons.save} حفظ المهمة</button>`}
          </div>
        </form>
      </div>
    `;
  }

  function renderNotebookAssignmentModal() {
    const { state, safe, icons, roleLabel, schoolName, canCreateTasks, canAssignTask } = getContext();
    const canAssignAcrossBranches = isGeneralManager(state.currentUser);
    const sourceGroups = permanentDailyEmployeeGroups(permanentTaskRoots()).filter((group) => {
      const sourceTask = group.tasks[0];
      return sourceTask && canCreateTasks({ schoolId: sourceTask.schoolId, recurrence: "permanent" });
    });
    const activeNotebookEmployeeIds = new Set(permanentTaskRoots().map((task) => task.assigneeId).filter(Boolean));
    const sourceGroup = sourceGroups[0] || null;
    const sourceSchoolId = sourceGroup?.tasks[0]?.schoolId || "";
    const targetUsers = state.users
      .filter((user) => user.active && !activeNotebookEmployeeIds.has(user.id))
      .filter((user) => !["general_manager", "school_principal"].includes(user.role))
      .filter((user) => canAssignAcrossBranches || user.schoolId === sourceSchoolId)
      .filter((user) => canCreateTasks({ schoolId: sourceGroup?.tasks[0]?.schoolId || user.schoolId, recurrence: "permanent" }) || canAssignTask({ schoolId: user.schoolId, recurrence: "permanent" }, user))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar", { sensitivity: "base" }));
    const visibleTargetCount = targetUsers.length;
    const sourceOptions = sourceGroups.map((group) => {
      const sourceTask = group.tasks[0];
      const endDate = assignedPermanentNotebookEndDate(group.tasks);
      return `<option value="${safe(group.userId)}" data-school-id="${safe(sourceTask.schoolId)}" data-due-date="${safe(endDate)}" data-item-count="${safe(group.tasks.length)}">${safe(group.name)} - ${safe(permanentNotebookTitle(sourceTask))} (${safe(schoolName(sourceTask.schoolId))})</option>`;
    }).join("");
    const targetOptions = targetUsers.map((user) => {
      return `<option value="${safe(user.id)}" data-school-id="${safe(user.schoolId)}">${safe(user.name)} - ${safe(schoolName(user.schoolId))} (${safe(roleLabel(user.role))})</option>`;
    }).join("");
    return `
      <div class="modal">
        <form class="modal-box" data-notebook-assignment-form onsubmit="actions.saveAssignedNotebook(event)">
          <div class="modal-head">
            <h3>إسناد دفتر مهام جاهز</h3>
            <button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button>
          </div>
          ${
            sourceGroup
              ? `<div class="notebook-assignment-summary">
                  <span class="notebook-assignment-summary-icon">${icons.notebook}</span>
                  <div>
                    <strong>نسخة مستقلة للموظف الجديد</strong>
                    <p>سيتم نسخ بنود الدفتر ووصفها فقط، دون نسخ الإنجاز أو الملاحظات اليومية أو الاعتمادات السابقة.</p>
                  </div>
                </div>
                <div class="form-grid">
                  <label class="field wide">
                    <span>الدفتر الجاهز</span>
                    <select name="sourceEmployeeId" required onchange="actions.updateNotebookAssignmentSource(this, this.form)">${sourceOptions}</select>
                  </label>
                  <label class="field wide">
                    <span>الموظف الجديد</span>
                    <select name="targetEmployeeId" required>
                      <option value="">اختر الموظف</option>
                      ${targetOptions}
                    </select>
                    <p class="muted" data-notebook-assignment-empty ${visibleTargetCount ? "hidden" : ""}>${canAssignAcrossBranches ? "لا يوجد موظف متاح دون دفتر نشط في الفروع." : "لا يوجد موظف متاح دون دفتر نشط في نفس فرع الدفتر."}</p>
                  </label>
                  <label class="field"><span>نهاية سنة الدفتر الجديد</span><input type="date" name="dueDate" min="${safe(today())}" value="${safe(assignedPermanentNotebookEndDate(sourceGroup.tasks))}" required /></label>
                  <div class="notebook-assignment-count"><span>عدد البنود</span><strong data-notebook-assignment-count>${safe(sourceGroup.tasks.length)}</strong></div>
                </div>
                <div class="actions" style="margin-top:14px;">
                  <button class="btn" type="submit">${icons.check} إسناد الدفتر للموظف</button>
                </div>`
              : `<div class="empty">لا يوجد دفتر جاهز متاح للإسناد حاليًا.</div>`
          }
        </form>
      </div>
    `;
  }

  function updateNotebookAssignmentSource(select, form = null) {
    const targetForm = form || select?.form || document.querySelector("[data-notebook-assignment-form]");
    const sourceOption = select?.selectedOptions?.[0];
    const targetSelect = targetForm?.elements?.targetEmployeeId;
    if (!sourceOption || !targetSelect) return;
    const schoolId = sourceOption.dataset.schoolId || "";
    const canAssignAcrossBranches = isGeneralManager(getContext().state.currentUser);
    let visibleCount = 0;
    Array.from(targetSelect.options).forEach((option) => {
      if (!option.value) return;
      const visible = canAssignAcrossBranches || option.dataset.schoolId === schoolId;
      option.hidden = !visible;
      option.disabled = !visible;
      if (visible) visibleCount += 1;
      if (!visible && option.selected) option.selected = false;
    });
    targetSelect.value = "";
    if (targetForm.elements.dueDate) targetForm.elements.dueDate.value = sourceOption.dataset.dueDate || `${today().slice(0, 4)}-12-31`;
    const count = targetForm.querySelector("[data-notebook-assignment-count]");
    if (count) count.textContent = sourceOption.dataset.itemCount || "0";
    const emptyMessage = targetForm.querySelector("[data-notebook-assignment-empty]");
    if (emptyMessage) emptyMessage.hidden = visibleCount > 0;
  }

  function renderFeedbackModal(id) {
    const { state, safe, icons } = getContext();
    const task = state.tasks.find((item) => item.id === id);
    return `
      <div class="modal">
        <form class="modal-box" onsubmit="actions.addFeedback(event)">
          <div class="modal-head">
            <h3>إضافة تعليق</h3>
            <button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button>
          </div>
          <input type="hidden" name="id" value="${safe(id)}" />
          <p class="muted">${safe(task?.title || "")}</p>
          <label class="field"><span>التعليق</span><textarea name="feedback" required></textarea></label>
          <div class="actions" style="margin-top:14px;"><button class="btn" type="submit">${icons.message} حفظ التعليق</button></div>
        </form>
      </div>
    `;
  }

  function syncGeneratedChildren(nextTask, allTasks) {
    const rootTasks = allTasks.filter((item) => item.id !== nextTask.id && item.sourceTaskId !== nextTask.id);
    return generateRecurringInstances([...rootTasks, nextTask]);
  }

  async function pickPermanentOutcome(input) {
    const row = input.closest(".permanent-daily-row");
    if (!row) return;
    const taskId = String(row.querySelector('input[name="taskId"]')?.value || "");
    const task = getContext().state.tasks.find((item) => item.id === taskId && item.recurrence === "permanent" && !item.sourceTaskId);
    if (isDailyNotebookReadOnly(task)) return;
    await savePermanentDailyRow(input);
  }

  async function savePermanentDailyRow(input) {
    const row = input?.closest(".permanent-daily-row");
    const formElement = input?.form || row?.closest("form");
    if (!row || !formElement) return;
    const { state, canActOnTask, showToast, cloud, supabase, persistLocal, render } = getContext();
    const entryDate = toDateKey(String(new FormData(formElement).get("date") || permanentTaskDate()));
    const taskId = String(row.querySelector('input[name="taskId"]')?.value || "");
    const task = state.tasks.find((item) => item.id === taskId && item.recurrence === "permanent" && !item.sourceTaskId);
    if (isDailyNotebookReadOnly(task, entryDate)) {
      showToast("هذا الحساب للعرض فقط في دفتر المهام.");
      return;
    }
    if (!task || !canActOnTask(task)) return;
    const outcome = row.querySelector('input[type="checkbox"][name^="outcome-"]')?.checked ? "completed" : "not_done";
    const note = String(row.querySelector("textarea")?.value || "").trim();
    const updatedTask = taskWithPermanentDailyRecord(task, entryDate, outcome, note);
    try {
      if (cloud.enabled) await supabase.updateTaskWorkflow(updatedTask);
      state.tasks = state.tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item));
      if (!cloud.enabled) persistLocal();
      render();
      showToast("تم حفظ حالة المهمة ورفعها للمدير.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر حفظ حالة المهمة.");
    }
  }

  async function savePermanentDailyEntry(event) {
    event.preventDefault();
    const { state, canActOnTask, showToast, cloud, supabase, audit, persistLocal, render } = getContext();
    const form = new FormData(event.currentTarget);
    const entryDate = toDateKey(String(form.get("date") || permanentTaskDate()));
    if (isDailyNotebookReadOnly(String(form.get("employeeId") || ""), entryDate)) {
      showToast("هذا الحساب للعرض فقط في دفتر المهام.");
      return;
    }
    const taskIds = form.getAll("taskId").map(String).filter(Boolean);
    const updates = taskIds
      .map((taskId) => {
        const task = state.tasks.find((item) => item.id === taskId && item.recurrence === "permanent" && !item.sourceTaskId);
        const outcome = form.has(`outcome-${taskId}`) ? "completed" : "not_done";
        const note = String(form.get(`note-${taskId}`) || "").trim();
        return { task, outcome, note };
      })
      .filter((item) => item.task);
    if (!updates.length || updates.some((item) => !canActOnTask(item.task))) return;
    const busyKey = `permanent-group:${String(form.get("employeeId") || "employee")}:${entryDate}`;
    await runTaskAction(busyKey, async () => {
      const updatedTasks = updates.map((item) => taskWithPermanentDailyRecord(item.task, entryDate, item.outcome, item.note));
      if (cloud.enabled) {
        await saveUpdatedTasksOptimistically(updatedTasks, (updatedTask) => supabase.updateTaskWorkflow(updatedTask));
        showToast("تم حفظ دفتر المهام ورفعه للمدير.");
        return;
      }
      state.tasks = state.tasks.map((item) => updatedTasks.find((updatedTask) => updatedTask.id === item.id) || item);
      const firstTask = updatedTasks[0];
      await audit.recordActivity("permanent_task_daily_update", "تم حفظ دفتر المهام اليومية", `تم حفظ ${updatedTasks.length} مهمة بتاريخ ${entryDate}.`, firstTask.schoolId, state.currentUser.id);
      await audit.recordAudit("permanent_task_daily_update", "task", firstTask.id, `تم حفظ دفتر المهام اليومية بعدد ${updatedTasks.length} مهمة بتاريخ ${entryDate}.`, "medium", firstTask.schoolId, state.currentUser.id);
      persistLocal();
      render();
      showToast("تم حفظ دفتر المهام ورفعه للمدير.");
    });
  }

  async function completePermanentDailyGroup(employeeId, date = permanentTaskDate()) {
    const { state, canActOnTask, showToast, cloud, supabase, audit, persistLocal, render } = getContext();
    const entryDate = toDateKey(date);
    const tasks = permanentTaskRootsForDate(entryDate).filter((task) => task.assigneeId === employeeId);
    if (isDailyNotebookReadOnly(employeeId, entryDate) || tasks.some((task) => !canActOnTask(task))) {
      showToast("هذا الحساب للعرض فقط في دفتر المهام.");
      return;
    }
    if (!tasks.length) {
      showToast("لا توجد مهام يمكن تحديثها لهذا الموظف.");
      return;
    }
    const busyKey = `permanent-complete-group:${employeeId}:${entryDate}`;
    await runTaskAction(busyKey, async () => {
      const updatedTasks = tasks.map((task) => taskWithPermanentDailyRecord(task, entryDate, "completed", permanentDailyNote(task, entryDate)));
      if (cloud.enabled) {
        await saveUpdatedTasksOptimistically(updatedTasks, (updatedTask) => supabase.updateTaskWorkflow(updatedTask));
        showToast("تم تحديد جميع مهام الدفتر كمنجزة.");
        return;
      }
      state.tasks = state.tasks.map((item) => updatedTasks.find((updatedTask) => updatedTask.id === item.id) || item);
      const firstTask = updatedTasks[0];
      await audit.recordActivity("permanent_task_daily_update", "تم إنجاز دفتر كامل", `تم تحديد ${updatedTasks.length} مهمة كمنجزة بتاريخ ${entryDate}.`, firstTask.schoolId, state.currentUser.id);
      await audit.recordAudit("permanent_task_daily_update", "task", firstTask.id, `تم تحديد جميع مهام دفتر الموظف كمنجزة بتاريخ ${entryDate}.`, "medium", firstTask.schoolId, state.currentUser.id);
      persistLocal();
      render();
      showToast("تم تحديد جميع مهام الدفتر كمنجزة.");
    });
  }

  async function approvePermanentDailyEntry(taskId, date = permanentTaskDate()) {
    const { state, canApproveTasks, canReadTask, showToast, cloud, supabase, audit, persistLocal, render } = getContext();
    if (isDailyNotebookReadOnly()) {
      showToast("هذا الحساب للعرض فقط في دفتر المهام.");
      return;
    }
    const entryDate = toDateKey(date);
    const task = state.tasks.find((item) => item.id === taskId && item.recurrence === "permanent" && !item.sourceTaskId);
    if (!task || !canApproveTasks() || !canReadTask(task)) return;
    const record = permanentDailyRecord(task, entryDate);
    if (!record?.status) {
      showToast("لا يمكن اعتماد المهمة قبل حفظ حالتها اليومية.");
      return;
    }
    if (record.approvedAt) {
      showToast("هذه المهمة معتمدة مسبقًا لهذا التاريخ.");
      return;
    }
    const busyKey = `permanent:${task.id}:${entryDate}`;
    await runTaskAction(busyKey, async () => {
      const updatedTask = taskWithPermanentDailyApproval(task, entryDate);
      if (cloud.enabled) {
        await saveUpdatedTasksOptimistically([updatedTask], (item) => supabase.updateTaskWorkflow(item));
        showToast("تم اعتماد مهمة الدفتر اليومية.");
        return;
      }
      state.tasks = state.tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item));
      await audit.recordActivity("permanent_task_daily_approved", "تم اعتماد مهمة يومية", `${updatedTask.taskNumber} - ${entryDate}`, updatedTask.schoolId, state.currentUser.id);
      await audit.recordAudit("permanent_task_daily_approved", "task", updatedTask.id, `تم اعتماد متابعة ${updatedTask.taskNumber} بتاريخ ${entryDate}.`, "medium", updatedTask.schoolId, state.currentUser.id);
      persistLocal();
      render();
      showToast("تم اعتماد مهمة الدفتر اليومية.");
    });
  }

  async function approvePermanentDailyGroup(employeeId, date = permanentTaskDate()) {
    const { state, canApproveTasks, canReadTask, showToast, cloud, supabase, audit, persistLocal, render } = getContext();
    if (isDailyNotebookReadOnly()) {
      showToast("هذا الحساب للعرض فقط في دفتر المهام.");
      return;
    }
    const entryDate = toDateKey(date);
    if (!canApproveTasks()) return;
    const tasks = permanentTaskRootsForDate(entryDate).filter((task) => task.assigneeId === employeeId && canReadTask(task));
    const approvableDailyTasks = tasks.filter((task) => permanentDailyRecord(task, entryDate)?.status && !permanentDailyApproved(task, entryDate));
    if (!approvableDailyTasks.length) {
      showToast("لا توجد مهام محفوظة وغير معتمدة لهذا الموظف.");
      return;
    }
    const busyKey = `permanent-approve-group:${employeeId}:${entryDate}`;
    await runTaskAction(busyKey, async () => {
      const updatedTasks = approvableDailyTasks.map((task) => taskWithPermanentDailyApproval(task, entryDate));
      if (cloud.enabled) {
        await saveUpdatedTasksOptimistically(updatedTasks, (updatedTask) => supabase.updateTaskWorkflow(updatedTask));
        showToast("تم اعتماد دفتر المهام اليومية للموظف.");
        return;
      }
      state.tasks = state.tasks.map((item) => updatedTasks.find((updatedTask) => updatedTask.id === item.id) || item);
      const firstTask = updatedTasks[0];
      await audit.recordActivity("permanent_task_daily_approved", "تم اعتماد دفتر يومي", `تم اعتماد ${updatedTasks.length} مهمة بتاريخ ${entryDate}.`, firstTask.schoolId, state.currentUser.id);
      await audit.recordAudit("permanent_task_daily_approved", "task", firstTask.id, `تم اعتماد دفتر المهام اليومية بعدد ${updatedTasks.length} مهمة بتاريخ ${entryDate}.`, "medium", firstTask.schoolId, state.currentUser.id);
      persistLocal();
      render();
      showToast("تم اعتماد دفتر المهام اليومية للموظف.");
    });
  }

  async function approveAllPermanentDailyNotebooks(date = permanentTaskDate()) {
    const { state, canApproveTasks, canReadTask, showToast, cloud, supabase, audit, persistLocal, render } = getContext();
    if (isDailyNotebookReadOnly() || !canApproveTasks()) return;
    const entryDate = toDateKey(date);
    const approvableTasks = permanentTaskRootsForDate(entryDate).filter(
      (task) => canReadTask(task) && permanentDailyRecord(task, entryDate)?.status && !permanentDailyApproved(task, entryDate),
    );
    if (!approvableTasks.length) {
      showToast("لا توجد دفاتر مرفوعة بانتظار الاعتماد لهذا التاريخ.");
      return;
    }
    if (!confirm(`سيتم اعتماد كل دفاتر الموظفين المرفوعة بتاريخ ${entryDate}. هل تريد المتابعة؟`)) return;
    await runTaskAction(`permanent-approve-all:${entryDate}`, async () => {
      const updatedTasks = approvableTasks.map((task) => taskWithPermanentDailyApproval(task, entryDate));
      if (cloud.enabled) {
        await saveUpdatedTasksOptimistically(updatedTasks, (updatedTask) => supabase.updateTaskWorkflow(updatedTask));
      } else {
        state.tasks = state.tasks.map((item) => updatedTasks.find((updatedTask) => updatedTask.id === item.id) || item);
      }
      const firstTask = updatedTasks[0];
      await audit.recordActivity("all_daily_notebooks_approved", "تم اعتماد كل الدفاتر اليومية", `تم اعتماد ${updatedTasks.length} بندًا بتاريخ ${entryDate}.`, firstTask.schoolId, state.currentUser.id);
      await audit.recordAudit("all_daily_notebooks_approved", "task", firstTask.id, `اعتماد جماعي لكل دفاتر المهام المرفوعة بتاريخ ${entryDate}.`, "high", firstTask.schoolId, state.currentUser.id);
      if (!cloud.enabled) persistLocal();
      render();
      showToast("تم اعتماد كل دفاتر المهام المرفوعة بنجاح.");
    });
  }

  async function renewPermanentDailyNotebook(employeeId) {
    const { state, canEditTask, showToast, cloud, supabase, notifications, audit, persistLocal, render, formatDate } = getContext();
    const tasks = uniquePermanentTaskRoots(visibleTasks({ includeSearch: false })).filter((task) => task.assigneeId === employeeId && effectiveStatus(task) !== "archived");
    if (!tasks.length || isDailyNotebookReadOnly() || tasks.some((task) => !canEditTask(task))) return;
    const renewedEndDate = renewedPermanentNotebookEndDate(tasks);
    const confirmed = confirm(`هل تريد تجديد دفتر المهام لمدة 60 يومًا حتى ${formatDate(renewedEndDate)}؟`);
    if (!confirmed) return;
    const busyKey = `permanent-lifecycle:${employeeId}`;
    await runTaskAction(busyKey, async () => {
      const updatedTasks = tasks.map((task) => ({
        ...task,
        status: "new",
        progress: 0,
        completedAt: "",
        dueDate: renewedEndDate,
        comments: [
          ...(task.comments || []).filter((comment) => !["notebook_renewed_at", "notebook_archived_at"].includes(comment.type)),
          createNotebookMetaRecord(state.currentUser.id, today(), "notebook_renewed_at"),
        ],
      }));
      if (cloud.enabled) {
        await saveUpdatedTasksOptimistically(updatedTasks, (updatedTask) => supabase.updateTaskWorkflow(updatedTask));
      } else {
        state.tasks = state.tasks.map((item) => updatedTasks.find((updatedTask) => updatedTask.id === item.id) || item);
      }
      const firstTask = updatedTasks[0];
      await notifications.createNotificationsForTask(firstTask, "تم تجديد دفتر المهام", `تم تجديد الدفتر لمدة 60 يومًا حتى ${formatDate(renewedEndDate)}.`, {
        excludeRecipientId: state.currentUser.id,
        type: "notebook_renewed",
      });
      scheduleTaskAlertSync(notifications, true);
      await audit.recordActivity("notebook_renewed", "تم تجديد دفتر المهام", `تم تجديد ${updatedTasks.length} بندًا لمدة 60 يومًا حتى ${renewedEndDate}.`, firstTask.schoolId, state.currentUser.id);
      await audit.recordAudit("notebook_renewed", "task", firstTask.id, `تم تجديد دفتر المهام لمدة 60 يومًا حتى ${renewedEndDate}.`, "medium", firstTask.schoolId, state.currentUser.id);
      if (!cloud.enabled) persistLocal();
      render();
      showToast("تم تجديد دفتر المهام لمدة 60 يومًا بنجاح.");
    });
  }

  async function archivePermanentDailyNotebook(employeeId) {
    const { state, canEditTask, showToast, cloud, supabase, notifications, audit, persistLocal, render } = getContext();
    const tasks = filteredPermanentTaskRoots().filter((task) => task.assigneeId === employeeId);
    if (!tasks.length || isDailyNotebookReadOnly() || tasks.some((task) => !canEditTask(task))) return;
    const confirmed = confirm("هل تريد أرشفة دفتر المهام؟ ستبقى جميع سجلاته السابقة محفوظة في التقارير حسب التاريخ.");
    if (!confirmed) return;
    const busyKey = `permanent-lifecycle:${employeeId}`;
    await runTaskAction(busyKey, async () => {
      const updatedTasks = tasks.map((task) => ({
        ...updatedTaskWithStatus(task, "archived"),
        comments: [
          ...(task.comments || []).filter((comment) => comment.type !== "notebook_archived_at"),
          createNotebookMetaRecord(state.currentUser.id, today(), "notebook_archived_at"),
        ],
      }));
      if (cloud.enabled) {
        await saveUpdatedTasksOptimistically(updatedTasks, (updatedTask) => supabase.updateTaskWorkflow(updatedTask));
      } else {
        state.tasks = state.tasks.map((item) => updatedTasks.find((updatedTask) => updatedTask.id === item.id) || item);
      }
      const firstTask = updatedTasks[0];
      await notifications.createNotificationsForTask(firstTask, "تمت أرشفة دفتر المهام", "تمت أرشفة الدفتر مع الاحتفاظ بجميع سجلاته السابقة.", {
        excludeRecipientId: state.currentUser.id,
        type: "notebook_archived",
      });
      scheduleTaskAlertSync(notifications, true);
      await audit.recordActivity("notebook_archived", "تمت أرشفة دفتر المهام", `تمت أرشفة دفتر مكوّن من ${updatedTasks.length} بندًا.`, firstTask.schoolId, state.currentUser.id);
      await audit.recordAudit("notebook_archived", "task", firstTask.id, "تمت أرشفة دفتر المهام مع الاحتفاظ بسجلاته.", "medium", firstTask.schoolId, state.currentUser.id);
      if (!cloud.enabled) persistLocal();
      render();
      showToast("تمت أرشفة دفتر المهام مع حفظ سجلاته السابقة.");
    });
  }

  async function saveDailyExtraTask(button) {
    const panel = button?.closest(".daily-extra-entry");
    if (!panel) return;
    const { state, showToast, cloud, supabase, audit, persistLocal, render } = getContext();
    if (isDailyNotebookReadOnly()) {
      showToast("هذا الحساب للعرض فقط في دفتر المهام.");
      return;
    }
    const taskId = String(panel.dataset.taskId || "");
    const task = state.tasks.find((item) => item.id === taskId && item.recurrence === "permanent" && !item.sourceTaskId);
    if (!task || task.assigneeId !== state.currentUser?.id) return;
    const entries = Array.from(panel.querySelectorAll(".daily-extra-input-row"))
      .map((row) => ({
        title: String(row.querySelector('input[name="dailyExtraTitle"]')?.value || "").trim(),
        details: String(row.querySelector('textarea[name="dailyExtraDetails"]')?.value || "").trim(),
      }))
      .filter((entry) => entry.title || entry.details);
    if (!entries.length) {
      showToast("أضف مهمة مستحدثة واحدة على الأقل قبل الحفظ.");
      return;
    }
    const entryDate = permanentTaskDate();
    const updatedTask = entries.reduce(
      (currentTask, entry) => taskWithDailyExtraTask(currentTask, entryDate, entry.title || "مهمة مستحدثة", entry.details),
      task,
    );
    await runTaskAction(`daily-extra:${task.id}:${entryDate}`, async () => {
      if (cloud.enabled) {
        await saveUpdatedTasksOptimistically([updatedTask], (item) => supabase.updateTaskWorkflow(item));
      } else {
        state.tasks = state.tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item));
      }
      if (!cloud.enabled) {
        await audit.recordActivity("daily_extra_task_created", "تمت إضافة مهام مستحدثة", `تمت إضافة ${entries.length} مهمة بتاريخ ${entryDate}.`, task.schoolId, state.currentUser.id);
        persistLocal();
      }
      render();
      showToast(`تم حفظ ورفع ${entries.length} مهمة مستحدثة للإدارة.`);
    });
  }

  async function approveDailyExtraTask(taskId, extraId) {
    const { state, canApproveTasks, canReadTask, showToast, cloud, supabase, audit, persistLocal, render } = getContext();
    if (isDailyNotebookReadOnly()) {
      showToast("هذا الحساب للعرض فقط في دفتر المهام.");
      return;
    }
    const task = state.tasks.find((item) => item.id === taskId && item.recurrence === "permanent" && !item.sourceTaskId);
    if (!task || !canApproveTasks() || !canReadTask(task)) return;
    const extraTask = dailyExtraTasks(task, permanentTaskDate()).find((item) => item.id === extraId);
    if (!extraTask) return;
    if (extraTask.approvedAt) {
      showToast("هذه المهمة المستحدثة معتمدة مسبقًا.");
      return;
    }
    const updatedTask = taskWithDailyExtraApproval(task, extraId);
    await runTaskAction(`daily-extra-approve:${task.id}:${extraId}`, async () => {
      if (cloud.enabled) {
        await saveUpdatedTasksOptimistically([updatedTask], (item) => supabase.updateTaskWorkflow(item));
      } else {
        state.tasks = state.tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item));
      }
      if (!cloud.enabled) {
        await audit.recordActivity("daily_extra_task_approved", "تم اعتماد مهمة مستحدثة", `${extraTask.title || extraTask.text} - ${extraTask.date}`, task.schoolId, state.currentUser.id);
        persistLocal();
      }
      render();
      showToast("تم اعتماد المهمة المستحدثة.");
    });
  }

  async function approveAllDailyExtraTasks(date = permanentTaskDate()) {
    const { state, canApproveTasks, canReadTask, showToast, cloud, supabase, audit, persistLocal, render } = getContext();
    if (isDailyNotebookReadOnly() || !canApproveTasks()) return;
    const entryDate = toDateKey(date);
    const pendingEntries = dailyExtraTaskArchive({ from: entryDate, to: entryDate }).filter((item) => !item.approvedAt && canReadTask(item.sourceTask));
    if (!pendingEntries.length) {
      showToast("لا توجد مهام مستحدثة بانتظار الاعتماد لهذا التاريخ.");
      return;
    }
    if (!confirm(`سيتم اعتماد كل المهام المستحدثة بتاريخ ${entryDate}. هل تريد المتابعة؟`)) return;
    await runTaskAction(`daily-extra-approve-all:${entryDate}`, async () => {
      const sourceTasks = new Map(pendingEntries.map((item) => [item.taskId, item.sourceTask]));
      const updatedTasks = [...sourceTasks.values()].map((task) =>
        pendingEntries.filter((item) => item.taskId === task.id).reduce((updatedTask, item) => taskWithDailyExtraApproval(updatedTask, item.id), task));
      if (cloud.enabled) {
        await saveUpdatedTasksOptimistically(updatedTasks, (updatedTask) => supabase.updateTaskWorkflow(updatedTask));
      } else {
        state.tasks = state.tasks.map((item) => updatedTasks.find((updatedTask) => updatedTask.id === item.id) || item);
      }
      const approvedCount = pendingEntries.length;
      const firstTask = updatedTasks[0];
      await audit.recordActivity("all_daily_extra_tasks_approved", "تم اعتماد كل المهام المستحدثة", `تم اعتماد ${approvedCount} مهمة مستحدثة بتاريخ ${entryDate}.`, firstTask.schoolId, state.currentUser.id);
      await audit.recordAudit("all_daily_extra_tasks_approved", "task", firstTask.id, `اعتماد جماعي للمهام المستحدثة بتاريخ ${entryDate}.`, "high", firstTask.schoolId, state.currentUser.id);
      if (!cloud.enabled) persistLocal();
      render();
      showToast("تم اعتماد كل المهام المستحدثة بنجاح.");
    });
  }

  function printDailyExtraTasks() {
    const { state, safe, canApproveTasks, showToast, formatDate, schoolName } = getContext();
    if (!canApproveTasks()) return;
    const filters = state.dailyExtraReport || {};
    const from = toDateKey(filters.from || permanentTaskDate());
    const to = toDateKey(filters.to || permanentTaskDate());
    if (!from || !to || from > to) {
      showToast("تأكد من أن تاريخ البداية يسبق تاريخ النهاية.");
      return;
    }
    const employeeId = filters.employeeId || "all";
    const entries = dailyExtraTaskArchive({ from, to, employeeId });
    if (!entries.length) {
      showToast("لا توجد مهام مستحدثة مطابقة للموظف والفترة المحددين.");
      return;
    }
    const employeeLabel = employeeId === "all" ? "كل الموظفين" : entries[0]?.employeeName || "الموظف المحدد";
    const approvedCount = entries.filter((item) => item.approvedAt).length;
    const popup = window.open("", "_blank", "width=1100,height=900");
    if (!popup) {
      showToast("حظر المتصفح نافذة معاينة الطباعة.");
      return;
    }
    const rows = entries.map((item, index) => `
      <tr>
        <td>${safe(index + 1)}</td>
        <td><strong>${safe(item.title || "مهمة مستحدثة")}</strong></td>
        <td>${safe(item.text || "لا توجد تفاصيل")}</td>
        <td>${safe(item.employeeName)}</td>
        <td>${safe(schoolName(item.schoolId))}</td>
        <td>${safe(formatDate(item.date))}</td>
        <td><span class="status ${item.approvedAt ? "approved" : "pending"}">${item.approvedAt ? "معتمدة" : "قيد الاعتماد"}</span></td>
      </tr>
    `).join("");
    popup.document.open();
    popup.document.write(`
      <!doctype html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>تقرير المهام المستحدثة</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #172033; font-family: "Segoe UI", Tahoma, Arial, sans-serif; direction: rtl; }
            .page { display: grid; gap: 16px; }
            header { display: flex; justify-content: space-between; gap: 20px; align-items: start; padding-bottom: 14px; border-bottom: 3px solid #2563eb; }
            h1, p { margin: 0; }
            h1 { font-size: 25px; }
            header p { margin-top: 6px; color: #64748b; }
            .print-button { border: 0; border-radius: 7px; padding: 10px 18px; color: white; background: #2563eb; font-weight: 800; cursor: pointer; }
            .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
            .summary div { padding: 11px; border: 1px solid #dbe3ef; border-radius: 7px; background: #f8fafc; }
            .summary span { display: block; color: #64748b; font-size: 12px; }
            .summary strong { display: block; margin-top: 4px; font-size: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 9px; border: 1px solid #dbe3ef; text-align: right; vertical-align: top; line-height: 1.55; }
            th { color: #1e3a5f; background: #eaf2ff; font-weight: 900; }
            tbody tr:nth-child(even) { background: #f8fafc; }
            .status { display: inline-block; padding: 4px 8px; border-radius: 5px; font-weight: 800; white-space: nowrap; }
            .approved { color: #166534; background: #dcfce7; }
            .pending { color: #92400e; background: #fef3c7; }
            footer { display: flex; justify-content: space-between; gap: 16px; padding-top: 10px; border-top: 1px solid #dbe3ef; color: #64748b; font-size: 11px; }
            @media print { .print-button { display: none; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <main class="page">
            <header>
              <div><h1>تقرير المهام المستحدثة</h1><p>سجل تفصيلي محفوظ حسب الموظف وتاريخ المهمة</p></div>
              <button class="print-button" type="button" onclick="window.print()">طباعة / حفظ PDF</button>
            </header>
            <section class="summary">
              <div><span>الموظف</span><strong>${safe(employeeLabel)}</strong></div>
              <div><span>الفترة</span><strong>${safe(formatDate(from))} - ${safe(formatDate(to))}</strong></div>
              <div><span>إجمالي المهام</span><strong>${safe(entries.length)}</strong></div>
              <div><span>المعتمدة / قيد الاعتماد</span><strong>${safe(approvedCount)} / ${safe(entries.length - approvedCount)}</strong></div>
            </section>
            <table>
              <thead><tr><th>م</th><th>عنوان المهمة</th><th>التفاصيل</th><th>اسم الموظف</th><th>الفرع</th><th>تاريخ المهمة</th><th>الاعتماد</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <footer><span>منصة المهام المدرسية</span><span>تاريخ الطباعة: ${safe(formatDate(today()))}</span></footer>
          </main>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 350);
  }

  function taskChildrenToDelete(taskId) {
    const { state } = getContext();
    return state.tasks.filter((task) => task.id === taskId || task.sourceTaskId === taskId);
  }

  function updatedTaskWithStatus(task, status) {
    const next = normalizeTask({ ...task, status });
    if (status === "new") next.progress = 0;
    if (status === "in_progress" && next.progress < 1) next.progress = 10;
    if (status === "under_review" && next.progress < 90) next.progress = 90;
    if (status === "approved" && next.progress < 95) next.progress = 95;
    if (status === "completed") {
      next.progress = 100;
      next.completedAt = task.completedAt || nowTimestamp();
    } else if (["new", "in_progress", "under_review", "approved"].includes(status)) {
      next.completedAt = "";
    }
    return next;
  }

  async function saveAssignedNotebook(event) {
    event.preventDefault();
    const { state, getUser, canCreateTasks, canAssignTask, showToast, cloud, supabase, notifications, audit, persistLocal, render } = getContext();
    const form = new FormData(event.currentTarget);
    const sourceEmployeeId = String(form.get("sourceEmployeeId") || "").trim();
    const targetEmployeeId = String(form.get("targetEmployeeId") || "").trim();
    const dueDate = toDateKey(String(form.get("dueDate") || ""));
    const sourceTasks = permanentTaskRoots().filter((task) => task.assigneeId === sourceEmployeeId);
    const sourceTask = sourceTasks[0];
    const targetUser = getUser(targetEmployeeId);
    if (!sourceTask || !sourceTasks.length) {
      showToast("لم يعد الدفتر الجاهز متاحًا. حدّث البيانات ثم أعد المحاولة.");
      return;
    }
    if (!targetUser?.active || !targetUser.schoolId) {
      showToast("اختر موظفًا نشطًا من أحد الفروع.");
      return;
    }
    if (!isGeneralManager(state.currentUser) && targetUser.schoolId !== sourceTask.schoolId) {
      showToast("إسناد الدفتر بين الفروع متاح لمدير الإدارة العامة فقط.");
      return;
    }
    const targetHasNotebook = state.tasks.some((task) => task.recurrence === "permanent" && !task.sourceTaskId && task.assigneeId === targetUser.id && effectiveStatus(task) !== "archived");
    if (targetHasNotebook) {
      showToast("الموظف المحدد لديه دفتر مهام نشط بالفعل.");
      return;
    }
    if (!dueDate || dueDate < today()) {
      showToast("حدد تاريخ نهاية صالحًا للدفتر الجديد.");
      return;
    }
    const sourcePermissionTarget = { schoolId: sourceTask.schoolId, recurrence: "permanent" };
    const targetPermission = { schoolId: targetUser.schoolId, recurrence: "permanent" };
    if (!canCreateTasks(sourcePermissionTarget) && !canAssignTask(targetPermission, targetUser)) {
      showToast("لا توجد صلاحية لإسناد دفتر المهام لهذا الموظف.");
      return;
    }
    const notebookSeed = createUuid();
    const notebookNumber = generateTaskNumber(today(), notebookSeed);
    const notebookTitle = permanentNotebookTitle(sourceTask);
    const assignedTasks = sourceTasks.map((item, index) => {
      const taskId = index === 0 ? notebookSeed : createUuid();
      return normalizeTask({
        id: taskId,
        taskNumber: generateTaskNumber(today(), taskId),
        title: permanentNotebookItemTitle(item),
        description: item.description || "",
        department: taskDepartmentValue({ ...item, schoolId: targetUser.schoolId }),
        priority: "medium",
        recurrence: "permanent",
        status: "new",
        progress: 0,
        assigneeId: targetUser.id,
        creatorId: state.currentUser.id,
        schoolId: targetUser.schoolId,
        dueDate,
        completedAt: "",
        createdAt: today(),
        occurrenceDate: today(),
        sourceTaskId: "",
        comments: [
          createNotebookMetaRecord(state.currentUser.id, notebookNumber, "notebook_number"),
          createNotebookMetaRecord(state.currentUser.id, notebookTitle, "notebook_title"),
          createNotebookMetaRecord(state.currentUser.id, permanentNotebookItemTitle(item), "notebook_item_title"),
        ],
        feedback: [],
        attachments: [],
        approvalRequired: item.approvalRequired !== false,
        approverRole: item.approverRole || "school_principal",
        approvals: [],
      });
    });
    const validationError = assignedTasks.map(validateTaskInput).find(Boolean);
    if (validationError) {
      showToast(validationError);
      return;
    }
    const busyKey = `assign-notebook:${targetUser.id}`;
    await runTaskAction(busyKey, async () => {
      const savedIds = [];
      try {
        if (cloud.enabled) {
          for (const assignedTask of assignedTasks) {
            await supabase.saveCloudDoc("tasks", assignedTask.id, supabase.cloudTaskData(assignedTask), false);
            savedIds.push(assignedTask.id);
          }
        }
      } catch (error) {
        if (cloud.enabled) {
          for (const savedId of savedIds) await supabase.deleteCloudDoc("tasks", savedId).catch(() => {});
        }
        throw error;
      }
      state.tasks = [...assignedTasks, ...state.tasks];
      await notifications.createNotificationsForTask(assignedTasks[0], "تم إسناد دفتر مهام جديد", `تم إسناد دفتر يحتوي على ${assignedTasks.length} بندًا حتى ${dueDate}.`, {
        excludeRecipientId: state.currentUser.id,
        type: "notebook_assigned",
      });
      scheduleTaskAlertSync(notifications, true);
      await audit.recordActivity("notebook_assigned", "تم إسناد دفتر مهام جاهز", `تم إسناد ${assignedTasks.length} بندًا إلى ${targetUser.name}.`, targetUser.schoolId, state.currentUser.id);
      await audit.recordAudit("notebook_assigned", "task", assignedTasks[0].id, `تم إنشاء دفتر مستقل للموظف ${targetUser.name} من دفتر جاهز.`, "medium", targetUser.schoolId, state.currentUser.id);
      if (!cloud.enabled) persistLocal();
      state.modal = null;
      render();
      showToast("تم إسناد دفتر المهام الجاهز للموظف بنجاح.");
    });
  }

  async function saveTask(event) {
    event.preventDefault();
    const { canCreateTasks, canEditTask, canAssignTask, getUser, state, showToast, cloud, attachments, supabase, notifications, audit, persistLocal, consumeFileSelection, render } = getContext();
    if (isTaskModalReadOnly(state.modal?.id || "")) {
      showToast("هذه المهمة مفتوحة للعرض فقط من التنبيهات.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id") || "").trim() || createUuid();
    const existing = state.tasks.find((task) => task.id === id);
    if (existing && !canEditTask(existing)) {
      showToast("لا يمكن تعديل بيانات مهمة أنشأها المدير. يمكنك تنفيذها أو التعليق عليها فقط حسب الصلاحية.");
      return;
    }
    if (existing?.recurrence === "permanent" && !canOverrideManagerApprovalLock(state.currentUser) && notebookSiblingTasks(existing).some(hasAnyPermanentDailyApproval)) {
      showToast("تم اعتماد هذا الدفتر من المدير، ولا يمكن تعديله إلا من المدير.");
      return;
    }
    const assigneeIds = form.getAll("assigneeIds").map(String).filter(Boolean);
    const assigneeId = assigneeIds[0] || String(form.get("assigneeId") || "");
    const selectedAssignees = [...new Set([assigneeId, ...assigneeIds])].map(getUser).filter(Boolean);
    const assignee = selectedAssignees[0] || getUser(assigneeId);
    const selectedSchoolId = String(form.get("schoolId") || "").trim() || existing?.schoolId || assignee?.schoolId || state.currentUser.schoolId;
    const recurrence = String(form.get("recurrence") || "once");
    const isPermanentNotebook = recurrence === "permanent";
    const savedStatus = isPermanentNotebook ? existing?.status || "new" : String(form.get("status") || "new");
    const notebookNumber = String(form.get("taskNumber") || permanentNotebookNumber(existing || {}) || generateTaskNumber(today(), id)).trim();
    const notebookTitle = String(form.get("notebookTitle") || permanentNotebookTitle(existing || {}) || "دفتر المهام اليومية").trim();
    const itemIds = form.getAll("notebookTaskId").map((value) => String(value || "").trim());
    const itemTitles = form.getAll("notebookItemTitle").map((value) => String(value || "").trim());
    const itemDescriptions = form.getAll("notebookItemDescription").map((value) => String(value || "").trim());
    const rawNotebookItems = isPermanentNotebook && itemTitles.length
      ? itemTitles.map((title, index) => ({ id: itemIds[index] || "", title, description: itemDescriptions[index] || "" })).filter((item) => item.title)
      : [{ id: existing?.id || "", title: String(form.get("title") || "").trim(), description: String(form.get("description") || "").trim() }];
    const notebookItems = isPermanentNotebook ? uniqueNotebookItems(rawNotebookItems) : rawNotebookItems;
    if (!selectedSchoolId) {
      showToast("اختر الفرع قبل حفظ المهمة.");
      return;
    }
    if (!selectedAssignees.length) {
      showToast("اختر موظفًا واحدًا على الأقل لإسناد المهمة.");
      return;
    }
    if (selectedAssignees.some((item) => item.schoolId !== selectedSchoolId)) {
      showToast("اختر موظفًا من نفس الفرع المحدد.");
      return;
    }
    if (isPermanentNotebook && !notebookItems.length) {
      showToast("أضف مهمة واحدة على الأقل داخل دفتر المهام اليومية.");
      return;
    }
    const primaryNotebookItem = notebookItems[0] || { title: "", description: "" };
    const existingNotebookGroup = isPermanentNotebook && existing ? notebookSiblingTasks(existing) : [];
    const existingNotebookById = new Map(existingNotebookGroup.map((item) => [item.id, item]));
    const removedNotebookTasks = isPermanentNotebook && existing
      ? existingNotebookGroup.filter((item) => !notebookItems.some((notebookItem) => notebookItem.id === item.id))
      : [];
    const baseComments = (existing?.comments || []).filter((comment) => !["notebook_title", "notebook_item_title", "notebook_number"].includes(comment.type));
    const task = normalizeTask({
      id,
      taskNumber: isPermanentNotebook && existing ? existing.taskNumber : String(form.get("taskNumber") || existing?.taskNumber || generateTaskNumber(today(), id)),
      title: primaryNotebookItem.title,
      description: primaryNotebookItem.description,
      department: taskDepartmentValue({ schoolId: selectedSchoolId, department: String(form.get("department") || existing?.department || "") }),
      priority: isPermanentNotebook ? existing?.priority || "medium" : String(form.get("priority") || existing?.priority || "medium"),
      recurrence,
      status: savedStatus,
      progress: Number(existing?.progress || 0),
      assigneeId,
      creatorId: existing?.creatorId || state.currentUser.id,
      schoolId: selectedSchoolId,
      dueDate: String(form.get("dueDate") || today()),
      completedAt: isPermanentNotebook ? existing?.completedAt || "" : savedStatus === "completed" ? existing?.completedAt || nowTimestamp() : "",
      createdAt: existing?.createdAt || today(),
      occurrenceDate: existing?.occurrenceDate || (["daily", "permanent"].includes(String(form.get("recurrence"))) ? today() : ""),
      sourceTaskId: existing?.sourceTaskId || "",
      comments: isPermanentNotebook
        ? [
            ...baseComments,
            createNotebookMetaRecord(state.currentUser.id, notebookNumber, "notebook_number"),
            createNotebookMetaRecord(state.currentUser.id, notebookTitle, "notebook_title"),
            createNotebookMetaRecord(state.currentUser.id, primaryNotebookItem.title, "notebook_item_title"),
          ]
        : existing?.comments || [],
      feedback: existing?.feedback || [],
      attachments: existing?.attachments || [],
      approvalRequired: String(form.get("approvalRequired")) !== "false",
      approverRole: String(form.get("approverRole") || "school_principal"),
      approvals: existing?.approvals || [],
    });
    const canSaveTaskDefinition = existing ? canEditTask(existing) : canCreateTasks(task);
    if (!canSaveTaskDefinition || selectedAssignees.some((item) => !canAssignTask(task, item))) {
      showToast(existing ? "لا توجد صلاحية لتعديل هذه المهمة." : "لا توجد صلاحية لإنشاء المهمة أو إسنادها ضمن هذا النطاق.");
      return;
    }
    const validationError = validateTaskInput(task);
    if (validationError) {
      showToast(validationError);
      return;
    }
    const pendingFiles = consumeFileSelection(false);
    const { accepted: acceptedFiles, errors: attachmentErrors } = attachments.validateSelectedFiles(pendingFiles);
    if (attachmentErrors.length) {
      showToast(attachmentErrors.join(" "));
      return;
    }
    const bulkAssignees = existing ? [assignee] : selectedAssignees;
    if (bulkAssignees.length > 1 && acceptedFiles.length) {
      showToast("عند اختيار أكثر من موظف، احفظ المهام أولًا ثم أضف المرفقات لكل مهمة على حدة.");
      return;
    }
    const rawTaskDrafts = existing
      ? (isPermanentNotebook ? notebookItems.map((item, index) => ({ assignee: bulkAssignees[0], item, index })) : [{ assignee: bulkAssignees[0], item: primaryNotebookItem, index: 0 }])
      : bulkAssignees.flatMap((item) => notebookItems.map((notebookItem) => ({ assignee: item, item: notebookItem })));
    const existingNotebookKeys = new Set(
      isPermanentNotebook
        ? state.tasks
            .filter((item) => item.recurrence === "permanent" && !item.sourceTaskId && effectiveStatus(item) !== "archived" && item.id !== existing?.id && !existingNotebookById.has(item.id))
            .map(notebookTaskIdentity)
        : [],
    );
    const batchNotebookKeys = new Set();
    const taskDrafts = rawTaskDrafts.filter((draft) => {
      if (!isPermanentNotebook) return true;
      const key = notebookItemIdentity(selectedSchoolId, draft.assignee.id, draft.item.title);
      if (existingNotebookKeys.has(key) || batchNotebookKeys.has(key)) return false;
      batchNotebookKeys.add(key);
      return true;
    });
    const skippedNotebookDuplicates = rawTaskDrafts.length - taskDrafts.length;
    if (!taskDrafts.length) {
      showToast("لم تتم الإضافة لأن هذه المهمة موجودة مسبقًا في دفتر الموظف نفسه.");
      return;
    }
    const taskSaveMessage = skippedNotebookDuplicates
      ? `تم حفظ المهمة وتجاهل ${skippedNotebookDuplicates} من البنود المكررة.`
      : "تم حفظ المهمة.";
    const tasksToSave = taskDrafts.map((draft, index) => {
      const itemExisting = existingNotebookById.get(draft.item.id) || (!isPermanentNotebook && index === 0 ? existing : null);
      const taskId = itemExisting?.id || (index === 0 && (!isPermanentNotebook || !existing) ? task.id : createUuid());
      const itemBaseComments = (itemExisting?.comments || baseComments).filter((comment) => !["notebook_title", "notebook_item_title", "notebook_number"].includes(comment.type));
      return normalizeTask({
        ...task,
        id: taskId,
        assigneeId: draft.assignee.id,
        title: draft.item.title,
        description: draft.item.description,
        taskNumber: itemExisting?.taskNumber || (index === 0 ? task.taskNumber : generateTaskNumber(today(), taskId)),
        status: itemExisting?.status || task.status,
        progress: Number(itemExisting?.progress ?? task.progress ?? 0),
        completedAt: itemExisting?.completedAt || "",
        createdAt: itemExisting?.createdAt || task.createdAt,
        occurrenceDate: itemExisting?.occurrenceDate || task.occurrenceDate,
        feedback: itemExisting?.feedback || task.feedback,
        attachments: itemExisting?.attachments || [],
        approvals: itemExisting?.approvals || [],
        comments: isPermanentNotebook
          ? [
              ...itemBaseComments,
              createNotebookMetaRecord(state.currentUser.id, notebookNumber, "notebook_number"),
              createNotebookMetaRecord(state.currentUser.id, notebookTitle, "notebook_title"),
              createNotebookMetaRecord(state.currentUser.id, draft.item.title, "notebook_item_title"),
            ]
          : task.comments,
      });
    });
    let nextTasks = state.tasks.filter((item) => !tasksToSave.some((taskItem) => taskItem.id === item.id) && !removedNotebookTasks.some((taskItem) => taskItem.id === item.id || item.sourceTaskId === taskItem.id));
    for (const taskItem of tasksToSave) {
      nextTasks = [taskItem, ...nextTasks];
      nextTasks = syncGeneratedChildren(taskItem, nextTasks);
    }
    if (cloud.enabled) {
      let primaryTaskSaved = false;
      try {
        const savedTasks = [];
        for (const removedTask of removedNotebookTasks) {
          await supabase.deleteCloudDoc("tasks", removedTask.id);
        }
        for (let index = 0; index < tasksToSave.length; index += 1) {
          const taskItem = tasksToSave[index];
          await supabase.saveCloudDoc("tasks", taskItem.id, supabase.cloudTaskData(taskItem), false);
          primaryTaskSaved = true;

          let mergedTask = taskItem;
          if (index === 0 && acceptedFiles.length) {
            const newAttachments = await attachments.uploadTaskFiles(taskItem);
            mergedTask = { ...taskItem, attachments: [...taskItem.attachments, ...newAttachments] };
            nextTasks = nextTasks.map((item) => (item.id === taskItem.id ? mergedTask : item));
            await supabase.saveCloudDoc("tasks", taskItem.id, supabase.cloudTaskData(mergedTask), false);
          }
          savedTasks.push(mergedTask);
        }

        for (const taskItem of savedTasks) {
          for (const child of nextTasks.filter((item) => item.sourceTaskId === taskItem.id)) {
            await supabase.saveCloudDoc("tasks", child.id, supabase.cloudTaskData(child), false);
          }
          await notifications.createNotificationsForTask(taskItem, existing ? "Task updated" : "Task created", `${taskItem.taskNumber} - ${taskItem.title}`, {
            excludeRecipientId: state.currentUser.id,
            type: existing ? "task_updated" : "task_created",
          });
          await notifications.notifyTaskAssignment(taskItem, existing || null);
        }
        scheduleTaskAlertSync(notifications, true);
        state.tasks = nextTasks;
        consumeFileSelection(true);
        state.modal = null;
        render();
        showToast(taskSaveMessage);
        return;
      } catch (error) {
        console.error(error);
        showToast(primaryTaskSaved ? "تم حفظ أصل المهمة، لكن تعذر إكمال المرفقات أو التحديثات التابعة." : supabase.formatCloudError(error, "تعذر حفظ المهمة."));
        return;
      }
    }
    state.tasks = nextTasks;
    consumeFileSelection(true);
    const newFiles = acceptedFiles.map((file) => attachments.normalizeAttachment({
      id: createUuid(),
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      url: "#",
      storagePath: "",
      uploadedAt: today(),
      uploadedBy: state.currentUser.id,
    }));
    state.tasks = state.tasks.map((item) => (item.id === task.id ? { ...item, attachments: [...item.attachments, ...newFiles] } : item));
    for (const taskItem of tasksToSave) {
      await notifications.createNotificationsForTask(taskItem, existing ? "Task updated" : "Task created", `${taskItem.taskNumber} - ${taskItem.title}`, {
        excludeRecipientId: state.currentUser.id,
        type: existing ? "task_updated" : "task_created",
      });
      await notifications.notifyTaskAssignment(taskItem, existing || null);
    }
    scheduleTaskAlertSync(notifications, true);
    await audit.recordActivity(existing ? "task_updated" : "task_created", existing ? "تم تحديث مهمة" : "تم إنشاء مهمة", `${task.taskNumber} - ${task.title}${tasksToSave.length > 1 ? ` (${tasksToSave.length} مستخدمين)` : ""}`, task.schoolId, state.currentUser.id);
    await audit.recordAudit(existing ? "task_updated" : "task_created", "task", task.id, `تم حفظ ${task.taskNumber} محليًا.`, "medium", task.schoolId, state.currentUser.id);
    state.modal = null;
    persistLocal();
    render();
    showToast(taskSaveMessage);
  }

  async function deleteTask(id) {
    const { canDeleteTask, showToast, cloud, state, attachments, supabase, notifications, audit, persistLocal, render } = getContext();
    if (isTaskModalReadOnly(id)) {
      showToast("هذه المهمة مفتوحة للعرض فقط من التنبيهات.");
      return;
    }
    const taskToDelete = state.tasks.find((task) => task.id === id);
    if (!taskToDelete || !canDeleteTask(taskToDelete)) return;
    const confirmed = confirm("هل تريد حذف هذه المهمة وجميع التكرارات الناتجة عنها؟");
    if (!confirmed) return;
    await runTaskAction(id, async () => {
    const affectedTasks = taskChildrenToDelete(id);
    if (cloud.enabled) {
      try {
        await attachments.deleteAttachmentsForTasks(affectedTasks);
        await supabase.deleteCloudDoc("tasks", id);
        for (const task of affectedTasks) {
          await notifications.createNotificationsForTask(task, "تم حذف مهمة", `تم حذف ${task.taskNumber}.`, {
            excludeRecipientId: state.currentUser.id,
            type: "task_deleted",
          });
        }
      } catch (error) {
        console.error(error);
        showToast("تعذر حذف المهمة أو أحد مرفقاتها. لم تكتمل العملية.");
        return;
      }
      state.tasks = state.tasks.filter((task) => task.id !== id && task.sourceTaskId !== id);
      render();
      showToast("تم حذف المهمة.");
      return;
    }
    for (const task of affectedTasks) {
      await notifications.createNotificationsForTask(task, "تم حذف مهمة", `تم حذف ${task.taskNumber}.`, {
        excludeRecipientId: state.currentUser.id,
        type: "task_deleted",
      });
      await audit.recordAudit("task_deleted", "task", task.id, `تم حذف ${task.taskNumber} محليًا.`, "high", task.schoolId, state.currentUser.id);
    }
    await audit.recordActivity("task_deleted", "تم حذف مهمة", `تم حذف ${id} والتكرارات المرتبطة بها.`, affectedTasks[0]?.schoolId || state.currentUser.schoolId, state.currentUser.id);
    state.tasks = state.tasks.filter((task) => task.id !== id && task.sourceTaskId !== id);
    persistLocal();
    render();
    showToast("تم حذف المهمة.");
    });
  }

  async function runTaskAction(taskId, action) {
    const { state, render, showToast, supabase } = getContext();
    if (state.taskActionBusy?.[taskId]) return false;
    state.taskActionBusy = { ...(state.taskActionBusy || {}), [taskId]: true };
    render();
    try {
      await action();
      return true;
    } catch (error) {
      console.error(error);
      showToast(supabase?.formatCloudError?.(error, "تعذر تنفيذ الإجراء.") || error?.message || "تعذر تنفيذ الإجراء.");
      return false;
    } finally {
      const nextBusy = { ...(state.taskActionBusy || {}) };
      delete nextBusy[taskId];
      state.taskActionBusy = nextBusy;
      render();
    }
  }

  async function writeTaskUpdate(updatedTask, notificationTitle, notificationMessage, notificationType) {
    const { cloud, state, supabase, notifications, audit, persistLocal, render } = getContext();
    if (cloud.enabled) {
      await saveUpdatedTasksOptimistically([updatedTask], (item) => supabase.updateTaskWorkflow(item));
      await notifications.createNotificationsForTask(updatedTask, notificationTitle, notificationMessage, {
        excludeRecipientId: state.currentUser.id,
        type: notificationType,
      });
      scheduleTaskAlertSync(notifications, true);
      return;
    }
    state.tasks = state.tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item));
    await notifications.createNotificationsForTask(updatedTask, notificationTitle, notificationMessage, {
      excludeRecipientId: state.currentUser.id,
      type: notificationType,
    });
    scheduleTaskAlertSync(notifications, true);
    await audit.recordActivity(notificationType, notificationTitle, notificationMessage, updatedTask.schoolId, state.currentUser.id);
    persistLocal();
    render();
  }

  async function updateStatus(id, status) {
    const { state, canActOnTask, showToast, labels } = getContext();
    if (isTaskModalReadOnly(id)) {
      showToast("هذه المهمة مفتوحة للعرض فقط من التنبيهات.");
      return;
    }
    const task = state.tasks.find((item) => item.id === id);
    if (!task || !canActOnTask(task)) return;
    await runTaskAction(id, async () => {
      const updatedTask = updatedTaskWithStatus(task, status);
      await writeTaskUpdate(updatedTask, "تم تحديث حالة المهمة", `تم نقل ${updatedTask.taskNumber} إلى ${labels[effectiveStatus(updatedTask)]}.`, "task_status");
      showToast("تم تحديث حالة المهمة.");
    });
  }

  async function setTaskDisplayStatus(id, displayStatus) {
    const { state } = getContext();
    const task = state.tasks.find((item) => item.id === id);
    if (!task || !["not_done", "in_progress", "done"].includes(displayStatus)) return;
    const hasApproval = (task.approvals || []).some((approval) => approval.action === "approved");
    const status = displayStatus === "not_done"
      ? "new"
      : displayStatus === "in_progress"
        ? "in_progress"
        : task.approvalRequired && !hasApproval
          ? "under_review"
          : "completed";
    await updateStatus(id, status);
  }

  async function reopenTask(id) {
    const { state, canActOnTask, showToast } = getContext();
    if (isTaskModalReadOnly(id)) {
      showToast("هذه المهمة مفتوحة للعرض فقط من التنبيهات.");
      return;
    }
    const task = state.tasks.find((item) => item.id === id);
    if (!task || effectiveStatus(task) !== "completed" || !canActOnTask(task)) return;
    await runTaskAction(id, async () => {
      const updatedTask = updatedTaskWithStatus({ ...task, progress: Math.min(Number(task.progress || 0), 90), completedAt: "" }, "in_progress");
      await writeTaskUpdate(updatedTask, "تمت إعادة فتح المهمة", `تمت إعادة فتح ${updatedTask.taskNumber} ومتابعة تنفيذها.`, "task_reopened");
      showToast("تمت إعادة فتح المهمة.");
    });
  }

  async function archiveTask(id) {
    const { state, canEditTask, showToast } = getContext();
    if (isTaskModalReadOnly(id)) {
      showToast("هذه المهمة مفتوحة للعرض فقط من التنبيهات.");
      return;
    }
    const task = state.tasks.find((item) => item.id === id);
    if (!task || !canEditTask(task)) return;
    await runTaskAction(id, async () => {
      const updatedTask = updatedTaskWithStatus(task, "archived");
      await writeTaskUpdate(updatedTask, "تمت أرشفة المهمة", `تمت أرشفة ${updatedTask.taskNumber}.`, "task_archived");
      showToast("تمت أرشفة المهمة.");
    });
  }

  async function approveTask(id) {
    const { state, canApproveTask, showToast } = getContext();
    if (isTaskModalReadOnly(id)) {
      showToast("هذه المهمة مفتوحة للعرض فقط من التنبيهات.");
      return;
    }
    const task = state.tasks.find((item) => item.id === id);
    if (!task || !canApproveTask(task)) return;
    await runTaskAction(id, async () => {
      const approval = createApprovalRecord("approved", state.currentUser, "تم الاعتماد عبر مسار العمل.");
      const updatedTask = updatedTaskWithStatus({
        ...task,
        approvals: [...task.approvals, approval],
      }, "completed");
      await writeTaskUpdate(updatedTask, "تم اعتماد المهمة", `تم اعتماد ${updatedTask.taskNumber}.`, "task_approved");
      showToast("تم اعتماد المهمة.");
    });
  }

  async function addFeedback(event) {
    event.preventDefault();
    const { state, canCommentOnTask, showToast } = getContext();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id"));
    if (isTaskModalReadOnly(id)) {
      showToast("هذه المهمة مفتوحة للعرض فقط من التنبيهات.");
      return;
    }
    const text = String(form.get("feedback")).trim();
    const task = state.tasks.find((item) => item.id === id);
    if (!task || !text || !canCommentOnTask(task)) return;
    const comment = createCommentRecord(state.currentUser.id, text, "comment");
    const updatedTask = normalizeTask({
      ...task,
      comments: [...task.comments, comment],
      feedback: [...task.feedback, { userId: state.currentUser.id, text, at: today() }],
    });
    await runTaskAction(id, async () => {
      await writeTaskUpdate(updatedTask, "تمت إضافة تعليق", `تمت إضافة تعليق جديد إلى ${updatedTask.taskNumber}.`, "task_comment");
      state.modal = null;
      showToast("تم حفظ التعليق.");
    });
  }

  function averageProgress(tasks) {
    if (!tasks.length) return 0;
    return Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length);
  }

  function reportBaseTasks() {
    return filteredTasks(visibleTasks().filter((task) => task.recurrence !== "permanent"));
  }

  return {
    createCommentRecord,
    createApprovalRecord,
    generateTaskNumber,
    normalizeTask,
    generateRecurringInstances,
    taskWorkDate,
    effectiveStatus,
    visibleTasks,
    workTasks,
    standardWorkTasks,
    filteredTasks,
    latestComment,
    progressClass,
    taskDateText,
    renderFilters,
    renderComments,
    renderApprovals,
    renderTaskRow,
    renderDailyNotebook,
    renderPermanentDailyTasks,
    renderTasks,
    renderTaskModal,
    renderNotebookAssignmentModal,
    updateNotebookAssignmentSource,
    filterTaskAssigneesBySchool,
    renderFeedbackModal,
    pickPermanentOutcome,
    savePermanentDailyEntry,
    completePermanentDailyGroup,
    approvePermanentDailyEntry,
    approvePermanentDailyGroup,
    approveAllPermanentDailyNotebooks,
    renewPermanentDailyNotebook,
    archivePermanentDailyNotebook,
    saveDailyExtraTask,
    approveDailyExtraTask,
    approveAllDailyExtraTasks,
    addDailyExtraTaskRow,
    removeDailyExtraTaskRow,
    printDailyExtraTasks,
    saveTask,
    saveAssignedNotebook,
    deleteTask,
    updateStatus,
    setTaskDisplayStatus,
    reopenTask,
    archiveTask,
    approveTask,
    addFeedback,
    averageProgress,
    dailyNotebookStats,
    permanentDailySummary,
    allDailyExtraTasks,
    permanentDailyOutcome,
    permanentDailyNote,
    permanentDailyApproved,
    permanentNotebookActiveOnDate,
    uniquePermanentTaskRoots,
    permanentNotebookItemTitle,
    reportBaseTasks,
  };
}
