import { supabaseClient, supabaseUrl, isSupabaseConfigured } from "./lib/supabaseClient.js";
import "./styles/main.js";
import { localDateValue, today, compareDate, compareTimestamp, toDateKey, formatArabicDate, formatArabicNumber } from "./utils/dateUtils.js";
import { sortSchools } from "./utils/schoolUtils.js";
import {
  canActOnTask as permissionCanActOnTask,
  canAssignTask as permissionCanAssignTask,
  canApproveTask as permissionCanApproveTask,
  canApproveTasks as permissionCanApproveTasks,
  canCommentOnTask as permissionCanCommentOnTask,
  canCreateBackups as permissionCanCreateBackups,
  canCreateTasks as permissionCanCreateTasks,
  canCreateUsers as permissionCanCreateUsers,
  canViewUsers as permissionCanViewUsers,
  canDeleteAttachment as permissionCanDeleteAttachment,
  canDeleteTask as permissionCanDeleteTask,
  canEditTaskDefinition as permissionCanEditTaskDefinition,
  canAssignUserRole as permissionCanAssignUserRole,
  canChangeUserRole as permissionCanChangeUserRole,
  canEditUser as permissionCanEditUser,
  canViewUser as permissionCanViewUser,
  canManageTaskDefinitions as permissionCanManageTaskDefinitions,
  canManageUsers as permissionCanManageUsers,
  canReadSchoolTasks as permissionCanReadSchoolTasks,
  canReadTask as permissionCanReadTask,
  canRestoreBackup as permissionCanRestoreBackup,
  canSendNotifications as permissionCanSendNotifications,
  canUploadAttachment as permissionCanUploadAttachment,
  canViewAuditLogs as permissionCanViewAuditLogs,
  canViewDashboard as permissionCanViewDashboard,
  canViewReports as permissionCanViewReports,
  canViewFinance as permissionCanViewFinance,
  canManageFinanceDiscounts as permissionCanManageFinanceDiscounts,
  canViewGradeAdjustments as permissionCanViewGradeAdjustments,
  canManageGradeAdjustments as permissionCanManageGradeAdjustments,
  canViewStaffEvaluations as permissionCanViewStaffEvaluations,
  canManageStaffEvaluations as permissionCanManageStaffEvaluations,
  canViewStaffEvaluationReports as permissionCanViewStaffEvaluationReports,
  canControlStaffEvaluationAccess as permissionCanControlStaffEvaluationAccess,
  hasRole as permissionHasRole,
  accessFlag as permissionAccessFlag,
  isGeneralManager as permissionIsGeneralManager,
  normalizeRole,
  roleGroups,
} from "./utils/permissionUtils.js";
import { createSupabaseModule } from "./lib/supabaseRepository.js";
import { createAuthModule } from "./services/authService.js";
import { createUsersModule } from "./services/userService.js";
import { createTasksModule } from "./services/taskService.js";
import { createDashboardModule } from "./services/dashboardService.js";
import { createNotificationsModule } from "./services/notificationService.js";
import { createAttachmentsModule } from "./services/attachmentService.js";
import { createBackupModule } from "./services/backupService.js";
import { createFinanceModule } from "./services/financeService.js";
import { createGradeAdjustmentsModule } from "./services/gradeAdjustmentService.js";
import { createStaffEvaluationsModule } from "./services/staffEvaluationService.js";
import { createAdministrativeReportsModule } from "./services/administrativeReportService.js";
import { createExamScheduleModule } from "./services/examScheduleService.js";
import { createCircularsModule } from "./services/circularService.js";
import { createMeetingsModule } from "./services/meetingService.js";
import { createChatModule } from "./services/chatService.js";
import { createAuditService } from "./services/auditService.js";
import { createAdminModule } from "./components/layout/layout.js";
import { createAuthView } from "./components/layout/authView.js";
import { initializeCapacitorPlatform } from "./platform/capacitorPlatform.js";
import {
  departments,
  icons,
  labels,
  paginationDefaults,
  reportTypeLabels,
  reportTypes,
  roles,
  schoolProfileDefaults,
  schools,
  taskCreationStatuses,
  taskStatuses,
} from "./config/appConfig.js";

const app = document.querySelector("#app");

let toastTimer = null;
let dashboardQueryTimer = null;
let searchRenderTimer = null;
let fileSelection = [];
let renderQueued = false;
let reloadingForServiceWorkerUpdate = false;
let capacitorPlatform = { native: false, hideSplash: async () => {} };
let systemThemeQuery = null;
const OFFLINE_QUEUE_KEY = "schoolTaskOfflineQueueV1";
const APP_RELEASE = "20260930-logo-layout-fix-01";

