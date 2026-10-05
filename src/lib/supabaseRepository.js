import { createClient } from "@supabase/supabase-js";
import { schools as defaultSchools } from "../config/appConfig.js";
import { toStorageTimestamp } from "../utils/dateUtils.js";
import { isGeneralManager } from "../utils/permissionUtils.js";
import { sortSchools } from "../utils/schoolUtils.js";
import { supabaseAnonKey, supabaseUrl } from "./supabaseClient.js";

const TABLES = {
  schools: "schools",
  users: "profiles",
  tasks: "tasks",
  attachments: "attachments",
  notifications: "notifications",
  activityLogs: "activity_logs",
  auditLogs: "audit_logs",
  backups: "backups",
  financeDiscounts: "finance_discounts",
  gradeAdjustments: "grade_adjustments",
  teacherDirectory: "teacher_directory",
  staffEvaluations: "staff_evaluations",
  staffEvaluationSettings: "staff_evaluation_settings",
  administrativeReports: "administrative_reports",
  chatMessages: "chat_messages",
};

const COLUMN_MAPS = {
  users: {
    name: "full_name",
    schoolId: "school_id",
    linkedSchoolIds: "linked_school_ids",
    avatarUrl: "avatar_url",
    accessFlags: "access_flags",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  tasks: {
    taskNumber: "task_number",
    assigneeId: "assigned_to",
    creatorId: "created_by",
    schoolId: "school_id",
    dueDate: "due_date",
    completedAt: "completed_at",
    createdAt: "created_at",
    occurrenceDate: "occurrence_date",
    sourceTaskId: "source_task_id",
    approvalRequired: "approval_required",
    approverRole: "approver_role",
    recurrence: "recurrence_type",
    department: "department_name",
  },
  notifications: {
    recipientId: "user_id",
    schoolId: "school_id",
    taskId: "related_task_id",
    read: "is_read",
    dedupeKey: "dedupe_key",
    createdAt: "created_at",
  },
  schools: {
    shortName: "short_name",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  activityLogs: {
    schoolId: "school_id",
    userId: "user_id",
    type: "action",
    createdAt: "created_at",
  },
  auditLogs: {
    schoolId: "school_id",
    actorId: "user_id",
    createdAt: "created_at",
  },
  backups: {
    schoolId: "school_id",
    createdAt: "created_at",
    createdBy: "created_by",
    entityCounts: "entity_counts",
    label: "backup_name",
    payload: "backup_data",
  },
  attachments: {
    schoolId: "school_id",
    taskId: "task_id",
    uploadedBy: "uploaded_by",
    name: "file_name",
    storagePath: "file_path",
    type: "file_type",
    size: "file_size",
    uploadedAt: "created_at",
  },
  financeDiscounts: {
    schoolId: "school_id",
    studentName: "student_name",
    studentNumber: "student_number",
    className: "class_name",
    discountType: "discount_type",
    discountValue: "discount_value",
    assignedTo: "assigned_to",
    assignedToName: "assigned_to_name",
    receivedBy: "received_by",
    receivedByName: "received_by_name",
    createdBy: "created_by",
    createdByName: "created_by_name",
    receivedAt: "received_at",
    completedAt: "completed_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  gradeAdjustments: {
    schoolId: "school_id", studentName: "student_name", studentNumber: "student_number", month: "adjustment_month",
    assessmentPeriod: "assessment_period", gradeSection: "grade_section",
    subjectName: "subject_name", teacherName: "teacher_name", className: "class_name",
    sectionName: "section_name", previousGrade: "previous_grade", newGrade: "new_grade",
    assignedTo: "assigned_to", receivedBy: "received_by", createdBy: "created_by",
    receivedAt: "received_at", completedAt: "completed_at", createdAt: "created_at", updatedAt: "updated_at",
  },
  teacherDirectory: {
    schoolId: "school_id", teacherName: "teacher_name", subjectName: "subject_name", active: "active", createdBy: "created_by", createdAt: "created_at", updatedAt: "updated_at",
  },
  staffEvaluations: {
    schoolId: "school_id", teacherId: "teacher_id", teacherName: "teacher_name", subjectName: "subject_name", sequenceKey: "sequence_key", assessmentPeriod: "assessment_period", evaluatedAt: "evaluated_at", scores: "scores", total: "total", maxTotal: "max_total", notes: "notes", evaluatedBy: "evaluated_by", createdAt: "created_at", updatedAt: "updated_at",
  },
  staffEvaluationSettings: {
    schoolId: "school_id", openToAll: "open_to_all", updatedBy: "updated_by", createdAt: "created_at", updatedAt: "updated_at",
  },
  administrativeReports: {
    date: "report_date",
    schoolId: "school_id",
    supervisorId: "supervisor_id",
    buildingNotes: "building_notes",
    deputyTeacherSummary: "deputy_teacher_summary",
    deputyLearnerSummary: "deputy_learner_summary",
    deputyParentSummary: "deputy_parent_summary",
    deputyBuildingSummary: "deputy_building_summary",
    deputyRecommendations: "deputy_recommendations",
    deputyApprovedAt: "deputy_approved_at",
    deputyApprovedBy: "deputy_approved_by",
    principalApprovedAt: "principal_approved_at",
    principalApprovedBy: "principal_approved_by",
    submittedAt: "submitted_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  chatMessages: {
    schoolId: "school_id",
    senderId: "sender_id",
    recipientId: "recipient_id",
    text: "message",
    readAt: "read_at",
    createdAt: "created_at",
  },
};

function renameKeys(value, map) {
  return Object.fromEntries(Object.entries(value || {}).map(([key, inner]) => [map[key] || key, inner]));
}

function reverseMap(map) {
  return Object.fromEntries(Object.entries(map || {}).map(([key, value]) => [value, key]));
}

function tableName(collectionName) {
  const name = TABLES[collectionName];
  if (!name) throw new Error(`مجموعة البيانات غير معروفة: ${collectionName}`);
  return name;
}

function toDatabaseRow(collectionName, data) {
  const row = renameKeys(data, COLUMN_MAPS[collectionName] || {});
  delete row.createdAtTs;
  delete row.dueAt;
  delete row.occurrenceAt;
  if (collectionName === "users") {
    row.status = data.active === false ? "inactive" : "active";
    delete row.active;
  }
  if (collectionName === "tasks") {
    row.status = data.status === "new" ? "pending" : data.status;
    row.source_task_id = row.source_task_id || null;
    row.occurrence_date = row.occurrence_date || null;
    row.due_date = toStorageTimestamp(data.dueDate);
    row.completed_at = data.completedAt ? toStorageTimestamp(data.completedAt) : null;
    row.created_at = toStorageTimestamp(data.createdAt) || row.created_at;
    row.assigned_to = row.assigned_to || null;
    row.created_by = row.created_by || null;
    delete row.attachments;
  }
  if (collectionName === "activityLogs") {
    row.details = { title: data.title || "", description: data.description || "" };
    row.entity_type = data.entityType || null;
    row.entity_id = data.entityId || null;
    delete row.title;
    delete row.description;
  }
  if (collectionName === "auditLogs") {
    row.details = { targetType: data.targetType || "system", targetId: data.targetId || "", message: data.details || "" };
    delete row.targetType;
    delete row.targetId;
  }
  if (collectionName === "attachments") {
    delete row.url;
    delete row.previewKind;
  }
  if (collectionName === "financeDiscounts") {
    row.assigned_to = row.assigned_to || null;
    row.received_by = row.received_by || null;
    row.created_by = row.created_by || null;
    row.received_at = data.receivedAt ? toStorageTimestamp(data.receivedAt) : null;
    row.completed_at = data.completedAt ? toStorageTimestamp(data.completedAt) : null;
    row.created_at = toStorageTimestamp(data.createdAt) || row.created_at;
    row.updated_at = toStorageTimestamp(data.updatedAt) || row.updated_at;
  }
  if (collectionName === "gradeAdjustments") {
    row.assigned_to = row.assigned_to || null;
    row.received_by = row.received_by || null;
    row.created_by = row.created_by || null;
    row.received_at = data.receivedAt ? toStorageTimestamp(data.receivedAt) : null;
    row.completed_at = data.completedAt ? toStorageTimestamp(data.completedAt) : null;
    row.created_at = toStorageTimestamp(data.createdAt) || row.created_at;
    row.updated_at = toStorageTimestamp(data.updatedAt) || row.updated_at;
  }
  if (collectionName === "administrativeReports") {
    const reportDate = String(data.date || "");
    row.report_date = /^\d{4}-\d{2}-\d{2}$/.test(reportDate) ? reportDate : new Date().toISOString().slice(0, 10);
    row.supervisor_id = row.supervisor_id || null;
    row.deputy_approved_by = row.deputy_approved_by || null;
    row.principal_approved_by = row.principal_approved_by || null;
    row.submitted_at = data.submittedAt ? toStorageTimestamp(data.submittedAt) : null;
    row.deputy_approved_at = data.deputyApprovedAt ? toStorageTimestamp(data.deputyApprovedAt) : null;
    row.principal_approved_at = data.principalApprovedAt ? toStorageTimestamp(data.principalApprovedAt) : null;
    row.created_at = toStorageTimestamp(data.createdAt) || row.created_at;
    row.updated_at = toStorageTimestamp(data.updatedAt) || row.updated_at;
  }
  if (collectionName === "chatMessages") {
    row.sender_id = row.sender_id || null;
    row.recipient_id = row.recipient_id || null;
    row.read_at = data.readAt ? toStorageTimestamp(data.readAt) : null;
    row.created_at = toStorageTimestamp(data.createdAt) || row.created_at;
  }
  if (collectionName === "schools") {
    delete row.short_name;
    if (!row.created_at) delete row.created_at;
    if (!row.updated_at) delete row.updated_at;
  }
  return row;
}

function fromDatabaseRow(collectionName, row) {
  if (!row) return null;
  const value = renameKeys(row, reverseMap(COLUMN_MAPS[collectionName] || {}));
  if (collectionName === "users") value.active = row.status === "active";
  if (collectionName === "tasks") value.status = row.status === "pending" ? "new" : row.status;
  if (collectionName === "activityLogs") {
    value.title = row.details?.title || row.action || "نشاط";
    value.description = row.details?.description || "";
  }
  if (collectionName === "auditLogs") {
    value.targetType = row.details?.targetType || "system";
    value.targetId = row.details?.targetId || "";
    value.details = row.details?.message || "";
  }
  return value;
}

function formatStartupError(error) {
  const message = error?.message ? String(error.message) : "تعذر إكمال التهيئة الأولية.";
  return `تعذر تهيئة الاتصال بخدمات Supabase. ${message}`;
}

function formatCloudError(error, fallbackMessage) {
  const message = String(error?.message || "");
  const normalized = message.toLowerCase();
  if (normalized.includes("write_log_entry") || normalized.includes("schema cache")) {
    return "تم حفظ البيانات، لكن تعذر تحديث سجل النشاط مؤقتًا. حدّث الصفحة وحاول مرة أخرى إذا لزم.";
  }
  if (normalized.includes("invalid input syntax for type timestamp")) {
    return "تعذر حفظ البيانات بسبب قيمة تاريخ غير صحيحة. حدّث الصفحة ثم أعد المحاولة.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("load failed")) {
    return "تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.";
  }
  if (normalized.includes("permission denied") || normalized.includes("row-level security") || normalized.includes("not authorized")) {
    return "لا توجد صلاحية كافية لتنفيذ هذه العملية.";
  }
  if (message.includes("there is no unique or exclusion constraint matching the ON CONFLICT specification")) {
    return "تعذر حفظ المهمة بسبب إعداد قديم في قاعدة البيانات. طبّق آخر تحديثات Supabase ثم أعد المحاولة.";
  }
  if (message.includes("duplicate key") && message.includes("task_number")) {
    return "تعذر حفظ دفتر المهام بسبب تكرار رقم داخلي. أعد المحاولة بعد تحديث الصفحة.";
  }
  if (message.includes("Duplicate notebook task for this employee")) {
    return "لم تتم إضافة المهمة لأنها موجودة مسبقًا في دفتر هذا الموظف.";
  }
  return fallbackMessage || "تعذر تنفيذ العملية. حاول مرة أخرى.";
}

function isTransientConnectionError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed") ||
    message.includes("timeout") ||
    message.includes("aborted")
  );
}

