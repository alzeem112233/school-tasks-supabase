import { compareTimestamp, today } from "../utils/dateUtils.js";
import { createUuid } from "../utils/idUtils.js";
import { isGeneralManager, roleGroups } from "../utils/permissionUtils.js";
import { notificationTypeLabel } from "../components/notifications/notificationPresentation.js";
import { createNotificationView } from "../components/notifications/notificationView.js";

export function createNotificationsModule(getContext) {
  let lastTaskAlertSyncAt = 0;
  let alertTimer = null;
  let nativeNotificationListenersReady = false;
  let nativeNotificationChannelReady = false;
  const DEVICE_NOTIFIED_PREFIX = "schoolTasksDeviceNotified:";
  const deviceNotificationTypes = new Set(["task_assigned", "task_created", "chat_message", "administrative_circular", "daily_notebook_reminder"]);

  function normalizeNotification(notification = {}) {
    const { state } = getContext();
    return {
      id: notification.id || createUuid(),
      recipientId: notification.recipientId || "",
      schoolId: notification.schoolId || state.currentUser?.schoolId || "general",
      title: notification.title || "تنبيه",
      message: notification.message || "",
      taskId: notification.taskId || "",
      type: notification.type || "general",
      read: notification.read === true,
      dedupeKey: notification.dedupeKey || "",
      createdAt: notification.createdAt || notification.createdAtTs || today(),
    };
  }

  const typeLabel = notificationTypeLabel;

  function canReadNotification(notification) {
    const { state } = getContext();
    const user = state.currentUser;
    if (!user) return false;
    return notification.recipientId === user.id;
  }

  function visibleNotifications() {
    const { state } = getContext();
    return state.notifications
      .map(normalizeNotification)
      .filter(canReadNotification)
      .sort((a, b) => compareTimestamp(b.createdAt, a.createdAt));
  }

  function getUnreadCount() {
    return visibleNotifications().filter((item) => !item.read).length;
  }

  const view = createNotificationView(getContext, { visibleNotifications, getUnreadCount, typeLabel });

  function deviceNotificationStorageKey() {
    const { state } = getContext();
    return `${DEVICE_NOTIFIED_PREFIX}${state.currentUser?.id || "guest"}`;
  }

  function readDeviceNotifiedIds() {
    try {
      return new Set(JSON.parse(localStorage.getItem(deviceNotificationStorageKey()) || "[]"));
    } catch {
      return new Set();
    }
  }

  function writeDeviceNotifiedIds(ids) {
    const latestIds = [...ids].slice(-250);
    localStorage.setItem(deviceNotificationStorageKey(), JSON.stringify(latestIds));
  }

  function notificationLink(item) {
    if (item.taskId) return `/?task=${encodeURIComponent(item.taskId)}`;
    if (item.type === "administrative_circular") return "/?view=notifications";
    if (item.type === "chat_message") return "/?view=chat";
    return "/?view=notifications";
  }

  function canShowDeviceNotification(item) {
    const { state } = getContext();
    if (!state.currentUser || !canReadNotification(item) || item.read) return false;
    if (!deviceNotificationTypes.has(item.type)) return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
    return true;
  }

  function isNativeApp() {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  }

  async function loadLocalNotificationsPlugin() {
    if (!isNativeApp()) return null;
    try {
      const module = await import("@capacitor/local-notifications");
      return module.LocalNotifications;
    } catch (error) {
      console.warn("تعذر تحميل إشعارات أندرويد الأصلية", error);
      return null;
    }
  }

  async function ensureNativeNotificationPermission() {
    const LocalNotifications = await loadLocalNotificationsPlugin();
    if (!LocalNotifications) return false;
    try {
      const current = await LocalNotifications.checkPermissions();
      if (current.display === "granted") return true;
      const requested = await LocalNotifications.requestPermissions();
      return requested.display === "granted";
    } catch (error) {
      console.warn("تعذر طلب إذن إشعارات الهاتف", error);
      return false;
    }
  }

  async function requestNativeNotificationPermissionStatus() {
    const LocalNotifications = await loadLocalNotificationsPlugin();
    if (!LocalNotifications) return "unsupported";
    try {
      const current = await LocalNotifications.checkPermissions();
      if (current.display === "granted") return "granted";
      if (current.display === "denied") return "denied";
      const requested = await LocalNotifications.requestPermissions();
      return requested.display || "prompt";
    } catch (error) {
      console.warn("تعذر فتح نافذة إذن إشعارات الهاتف", error);
      return "error";
    }
  }

  async function checkNativeNotificationPermission() {
    const LocalNotifications = await loadLocalNotificationsPlugin();
    if (!LocalNotifications) return "unsupported";
    try {
      const current = await LocalNotifications.checkPermissions();
      return current.display || "prompt";
    } catch (error) {
      console.warn("تعذر فحص إذن إشعارات الهاتف", error);
      return "error";
    }
  }

  function persistNotificationDeviceState(status) {
    const { state } = getContext();
    state.messagingStatus = status;
    try {
      localStorage.setItem("schoolTaskNotificationStatus", status);
      if (status === "enabled" || status === "blocked" || status === "unsupported") {
        localStorage.setItem("schoolTaskNotificationPromptDismissed", "1");
        state.notificationPromptDismissed = true;
      }
    } catch {}
  }

  function notificationNumericId(item) {
    const seed = String(item.id || item.dedupeKey || item.title || Date.now());
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) | 0;
    }
    return Math.max(1, Math.abs(hash % 2147483647));
  }

  async function setupNativeNotificationListeners() {
    if (nativeNotificationListenersReady) return;
    const LocalNotifications = await loadLocalNotificationsPlugin();
    if (!LocalNotifications) return;
    nativeNotificationListenersReady = true;
    try {
      await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
        const link = event?.notification?.extra?.link || "/?view=notifications";
        window.location.href = link;
      });
    } catch (error) {
      nativeNotificationListenersReady = false;
      console.warn("تعذر تجهيز مستمع إشعارات الهاتف", error);
    }
  }

  async function ensureNativeNotificationChannel(LocalNotifications) {
    if (nativeNotificationChannelReady || !LocalNotifications?.createChannel) return;
    try {
      await LocalNotifications.createChannel({
        id: "school_tasks_default",
        name: "تنبيهات المهام المدرسية",
        description: "تنبيهات المهام والتعاميم والرسائل داخل منصة مهام المدارس",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
        lights: true,
        lightColor: "#4F8CFF",
      });
      nativeNotificationChannelReady = true;
    } catch (error) {
      console.warn("تعذر تجهيز قناة إشعارات أندرويد", error);
    }
  }

  async function showNativeDeviceNotification(item) {
    const LocalNotifications = await loadLocalNotificationsPlugin();
    if (!LocalNotifications) return false;
    const allowed = await ensureNativeNotificationPermission();
    if (!allowed) return false;
    await ensureNativeNotificationChannel(LocalNotifications);
    await setupNativeNotificationListeners();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationNumericId(item),
          title: item.title,
          body: item.message || typeLabel(item.type),
          channelId: "school_tasks_default",
          schedule: { at: new Date(Date.now() + 250) },
          sound: "default",
          extra: { link: notificationLink(item), notificationId: item.id, type: item.type },
        },
      ],
    });
    return true;
  }

  function hasWebNotificationPermission() {
    return Boolean(getContext().state.notificationsSupported && typeof Notification !== "undefined" && Notification.permission === "granted");
  }

  async function showDeviceNotification(notification, options = {}) {
    const item = normalizeNotification(notification);
    if (!canShowDeviceNotification(item)) return false;
    const notifiedIds = readDeviceNotifiedIds();
    const notificationKey = item.id || item.dedupeKey;
    if (!notificationKey || notifiedIds.has(notificationKey)) return false;
    try {
      if (isNativeApp()) {
        const shownNative = await showNativeDeviceNotification(item);
        if (shownNative) {
          notifiedIds.add(notificationKey);
          writeDeviceNotifiedIds(notifiedIds);
          return true;
        }
      }
      if (!hasWebNotificationPermission()) return false;
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(item.title, {
        body: item.message,
        icon: "/icon-192.png",
        badge: "/icon-32.png",
        tag: item.dedupeKey || item.id,
        renotify: false,
        data: { link: notificationLink(item), notificationId: item.id, type: item.type, source: options.source || "sync" },
      });
      notifiedIds.add(notificationKey);
      writeDeviceNotifiedIds(notifiedIds);
      return true;
    } catch (error) {
      console.warn("تعذر عرض إشعار الجهاز", error);
      return false;
    }
  }

  async function showPendingDeviceNotifications(source = "sync") {
    const pending = visibleNotifications()
      .filter(canShowDeviceNotification)
      .slice(0, 5)
      .reverse();
    for (const notification of pending) {
      await showDeviceNotification(notification, { source });
    }
  }

  function recipientIdsForTask(task) {
    const { state } = getContext();
    const recipients = new Set([task.assigneeId, task.creatorId]);
    state.users
      .filter((user) => user.active && (user.schoolId === task.schoolId || isGeneralManager(user)))
      .filter((user) => roleGroups.approveTasks.includes(user.role) || user.id === task.assigneeId || user.id === task.creatorId)
      .forEach((user) => recipients.add(user.id));
    return [...recipients].filter(Boolean);
  }

  function taskNotificationDedupeKey(task, type = "task") {
    return `${type}:${task.id || task.taskNumber || "task"}`;
  }

  function buildNotificationRecord(payload) {
    return normalizeNotification({
      id: payload.id || createUuid(),
      recipientId: payload.recipientId,
      schoolId: payload.schoolId,
      title: payload.title,
      message: payload.message,
      taskId: payload.taskId || "",
      type: payload.type || "general",
      read: false,
      dedupeKey: payload.dedupeKey || "",
      createdAt: payload.createdAt || today(),
    });
  }

  function appendLocalNotifications(records) {
    const { state, persistLocal } = getContext();
    if (!records.length) return;
    const existingKeys = new Set(
      state.notifications
        .map(normalizeNotification)
        .map((item) => `${item.recipientId}:${item.dedupeKey || item.id}`),
    );
    const additions = records.filter((item) => !existingKeys.has(`${item.recipientId}:${item.dedupeKey || item.id}`));
    if (!additions.length) return;
    state.notifications = [...additions, ...state.notifications.map(normalizeNotification)].sort((a, b) => compareTimestamp(b.createdAt, a.createdAt));
    persistLocal();
  }

  async function createNotificationsForTask(task, title, message, options = {}) {
    const { cloud } = getContext();
    if (cloud.enabled) {
      // Handled by backend triggers in cloud mode.
      return;
    }
    const records = recipientIdsForTask(task)
      .filter((recipientId) => recipientId !== options.excludeRecipientId)
      .map((recipientId) =>
        buildNotificationRecord({
          recipientId,
          schoolId: task.schoolId,
          title,
          message,
          taskId: task.id,
          type: options.type || "task",
          dedupeKey: options.dedupeKey || taskNotificationDedupeKey(task, options.type || "task"),
        }),
      );
    appendLocalNotifications(records);
  }

  async function notifyTaskAssignment(task, previousTask = null) {
    const { cloud, state } = getContext();
    if (!task.assigneeId) return;
    if (previousTask && previousTask.assigneeId === task.assigneeId) return;
    if (cloud.enabled) return;
    appendLocalNotifications([
      buildNotificationRecord({
        recipientId: task.assigneeId,
        schoolId: task.schoolId,
        title: "تم إسناد مهمة إليك",
        message: `${task.taskNumber} - ${task.title}`,
        taskId: task.id,
        type: "task_assigned",
        dedupeKey: `task-assigned:${task.id}:${task.assigneeId}`,
        createdAt: today(),
      }),
      ...(task.creatorId && task.creatorId !== task.assigneeId
        ? [
            buildNotificationRecord({
              recipientId: task.creatorId,
              schoolId: task.schoolId,
              title: "تم تحديث إسناد المهمة",
              message: `تم إسناد ${task.taskNumber} إلى ${getContext().getUser(task.assigneeId)?.name || "مستخدم"}.`,
              taskId: task.id,
              type: "task_assigned",
              dedupeKey: `task-assignment-owner:${task.id}:${task.assigneeId}`,
              createdAt: today(),
            }),
          ]
        : []),
    ]);
    if (state.currentUser) getContext().render();
  }

  async function notifyRoleChange(user, previousUser = null) {
    const { cloud, state, render } = getContext();
    if (cloud.enabled || !previousUser) return;
    const changedRole = previousUser.role !== user.role;
    const changedSchool = previousUser.schoolId !== user.schoolId;
    const changedAccess = previousUser.active !== user.active;
    if (!changedRole && !changedSchool && !changedAccess) return;

    const messageParts = [];
    if (changedRole) messageParts.push(`تم تغيير الدور إلى ${getContext().roleLabel(user.role)}`);
    if (changedSchool) messageParts.push(`تم تغيير المدرسة إلى ${user.schoolId}`);
    if (changedAccess) messageParts.push(user.active ? "تمت إعادة تفعيل الحساب" : "تم تعطيل الحساب");

    appendLocalNotifications([
      buildNotificationRecord({
        recipientId: user.id,
        schoolId: user.schoolId,
        title: changedRole ? "تم تحديث دورك" : "تم تحديث صلاحيات الوصول الخاصة بك",
        message: messageParts.join(" | "),
        type: changedRole ? "role_changed" : "access_changed",
        dedupeKey: `role-change:${user.id}:${user.role}:${user.schoolId}:${user.active}:${today()}`,
      }),
    ]);
    if (state.currentUser) render();
  }

  function buildDeadlineReminderRecords() {
    const { state, tasks } = getContext();
    return state.tasks
      .filter((task) => task.dueDate === today())
      .filter((task) => task.recurrence !== "permanent")
      .filter((task) => !["completed", "archived"].includes(tasks.effectiveStatus(task)))
      .flatMap((task) =>
        recipientIdsForTask(task).map((recipientId) =>
          buildNotificationRecord({
            recipientId,
            schoolId: task.schoolId,
            title: "تذكير بموعد الاستحقاق",
            message: `${task.taskNumber} يستحق اليوم.`,
            taskId: task.id,
            type: "deadline_reminder",
            dedupeKey: `deadline-reminder:${task.id}`,
          }),
        ),
      );
  }

  function buildOverdueAlertRecords() {
    const { state, tasks } = getContext();
    return state.tasks
      .filter((task) => task.recurrence !== "permanent")
      .filter((task) => tasks.effectiveStatus(task) === "overdue")
      .flatMap((task) =>
        recipientIdsForTask(task).map((recipientId) =>
          buildNotificationRecord({
            recipientId,
            schoolId: task.schoolId,
            title: "تنبيه مهمة متأخرة",
            message: `${task.taskNumber} متأخرة منذ ${task.dueDate}.`,
            taskId: task.id,
            type: "overdue_alert",
            dedupeKey: `overdue-alert:${task.id}`,
          }),
        ),
      );
  }

  function buildNotebookExpiryRecords() {
    const { state, tasks } = getContext();
    const groups = new Map();
    state.tasks
      .filter((task) => task.recurrence === "permanent" && !task.sourceTaskId)
      .filter((task) => tasks.effectiveStatus(task) !== "archived" && task.dueDate && task.dueDate <= today())
      .forEach((task) => {
        const key = `${task.schoolId}:${task.assigneeId || task.creatorId}:${task.dueDate}`;
        const group = groups.get(key) || { task, recipients: new Set() };
        recipientIdsForTask(task).forEach((recipientId) => group.recipients.add(recipientId));
        groups.set(key, group);
      });
    return [...groups.entries()].flatMap(([key, group]) =>
      [...group.recipients].map((recipientId) =>
        buildNotificationRecord({
          recipientId,
          schoolId: group.task.schoolId,
          title: group.task.dueDate === today() ? "تنبيه نهاية فترة دفتر المهام" : "انتهت فترة دفتر المهام",
          message: `${group.task.dueDate === today() ? "تنتهي" : "انتهت"} فترة الدفتر بتاريخ ${group.task.dueDate}. يمكن تجديد الفترة أو أرشفة الدفتر من صفحة دفتر المهام.`,
          taskId: group.task.id,
          type: "notebook_expired",
          dedupeKey: `notebook-expired:${key}`,
        }),
      ),
    );
  }

  function buildDailyNotebookReminderRecords() {
    const { state, tasks } = getContext();
    const now = new Date();
    if (now.getHours() < 12) return [];
    const groups = new Map();
    state.tasks
      .filter((task) => task.recurrence === "permanent" && !task.sourceTaskId)
      .filter((task) => task.assigneeId && tasks.effectiveStatus(task) !== "archived")
      .filter((task) => !task.dueDate || task.dueDate >= today())
      .filter((task) => !tasks.permanentDailyOutcome?.(task, today()))
      .forEach((task) => {
        const key = `${task.schoolId}:${task.assigneeId}:${today()}`;
        if (!groups.has(key)) groups.set(key, task);
      });
    return [...groups.entries()].map(([key, task]) =>
      buildNotificationRecord({
        recipientId: task.assigneeId,
        schoolId: task.schoolId,
        title: "تذكير دفتر المهام",
        message: "لم يتم تفعيل دفتر المهام اليوم. يرجى فتح دفتر المهام وتحديد حالة مهام اليوم.",
        taskId: task.id,
        type: "daily_notebook_reminder",
        dedupeKey: `daily-notebook-reminder:${key}`,
      }),
    );
  }

  async function syncTaskAlerts(force = false) {
    const { state, cloud, supabase, scopedSchoolId, render } = getContext();
    if (!state.currentUser) return;
    const now = Date.now();
    if (!force && now - lastTaskAlertSyncAt < 45000) return;
    lastTaskAlertSyncAt = now;

    if (cloud.enabled) {
      try {
        const managementRoles = ["superadmin", "general_manager", "branch_manager", "development_supervision_manager", "general_secretary", "school_principal", "deputy_principal"];
        if (managementRoles.includes(state.currentUser.role)) {
          const scope = scopedSchoolId();
          const schoolIds = scope === "all" ? [...new Set(state.tasks.map((task) => task.schoolId).filter(Boolean))] : [scope];
          for (const schoolId of schoolIds) {
            await Promise.all([
              supabase.callFunction("deadlineReminder", { schoolId }),
              supabase.callFunction("overdueTaskCheck", { schoolId }),
              supabase.callFunction("syncDailyNotebookReminders", { schoolScope: schoolId }),
            ]);
          }
        } else {
          await Promise.all([
            supabase.callFunction("syncTaskNotifications", { schoolScope: scopedSchoolId() }),
            supabase.callFunction("syncDailyNotebookReminders", { schoolScope: scopedSchoolId() }),
          ]);
        }
      } catch (error) {
        console.error("Notification sync failed", error);
      }
      return;
    }

    appendLocalNotifications([
      ...buildDeadlineReminderRecords(),
      ...buildOverdueAlertRecords(),
      ...buildNotebookExpiryRecords(),
      ...buildDailyNotebookReminderRecords(),
    ]);
    render();
  }

  function startAlertScheduler() {
    stopAlertScheduler();
    if (typeof window === "undefined" || typeof window.setInterval !== "function") return;
    alertTimer = window.setInterval(() => {
      syncTaskAlerts(true).catch((error) => console.error("Scheduled notification sync failed", error));
    }, 5 * 60 * 1000);
  }

  function stopAlertScheduler() {
    if (!alertTimer || typeof window === "undefined") return;
    window.clearInterval(alertTimer);
    alertTimer = null;
  }

  async function maybeEnableNotificationsSilently() {
    const { cloud, state, render } = getContext();
    if (!cloud.enabled || !state.currentUser) return;
    if (isNativeApp()) state.notificationsSupported = true;
    if (!state.notificationsSupported) return;
    await setupNativeNotificationListeners();
    if (isNativeApp()) {
      const permission = await checkNativeNotificationPermission();
      if (permission === "granted") {
        persistNotificationDeviceState("enabled");
        render();
        showPendingDeviceNotifications("startup").catch((error) => console.error("Pending notification display failed", error));
      } else {
        persistNotificationDeviceState(permission === "denied" ? "blocked" : "idle");
        render();
      }
      return;
    }
    if (Notification.permission === "granted") {
      persistNotificationDeviceState("enabled");
      render();
      showPendingDeviceNotifications("startup").catch((error) => console.error("Pending notification display failed", error));
      return;
    }
    if (Notification.permission === "denied") {
      persistNotificationDeviceState("blocked");
      render();
    }
  }

  function shouldShowPhoneNotificationPrompt() {
    const { cloud, state } = getContext();
    if (!cloud.enabled || !state.currentUser) return false;
    if (isNativeApp() && !state.notificationsSupported) state.notificationsSupported = true;
    if (!state.notificationsSupported) return false;
    if (state.notificationPromptDismissed) return false;
    if (isNativeApp()) return !["enabled", "blocked", "unsupported"].includes(state.messagingStatus);
    if (typeof Notification === "undefined") return false;
    return Notification.permission === "default";
  }

  function renderPhoneNotificationPrompt() {
    const { safe, icons } = getContext();
    if (!shouldShowPhoneNotificationPrompt()) return "";
    return `
      <section class="phone-notification-prompt" role="region" aria-label="تفعيل تنبيهات الهاتف">
        <div class="phone-notification-icon">${icons.bell}</div>
        <div class="phone-notification-copy">
          <strong>فعّل تنبيهات الهاتف</strong>
          <span>${safe("ليصلك إشعار عند إسناد مهمة أو وصول رسالة أو تعميم جديد بمجرد اتصال الهاتف بالإنترنت.")}</span>
        </div>
        <div class="phone-notification-actions">
          <button class="btn" type="button" onclick="actions.enableNotifications()">${icons.check} السماح بالتنبيهات</button>
          <button class="btn secondary" type="button" onclick="actions.dismissNotificationPrompt()">لاحقًا</button>
        </div>
      </section>
    `;
  }

  async function enableNotifications() {
    const { cloud, state, render, showToast } = getContext();
    if (!cloud.enabled) {
      showToast("التنبيهات تحتاج إلى مشروع Supabase مُعد مسبقًا.");
      return;
    }
    if (isNativeApp()) state.notificationsSupported = true;
    if (!state.notificationsSupported) {
      persistNotificationDeviceState("unsupported");
      render();
      showToast("هذا المتصفح لا يدعم التنبيهات الفورية.");
      return;
    }
    if (isNativeApp()) {
      try {
        const permission = await requestNativeNotificationPermissionStatus();
        if (permission === "unsupported") {
          persistNotificationDeviceState("unsupported");
          render();
          showToast("إشعارات الهاتف غير متاحة في هذه النسخة من التطبيق.");
          return;
        }
        if (permission === "error") {
          persistNotificationDeviceState("idle");
          render();
          showToast("تعذر فتح طلب إذن التنبيهات. حدّث التطبيق أو فعّل الإشعارات من إعدادات الهاتف.");
          return;
        }
        const granted = permission === "granted";
        persistNotificationDeviceState(granted ? "enabled" : permission === "denied" ? "blocked" : "idle");
        state.notificationPromptDismissed = granted || permission === "denied";
        render();
        if (!granted) {
          showToast(permission === "denied" ? "إشعارات الهاتف محظورة. فعّلها من إعدادات التطبيق في الهاتف." : "لم يتم منح إذن تنبيهات الهاتف.");
          return;
        }
        await setupNativeNotificationListeners();
        await showPendingDeviceNotifications("permission");
        showToast("تم تفعيل تنبيهات الهاتف لهذا الجهاز.");
        return;
      } catch (error) {
        console.error("Native notification enable failed", error);
        persistNotificationDeviceState("idle");
        render();
        showToast("تعذر تفعيل تنبيهات الهاتف. تأكد من سماح النظام بالإشعارات ثم حاول مرة أخرى.");
      }
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      persistNotificationDeviceState(permission === "denied" ? "blocked" : "idle");
      render();
      showToast("لم يتم منح إذن التنبيهات.");
      return;
    }
    persistNotificationDeviceState("enabled");
    render();
    await showPendingDeviceNotifications("permission");
    showToast("تم تفعيل التنبيهات لهذا الجهاز.");
  }

  async function showRealtimeNotification(notification) {
    const { state, showToast } = getContext();
    const item = normalizeNotification(notification);
    showToast(item.title);
    await showDeviceNotification(item, { source: "realtime" });
  }

  function openNotificationComposer() {
    const { state, canSendNotifications, showToast, render } = getContext();
    if (!canSendNotifications()) {
      showToast("لا توجد صلاحية لإرسال الإشعارات.");
      return;
    }
    state.mobileNavOpen = false;
    state.modal = { type: "notification" };
    render();
  }

  function manualNotificationRecipients(audience, recipientId, schoolScope) {
    const { state } = getContext();
    const currentUser = state.currentUser;
    if (!currentUser) return [];
    const activeUsers = state.users.filter((user) => user.active);
    if (audience === "all") {
      return isGeneralManager(currentUser) ? activeUsers : [];
    }
    if (audience === "user") {
      return activeUsers.filter((user) => user.id === recipientId && (isGeneralManager(currentUser) || user.schoolId === currentUser.schoolId));
    }
    const targetSchoolId = isGeneralManager(currentUser) ? schoolScope || currentUser.schoolId : currentUser.schoolId;
    return activeUsers.filter((user) => user.schoolId === targetSchoolId);
  }

  async function sendManualNotification(event) {
    event.preventDefault();
    const { state, cloud, canSendNotifications, showToast, supabase, persistLocal, audit, render } = getContext();
    if (!canSendNotifications()) {
      showToast("لا توجد صلاحية لإرسال الإشعارات.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const audience = String(form.get("audience") || "school");
    const recipientId = String(form.get("recipientId") || "");
    const schoolScope = String(form.get("schoolScope") || "");
    const title = String(form.get("title") || "").trim();
    const message = String(form.get("message") || "").trim();
    if (!title || !message) {
      showToast("اكتب عنوان الرسالة ونصها.");
      return;
    }
    if (audience === "all" && !isGeneralManager(state.currentUser)) {
      showToast("فقط مدير الإدارة العامة يمكنه الإرسال لكل النظام.");
      return;
    }

    try {
      if (cloud.enabled) {
        const result = await supabase.callFunction("sendManualNotification", {
          audience,
          recipientId: audience === "user" ? recipientId : null,
          schoolScope: audience === "school" ? schoolScope : null,
          title,
          message,
        });
        state.modal = null;
        showToast(`تم إرسال الإشعار إلى ${result?.sent ?? result?.processed ?? 0} مستخدم.`);
        return;
      }

      const recipients = manualNotificationRecipients(audience, recipientId, schoolScope);
      if (!recipients.length) {
        showToast("لا يوجد مستلمون مطابقون.");
        return;
      }
      const dedupeSeed = createUuid();
      appendLocalNotifications(recipients.map((user) => buildNotificationRecord({
        recipientId: user.id,
        schoolId: user.schoolId,
        title,
        message,
        type: "manual",
        dedupeKey: `manual:${dedupeSeed}:${user.id}`,
      })));
      await audit.recordActivity("manual_notification_sent", "تم إرسال إشعار", title, state.currentUser.schoolId, state.currentUser.id);
      state.modal = null;
      persistLocal();
      showToast(`تم إرسال الإشعار إلى ${recipients.length} مستخدم.`);
      render();
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر إرسال الإشعار.");
    }
  }

  async function markNotificationRead(id) {
    const { cloud, state, persistLocal, render, supabase } = getContext();
    const notification = state.notifications.map(normalizeNotification).find((item) => item.id === id && canReadNotification(item));
    if (!notification || notification.read) return;
    if (cloud.enabled) {
      await supabase.saveCloudDoc("notifications", id, { read: true }, true);
      state.notifications = state.notifications.map((item) => (item.id === id ? { ...normalizeNotification(item), read: true } : normalizeNotification(item)));
      render();
      return;
    }
    state.notifications = state.notifications.map((item) => (item.id === id ? { ...normalizeNotification(item), read: true } : normalizeNotification(item)));
    persistLocal();
    render();
  }

  async function markAllNotificationsRead() {
    const { cloud, state, persistLocal, render } = getContext();
    const unread = visibleNotifications().filter((item) => !item.read);
    if (!unread.length) return;
    if (cloud.enabled) {
      const { error } = await cloud.client
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", state.currentUser.id)
        .eq("is_read", false);
      if (error) throw error;
      const unreadIds = new Set(unread.map((item) => item.id));
      state.notifications = state.notifications.map((item) => (unreadIds.has(item.id) ? { ...normalizeNotification(item), read: true } : normalizeNotification(item)));
      render();
      return;
    }
    const unreadIds = new Set(unread.map((item) => item.id));
    state.notifications = state.notifications.map((item) => (unreadIds.has(item.id) ? { ...normalizeNotification(item), read: true } : normalizeNotification(item)));
    persistLocal();
    render();
  }

  async function openNotificationTask(notificationId, taskId) {
    const { state, render, showToast } = getContext();
    await markNotificationRead(notificationId);
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) {
      showToast("المهمة المرتبطة بهذا التنبيه لم تعد متاحة.");
      return;
    }
    state.view = "tasks";
    state.mobileNavOpen = false;
    state.modal = { type: "task", id: taskId, readOnly: true, source: "notification" };
    render();
  }

  return {
    normalizeNotification,
    visibleNotifications,
    getUnreadCount,
    ...view,
    createNotificationsForTask,
    notifyTaskAssignment,
    notifyRoleChange,
    syncTaskAlerts,
    startAlertScheduler,
    stopAlertScheduler,
    maybeEnableNotificationsSilently,
    enableNotifications,
    showRealtimeNotification,
    showPendingDeviceNotifications,
    renderPhoneNotificationPrompt,
    openNotificationComposer,
    sendManualNotification,
    markNotificationRead,
    markAllNotificationsRead,
    openNotificationTask,
  };
}