let state = {
  currentUser: null,
  schools: sortSchools(schools),
  users: [],
  tasks: [],
  financeDiscounts: [],
  gradeAdjustments: [],
  gradeAdjustmentBusy: {},
  gradeAdjustmentFilters: { search: "", status: "all", month: "", from: "", to: "" },
  teacherDirectory: [],
  staffEvaluations: [],
  staffEvaluationFilters: { search: "", roleKey: "all", assessmentPeriod: "first_term", from: "", to: "", sort: "total_desc" },
  staffEvaluationBusy: {},
  staffEvaluationDraftSequence: "",
  staffEvaluationDraftTeacherId: "",
  staffEvaluationSettings: [],
  financeBusy: {},
  financeFilters: { search: "", status: "all", assigneeId: "all", from: "", to: "" },
  taskActionBusy: {},
  permanentTaskDate: today(),
  dailyNotebookEmployeeId: "all",
  dailyExtraReport: { employeeId: "all", from: today(), to: today() },
  refreshingData: false,
  notifications: [],
  chatMessages: [],
  chatSelectedUserId: "",
  chatSearch: "",
  activityLogs: [],
  auditLogs: [],
  backups: [],
  backupBusy: false,
  isOffline: typeof navigator !== "undefined" && navigator.onLine === false,
  syncingOfflineChanges: false,
  offlineQueue: [],
  dashboardData: null,
  dashboardLoading: false,
  dashboardError: "",
  userFilters: { query: "", role: "all", status: "active", schoolId: "all" },
  filters: { assigneeId: "all", priority: "all", recurrence: "all", status: "all", department: "all", from: "", to: "" },
  taskFiltersOpen: false,
  search: "",
  activeSchoolId: "all",
  theme: "system",
  pagination: { ...paginationDefaults },
  reportConfig: { type: "task", schoolId: "all", orientation: "portrait", approvalName: "", approvalTitle: "", signatureText: "", notes: "" },
  administrativeReports: [],
  stageSupervisorColors: {},
  administrativeReportFilters: { tab: "daily", date: today(), month: today().slice(0, 7), periodMode: "month", supervisorId: "all", schoolId: "all", printType: "daily", printMode: "both" },
  examSchedulePeriods: [],
  examScheduleLogs: [],
  examScheduleSettings: null,
  examScheduleFilters: { search: "", status: "all", periodId: "" },
  circulars: [],
  circularRecipients: [],
  circularsLoading: false,
  circularsError: "",
  circularFilters: { search: "", status: "all", category: "all" },
  meetings: [],
  meetingAttendees: [],
  meetingDecisions: [],
  meetingsLoading: false,
  meetingsError: "",
  meetingFilters: { search: "", status: "all" },
  schoolProfile: { ...schoolProfileDefaults },
  view: "home",
  mobileNavOpen: false,
  modal: null,
  toast: "",
  loginError: "",
  loginBusy: false,
  profileError: "",
  startupError: "",
  messagingStatus: "idle",
  notificationsSupported: false,
  notificationPromptDismissed: false,
};

let cloud = {
  enabled: false,
  client: null,
  authUser: null,
  scopeKey: "",
  recurringSyncInFlight: false,
};

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function safe(value) {
  return escapeHtml(value);
}

function roleLabel(role) {
  const normalized = normalizeRole(role, role);
  return labels[normalized] || labels[role] || role;
}

function showToast(message) {
  state.toast = message;
  render();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = "";
    render();
  }, 2600);
}

function queueDashboardRefresh(delay = 180) {
  if (dashboardQueryTimer) window.clearTimeout(dashboardQueryTimer);
  if (!cloud.enabled || !state.currentUser || state.view !== "dashboard") return;
  dashboardQueryTimer = window.setTimeout(() => {
    modules.supabase.loadDashboardData(state.currentUser).catch((error) => {
      console.error("Dashboard query failed", error);
      showToast("تعذر تحديث مؤشرات لوحة التحكم.");
    });
  }, delay);
}

function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function persistLocal() {
  if (!cloud.enabled) return;
  localStorage.setItem("schoolTaskReportConfig", JSON.stringify(state.reportConfig));
  localStorage.setItem("schoolTaskSchoolProfile", JSON.stringify(state.schoolProfile));
  localStorage.setItem("schoolTaskTheme", state.theme);
  localStorage.setItem("schoolTaskActiveSchool", state.activeSchoolId);
}

function clearLegacyDemoStorage() {
  [
    "schoolTaskUsers",
    "schoolTaskTasks",
    "schoolTaskNotifications",
    "schoolTaskActivityLogs",
    "schoolTaskAuditLogs",
    "schoolTaskBackups",
    "schoolTaskSession",
    "schoolTaskLocalDemoStateV1",
  ].forEach((key) => localStorage.removeItem(key));
}

function scopedSchoolId() {
  if (!state.currentUser) return "all";
  if (state.currentUser.role === "superadmin") return state.activeSchoolId;
  return state.currentUser.schoolId;
}

function scopedSchoolIds() {
  if (!state.currentUser) return [];
  if (state.currentUser.role === "superadmin") {
    if (state.activeSchoolId && state.activeSchoolId !== "all") return [state.activeSchoolId];
    return (state.schools || schools).map((school) => school.id);
  }
  return [state.currentUser.schoolId].filter(Boolean);
}

function schoolName(id) {
  const source = state.schools?.length ? state.schools : schools;
  return source.find((school) => school.id === id)?.name || id;
}

function effectiveTheme() {
  if (state.theme === "dark" || state.theme === "light") return state.theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function applyTheme() {
  const resolvedTheme = effectiveTheme();
  document.documentElement.setAttribute("data-theme", resolvedTheme);
  document.documentElement.setAttribute("data-theme-mode", state.theme);
  document.body.classList.toggle("theme-dark", resolvedTheme === "dark");
  document.body.classList.toggle("offline-mode", state.isOffline);
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const themeColor = state.isOffline ? "#64748b" : (resolvedTheme === "dark" ? "#080F1D" : "#2563eb");
  if (themeMeta) themeMeta.setAttribute("content", themeColor);
  window.__setNativeTheme?.(resolvedTheme);
}

async function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForServiceWorkerUpdate) return;
      reloadingForServiceWorkerUpdate = true;
      window.location.reload();
    });
    const registration = await navigator.serviceWorker.register(`/service-worker.js?v=${APP_RELEASE}`, { updateViaCache: "none" });
    registration.update?.();
  } catch (error) {
    console.warn("تعذر تسجيل عامل الخدمة الخاص بالتطبيق", error);
  }
}

function setConnectivityState(isOffline, announce = false) {
  if (state.isOffline === isOffline) return;
  state.isOffline = isOffline;
  applyTheme();
  render();
  if (announce) {
    showToast(isOffline ? "لا يوجد اتصال بالإنترنت. سيتم حفظ التغييرات محليا حتى تضغط مزامنة." : "عاد الاتصال بالإنترنت. اضغط مزامنة لإرسال التغييرات المحفوظة.");
  }
}

async function clearCachedVersionAndReload() {
  state.loginBusy = true;
  state.loginError = "";
  render();
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    showToast("تم تنظيف النسخة المخزنة. ستتم إعادة تحميل الصفحة.");
    window.setTimeout(() => window.location.reload(), 700);
  } catch (error) {
    console.error(error);
    state.loginBusy = false;
    state.loginError = "تعذر تنظيف النسخة المخزنة من المتصفح. حاول تحديث الصفحة يدويًا.";
    render();
  }
}