export function createSupabaseModule(getContext) {
  let profileChannel = null;
  let scopedChannel = null;
  let authSubscription = null;
  let reloadTimer = null;
  let profileRetryTimer = null;
  let scopedLoadVersion = 0;
  let dashboardRefreshPending = false;
  let lifecycleRefreshBound = false;
  let lastLifecycleRefreshAt = 0;
  const signedUrlCache = new Map();
  const PROFILE_CACHE_KEY = "schoolTaskProfileCacheV1";
  const SCOPED_DATA_CACHE_KEY = "schoolTaskScopedDataCacheV1";
  const PROFILE_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

  function browserIsOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  function queueId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function readOfflineQueue() {
    const { state, OFFLINE_QUEUE_KEY, storageGet } = getContext();
    const ownerId = state.currentUser?.id || "";
    if (!ownerId) {
      state.offlineQueue = [];
      return state.offlineQueue;
    }
    const queueKey = `${OFFLINE_QUEUE_KEY}:${ownerId}`;
    const queue = storageGet(queueKey, []);
    state.offlineQueue = queue;
    return queue;
  }

  function writeOfflineQueue(queue) {
    const { state, OFFLINE_QUEUE_KEY } = getContext();
    const ownerId = state.currentUser?.id || "";
    if (!ownerId) throw new Error("يجب تسجيل الدخول قبل حفظ تغييرات دون اتصال.");
    state.offlineQueue = queue;
    try {
      localStorage.setItem(`${OFFLINE_QUEUE_KEY}:${ownerId}`, JSON.stringify(queue));
    } catch (error) {
      console.warn("تعذر حفظ التغييرات المحلية.", error);
    }
  }

  function queueOfflineMutation(mutation) {
    const queue = readOfflineQueue();
    const ownerId = getContext().state.currentUser?.id || "";
    if (!ownerId) throw new Error("يجب تسجيل الدخول قبل حفظ تغييرات دون اتصال.");
    const entry = { id: queueId(), ownerId, createdAt: new Date().toISOString(), ...mutation };
    writeOfflineQueue([...queue, entry]);
    getContext().render?.();
    return entry;
  }

  function readScopedDataCache(profile) {
    try {
      const cached = JSON.parse(localStorage.getItem(SCOPED_DATA_CACHE_KEY) || "null");
      if (!cached?.profileId || cached.profileId !== profile?.id) return null;
      return cached;
    } catch {
      return null;
    }
  }

  function writeScopedDataCache(profile, data) {
    if (!profile?.id) return;
    try {
      const privateSafeData = {
        ...data,
        core: data?.core ? { ...data.core, chatMessages: [] } : data?.core,
      };
      localStorage.setItem(SCOPED_DATA_CACHE_KEY, JSON.stringify({
        profileId: profile.id,
        savedAt: new Date().toISOString(),
        data: privateSafeData,
      }));
    } catch (error) {
      console.warn("تعذر حفظ نسخة البيانات المحلية.", error);
    }
  }

  function readCachedProfile(uid) {
    try {
      const cached = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || "null");
      if (!cached?.profile || cached.uid !== uid || Date.now() - Number(cached.savedAt || 0) > PROFILE_CACHE_MAX_AGE) return null;
      return getContext().users.normalizeUser(cached.profile);
    } catch {
      return null;
    }
  }

  function cacheProfile(profile) {
    if (!profile?.id) return;
    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ uid: profile.id, savedAt: Date.now(), profile }));
    } catch (error) {
      console.warn("تعذر حفظ ملف المستخدم محليًا.", error);
    }
  }

  function clearCachedProfile() {
    try {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch {
      // Local storage can be unavailable in restricted browser modes.
    }
  }

  function restoreCachedProfile(uid) {
    const profile = readCachedProfile(uid);
    if (!profile) return false;
    const { state } = getContext();
    state.currentUser = profile;
    state.loginBusy = false;
    state.loginError = "";
    state.profileError = "";
    return true;
  }

  function scheduleProfileRetry(uid) {
    if (!uid) return;
    if (profileRetryTimer) window.clearTimeout(profileRetryTimer);
    profileRetryTimer = window.setTimeout(() => {
      profileRetryTimer = null;
      startProfileListener(uid).catch((error) => {
        console.warn("Profile reload failed; keeping the saved session.", error);
        scheduleProfileRetry(uid);
      });
    }, navigator.onLine === false ? 5000 : 2500);
  }

  function scheduleReload(profile, changedTable = "", payload = null) {
    if (changedTable === "notifications" && payload?.eventType === "INSERT") {
      const notification = fromDatabaseRow("notifications", payload.new);
      if (notification?.recipientId === profile.id) {
        getContext().notifications.showRealtimeNotification(notification);
      }
    }
    if (["tasks", "activityLogs", "users"].includes(changedTable) || changedTable === "administrativeReports") dashboardRefreshPending = true;
    if (reloadTimer) window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => {
      const refreshDashboard = dashboardRefreshPending;
      dashboardRefreshPending = false;
      loadScopedData(profile, refreshDashboard, { deferSecondary: true, secondaryDelay: 1200 }).catch((error) => handleDataError("تحديث البيانات", error));
    }, 420);
  }

  async function refreshAfterResume(restartRealtime = false) {
    const { cloud, state } = getContext();
    if (!cloud.enabled || !cloud.client || !state.currentUser || navigator.onLine === false) return;
    const now = Date.now();
    if (now - lastLifecycleRefreshAt < 12000) return;
    lastLifecycleRefreshAt = now;
    try {
      if (restartRealtime) {
        cloud.scopeKey = "";
        await startScopedListeners(state.currentUser);
      } else {
        await refreshCloudData(false, { deferSecondary: true, secondaryDelay: 1400 });
      }
    } catch (error) {
      console.warn("تعذر تحديث البيانات بعد استئناف التطبيق.", error);
    }
  }

  function bindLifecycleRefresh() {
    if (lifecycleRefreshBound || typeof window === "undefined" || typeof document === "undefined") return;
    lifecycleRefreshBound = true;
    window.addEventListener("online", () => refreshAfterResume(true));
    window.addEventListener("focus", () => refreshAfterResume(false));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshAfterResume(false);
    });
  }

  async function removeChannel(channel) {
    const { cloud } = getContext();
    if (channel && cloud.client) await cloud.client.removeChannel(channel);
  }

  async function stopCloudListeners() {
    scopedLoadVersion += 1;
    if (reloadTimer) window.clearTimeout(reloadTimer);
    if (profileRetryTimer) window.clearTimeout(profileRetryTimer);
    reloadTimer = null;
    profileRetryTimer = null;
    dashboardRefreshPending = false;
    await Promise.all([removeChannel(profileChannel), removeChannel(scopedChannel)]);
    profileChannel = null;
    scopedChannel = null;
    getContext().notifications?.stopAlertScheduler?.();
    getContext().cloud.scopeKey = "";
  }

  function clearProtectedData() {
    const { state, paginationDefaults } = getContext();
    state.currentUser = null;
    state.schools = sortSchools(defaultSchools);
    state.users = [];
    state.tasks = [];
    state.taskActionBusy = {};
    state.notifications = [];
    state.chatMessages = [];
    state.chatSelectedUserId = "";
    state.activityLogs = [];
    state.auditLogs = [];
    state.backups = [];
    state.financeDiscounts = [];
    state.gradeAdjustments = [];
    state.gradeAdjustmentBusy = {};
    state.gradeAdjustmentFilters = { search: "", status: "all", month: "", from: "", to: "" };
    state.teacherDirectory = [];
    state.staffEvaluations = [];
    state.staffEvaluationSettings = [];
    state.staffEvaluationDraftSequence = "";
    state.staffEvaluationDraftTeacherId = "";
    state.financeBusy = {};
    state.financeFilters = { search: "", status: "all", assigneeId: "all", from: "", to: "" };
    state.backupBusy = false;
    state.filters = { assigneeId: "all", priority: "all", recurrence: "all", status: "all", department: "all", from: "", to: "" };
    state.userFilters = { query: "", role: "all", status: "active", schoolId: "all" };
    state.search = "";
    state.dailyNotebookEmployeeId = "all";
    state.pagination = { ...paginationDefaults };
    state.dashboardData = null;
    state.dashboardLoading = false;
    state.dashboardError = "";
    state.userFilters = { query: "", role: "all", status: "all", schoolId: "all" };
    state.pagination = { ...paginationDefaults };
  }

  async function clearProtectedState() {
    await stopCloudListeners();
    clearProtectedData();
  }

  async function resetCloudState() {
    const { cloud } = getContext();
    await stopCloudListeners();
    authSubscription?.unsubscribe();
    authSubscription = null;
    clearProtectedData();
    cloud.enabled = false;
    cloud.client = null;
    cloud.authUser = null;
    cloud.recurringSyncInFlight = false;
  }

  function scopedQuery(collectionName, profile) {
    const { cloud, state } = getContext();
    let query = collectionName === "backups"
      ? cloud.client.from(tableName(collectionName)).select("id,school_id,created_by,backup_name,created_at,entity_counts")
      : cloud.client.from(tableName(collectionName)).select("*");
    if (collectionName === "schools") {
      if (isGeneralManager(profile)) return query;
      return query.eq("id", profile.schoolId);
    }
    if (collectionName === "users") {
      if (isGeneralManager(profile)) return query;
      return query.eq("school_id", profile.schoolId);
    }
    if (collectionName === "tasks") {
      if (isGeneralManager(profile)) return query;
      return query.eq("school_id", profile.schoolId);
    }
    if (collectionName === "notifications") {
      return query.eq("user_id", profile.id).order("created_at", { ascending: false }).limit(200);
    }
    if (collectionName === "chatMessages") {
      return query.or(`sender_id.eq.${profile.id},recipient_id.eq.${profile.id}`).order("created_at", { ascending: false }).limit(500);
    }
    if (collectionName === "administrativeReports") {
      if (isGeneralManager(profile)) return query.order("report_date", { ascending: false }).limit(1200);
      return query.eq("school_id", profile.schoolId).order("report_date", { ascending: false }).limit(1200);
    }
    if (!(isGeneralManager(profile) && state.activeSchoolId === "all")) {
      const schoolId = isGeneralManager(profile) ? state.activeSchoolId : profile.schoolId;
      query = query.eq("school_id", schoolId);
    }
    if (["activityLogs", "auditLogs"].includes(collectionName)) {
      return query.order("created_at", { ascending: false }).limit(500);
    }
    if (collectionName === "backups") return query.order("created_at", { ascending: false }).limit(50);
    return query;
  }

  async function fetchScopedCollections(names, profile) {
    const entries = await Promise.all(names.map(async (name) => {
      const { data, error } = await scopedQuery(name, profile);
      if (error && name === "administrativeReports" && String(error.message || "").includes("administrative_reports")) {
        console.warn("Administrative reports table is not ready yet", error);
        return [name, []];
      }
      if (error && name === "chatMessages" && String(error.message || "").includes("chat_messages")) {
        console.warn("Chat messages table is not ready yet", error);
        return [name, []];
      }
      if (error && ["teacherDirectory", "staffEvaluations", "staffEvaluationSettings"].includes(name) && (String(error.message || "").includes("schema cache") || String(error.message || "").includes(TABLES[name]))) {
        console.warn(`${name} table is not ready yet`, error);
        return [name, []];
      }
      if (error) throw error;
      return [name, (data || []).map((row) => fromDatabaseRow(name, row))];
    }));
    return Object.fromEntries(entries);
  }

  function runDeferred(callback, delay = 900) {
    if (typeof window === "undefined") {
      callback();
      return;
    }
    window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(callback, { timeout: 2500 });
        return;
      }
      callback();
    }, delay);
  }

  async function resolveAttachmentUrls(tasks) {
    const { cloud } = getContext();
    const now = Date.now();
    const paths = [...new Set(tasks.flatMap((task) => task.attachments || []).map((item) => item.storagePath).filter(Boolean))];
    if (!paths.length) return tasks;
    const missingPaths = paths.filter((path) => {
      const cached = signedUrlCache.get(path);
      return !cached || cached.expiresAt <= now;
    });
    if (missingPaths.length) {
      const { data, error } = await cloud.client.storage.from("task-attachments").createSignedUrls(missingPaths, 3600);
      if (error) {
        console.warn("تعذر إنشاء روابط معاينة المرفقات", error);
      } else {
        for (const item of data || []) signedUrlCache.set(item.path, { url: item.signedUrl, expiresAt: now + 3300000 });
      }
    }
    return tasks.map((task) => ({
      ...task,
      attachments: (task.attachments || []).map((attachment) => ({
        ...attachment,
        url: signedUrlCache.get(attachment.storagePath)?.url || "#",
      })),
    }));
  }

  function applyNotificationDeepLink() {
    if (typeof window === "undefined" || !window.location?.href) return;
    const url = new URL(window.location.href);
    const taskId = url.searchParams.get("task");
    const view = url.searchParams.get("view");
    const { state, canReadTask } = getContext();
    if (taskId) {
      const task = state.tasks.find((item) => item.id === taskId);
      if (task && canReadTask(task)) {
        state.view = "tasks";
        state.modal = { type: "task", id: taskId };
      }
      url.searchParams.delete("task");
    } else if (["notifications", "chat", "tasks"].includes(view)) {
      state.view = view;
    }
    url.searchParams.delete("view");
    if (window.history?.replaceState) window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function loadDashboardData(profile = getContext().state.currentUser, shouldRender = true) {
    const { cloud, state, render } = getContext();
    if (!cloud.enabled || !profile) return null;
    state.dashboardLoading = true;
    state.dashboardError = "";
    if (shouldRender) render();
    const nullableFilter = (value) => (!value || value === "all" ? null : value);
    const schoolScope = isGeneralManager(profile) ? state.activeSchoolId : profile.schoolId;
    const { data, error } = await cloud.client.rpc("get_dashboard_data", {
      p_school_scope: schoolScope || "all",
      p_status: nullableFilter(state.filters.status),
      p_priority: nullableFilter(state.filters.priority),
      p_assignee_id: nullableFilter(state.filters.assigneeId),
      p_department: nullableFilter(state.filters.department),
      p_recurrence: nullableFilter(state.filters.recurrence),
      p_due_from: state.filters.from || null,
      p_due_to: state.filters.to || null,
      p_search: state.search.trim() || null,
    });
    state.dashboardLoading = false;
    if (error) {
      state.dashboardData = null;
      state.dashboardError = error.message || "تعذر تحميل بيانات لوحة التحكم.";
      if (shouldRender) render();
      throw error;
    }
    state.dashboardData = data || null;
    state.dashboardError = "";
    if (shouldRender) render();
    return state.dashboardData;
  }

  async function loadScopedData(profile, refreshDashboard = true, options = {}) {
    const { state, users, tasks, finance, notifications, backup, audit, chat, render } = getContext();
    const loadVersion = ++scopedLoadVersion;
    let core = null;
    let cachedSnapshot = null;
    try {
      core = await fetchScopedCollections(["schools", "users", "tasks", "notifications", "financeDiscounts", "gradeAdjustments", "teacherDirectory", "staffEvaluations", "staffEvaluationSettings", "administrativeReports", "chatMessages"], profile);
    } catch (error) {
      cachedSnapshot = readScopedDataCache(profile);
      if (!cachedSnapshot?.data?.core) throw error;
      core = cachedSnapshot.data.core;
      state.isOffline = true;
      getContext().applyTheme?.();
      getContext().showToast("لا يوجد اتصال بالإنترنت. تم فتح آخر نسخة محفوظة من البيانات.");
    }
    if (loadVersion !== scopedLoadVersion) return;
    const loadedSchools = core.schools.map(users.normalizeSchool);
    state.schools = sortSchools(loadedSchools.length ? loadedSchools : defaultSchools);
    if (state.activeSchoolId !== "all" && !state.schools.some((school) => school.id === state.activeSchoolId)) {
      state.activeSchoolId = "all";
      localStorage.setItem("schoolTaskActiveSchool", "all");
    }
    state.users = core.users.map(users.normalizeUser);
    const coreTasks = core.tasks.map((task) => tasks.normalizeTask({ ...task, attachments: [] }));
    state.tasks = tasks.generateRecurringInstances(coreTasks);
    state.financeDiscounts = core.financeDiscounts.map(finance.normalizeDiscount);
    state.gradeAdjustments = core.gradeAdjustments.map(getContext().gradeAdjustments.normalizeAdjustment);
    state.teacherDirectory = (core.teacherDirectory || []).map((item) => ({ ...item, active: item.active !== false }));
    state.staffEvaluations = (core.staffEvaluations || []).map(getContext().staffEvaluations.normalizeEvaluation);
    state.staffEvaluationSettings = core.staffEvaluationSettings || [];
    if (state.modal?.type === "staff_evaluation") {
      const evaluationSchoolId = isGeneralManager(profile) ? state.activeSchoolId : profile.schoolId;
      const evaluationOpen = state.staffEvaluationSettings.some((item) => item.schoolId === evaluationSchoolId && item.openToAll === true);
      if (!evaluationOpen) state.modal = null;
    }
    state.administrativeReports = (core.administrativeReports || []).map((report) => getContext().administrativeReports.normalizeReport(report));
    state.chatMessages = (core.chatMessages || []).map(chat.normalizeChatMessage).sort((a, b) => getContext().compareTimestamp(a.createdAt, b.createdAt));
    const activeAssigneeIds = new Set([
      profile.id,
      ...state.users.filter((user) => user.active).map((user) => user.id),
    ]);
    if (state.filters.assigneeId !== "all" && !activeAssigneeIds.has(state.filters.assigneeId)) state.filters.assigneeId = "all";
    if (state.dailyNotebookEmployeeId !== "all" && !activeAssigneeIds.has(state.dailyNotebookEmployeeId)) state.dailyNotebookEmployeeId = "all";
    applyNotificationDeepLink();
    state.notifications = core.notifications.map(notifications.normalizeNotification).sort((a, b) => getContext().compareTimestamp(b.createdAt, a.createdAt));
    notifications.showPendingDeviceNotifications?.("load").catch((error) => console.error("Pending notification display failed", error));
    render();

    const finishBackgroundLoad = async () => {
      let secondary = cachedSnapshot?.data?.secondary || null;
      if (!secondary) {
        secondary = await fetchScopedCollections(["attachments", "activityLogs", "auditLogs", "backups"], profile);
        writeScopedDataCache(profile, { core, secondary });
      }
      if (loadVersion !== scopedLoadVersion) return;
      const attachmentsByTask = new Map();
      secondary.attachments.forEach((attachment) => {
        const list = attachmentsByTask.get(attachment.taskId) || [];
        list.push(attachment);
        attachmentsByTask.set(attachment.taskId, list);
      });
      const rawTasks = core.tasks.map((task) => tasks.normalizeTask({ ...task, attachments: attachmentsByTask.get(task.id) || [] }));
      state.tasks = tasks.generateRecurringInstances(await resolveAttachmentUrls(rawTasks));
      state.activityLogs = secondary.activityLogs.map(audit.normalizeActivityLog).sort((a, b) => getContext().compareTimestamp(b.createdAt, a.createdAt));
      state.auditLogs = secondary.auditLogs.map(audit.normalizeAuditLog).sort((a, b) => getContext().compareTimestamp(b.createdAt, a.createdAt));
      state.backups = secondary.backups.map(backup.normalizeBackup).sort((a, b) => getContext().compareTimestamp(b.createdAt, a.createdAt));
      render();
      if (refreshDashboard) {
        try {
          await loadDashboardData(profile, true);
        } catch (error) {
          console.error("Dashboard query failed", error);
        }
      }
      window.setTimeout(() => {
        notifications.syncTaskAlerts().catch((error) => console.error("Task alert sync failed", error));
        persistGeneratedTasks(profile, rawTasks, state.tasks).catch((error) => console.error("Generated task sync failed", error));
      }, 1200);
    };

    if (options.deferSecondary) {
      runDeferred(() => {
        finishBackgroundLoad().catch((error) => handleDataError("تحميل البيانات الإضافية", error));
      }, options.secondaryDelay ?? 900);
      return;
    }
    await finishBackgroundLoad();
  }

  async function refreshCloudData(refreshDashboard = true) {
    const options = arguments[1] || {};
    const { state } = getContext();
    if (!state.currentUser) return;
    await loadScopedData(state.currentUser, refreshDashboard, options);
  }

  async function persistGeneratedTasks(profile, rawTasks, generatedTasks) {
    const { cloud, canManageTaskDefinitions } = getContext();
    if (!canManageTaskDefinitions(profile) || cloud.recurringSyncInFlight) return;
    const rawIds = new Set(rawTasks.map((task) => task.id));
    const missing = generatedTasks.filter((task) => !rawIds.has(task.id));
    if (!missing.length) return;
    cloud.recurringSyncInFlight = true;
    try {
      for (const task of missing) await saveCloudDoc("tasks", task.id, cloudTaskData(task), false);
    } finally {
      cloud.recurringSyncInFlight = false;
    }
  }

  function realtimeFilter(collectionName, profile) {
    const { state } = getContext();
    if (collectionName === "schools") return isGeneralManager(profile) ? undefined : `id=eq.${profile.schoolId}`;
    if (collectionName === "users") return isGeneralManager(profile) ? undefined : `school_id=eq.${profile.schoolId}`;
    if (collectionName === "tasks") {
      if (isGeneralManager(profile)) return undefined;
      return `school_id=eq.${profile.schoolId}`;
    }
    if (collectionName === "notifications") return `user_id=eq.${profile.id}`;
    if (collectionName === "chatMessages") return undefined;
    if (collectionName === "administrativeReports") return isGeneralManager(profile) ? undefined : `school_id=eq.${profile.schoolId}`;
    if (isGeneralManager(profile) && state.activeSchoolId === "all") return undefined;
    const schoolId = isGeneralManager(profile) ? state.activeSchoolId : profile.schoolId;
    return `school_id=eq.${schoolId}`;
  }

  async function startScopedListeners(profile) {
    const { cloud, state } = getContext();
    const scopeKey = `${profile.id}:${profile.role}:${profile.schoolId}:${state.activeSchoolId}`;
    if (cloud.scopeKey === scopeKey) return;
    await removeChannel(scopedChannel);
    await loadScopedData(profile, true, { deferSecondary: true });
    cloud.scopeKey = scopeKey;
    scopedChannel = cloud.client.channel(`school-data-${scopeKey}`);
    for (const collectionName of Object.keys(TABLES)) {
      const options = { event: "*", schema: "public", table: tableName(collectionName) };
      const filter = realtimeFilter(collectionName, profile);
      if (filter) options.filter = filter;
      scopedChannel.on("postgres_changes", options, (payload) => scheduleReload(profile, collectionName, payload));
    }
    scopedChannel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") handleDataError("التحديثات الفورية", new Error("تعذر فتح قناة Realtime."));
    });
  }

  function handleDataError(label, error) {
    console.error(`${label} failed`, error);
    getContext().showToast(`تعذر ${label}. تحقق من الاتصال وسياسات Supabase.`);
  }

  async function loadProfile(uid) {
    const { cloud, state, users, render, notifications } = getContext();
    const { data, error } = await cloud.client.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (error) throw error;
    if (!data) {
      await removeChannel(scopedChannel);
      scopedChannel = null;
      cloud.scopeKey = "";
      clearProtectedData();
      state.loginBusy = false;
      state.profileError = "تم تسجيل الدخول بنجاح، لكن لا يوجد ملف مستخدم مطابق داخل جدول profiles.";
      render();
      return;
    }
    const profile = users.normalizeUser(fromDatabaseRow("users", data));
    if (!profile.active) {
      await removeChannel(scopedChannel);
      scopedChannel = null;
      cloud.scopeKey = "";
      clearProtectedData();
      state.loginBusy = false;
      state.profileError = "هذا الحساب غير نشط. يرجى التواصل مع المسؤول.";
      render();
      return;
    }
    if (!profile.schoolId) {
      await removeChannel(scopedChannel);
      scopedChannel = null;
      cloud.scopeKey = "";
      clearProtectedData();
      state.loginBusy = false;
      state.profileError = "الحساب نشط لكنه غير مرتبط بمدرسة. يرجى التواصل مع المسؤول.";
      render();
      return;
    }
    state.currentUser = profile;
    readOfflineQueue();
    state.loginBusy = false;
    state.loginError = "";
    state.profileError = "";
    cacheProfile(profile);
    render();
    await startScopedListeners(profile);
    notifications.startAlertScheduler();
    notifications.maybeEnableNotificationsSilently().catch((error) => console.error("Silent notifications setup failed", error));
    render();
  }

  async function startProfileListener(uid) {
    const { cloud } = getContext();
    await removeChannel(profileChannel);
    await loadProfile(uid);
    profileChannel = cloud.client
      .channel(`profile-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${uid}` }, () => {
        loadProfile(uid).catch((error) => handleDataError("تحديث ملف المستخدم", error));
      })
      .subscribe();
  }

  async function initCloud() {
    const { supabaseClient, isSupabaseConfigured, cloud, state, render, auth } = getContext();
    if (!isSupabaseConfigured()) {
      state.startupError = "لم يتم العثور على إعدادات الاتصال العامة المطلوبة.";
      return false;
    }
    try {
      cloud.client = supabaseClient;
      cloud.enabled = true;
      bindLifecycleRefresh();
      state.startupError = "";
      state.notificationsSupported = ("Notification" in window && "serviceWorker" in navigator) || Boolean(window.Capacitor?.isNativePlatform?.());
      const { data, error } = await auth.getCurrentSession();
      if (error) {
        console.warn("تعذر قراءة الجلسة المحفوظة مؤقتًا دون حذفها.", error);
      }
      cloud.authUser = error ? null : data.session?.user || null;
      render();
      if (cloud.authUser) {
        const restoredFromCache = restoreCachedProfile(cloud.authUser.id);
        if (restoredFromCache) {
          render();
          startProfileListener(cloud.authUser.id).catch((profileError) => {
            console.warn("تعذر تحديث ملف المستخدم الآن، وسيتم الاحتفاظ بالجلسة الحالية.", profileError);
            state.loginBusy = false;
            render();
            scheduleProfileRetry(cloud.authUser?.id);
          });
        } else {
          await startProfileListener(cloud.authUser.id);
        }
      }
      authSubscription?.unsubscribe();
      authSubscription = auth.listenToAuthStateChanges((event, session) => {
        window.setTimeout(async () => {
          const nextUser = session?.user || null;
          if (nextUser?.id && nextUser.id === cloud.authUser?.id && nextUser.id === state.currentUser?.id && event !== "USER_UPDATED") return;
          cloud.authUser = nextUser;
          if (!cloud.authUser) {
            await clearProtectedState();
            state.loginBusy = false;
            state.profileError = "";
            render();
            return;
          }
          state.loginBusy = true;
          render();
          try {
            await startProfileListener(cloud.authUser.id);
          } catch (error) {
            state.loginBusy = false;
            if (!state.currentUser) restoreCachedProfile(cloud.authUser.id);
            if (!state.currentUser) state.profileError = `تعذر قراءة ملف المستخدم من Supabase. ${error?.message || ""}`;
            render();
            scheduleProfileRetry(cloud.authUser.id);
          }
        }, 0);
      });
      return true;
    } catch (error) {
      const message = String(error?.message || error || "");
      if (/failed to fetch|network|load failed|fetch/i.test(message)) {
        console.warn("تعذر الاتصال أثناء بدء التشغيل، وسيتم الاحتفاظ بالجلسة المحفوظة وإعادة المحاولة.", error);
        cloud.client = supabaseClient;
        cloud.enabled = true;
        state.loginBusy = false;
        state.startupError = "";
        if (cloud.authUser?.id) {
          restoreCachedProfile(cloud.authUser.id);
          scheduleProfileRetry(cloud.authUser.id);
        }
        return true;
      }
      state.startupError = formatStartupError(error);
      await resetCloudState();
      return false;
    }
  }

  function cloudTaskData(task) {
    const { tasks } = getContext();
    const { id, ...data } = tasks.normalizeTask(task);
    return data;
  }

  function isCloudEnabled() {
    const { cloud } = getContext();
    return !!cloud.enabled && !!cloud.client;
  }

  async function saveCloudDoc(collectionName, id, data, merge = true) {
    const { cloud } = getContext();
    if (browserIsOffline() || !cloud.client) {
      queueOfflineMutation({ type: "save", collectionName, docId: id, data, merge });
      getContext().showToast?.("لا يوجد اتصال. تم حفظ التغيير محليا وسيتم إرساله عند المزامنة.");
      return { queued: true };
    }
    if (collectionName === "administrativeReports" && !merge) {
      try {
        const { data: savedId, error } = await cloud.client.rpc("save_administrative_report", { p_report: { id, ...data } });
        if (error) throw error;
        return { id: savedId || id };
      } catch (error) {
        if (isTransientConnectionError(error)) {
          if (getContext().state.syncingOfflineChanges) throw error;
          queueOfflineMutation({ type: "save", collectionName, docId: id, data, merge });
          getContext().showToast?.("ضعف الاتصال. تم حفظ التقرير محليا وسيتم إرساله عند المزامنة.");
          return { queued: true };
        }
        const message = String(error?.message || "");
        if (!message.includes("save_administrative_report") && !message.includes("schema cache")) throw error;
      }
    }
    const target = cloud.client.from(tableName(collectionName));
    const updateRow = toDatabaseRow(collectionName, data);
    delete updateRow.id;
    const row = { id, ...toDatabaseRow(collectionName, data) };
    if (merge) {
      const { error } = await target.update(updateRow).eq("id", id);
      if (error) throw error;
      return;
    }

    if (["schools", "tasks", "administrativeReports", "chatMessages"].includes(collectionName)) {
      let updateResult;
      try {
        updateResult = await target.update(updateRow).eq("id", id).select("id");
      } catch (error) {
        if (isTransientConnectionError(error)) {
          if (getContext().state.syncingOfflineChanges) throw error;
          queueOfflineMutation({ type: "save", collectionName, docId: id, data, merge });
          getContext().showToast?.("ضعف الاتصال. تم حفظ التغيير محليا وسيتم إرساله عند المزامنة.");
          return { queued: true };
        }
        throw error;
      }
      if (updateResult.error) throw updateResult.error;
      if ((updateResult.data || []).length) return;
    }

    try {
      const { error } = await target.insert(row);
      if (error) throw error;
    } catch (error) {
      if (isTransientConnectionError(error)) {
        if (getContext().state.syncingOfflineChanges) throw error;
        queueOfflineMutation({ type: "save", collectionName, docId: id, data, merge });
        getContext().showToast?.("ضعف الاتصال. تم حفظ التغيير محليا وسيتم إرساله عند المزامنة.");
        return { queued: true };
      }
      throw error;
    }
  }

  async function deleteCloudDoc(collectionName, id) {
    const { cloud, state } = getContext();
    if (browserIsOffline() || !cloud.client) {
      queueOfflineMutation({ type: "delete", collectionName, docId: id });
      getContext().showToast?.("لا يوجد اتصال. تم حفظ الحذف محليا وسيتم إرساله عند المزامنة.");
      return { queued: true };
    }
    const { error } = await cloud.client.from(tableName(collectionName)).delete().eq("id", id);
    if (error) throw error;
    if (state.currentUser) scheduleReload(state.currentUser, collectionName);
  }

  async function verifyCloudDocExists(collectionName, id) {
    const { cloud } = getContext();
    if (!cloud.client || browserIsOffline()) return false;
    const { data, error } = await cloud.client.from(tableName(collectionName)).select("id").eq("id", id).maybeSingle();
    if (error) throw error;
    return Boolean(data?.id);
  }

  async function updateTaskWorkflow(task) {
    const { cloud } = getContext();
    if (browserIsOffline() || !cloud.client) {
      queueOfflineMutation({ type: "taskWorkflow", task });
      getContext().showToast?.("لا يوجد اتصال. تم حفظ تغيير المهمة محليا وسيتم إرساله عند المزامنة.");
      return { queued: true };
    }
    const row = toDatabaseRow("tasks", task);
    const workflow = {
      status: row.status,
      progress: row.progress,
      comments: row.comments,
      feedback: row.feedback,
      approvals: row.approvals,
      completed_at: row.completed_at,
    };
    const { error } = await cloud.client.from("tasks").update(workflow).eq("id", task.id);
    if (error) throw error;
  }

  function isMissingEdgeFunction(error) {
    const message = String(error?.message || "").toLowerCase();
    const status = String(error?.status || "");
    return (
      status === "404" ||
      message.includes("function was not found") ||
      message.includes("requested function was not found") ||
      message.includes("failed to send a request to the edge function")
    );
  }

  async function saveUserProfileFallback(data) {
    const { cloud } = getContext();
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("إعداد Supabase غير مكتمل.");
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");
    const name = String(data.name || "").trim();
    let authUserId = data.id || "";
    if (!data.id) {
      const fallbackClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      const signUpResult = await fallbackClient.auth.signUp({
        email,
        password,
        options: { data: { name, full_name: name } },
      });
      if (signUpResult.error) {
        const message = String(signUpResult.error.message || "").toLowerCase();
        if (!message.includes("already") && !message.includes("registered")) throw signUpResult.error;
      }
      authUserId = signUpResult.data?.user?.id || "";
    }
    const { data: result, error } = await cloud.client.rpc("admin_upsert_user_profile", {
      p_email: email,
      p_full_name: name,
      p_role: data.role,
      p_school_id: data.schoolId,
      p_active: data.active !== false,
      p_user_id: authUserId || null,
      p_access_flags: data.accessFlags || {},
    });
    if (error) throw error;
    return result || { ok: true, id: authUserId };
  }

  async function callFunction(name, data = {}) {
    const { cloud } = getContext();
    if (browserIsOffline() || !cloud.client) {
      if (["writeLogEntry", "syncTaskNotifications", "syncDailyNotebookReminders", "sendManualNotification"].includes(name)) {
        queueOfflineMutation({ type: "function", name, data });
        return { queued: true };
      }
      throw new Error("هذه العملية تحتاج اتصالا بالإنترنت. افتح الإنترنت ثم حاول مرة أخرى.");
    }
    const edgeFunctions = {
      "manage-user": "manage-user",
      createAdminUser: "create-admin-user",
      changeUserRole: "change-user-role",
      createBackup: "create-backup",
      restoreBackup: "restore-backup",
      exportBackup: "export-backup",
      importBackup: "import-backup",
      sendNotification: "send-notification",
      selfProfile: "self-profile",
      overdueTaskCheck: "overdue-task-check",
      deadlineReminder: "deadline-reminder",
      logLogin: "log-login",
    };
    const edgeFunction = edgeFunctions[name];
    if (edgeFunction) {
      const result = await cloud.client.functions.invoke(edgeFunction, { body: data });
      if (result.error) {
        let message = result.error.message || "تعذر تنفيذ العملية الآمنة.";
        try {
          const details = await result.error.context?.json();
          if (details?.error) message = details.error;
        } catch {
          // The response body is not always available after a transport failure.
        }
        const error = new Error(message);
        error.status = result.error.context?.status;
        if (["manage-user", "createAdminUser"].includes(name) && isMissingEdgeFunction(error)) {
          return saveUserProfileFallback(data);
        }
        throw error;
      }
      if (["manage-user", "changeUserRole"].includes(name) && getContext().state.currentUser) {
        scheduleReload(getContext().state.currentUser, "users");
      }
      return result.data;
    }
    const rpcCalls = {
      syncTaskNotifications: ["sync_task_notifications", { p_school_scope: data.schoolScope }],
      syncDailyNotebookReminders: ["sync_daily_notebook_reminders", { p_school_scope: data.schoolScope }],
      writeLogEntry: ["write_log_entry", { p_entry: data }],
      sendManualNotification: ["send_manual_notification", {
        p_audience: data.audience,
        p_recipient_id: data.recipientId,
        p_title: data.title,
        p_message: data.message,
        p_school_scope: data.schoolScope,
      }],
    };
    const rpc = rpcCalls[name];
    if (!rpc) throw new Error(`وظيفة Supabase غير معروفة: ${name}`);
    const { data: result, error } = await cloud.client.rpc(rpc[0], rpc[1]);
    if (error) throw error;
    return result;
  }

  async function syncOfflineChanges() {
    const queue = [...readOfflineQueue()];
    if (!queue.length) return 0;
    if (browserIsOffline()) throw new Error("لا يوجد اتصال بالإنترنت. افتح الإنترنت ثم حاول المزامنة.");
    let synced = 0;
    for (const entry of queue) {
      if (entry.type === "save") await saveCloudDoc(entry.collectionName, entry.docId, entry.data, entry.merge);
      if (entry.type === "delete") await deleteCloudDoc(entry.collectionName, entry.docId);
      if (entry.type === "taskWorkflow") await updateTaskWorkflow(entry.task);
      if (entry.type === "function") await callFunction(entry.name, entry.data);
      synced += 1;
      writeOfflineQueue(readOfflineQueue().filter((item) => item.id !== entry.id));
    }
    return synced;
  }

  return {
    formatStartupError,
    formatCloudError,
    stopCloudListeners,
    clearProtectedState,
    resetCloudState,
    initCloud,
    loadProfile,
    startScopedListeners,
    refreshCloudData,
    loadDashboardData,
    isCloudEnabled,
    saveCloudDoc,
    verifyCloudDocExists,
    updateTaskWorkflow,
    deleteCloudDoc,
    callFunction,
    syncOfflineChanges,
    loadOfflineQueue: readOfflineQueue,
    queueOfflineMutation,
    cacheProfile,
    clearCachedProfile,
    cloudTaskData,
    toDatabaseRow,
    fromDatabaseRow,
  };
}