async function retryProfileLoad() {
  state.loginBusy = true;
  state.profileError = "";
  state.loginError = "";
  render();
  try {
    const { data, error } = await modules.auth.getCurrentSession();
    if (error) throw error;
    const uid = data?.session?.user?.id || cloud.authUser?.id || "";
    if (!uid) {
      state.loginBusy = false;
      state.profileError = "";
      state.loginError = "انتهت الجلسة. سجّل الدخول مرة أخرى.";
      render();
      return;
    }
    cloud.authUser = data?.session?.user || cloud.authUser;
    await modules.supabase.loadProfile(uid);
  } catch (error) {
    console.error(error);
    state.loginBusy = false;
    state.profileError = `تعذر إعادة فتح الحساب. ${error?.message || "تحقق من الاتصال ثم حاول مرة أخرى."}`;
    render();
  }
}

function paginate(items, page, size) {
  const safeSize = Math.max(1, size);
  const totalPages = Math.max(1, Math.ceil(items.length / safeSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * safeSize;
  return { items: items.slice(start, start + safeSize), totalPages, currentPage, totalItems: items.length };
}

function getUser(id) {
  return state.users.find((user) => user.id === id) || null;
}

function getSchoolProfile() {
  return { ...schoolProfileDefaults, ...state.schoolProfile };
}

function reportNumber() {
  return `REP-${today().replaceAll("-", "")}-${String(state.reportConfig.type || "task").toUpperCase()}`;
}

function approvalBlock() {
  return {
    approvalName: state.reportConfig.approvalName || "",
    approvalTitle: state.reportConfig.approvalTitle || "",
    signatureText: state.reportConfig.signatureText || "",
    notes: state.reportConfig.notes || "",
  };
}

function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function consumeFileSelection(clear = false) {
  const current = [...fileSelection];
  if (clear) fileSelection = [];
  return current;
}

function hasRole(roleList, user = state.currentUser) {
  return permissionHasRole(user, roleList);
}

function canManageUsers(user = state.currentUser) {
  return permissionCanManageUsers(user);
}

function canCreateUsers(user = state.currentUser) {
  return permissionCanCreateUsers(user);
}

function canViewUsers(user = state.currentUser) {
  return permissionCanViewUsers(user);
}

function canViewUser(targetUser, user = state.currentUser) {
  return permissionCanViewUser(user, targetUser);
}

function canEditUser(targetUser, user = state.currentUser) {
  return permissionCanEditUser(user, targetUser);
}

function canChangeUserRole(user = state.currentUser) {
  return permissionCanChangeUserRole(user);
}

function canAssignUserRole(nextRole, currentRole = null, user = state.currentUser) {
  return permissionCanAssignUserRole(user, nextRole, currentRole);
}

function canManageTaskDefinitions(user = state.currentUser) {
  return permissionCanManageTaskDefinitions(user);
}

function canCreateTasks(taskOrSchool = null, user = state.currentUser) {
  const target = taskOrSchool === "notebook" ? { schoolId: user?.schoolId || "", recurrence: "permanent" } : taskOrSchool;
  const isNotebook = target?.recurrence === "permanent";
  if (permissionAccessFlag(user, "createTask") === false && !isNotebook) return false;
  if (permissionAccessFlag(user, "createNotebook") === false && isNotebook) return false;
  if (permissionCanCreateTasks(user, target)) return true;
  if (permissionAccessFlag(user, isNotebook ? "createNotebook" : "createTask") === true) {
    const schoolId = typeof target === "string" ? user?.schoolId || "" : target?.schoolId || user?.schoolId || "";
    return !!schoolId && (permissionIsGeneralManager(user) || schoolId === user?.schoolId);
  }
  if (normalizeRole(user?.role, "") !== "deputy_principal") return false;
  const schoolId = typeof taskOrSchool === "string" ? taskOrSchool : taskOrSchool?.schoolId || user?.schoolId || "";
  const isExistingTask = Boolean(taskOrSchool?.id && state.tasks.some((task) => task.id === taskOrSchool.id));
  return !isExistingTask && !!schoolId && schoolId === user?.schoolId;
}

function canEditTaskDefinition(task, user = state.currentUser) {
  return permissionCanEditTaskDefinition(user, task);
}

function canAssignTask(taskOrSchool, assignee = null, user = state.currentUser) {
  if (permissionCanAssignTask(user, taskOrSchool, assignee)) return true;
  if (normalizeRole(user?.role, "") !== "deputy_principal") return false;
  const schoolId = typeof taskOrSchool === "string" ? taskOrSchool : taskOrSchool?.schoolId || user?.schoolId || "";
  if (!schoolId || schoolId !== user?.schoolId) return false;
  if (!assignee) return true;
  const assigneeRole = normalizeRole(assignee.role, "");
  return assignee.active !== false && assignee.schoolId === schoolId && !["superadmin", "general_manager", "branch_manager", "finance_manager", "development_supervision_manager", "general_secretary", "school_principal", "deputy_principal"].includes(assigneeRole);
}

function canDeleteTask(task, user = state.currentUser) {
  return permissionCanDeleteTask(user, task);
}

function canViewDashboard(user = state.currentUser) {
  return permissionCanViewDashboard(user);
}

function canViewAuditLogs(user = state.currentUser) {
  return permissionCanViewAuditLogs(user);
}

function canCreateBackups(backupOrSchool = null, user = state.currentUser) {
  return permissionCanCreateBackups(user, backupOrSchool);
}

function canRestoreBackup(backup, user = state.currentUser) {
  return permissionCanRestoreBackup(user, backup);
}

function canUploadAttachment(task, user = state.currentUser) {
  return permissionCanUploadAttachment(user, task);
}

function canDeleteAttachment(task, attachment = null, user = state.currentUser) {
  return permissionCanDeleteAttachment(user, task, attachment);
}

function canApproveTasks(user = state.currentUser) {
  return permissionCanApproveTasks(user);
}

function canViewReports(user = state.currentUser) {
  return permissionCanViewReports(user);
}

function canViewFinance(user = state.currentUser) {
  return permissionCanViewFinance(user);
}

function canManageFinanceDiscounts(user = state.currentUser) {
  return permissionCanManageFinanceDiscounts(user);
}

function canViewGradeAdjustments(user = state.currentUser) { return permissionCanViewGradeAdjustments(user); }
function canManageGradeAdjustments(user = state.currentUser) { return permissionCanManageGradeAdjustments(user); }
function canViewStaffEvaluations(user = state.currentUser) { return permissionCanViewStaffEvaluations(user); }
function canManageStaffEvaluations(user = state.currentUser) { return permissionCanManageStaffEvaluations(user); }
function canViewStaffEvaluationReports(user = state.currentUser) { return permissionCanViewStaffEvaluationReports(user); }
function canControlStaffEvaluationAccess(user = state.currentUser) { return permissionCanControlStaffEvaluationAccess(user); }

function canSendNotifications(user = state.currentUser) {
  return permissionCanSendNotifications(user);
}

function canReadSchoolTasks(user = state.currentUser) {
  return permissionCanReadSchoolTasks(user);
}

function canReadTask(task, user = state.currentUser) {
  return permissionCanReadTask(user, task, getUser);
}

function canActOnTask(task, user = state.currentUser) {
  return permissionCanActOnTask(user, task);
}

function canCommentOnTask(task, user = state.currentUser) {
  return permissionCanCommentOnTask(user, task);
}

const modules = {};
function canApproveTask(task, user = state.currentUser) {
  return permissionCanApproveTask(user, task, (item) => modules.tasks.effectiveStatus(item));
}

function requestRenderFrame(callback) {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    window.setTimeout(callback, 0);
    return;
  }
  window.requestAnimationFrame(callback);
}

function getContext() {
  return {
    supabaseClient,
    supabaseUrl,
    isSupabaseConfigured,
    app,
    state,
    cloud,
    roles,
    schools: state.schools?.length ? state.schools : schools,
    departments,
    taskStatuses,
    taskCreationStatuses,
    roleGroups,
    labels,
    icons,
    reportTypes,
    reportTypeLabels,
    schoolProfileDefaults,
    paginationDefaults,
    safe,
    roleLabel,
    showToast,
    storageGet,
    OFFLINE_QUEUE_KEY,
    persistLocal,
    compareDate,
    compareTimestamp,
    scopedSchoolId,
    scopedSchoolIds,
    schoolName,
    applyTheme,
    paginate,
    getUser,
    getSchoolProfile,
    reportNumber,
    approvalBlock,
    downloadBlob,
    consumeFileSelection,
    hasRole,
    canViewUsers,
    canViewUser,
    canCreateUsers,
    canEditUser,
    canChangeUserRole,
    canAssignUserRole,
    canManageUsers,
    canCreateTasks,
    canEditTaskDefinition,
    canEditTask: canEditTaskDefinition,
    canAssignTask,
    canDeleteTask,
    canManageTaskDefinitions,
    canViewDashboard,
    canViewAuditLogs,
    canCreateBackups,
    canRestoreBackup,
    canUploadAttachment,
    canDeleteAttachment,
    canApproveTasks,
    canViewReports,
    canViewFinance,
    canManageFinanceDiscounts,
    canViewGradeAdjustments,
    canManageGradeAdjustments,
    canViewStaffEvaluations,
    canManageStaffEvaluations,
    canViewStaffEvaluationReports,
    canControlStaffEvaluationAccess,
    canSendNotifications,
    canReadSchoolTasks,
    canReadTask,
    canActOnTask,
    canCommentOnTask,
    canApproveTask,
    render,
    localDateValue,
    today,
    formatDate: formatArabicDate,
    formatNumber: formatArabicNumber,
    toDateKey,
    ...modules,
    renderPagination: modules.admin?.renderPagination,
  };
}

modules.attachments = createAttachmentsModule(getContext);
modules.auth = createAuthModule(getContext);
modules.users = createUsersModule(getContext);
modules.tasks = createTasksModule(getContext);
modules.notifications = createNotificationsModule(getContext);
modules.audit = createAuditService(getContext);
modules.backup = createBackupModule(getContext);
modules.finance = createFinanceModule(getContext);
modules.gradeAdjustments = createGradeAdjustmentsModule(getContext);
modules.staffEvaluations = createStaffEvaluationsModule(getContext);
modules.administrativeReports = createAdministrativeReportsModule(getContext);
modules.examSchedules = createExamScheduleModule(getContext);
modules.circulars = createCircularsModule(getContext);
modules.meetings = createMeetingsModule(getContext);
modules.chat = createChatModule(getContext);
modules.supabase = createSupabaseModule(getContext);
modules.dashboard = createDashboardModule(getContext);
modules.admin = createAdminModule(getContext);
modules.authView = createAuthView(getContext);

function renderNow() {
  document.body.classList.toggle("mobile-menu-open", Boolean(state.mobileNavOpen));
  document.body.classList.toggle("modal-open", Boolean(state.modal));
  if (cloud.enabled && state.profileError) {
    modules.authView.renderProfileError();
    return;
  }
  if (!cloud.enabled) {
    modules.authView.renderSetupRequired();
    return;
  }
  if (cloud.enabled && cloud.authUser && !state.currentUser) {
    modules.authView.renderPending();
    return;
  }
  if (!state.currentUser) {
    modules.authView.renderLogin();
    return;
  }
  modules.admin.renderShell();
}

function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestRenderFrame(() => {
    renderQueued = false;
    renderNow();
  });
}

async function boot() {
  clearLegacyDemoStorage();
  state.theme = localStorage.getItem("schoolTaskTheme") || "system";
  state.activeSchoolId = localStorage.getItem("schoolTaskActiveSchool") || "all";
  state.messagingStatus = localStorage.getItem("schoolTaskNotificationStatus") || "idle";
  state.notificationPromptDismissed = localStorage.getItem("schoolTaskNotificationPromptDismissed") === "1";
  state.reportConfig = { ...state.reportConfig, ...storageGet("schoolTaskReportConfig", {}) };
  modules.administrativeReports.load();
  modules.examSchedules.load();
  modules.circulars.load();
  modules.meetings.load();
  state.offlineQueue = [];
  state.isOffline = navigator.onLine === false;
  if (!reportTypes.includes(state.reportConfig.type)) state.reportConfig.type = "task";
  state.schoolProfile = { ...schoolProfileDefaults, ...storageGet("schoolTaskSchoolProfile", {}) };
  applyTheme();
  systemThemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)") || null;
  systemThemeQuery?.addEventListener?.("change", () => {
    if (state.theme === "system") {
      applyTheme();
      render();
    }
  });
  capacitorPlatform = await initializeCapacitorPlatform({ state, actions: () => window.actions, render, showToast });
  if (typeof window.addEventListener === "function") {
    window.addEventListener("offline", () => setConnectivityState(true, true));
    window.addEventListener("online", () => setConnectivityState(false, true));
  }
  if (!capacitorPlatform.native) {
    registerAppServiceWorker().catch((error) => console.warn("Service worker registration failed", error));
  }
  try {
    if (await modules.supabase.initCloud()) {
      render();
      await capacitorPlatform.hideSplash();
      return;
    }
  } catch (error) {
    console.error("حدث خطأ غير متوقع أثناء التشغيل", error);
    state.startupError = modules.supabase.formatStartupError(error);
    await modules.supabase.resetCloudState();
  }
  render();
  await capacitorPlatform.hideSplash();
}

window.actions = {
  login: modules.auth.login,
  logout: modules.auth.logout,
  clearCachedVersionAndReload,
  retryProfileLoad,
  saveUser: modules.users.saveUser,
  saveMyProfile: modules.users.saveMyProfile,
  disableUser: modules.users.disableUser,
  deleteUser: modules.users.deleteUser,
  deleteSchool: modules.users.deleteSchool,
  saveTask: modules.tasks.saveTask,
  saveAssignedNotebook: modules.tasks.saveAssignedNotebook,
  updateNotebookAssignmentSource: modules.tasks.updateNotebookAssignmentSource,
  deleteTask: modules.tasks.deleteTask,
  updateStatus: modules.tasks.updateStatus,
  setTaskDisplayStatus: modules.tasks.setTaskDisplayStatus,
  reopenTask: modules.tasks.reopenTask,
  approveTask: modules.tasks.approveTask,
  archiveTask: modules.tasks.archiveTask,
  renewPermanentDailyNotebook: modules.tasks.renewPermanentDailyNotebook,
  archivePermanentDailyNotebook: modules.tasks.archivePermanentDailyNotebook,
  addFeedback: modules.tasks.addFeedback,
  filterTaskAssigneesBySchool: modules.tasks.filterTaskAssigneesBySchool,
  async enableNotifications() {
    window.__notificationPermissionBusy = true;
    try {
      await modules.notifications.enableNotifications();
    } catch (error) {
      console.error("Notification permission action failed", error);
      state.messagingStatus = "idle";
      showToast("تعذر تفعيل تنبيهات الهاتف. افتح إعدادات التطبيق وتأكد من السماح بالإشعارات ثم حاول مرة أخرى.");
      render();
    } finally {
      window.__notificationPermissionBusy = false;
    }
  },
  dismissNotificationPrompt() {
    state.notificationPromptDismissed = true;
    localStorage.setItem("schoolTaskNotificationPromptDismissed", "1");
    render();
  },
  markNotificationRead: modules.notifications.markNotificationRead,
  markAllNotificationsRead: modules.notifications.markAllNotificationsRead,
  openNotificationTask: modules.notifications.openNotificationTask,
  async openNotificationLink(notificationId) {
    const item = state.notifications.find((notification) => notification.id === notificationId);
    if (!item) return;
    await modules.notifications.markNotificationRead(notificationId);
    const dedupe = String(item.dedupeKey || "");
    if (item.type === "administrative_circular") {
      const circularId = dedupe.split(":")[1] || "";
      state.view = "circulars";
      if (circularId) state.modal = { type: "circular", id: circularId };
      render();
      return;
    }
    if (item.type === "meeting_invite") {
      const meetingId = dedupe.split(":")[1] || "";
      state.view = "meetings";
      if (meetingId) state.modal = { type: "meeting", id: meetingId };
      render();
    }
  },
  exportReport: modules.dashboard.exportReport,
  createBackup: modules.backup.createBackup,
  restoreBackup: modules.backup.restoreBackup,
  restoreLatestBackup: modules.backup.restoreLatestBackup,
  openBackupFilePicker: modules.backup.openBackupFilePicker,
  restoreBackupFile: modules.backup.restoreBackupFile,
  exportBackup: modules.backup.exportBackup,
  saveFinanceDiscount: modules.finance.saveFinanceDiscount,
  updateFinanceDiscountStatus: modules.finance.updateFinanceDiscountStatus,
  deleteFinanceDiscount: modules.finance.deleteFinanceDiscount,
  setFinanceFilter: modules.finance.setFinanceFilter,
  openGradeAdjustment: modules.gradeAdjustments.openAdjustment,
  saveGradeAdjustment: modules.gradeAdjustments.saveAdjustment,
  updateGradeAdjustmentStatus: modules.gradeAdjustments.updateStatus,
  deleteGradeAdjustment: modules.gradeAdjustments.deleteAdjustment,
  setGradeAdjustmentFilter: modules.gradeAdjustments.setFilter,
  printGradeAdjustmentReport: modules.gradeAdjustments.printReport,
  applyGradeSectionLimits: modules.gradeAdjustments.applyGradeSectionLimits,
  validateGradeAdjustmentInput: modules.gradeAdjustments.validateGradeInput,
  addGradeAdjustmentSubject: modules.gradeAdjustments.addSubject,
  removeGradeAdjustmentSubject: modules.gradeAdjustments.removeSubject,
  selectGradeAdjustmentTeacher: modules.gradeAdjustments.selectTeacher,
  refreshGradeAdjustmentTeacherCatalog: modules.gradeAdjustments.refreshTeacherCatalog,
  openStaffEvaluation: modules.staffEvaluations.openEvaluation,
  changeStaffEvaluationSequence: modules.staffEvaluations.changeSequence,
  selectStaffEvaluationTeacher: modules.staffEvaluations.selectTeacher,
  toggleStaffEvaluationAccess: modules.staffEvaluations.toggleAccess,
  toggleStaffEvaluationTeacher: modules.staffEvaluations.toggleTeacherVisibility,
  saveStaffEvaluation: modules.staffEvaluations.saveEvaluation,
  deleteStaffEvaluation: modules.staffEvaluations.deleteEvaluation,
  setStaffEvaluationFilter: modules.staffEvaluations.setFilter,
  printStaffEvaluationReport: modules.staffEvaluations.printReport,
  printStaffEvaluationUsersReport: modules.staffEvaluations.printUsersReport,
  importTeacherDirectory: modules.staffEvaluations.importTeachers,
  exportTeacherTemplate: modules.staffEvaluations.exportTeacherTemplate,
  filterFinanceAssignees: modules.finance.filterFinanceAssignees,
  openAdministrativeReport: modules.administrativeReports.openReport,
  openAdministrativeReportMerged: modules.administrativeReports.openMergedReport,
  saveAdministrativeReport: modules.administrativeReports.saveReport,
  approveAdministrativeReportAsDeputy: modules.administrativeReports.approveByDeputy,
  saveAndApproveAdministrativeReportAsDeputy: modules.administrativeReports.saveAndApproveByDeputy,
  approveAdministrativeReportAsPrincipal: modules.administrativeReports.approveByPrincipal,
  deleteAdministrativeReportGroup: modules.administrativeReports.deleteAdministrativeReportGroup,
  setAdministrativeReportFilter: modules.administrativeReports.setFilter,
  setAdministrativeReportTab: modules.administrativeReports.setTab,
  setStageSupervisorColor: modules.administrativeReports.setSupervisorColor,
  addAdministrativeReportSectionRow: modules.administrativeReports.addSectionRow,
  selectAdministrativeReportTeacher: modules.administrativeReports.selectTeacherField,
  printAdministrativeReports: modules.administrativeReports.printAdministrativeReports,
  setExamScheduleFilter: modules.examSchedules.setFilter,
  resetExamScheduleFilters: modules.examSchedules.resetFilters,
  openExamSettings: modules.examSchedules.openSettingsModal,
  saveExamSettings: modules.examSchedules.saveSettings,
  addExamGradeSettingRow: modules.examSchedules.addGradeSettingRow,
  removeExamGradeSettingRow: modules.examSchedules.removeGradeSettingRow,
  clearExamGradeSettingRows: modules.examSchedules.clearGradeSettingRows,
  addExamSectionSetting: modules.examSchedules.addSectionSetting,
  removeExamSectionSetting: modules.examSchedules.removeSectionSetting,
  openExamPeriod: modules.examSchedules.openPeriodModal,
  saveExamPeriod: modules.examSchedules.savePeriod,
  openExamSlot: modules.examSchedules.openSlotModal,
  saveExamSlot: modules.examSchedules.saveSlot,
  deleteExamSlot: modules.examSchedules.deleteSlot,
  deleteExamPeriod: modules.examSchedules.deletePeriod,
  refreshExamSlotForm: modules.examSchedules.refreshSlotForm,
  updateExamPeriodStatus: modules.examSchedules.updatePeriodStatus,
  exportExamScheduleCsv: modules.examSchedules.exportCsv,
  exportExamScheduleJson: modules.examSchedules.exportJson,
  importExamScheduleJson: modules.examSchedules.importJson,
  printExamSchedule: modules.examSchedules.printSchedule,
  openExamPrintOptions: modules.examSchedules.openPrintOptionsModal,
  approveExamPeriod: modules.examSchedules.approveExamPeriod,
  toggleExamTracking: modules.examSchedules.toggleExamTracking,
  addExamBulkSubjectSchedule: modules.examSchedules.addBulkSubjectSchedule,
  printExamTrackingReport: modules.examSchedules.printTrackingReport,
  printExamMissingReport: modules.examSchedules.printMissingReport,
  openExamStudentCards: modules.examSchedules.openStudentCardsModal,
  printExamStudentCards: modules.examSchedules.printStudentCards,
  openCircular: modules.circulars.openCircular,
  saveCircular: modules.circulars.saveCircular,
  setCircularFilter: modules.circulars.setFilter,
  updateCircularStatus: modules.circulars.updateStatus,
  markCircularRead: modules.circulars.markRead,
  deleteCircular: modules.circulars.deleteCircular,
  printCircularReport: modules.circulars.printCircularReport,
  openMeeting: modules.meetings.openMeeting,
  addMeetingPointRow: modules.meetings.addMeetingPointRow,
  printMeetingReport: modules.meetings.printMeetingReport,
  saveMeeting: modules.meetings.saveMeeting,
  setMeetingFilter: modules.meetings.setFilter,
  updateMeetingStatus: modules.meetings.updateStatus,
  updateMeetingAttendance: modules.meetings.updateAttendance,
  updateMeetingDecision: modules.meetings.updateDecision,
  deleteMeeting: modules.meetings.deleteMeeting,
  selectChatContact: modules.chat.selectContact,
  setChatSearch: modules.chat.setSearch,
  sendChatMessage: modules.chat.sendMessage,
  printReport() {
    modules.dashboard.openPrintWindow(false);
  },
  async refreshData() {
    if (state.refreshingData) return;
    if (state.isOffline) {
      showToast("لا يوجد اتصال بالإنترنت. البيانات المعروضة من آخر نسخة محفوظة.");
      return;
    }
    state.refreshingData = true;
    render();
    try {
      if (cloud.enabled && state.currentUser) {
        await modules.supabase.refreshCloudData(true, { deferSecondary: true, secondaryDelay: 250 });
        await Promise.all([
          modules.examSchedules.loadCloudData?.(true),
          modules.circulars.loadCloudData?.(true),
          modules.meetings.loadCloudData?.(true),
        ]);
      } else {
        render();
      }
      showToast("تم تحديث البيانات.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر تحديث البيانات.");
    } finally {
      state.refreshingData = false;
      render();
    }
  },
  async syncOfflineChanges() {
    if (state.syncingOfflineChanges) return;
    if (state.isOffline || navigator.onLine === false) {
      showToast("لا يوجد اتصال بالإنترنت. افتح الإنترنت ثم اضغط مزامنة.");
      return;
    }
    if (!state.offlineQueue.length) {
      showToast("لا توجد تغييرات محفوظة تحتاج مزامنة.");
      return;
    }
    state.syncingOfflineChanges = true;
    render();
    try {
      const synced = await modules.supabase.syncOfflineChanges();
      await modules.supabase.refreshCloudData(true, { deferSecondary: true, secondaryDelay: 800 });
      showToast(`تمت مزامنة ${formatArabicNumber(synced)} تغييرات مع السيرفر.`);
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذرت المزامنة. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      state.syncingOfflineChanges = false;
      render();
    }
  },
  setReportConfig(key, value) {
    if (key === "type" && state.reportConfig.type !== value) {
      state.filters = { ...state.filters, assigneeId: "all", status: "all", department: "all" };
      state.search = "";
    }
    state.reportConfig[key] = value;
    if (["type", "schoolId"].includes(key)) state.pagination.reportsPage = 1;
    persistLocal();
    render();
  },
  setSchoolProfile(key, value) {
    state.schoolProfile[key] = value;
    persistLocal();
    render();
  },
  setDailyNotebookCutoffTime(value) {
    const nextValue = String(value || "").trim();
    state.schoolProfile.dailyNotebookCutoffTime = /^\d{2}:\d{2}$/.test(nextValue) ? nextValue : "23:59";
    persistLocal();
    showToast(`تم ضبط وقت إغلاق رفع دفتر المهام عند ${state.schoolProfile.dailyNotebookCutoffTime}.`);
    render();
  },
  setActiveSchool(value) {
    const requested = String(value || "all");
    state.activeSchoolId = state.currentUser?.role === "superadmin" ? requested : state.currentUser?.schoolId || "all";
    localStorage.setItem("schoolTaskActiveSchool", state.activeSchoolId);
    state.pagination = { ...paginationDefaults };
    state.mobileNavOpen = false;
    if (cloud.enabled && state.currentUser) {
      cloud.scopeKey = "";
      modules.supabase.startScopedListeners(state.currentUser);
    }
    render();
  },
  setSearch(value) {
    state.search = value;
    state.pagination = { ...paginationDefaults };
    if (searchRenderTimer) window.clearTimeout(searchRenderTimer);
    searchRenderTimer = window.setTimeout(() => {
      render();
      queueDashboardRefresh();
    }, 180);
  },
  clearSearch() {
    state.search = "";
    state.pagination = { ...paginationDefaults };
    render();
    queueDashboardRefresh(0);
  },
  searchTasks(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.search = String(form.get("query") || "").trim();
    state.pagination.tasksPage = 1;
    state.pagination.reportsPage = 1;
    render();
    queueDashboardRefresh(0);
  },
  toggleMobileNav() {
    state.mobileNavOpen = !state.mobileNavOpen;
    render();
  },
  toggleTaskFilters() {
    state.taskFiltersOpen = !state.taskFiltersOpen;
    render();
  },
  toggleTheme() {
    state.theme = effectiveTheme() === "dark" ? "light" : "dark";
    localStorage.setItem("schoolTaskTheme", state.theme);
    applyTheme();
    render();
  },
  setThemeMode(value) {
    state.theme = ["light", "dark", "system"].includes(value) ? value : "system";
    localStorage.setItem("schoolTaskTheme", state.theme);
    applyTheme();
    render();
  },
  changePage(key, value) {
    state.pagination[key] = value;
    render();
  },
  searchUsers(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.userFilters.query = String(form.get("query") || "").trim();
    state.pagination.usersPage = 1;
    render();
  },
  setUserFilter(key, value) {
    if (!["role", "status", "schoolId"].includes(key)) return;
    state.userFilters[key] = value;
    state.pagination.usersPage = 1;
    render();
  },
  resetUserFilters() {
    state.userFilters = { query: "", role: "all", status: "active", schoolId: "all" };
    state.pagination.usersPage = 1;
    render();
  },
  captureFiles(event) {
    fileSelection = Array.from(event.target.files || []);
    render();
  },
  setView(view) {
    if (view === "dashboard") view = "home";
    if (view === "inactiveUsers") view = "users";
    const previousView = state.view;
    state.view = view;
    if (view !== "tasks") state.taskFiltersOpen = false;
    if (view === "users") state.userFilters.status = "active";
    if (view === "users") state.pagination.usersPage = 1;
    if (["dashboard", "tasks", "reports"].includes(view) && state.filters.recurrence === "permanent") state.filters.recurrence = "all";
    if (view === "dailyNotebook" && !["all", "permanent"].includes(state.filters.recurrence)) state.filters.recurrence = "all";
    if (view === "administrativeReports" && previousView !== view) {
      const currentDay = today();
      state.administrativeReportFilters = {
        ...state.administrativeReportFilters,
        date: currentDay,
        month: currentDay.slice(0, 7),
      };
    }
    state.mobileNavOpen = false;
    render();
    if (view === "home") queueDashboardRefresh(0);
  },
  openHomeCircular(id) {
    state.view = "circulars";
    state.mobileNavOpen = false;
    modules.circulars.openCircular(id);
  },
  openHomeMeeting(id) {
    state.view = "meetings";
    state.mobileNavOpen = false;
    modules.meetings.openMeeting(id);
  },
  openHomeTask(id) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) {
      showToast("المهمة لم تعد متاحة.");
      return;
    }
    state.view = "tasks";
    state.mobileNavOpen = false;
    state.modal = { type: "task", id, readOnly: true, source: "home" };
    render();
  },
  setFilter(key, value) {
    state.filters[key] = value;
    state.pagination = { ...paginationDefaults };
    render();
    queueDashboardRefresh();
  },
  setPermanentTaskDate(value) {
    const previousDate = state.permanentTaskDate || today();
    const nextDate = value || today();
    state.permanentTaskDate = nextDate;
    if (state.dailyExtraReport?.from === previousDate && state.dailyExtraReport?.to === previousDate) {
      state.dailyExtraReport = { ...state.dailyExtraReport, from: nextDate, to: nextDate };
    }
    state.pagination.permanentTasksPage = 1;
    render();
  },
  setDailyNotebookFilter(value) {
    state.dailyNotebookEmployeeId = value || "all";
    state.pagination.permanentTasksPage = 1;
    render();
  },
  setDailyExtraReportFilter(key, value) {
    if (!["employeeId", "from", "to"].includes(key)) return;
    state.dailyExtraReport = { ...state.dailyExtraReport, [key]: value || (key === "employeeId" ? "all" : today()) };
    render();
  },
  resetFilters() {
    state.filters = { assigneeId: "all", priority: "all", recurrence: "all", status: "all", department: "all", from: "", to: "" };
    state.search = "";
    state.pagination = { ...paginationDefaults };
    render();
    queueDashboardRefresh(0);
  },
  openUser(id = "") {
    const targetUser = id ? getUser(id) : null;
    if (id ? !canEditUser(targetUser) : !canCreateUsers()) return;
    state.mobileNavOpen = false;
    state.modal = { type: "user", id };
    render();
  },
  openProfile() {
    fileSelection = [];
    state.mobileNavOpen = false;
    state.modal = { type: "profile" };
    render();
  },
  openFinanceDiscount(id = "") {
    if (!canManageFinanceDiscounts()) return;
    const existing = id ? state.financeDiscounts.find((item) => item.id === id) : null;
    if (id && !existing) return;
    state.mobileNavOpen = false;
    state.modal = { type: "finance", id };
    render();
  },
  openSchool(id = "") {
    if (!permissionIsGeneralManager(state.currentUser)) return;
    state.mobileNavOpen = false;
    state.modal = { type: "school", id };
    render();
  },
  saveSchool: modules.users.saveSchool,
  openTask(id = "", recurrence = "") {
    const existingTask = id ? state.tasks.find((task) => task.id === id) : null;
    if (!id && recurrence === "permanent" && !canCreateTasks("notebook")) {
      showToast("لا توجد صلاحية لإضافة دفتر المهام.");
      return;
    }
    if (!id && recurrence !== "permanent" && !canCreateTasks({ schoolId: state.currentUser?.schoolId || "", recurrence: "once" })) {
      showToast("لا توجد صلاحية لإضافة مهمة.");
      return;
    }
    if (id && (!existingTask || !canEditTaskDefinition(existingTask))) {
      showToast("لا يمكن تعديل بيانات مهمة أنشأها المدير. يمكنك تنفيذها أو التعليق عليها فقط حسب الصلاحية.");
      return;
    }
    fileSelection = [];
    state.mobileNavOpen = false;
    state.modal = { type: "task", id, recurrence };
    render();
  },
  openNotebookAssignment() {
    if (!canCreateTasks("notebook")) {
      showToast("لا توجد صلاحية لإسناد دفتر المهام.");
      return;
    }
    const hasReadyNotebook = state.tasks.some((task) => task.recurrence === "permanent" && !task.sourceTaskId && modules.tasks.effectiveStatus(task) !== "archived");
    if (!hasReadyNotebook) {
      showToast("لا يوجد دفتر جاهز متاح للإسناد حاليًا.");
      return;
    }
    state.mobileNavOpen = false;
    state.modal = { type: "assign_notebook" };
    render();
  },
  addNotebookItemRow(button) {
    const container = button?.closest(".notebook-builder")?.querySelector("[data-notebook-items]");
    if (!container) return;
    const row = document.createElement("div");
    row.className = "notebook-item-row";
    row.innerHTML = `
      <input type="hidden" name="notebookTaskId" value="" />
      <label class="field"><span>المهمة</span><input name="notebookItemTitle" required /></label>
      <label class="field"><span>تفاصيل المهمة</span><textarea name="notebookItemDescription"></textarea></label>
      <button class="icon-btn danger-icon" type="button" title="حذف البند" aria-label="حذف البند" onclick="actions.removeNotebookItemRow(this)">${icons.trash}</button>
    `;
    container.append(row);
    row.querySelector("input")?.focus();
  },
  removeNotebookItemRow(button) {
    const container = button?.closest("[data-notebook-items]");
    const row = button?.closest(".notebook-item-row");
    if (!container || !row) return;
    if (container.querySelectorAll(".notebook-item-row").length <= 1) {
      showToast("يجب أن يبقى بند واحد على الأقل في دفتر المهام اليومية.");
      return;
    }
    row.remove();
  },
  openFeedback(id) {
    state.mobileNavOpen = false;
    state.modal = { type: "feedback", id };
    render();
  },
  openNotificationComposer: modules.notifications.openNotificationComposer,
  sendManualNotification: modules.notifications.sendManualNotification,
  pickPermanentOutcome: modules.tasks.pickPermanentOutcome,
  savePermanentDailyEntry: modules.tasks.savePermanentDailyEntry,
  completePermanentDailyGroup: modules.tasks.completePermanentDailyGroup,
  approvePermanentDailyEntry: modules.tasks.approvePermanentDailyEntry,
  approvePermanentDailyGroup: modules.tasks.approvePermanentDailyGroup,
  approveAllPermanentDailyNotebooks: modules.tasks.approveAllPermanentDailyNotebooks,
  saveDailyExtraTask: modules.tasks.saveDailyExtraTask,
  approveDailyExtraTask: modules.tasks.approveDailyExtraTask,
  approveAllDailyExtraTasks: modules.tasks.approveAllDailyExtraTasks,
  addDailyExtraTaskRow: modules.tasks.addDailyExtraTaskRow,
  removeDailyExtraTaskRow: modules.tasks.removeDailyExtraTaskRow,
  printDailyExtraTasks: modules.tasks.printDailyExtraTasks,
  async removeAttachment(taskId, attachmentId) {
    await modules.attachments.removeAttachment(taskId, attachmentId);
    render();
  },
  downloadAttachment: modules.attachments.downloadAttachment,
  closeModal() {
    fileSelection = [];
    state.modal = null;
    render();
  },
};

boot();
