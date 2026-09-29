import { nowTimestamp, today } from "../utils/dateUtils.js";
import { createUuid } from "../utils/idUtils.js";
import { canOverrideManagerApprovalLock, isGeneralManager, isTracker, linkedSchoolIds, normalizeRole } from "../utils/permissionUtils.js";

const circularWriterRoles = ["general_manager", "school_principal", "deputy_principal", "school_secretary", "computer_unit", "printing_unit"];
const circularApproverRoles = ["general_manager", "school_principal"];
const statusLabels = {
  draft: "قيد كتابة التعميم",
  approval: "بانتظار اعتماد المدير",
  published: "منشور",
  archived: "مؤرشف",
  rejected: "معاد للتعديل",
};
const categoryLabels = {
  administrative: "إداري",
  academic: "أكاديمي",
  finance: "مالي",
  exams: "اختبارات",
  activities: "أنشطة",
  attendance: "حضور",
  urgent: "عاجل",
  custom: "مخصص",
};
const audienceLabels = { branch: "كل موظفي الفرع", all: "كل مستخدمي المنصة", custom: "مجموعة مخصصة" };

function clean(value) {
  return String(value || "").trim();
}

function listFromForm(form, key) {
  return form.getAll(key).map(String).filter(Boolean);
}

export function createCircularsModule(getContext) {
  let loadedKey = "";

  function roleOf(user = getContext().state.currentUser) {
    return normalizeRole(user?.role, "");
  }

  function schoolScopeId() {
    const { state } = getContext();
    if (isGeneralManager(state.currentUser)) return state.activeSchoolId || "all";
    if (isTracker(state.currentUser)) {
      const ids = linkedSchoolIds(state.currentUser);
      if (state.activeSchoolId !== "all" && ids.includes(state.activeSchoolId)) return state.activeSchoolId;
      return "all";
    }
    return state.currentUser?.schoolId || "";
  }

  function canViewCirculars(user = getContext().state.currentUser) {
    return !!user && user.active !== false;
  }

  function canManageCirculars(user = getContext().state.currentUser) {
    return !!user && user.active !== false && circularWriterRoles.includes(roleOf(user));
  }

  function canApproveCirculars(user = getContext().state.currentUser) {
    return !!user && user.active !== false && circularApproverRoles.includes(roleOf(user));
  }

  function canApproveCircular(item, user = getContext().state.currentUser) {
    if (!item || !canApproveCirculars(user)) return false;
    return isGeneralManager(user) || item.schoolId === user.schoolId;
  }

  function isManagerLockedCircular(item) {
    return item?.status === "published" || Boolean(item?.approvedAt || item?.approvedBy);
  }

  function canEditManagerLockedCircular(item, user = getContext().state.currentUser) {
    return !isManagerLockedCircular(item) || canOverrideManagerApprovalLock(user);
  }

  function visibleUsers() {
    const { state } = getContext();
    const scope = schoolScopeId();
    return (state.users || [])
      .filter((user) => user.active !== false)
      .filter((user) => scope === "all" || user.schoolId === scope)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
  }

  function defaultCircularSchoolId() {
    const { state } = getContext();
    if (isGeneralManager(state.currentUser) && state.activeSchoolId && state.activeSchoolId !== "all") return state.activeSchoolId;
    return state.currentUser?.schoolId || state.schools?.[0]?.id || "";
  }

  function issuerForSchool(schoolId) {
    const { state, schoolName } = getContext();
    if (isGeneralManager(state.currentUser) && (!schoolId || state.activeSchoolId === "all")) return "إدارة جميع الفروع";
    return `إدارة ${schoolName(schoolId || defaultCircularSchoolId())}`;
  }

  function recipientsForAudience(audience, selectedRecipients, schoolId) {
    const { state } = getContext();
    const activeUsers = (state.users || []).filter((user) => user.active !== false);
    if (audience === "custom") return selectedRecipients;
    if (audience === "all" && isGeneralManager(state.currentUser)) return activeUsers.map((user) => user.id);
    return activeUsers.filter((user) => user.schoolId === schoolId).map((user) => user.id);
  }

  function normalizeCircular(row = {}) {
    const createdAt = row.createdAt || row.created_at || nowTimestamp();
    const status = row.status === "review" ? "approval" : row.status;
    return {
      id: row.id || createUuid(),
      schoolId: row.schoolId || row.school_id || getContext().state.currentUser?.schoolId || "",
      number: clean(row.number || row.circular_number || `CIR-${today().replaceAll("-", "")}`),
      title: clean(row.title || "تعميم إداري"),
      category: categoryLabels[row.category] ? row.category : "administrative",
      issuer: clean(row.issuer || ""),
      priority: "medium",
      status: statusLabels[status] ? status : "draft",
      content: clean(row.content || ""),
      publishDate: row.publishDate || row.publish_date || today(),
      expiryDate: row.expiryDate || row.expiry_date || "",
      dueDate: row.dueDate || row.due_date || "",
      requireReadReceipt: row.requireReadReceipt ?? row.require_read_receipt ?? true,
      requireAction: row.requireAction ?? row.require_action ?? false,
      targets: row.targets || { audience: "branch", userIds: [] },
      attachments: row.attachments || [],
      workflow: row.workflow || {},
      metrics: row.metrics || {},
      version: Number(row.version || 1),
      createdBy: row.createdBy || row.created_by || getContext().state.currentUser?.id || null,
      reviewedBy: row.reviewedBy || row.reviewed_by || null,
      approvedBy: row.approvedBy || row.approved_by || null,
      publishedBy: row.publishedBy || row.published_by || null,
      createdAt,
      updatedAt: row.updatedAt || row.updated_at || createdAt,
      reviewedAt: row.reviewedAt || row.reviewed_at || null,
      approvedAt: row.approvedAt || row.approved_at || null,
      publishedAt: row.publishedAt || row.published_at || null,
      archivedAt: row.archivedAt || row.archived_at || null,
    };
  }

  function circularToRow(item) {
    return {
      id: item.id,
      school_id: item.schoolId,
      circular_number: item.number,
      title: item.title,
      category: item.category,
      issuer: item.issuer,
      priority: "medium",
      status: item.status,
      content: item.content,
      publish_date: item.publishDate || null,
      expiry_date: item.expiryDate || null,
      due_date: item.dueDate || null,
      require_read_receipt: Boolean(item.requireReadReceipt),
      require_action: Boolean(item.requireAction),
      targets: item.targets || {},
      attachments: item.attachments || [],
      workflow: item.workflow || {},
      metrics: item.metrics || {},
      version: Number(item.version || 1),
      created_by: item.createdBy || null,
      reviewed_by: item.reviewedBy || null,
      approved_by: item.approvedBy || null,
      published_by: item.publishedBy || null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      reviewed_at: item.reviewedAt || null,
      approved_at: item.approvedAt || null,
      published_at: item.publishedAt || null,
      archived_at: item.archivedAt || null,
    };
  }

  function normalizeRecipient(row = {}) {
    return {
      id: row.id || createUuid(),
      circularId: row.circularId || row.circular_id || "",
      schoolId: row.schoolId || row.school_id || "",
      userId: row.userId || row.user_id || "",
      readAt: row.readAt || row.read_at || null,
      acknowledgedAt: row.acknowledgedAt || row.acknowledged_at || null,
      actionStatus: row.actionStatus || row.action_status || "pending",
      actionNote: clean(row.actionNote || row.action_note || ""),
      reminderCount: Number(row.reminderCount || row.reminder_count || 0),
      createdAt: row.createdAt || row.created_at || nowTimestamp(),
    };
  }

  function recipientToRow(item) {
    return {
      id: item.id,
      circular_id: item.circularId,
      school_id: item.schoolId,
      user_id: item.userId,
      read_at: item.readAt || null,
      acknowledged_at: item.acknowledgedAt || null,
      action_status: item.actionStatus || "pending",
      action_note: item.actionNote || "",
      reminder_count: Number(item.reminderCount || 0),
      created_at: item.createdAt,
    };
  }

  async function loadCloudData(force = false) {
    const { state, cloud, render } = getContext();
    if (!cloud.enabled || !cloud.client || !state.currentUser || !canViewCirculars()) return;
    const key = `${state.currentUser.id}:${schoolScopeId()}`;
    if (!force && loadedKey === key) return;
    loadedKey = key;
    state.circularsLoading = true;
    render();
    try {
      let query = cloud.client.from("administrative_circulars").select("*").order("updated_at", { ascending: false }).limit(500);
      const scope = schoolScopeId();
      if (scope && scope !== "all") query = query.eq("school_id", scope);
      const { data, error } = await query;
      if (error) throw error;
      let recipientQuery = cloud.client.from("circular_recipients").select("*").order("created_at", { ascending: false }).limit(1200);
      if (scope && scope !== "all") recipientQuery = recipientQuery.eq("school_id", scope);
      const { data: recipients, error: recipientError } = await recipientQuery;
      if (recipientError) throw recipientError;
      state.circulars = (data || []).map(normalizeCircular);
      state.circularRecipients = (recipients || []).map(normalizeRecipient);
      state.circularsError = "";
    } catch (error) {
      console.error(error);
      state.circularsError = "تعذر تحميل التعاميم الإدارية. تأكد من تطبيق تحديثات قاعدة البيانات.";
    } finally {
      state.circularsLoading = false;
      render();
    }
  }

  function load() {
    loadCloudData().catch((error) => console.warn("Circulars cloud load failed", error));
  }

  function filteredCirculars() {
    const { state } = getContext();
    const filters = state.circularFilters || {};
    const query = clean(filters.search).toLowerCase();
    const currentUserId = state.currentUser?.id || "";
    const recipientCircularIds = new Set((state.circularRecipients || []).filter((item) => item.userId === currentUserId).map((item) => item.circularId));
    return (state.circulars || []).filter((item) => {
      if (!canManageCirculars() && item.status !== "published" && !recipientCircularIds.has(item.id)) return false;
      if (filters.status && filters.status !== "all" && item.status !== filters.status) return false;
      if (filters.category && filters.category !== "all" && item.category !== filters.category) return false;
      if (query && !`${item.number} ${item.title} ${item.content} ${item.issuer}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function recipientsFor(circularId) {
    return (getContext().state.circularRecipients || []).filter((item) => item.circularId === circularId);
  }

  function readRate(circularId) {
    const recipients = recipientsFor(circularId);
    if (!recipients.length) return 0;
    return Math.round((recipients.filter((item) => item.readAt).length / recipients.length) * 100);
  }

  function setFilter(key, value) {
    const { state, render } = getContext();
    state.circularFilters = { ...(state.circularFilters || {}), [key]: value };
    render();
  }

  function openCircular(id = "") {
    const { state, render } = getContext();
    state.modal = { type: "circular", id };
    render();
  }

  function closeModal() {
    const { state, render } = getContext();
    state.modal = null;
    render();
  }

  function updateCircularInState(item) {
    const { state } = getContext();
    const exists = (state.circulars || []).some((inner) => inner.id === item.id);
    state.circulars = exists ? state.circulars.map((inner) => (inner.id === item.id ? item : inner)) : [item, ...(state.circulars || [])];
  }

  async function saveCircular(event) {
    event.preventDefault();
    const { state, cloud, showToast, render } = getContext();
    if (!canManageCirculars()) {
      showToast("لا توجد صلاحية لحفظ التعاميم.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const id = clean(form.get("id")) || createUuid();
    const existing = (state.circulars || []).find((item) => item.id === id);
    if (existing && !canEditManagerLockedCircular(existing)) {
      showToast("تم اعتماد هذا التعميم من المدير، ولا يمكن تعديله إلا من المدير.");
      return;
    }
    const schoolId = clean(form.get("schoolId")) || defaultCircularSchoolId();
    const audience = clean(form.get("audience")) || "branch";
    const selectedRecipients = listFromForm(form, "recipientIds");
    const recipientIds = recipientsForAudience(audience, selectedRecipients, schoolId);
    const now = nowTimestamp();
    const item = normalizeCircular({
      ...(existing || {}),
      id,
      schoolId,
      number: clean(form.get("number")) || `CIR-${today().replaceAll("-", "")}`,
      title: clean(form.get("title")),
      category: clean(form.get("category")),
      issuer: issuerForSchool(schoolId),
      priority: "medium",
      status: existing?.status || "draft",
      content: clean(form.get("content")),
      publishDate: clean(form.get("publishDate")) || today(),
      expiryDate: clean(form.get("expiryDate")),
      dueDate: "",
      requireReadReceipt: true,
      requireAction: form.get("requireAction") === "on",
      targets: { audience, userIds: audience === "custom" ? selectedRecipients : recipientIds },
      createdBy: existing?.createdBy || state.currentUser?.id || null,
      updatedAt: now,
      createdAt: existing?.createdAt || now,
    });
    try {
      if (!cloud.enabled || !cloud.client) throw new Error("قاعدة البيانات غير متصلة.");
      const { error } = await cloud.client.from("administrative_circulars").upsert(circularToRow(item));
      if (error) throw error;
      if (recipientIds.length) {
        const rows = recipientIds.map((userId) =>
          recipientToRow(normalizeRecipient({
            circularId: item.id,
            schoolId: state.users.find((user) => user.id === userId)?.schoolId || item.schoolId,
            userId,
            actionStatus: item.requireAction ? "pending" : "not_required",
          })),
        );
        const { error: recipientError } = await cloud.client.from("circular_recipients").upsert(rows, { onConflict: "circular_id,user_id" });
        if (recipientError) throw recipientError;
      }
      updateCircularInState(item);
      await loadCloudData(true);
      closeModal();
      showToast("تم حفظ التعميم الإداري.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر حفظ التعميم.");
      render();
    }
  }

  async function updateStatus(id, status) {
    const { state, cloud, showToast } = getContext();
    const item = (state.circulars || []).find((inner) => inner.id === id);
    if (!item || !canManageCirculars()) return;
    if (isManagerLockedCircular(item) && !canEditManagerLockedCircular(item)) {
      showToast("تم اعتماد هذا التعميم من المدير، ولا يمكن تعديله إلا من المدير.");
      return;
    }
    if (status === "published" && !canApproveCircular(item)) {
      showToast("لا يمكن نشر التعميم قبل اعتماد المدير.");
      return;
    }
    const now = nowTimestamp();
    const patch = { status, updated_at: now };
    if (status === "approval") patch.reviewed_at = now, patch.reviewed_by = state.currentUser?.id || null;
    if (status === "published") {
      patch.approved_at = item.approvedAt || now;
      patch.approved_by = item.approvedBy || state.currentUser?.id || null;
      patch.published_at = now;
      patch.published_by = state.currentUser?.id || null;
    }
    if (status === "archived") patch.archived_at = now;
    try {
      const { error } = await cloud.client.from("administrative_circulars").update(patch).eq("id", id);
      if (error) throw error;
      if (status === "published") await notifyRecipients(item);
      await loadCloudData(true);
      showToast(status === "published" ? "تم اعتماد التعميم ونشره وإرسال التنبيهات." : "تم إرسال التعميم للمدير لاعتماده.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر تحديث حالة التعميم.");
    }
  }

  async function notifyRecipients(item) {
    const { state, cloud } = getContext();
    const recipients = recipientsFor(item.id);
    if (!recipients.length) return;
    const rows = recipients
      .filter((recipient) => recipient.userId !== state.currentUser?.id)
      .map((recipient) => ({
        school_id: item.schoolId,
        user_id: recipient.userId,
        title: "تعميم إداري جديد",
        message: `${item.number} - ${item.title}`,
        type: "administrative_circular",
        related_task_id: null,
        dedupe_key: `circular:${item.id}:${recipient.userId}:${item.version}`,
      }));
    if (rows.length) await cloud.client.from("notifications").insert(rows);
  }

  async function markRead(id, note = "") {
    const { state, cloud, showToast } = getContext();
    const recipient = (state.circularRecipients || []).find((item) => item.circularId === id && item.userId === state.currentUser?.id);
    if (!recipient) return;
    try {
      const { error } = await cloud.client.from("circular_recipients").update({
        read_at: recipient.readAt || nowTimestamp(),
        acknowledged_at: nowTimestamp(),
        action_note: clean(note || recipient.actionNote || ""),
      }).eq("id", recipient.id);
      if (error) throw error;
      await loadCloudData(true);
      showToast("تم حفظ تأكيد الاطلاع على التعميم.");
    } catch (error) {
      console.error(error);
      showToast("تعذر حفظ تأكيد الاطلاع.");
    }
  }

  async function submitCircularAcknowledgement(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await markRead(clean(form.get("circularId")), clean(form.get("employeeNote")));
  }

  async function deleteCircular(id) {
    const { cloud, showToast } = getContext();
    const item = (getContext().state.circulars || []).find((inner) => inner.id === id);
    if (!item || !canEditManagerLockedCircular(item)) {
      showToast("تم اعتماد هذا التعميم من المدير، ولا يمكن حذفه إلا من المدير.");
      return;
    }
    if (!window.confirm("هل تريد حذف هذا التعميم؟ لا يمكن حذف التعاميم المنشورة.")) return;
    try {
      const { error } = await cloud.client.from("administrative_circulars").delete().eq("id", id);
      if (error) throw error;
      await loadCloudData(true);
      showToast("تم حذف التعميم.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر حذف التعميم.");
    }
  }

  async function printCircularReport() {
    const { state, safe, formatDate, getUser, schoolName, showToast } = getContext();
    try {
      await loadCloudData(true);
    } catch (error) {
      console.warn("Circular report refresh failed", error);
    }
    const rows = filteredCirculars();
    if (!rows.length) {
      showToast("لا توجد تعاميم لاستخراج التقرير.");
      return;
    }
    const generatedAt = new Date().toLocaleString("ar");
    const reportRows = rows.map((item, index) => {
      const recipients = recipientsFor(item.id);
      const readCount = recipients.filter((recipient) => recipient.readAt).length;
      const notesCount = recipients.filter((recipient) => recipient.actionNote).length;
      return `
        <tr>
          <td>${safe(index + 1)}</td>
          <td>${safe(item.number)}</td>
          <td>${safe(item.title)}</td>
          <td>${safe(categoryLabels[item.category])}</td>
          <td>${safe(statusLabels[item.status])}</td>
          <td>${safe(item.issuer || schoolName(item.schoolId))}</td>
          <td>${safe(formatDate(item.publishDate))}</td>
          <td>${safe(item.expiryDate ? formatDate(item.expiryDate) : "بدون")}</td>
          <td>${safe(recipients.length)}</td>
          <td>${safe(readCount)}</td>
          <td>${safe(Math.max(0, recipients.length - readCount))}</td>
          <td>${safe(readRate(item.id))}%</td>
          <td>${safe(notesCount)}</td>
        </tr>`;
    }).join("");
    const recipientRows = rows.flatMap((item) =>
      recipientsFor(item.id).map((recipient) => `
        <tr>
          <td>${safe(item.number)}</td>
          <td>${safe(item.title)}</td>
          <td>${safe(getUser(recipient.userId)?.name || "مستخدم")}</td>
          <td>${safe(recipient.acknowledgedAt ? "أكد الاطلاع" : recipient.readAt ? "اطلع" : "لم يطلع")}</td>
          <td>${safe(recipient.readAt ? new Date(recipient.readAt).toLocaleString("ar") : "-")}</td>
          <td>${safe(recipient.actionNote || "-")}</td>
        </tr>`),
    ).join("");
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      showToast("تعذر فتح نافذة التقرير. اسمح للنوافذ المنبثقة ثم حاول مرة أخرى.");
      return;
    }
    printWindow.document.write(`<!doctype html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>تقرير التعاميم الإدارية</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 24px; color: #172033; font-family: "Tahoma", "Arial", sans-serif; background: #fff; }
          .report-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding-bottom: 14px; border-bottom: 4px solid #2563eb; }
          h1 { margin: 0 0 6px; color: #0f172a; font-size: 28px; }
          .muted { color: #64748b; font-size: 13px; line-height: 1.7; }
          .badge { display: inline-flex; align-items: center; padding: 8px 12px; border-radius: 999px; color: #1e3a8a; background: #eff6ff; font-weight: 800; }
          .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
          .card { padding: 12px; border: 1px solid #dbeafe; border-radius: 12px; background: #f8fbff; }
          .card span { display: block; color: #64748b; font-size: 12px; }
          .card strong { display: block; margin-top: 4px; color: #0f766e; font-size: 24px; }
          h2 { margin: 22px 0 10px; color: #1e3a8a; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
          th, td { border: 1px solid #d7deea; padding: 8px; text-align: center; vertical-align: middle; font-size: 12px; line-height: 1.55; }
          th { color: #fff; background: #2563eb; font-weight: 800; }
          tbody tr:nth-child(even) td { background: #f8fafc; }
          .note-cell { text-align: right; }
          .footer { display: flex; justify-content: space-between; margin-top: 20px; padding-top: 12px; border-top: 1px solid #dbeafe; color: #64748b; font-size: 12px; }
          @media print { body { padding: 12mm; } .no-print { display: none; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
        </style>
      </head>
      <body>
        <button class="no-print" onclick="window.print()" style="position:fixed;left:18px;top:18px;padding:10px 16px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer;">طباعة / حفظ PDF</button>
        <section class="report-head">
          <div>
            <h1>تقرير التعاميم الإدارية</h1>
            <div class="muted">تقرير مستخرج من بيانات السحابة ويشمل التعاميم ونسبة اطلاع الموظفين وملاحظاتهم.</div>
          </div>
          <div class="badge">تاريخ التقرير: ${safe(generatedAt)}</div>
        </section>
        <section class="cards">
          <div class="card"><span>إجمالي التعاميم</span><strong>${safe(rows.length)}</strong></div>
          <div class="card"><span>المنشورة</span><strong>${safe(rows.filter((item) => item.status === "published").length)}</strong></div>
          <div class="card"><span>بانتظار الاعتماد</span><strong>${safe(rows.filter((item) => item.status === "approval").length)}</strong></div>
          <div class="card"><span>متوسط الاطلاع</span><strong>${safe(Math.round(rows.reduce((sum, item) => sum + readRate(item.id), 0) / rows.length))}%</strong></div>
        </section>
        <h2>ملخص التعاميم</h2>
        <table>
          <thead><tr><th>م</th><th>الرقم</th><th>العنوان</th><th>التصنيف</th><th>الحالة</th><th>الجهة</th><th>النشر</th><th>الانتهاء</th><th>المستلمون</th><th>اطلع</th><th>لم يطلع</th><th>النسبة</th><th>ملاحظات</th></tr></thead>
          <tbody>${reportRows}</tbody>
        </table>
        <h2>تفاصيل الاطلاع والملاحظات</h2>
        <table>
          <thead><tr><th>رقم التعميم</th><th>العنوان</th><th>الموظف</th><th>حالة الاطلاع</th><th>وقت الاطلاع</th><th>ملاحظة الموظف</th></tr></thead>
          <tbody>${recipientRows || `<tr><td colspan="6">لا توجد بيانات مستلمين.</td></tr>`}</tbody>
        </table>
        <div class="footer"><span>منصة مهام المدارس</span><span>تقرير التعاميم الإدارية</span></div>
      </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
  }

  function renderCirculars() {
    const { state, safe, icons, dashboard, formatDate } = getContext();
    load();
    const rows = filteredCirculars();
    const cards = {
      draft: rows.filter((item) => item.status === "draft").length,
      approval: rows.filter((item) => item.status === "approval").length,
      published: rows.filter((item) => item.status === "published").length,
      unread: (state.circularRecipients || []).filter((item) => item.userId === state.currentUser?.id && !item.readAt).length,
      archived: rows.filter((item) => item.status === "archived").length,
    };
    return `
      <section class="work-module circular-page">
        <div class="topbar">
          <div class="section-title">
            <h2>التعاميم الإدارية</h2>
            <p class="muted">إنشاء التعاميم ومراجعتها واعتمادها ونشرها وتتبع القراءة والتنفيذ.</p>
          </div>
          <div class="actions">
            ${canManageCirculars() ? `<button class="btn secondary" onclick="actions.printCircularReport()">${icons.print || ""} تقرير التعاميم</button>` : ""}
            ${canManageCirculars() ? `<button class="btn" onclick="actions.openCircular()">${icons.plus} تعميم جديد</button>` : ""}
          </div>
        </div>
        <div class="grid metrics compact-metrics">
          ${dashboard.metric("قيد الكتابة", cards.draft)}
          ${dashboard.metric("بانتظار اعتماد المدير", cards.approval)}
          ${dashboard.metric("المنشورة", cards.published)}
          ${dashboard.metric("غير المقروءة", cards.unread)}
          ${dashboard.metric("المؤرشفة", cards.archived)}
        </div>
        <div class="panel module-toolbar">
          <label class="field"><span>بحث</span><input value="${safe(state.circularFilters?.search || "")}" placeholder="العنوان، الرقم، النص" oninput="actions.setCircularFilter('search', this.value)" /></label>
          <label class="field"><span>الحالة</span><select onchange="actions.setCircularFilter('status', this.value)">
            <option value="all">كل الحالات</option>${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${state.circularFilters?.status === value ? "selected" : ""}>${safe(label)}</option>`).join("")}
          </select></label>
          <label class="field"><span>التصنيف</span><select onchange="actions.setCircularFilter('category', this.value)">
            <option value="all">كل التصنيفات</option>${Object.entries(categoryLabels).map(([value, label]) => `<option value="${value}" ${state.circularFilters?.category === value ? "selected" : ""}>${safe(label)}</option>`).join("")}
          </select></label>
        </div>
        ${state.circularsLoading ? `<div class="skeleton-panel">جاري تحميل التعاميم...</div>` : ""}
        ${state.circularsError ? `<div class="feedback danger">${safe(state.circularsError)}</div>` : ""}
        <div class="module-card-list">
          ${rows.length ? rows.map((item) => `
            <article class="module-card">
              <div class="module-card-main">
                <span class="role-pill">${safe(item.number)}</span>
                <strong>${safe(item.title)}</strong>
                <p>${safe(item.content.slice(0, 160))}${item.content.length > 160 ? "..." : ""}</p>
                <div class="task-meta">
                  <span>${safe(categoryLabels[item.category])}</span>
                  <span>${safe(item.issuer || issuerForSchool(item.schoolId))}</span>
                  <span>${safe(formatDate(item.publishDate))}</span>
                  <span>قراءة: ${safe(readRate(item.id))}%</span>
                </div>
              </div>
              <div class="module-actions">
                <span class="status-pill status-${item.status === "published" ? "approved" : item.status === "archived" ? "archived" : "new"}">${safe(statusLabels[item.status])}</span>
                <button class="btn secondary" onclick="actions.openCircular('${safe(item.id)}')">عرض</button>
                ${(state.circularRecipients || []).some((recipient) => recipient.circularId === item.id && recipient.userId === state.currentUser?.id && !recipient.readAt) ? `<button class="btn success circular-read-btn" onclick="actions.markCircularRead('${safe(item.id)}')">${icons.check} تأكيد الاطلاع</button>` : ""}
                ${canManageCirculars() && item.status === "draft" ? `<button class="btn secondary" onclick="actions.updateCircularStatus('${safe(item.id)}', 'approval')">إرسال للمدير للاعتماد</button>` : ""}
                ${canApproveCircular(item) && item.status === "approval" ? `<button class="btn success" onclick="actions.updateCircularStatus('${safe(item.id)}', 'published')">اعتماد ونشر</button>` : ""}
                ${canManageCirculars() && ["draft", "rejected"].includes(item.status) ? `<button class="icon-btn danger-icon" onclick="actions.deleteCircular('${safe(item.id)}')">${icons.trash}</button>` : ""}
              </div>
            </article>`).join("") : `<div class="empty">لا توجد تعاميم ضمن الفلاتر الحالية.</div>`}
        </div>
      </section>
    `;
  }

  function renderCircularModal() {
    const { state, safe, icons, schoolName } = getContext();
    const item = normalizeCircular((state.circulars || []).find((inner) => inner.id === state.modal?.id) || {});
    const selected = new Set(item.targets?.userIds || recipientsFor(item.id).map((recipient) => recipient.userId));
    const users = visibleUsers();
    const currentRecipient = (state.circularRecipients || []).find((recipient) => recipient.circularId === item.id && recipient.userId === state.currentUser?.id);
    const readOnly = !canManageCirculars() || !canEditManagerLockedCircular(item);
    const audience = item.targets?.audience || (isGeneralManager(state.currentUser) ? "all" : "branch");
    const schoolId = item.schoolId || defaultCircularSchoolId();
    return `
      <div class="modal"><form class="modal-card module-modal" onsubmit="actions.saveCircular(event)">
        <div class="modal-head">
          <h3>${safe(item.id && state.modal?.id ? "تفاصيل التعميم الإداري" : "تعميم إداري جديد")}</h3>
          <button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button>
        </div>
        <input type="hidden" name="id" value="${safe(state.modal?.id || "")}" />
        <input type="hidden" name="schoolId" value="${safe(schoolId)}" />
        <div class="form-grid">
          <div class="module-form-section wide">
            <div class="module-form-section-title">
              <strong>بيانات التعميم الأساسية</strong>
              <span>اكتب عنوانًا قصيرًا يساعد الموظف على معرفة موضوع التعميم بسرعة.</span>
            </div>
            <div class="form-grid circular-inline-grid">
              <label class="field"><span>رقم التعميم</span><input name="number" value="${safe(item.number)}" placeholder="مثال: 1448-001" ${readOnly ? "readonly" : ""} required /></label>
              <label class="field wide"><span>عنوان التعميم</span><input name="title" value="${safe(item.title)}" placeholder="اكتب عنوان التعميم بوضوح" ${readOnly ? "readonly" : ""} required /></label>
              <label class="field"><span>نوع التعميم</span><select name="category" ${readOnly ? "disabled" : ""}>${Object.entries(categoryLabels).map(([value, label]) => `<option value="${value}" ${item.category === value ? "selected" : ""}>${safe(label)}</option>`).join("")}</select></label>
            </div>
          </div>
          <div class="module-form-section circular-writing-section wide">
            <div class="module-form-section-title">
              <strong>كتابة التعميم</strong>
              <span>هذه هي الخانة الرئيسية: اكتب فيها كل ما يخص التعميم كما سيظهر للموظفين.</span>
            </div>
            <label class="field wide circular-editor-field"><span>نص التعميم الكامل</span><textarea class="circular-content-editor" name="content" rows="10" placeholder="اكتب نص التعميم هنا..." ${readOnly ? "readonly" : ""} required>${safe(item.content)}</textarea></label>
          </div>
          <div class="module-form-section wide">
            <div class="module-form-section-title">
              <strong>النشر والاستلام</strong>
              <span>الجهة المصدرة تحدد تلقائيًا حسب الفرع، ويمكن تحديد نطاق النشر حسب الصلاحية.</span>
            </div>
            <div class="form-grid circular-inline-grid">
              <label class="field"><span>الجهة المصدرة</span><input value="${safe(item.issuer || issuerForSchool(schoolId))}" readonly /></label>
              <label class="field"><span>تاريخ النشر</span><input type="date" name="publishDate" value="${safe(item.publishDate || today())}" ${readOnly ? "readonly" : ""} /></label>
              <label class="field"><span>تاريخ انتهاء العرض</span><input type="date" name="expiryDate" value="${safe(item.expiryDate)}" ${readOnly ? "readonly" : ""} /></label>
              <label class="check-option module-check wide"><input type="checkbox" name="requireAction" ${item.requireAction ? "checked" : ""} ${readOnly ? "disabled" : ""} /><span>يتطلب تنفيذ إجراء من الموظف</span></label>
            </div>
          </div>
          ${
            isGeneralManager(state.currentUser) && !readOnly
              ? `<div class="module-form-section wide"><div class="module-form-section-title"><strong>المستلمون</strong><span>اختر كل المستخدمين أو مجموعة مخصصة حسب حاجة التعميم.</span></div><label class="field wide"><span>نطاق النشر</span><select name="audience" onchange="this.form.querySelector('[data-recipient-picker]').hidden = this.value !== 'custom'">
                  <option value="all" ${audience === "all" ? "selected" : ""}>${safe(audienceLabels.all)}</option>
                  <option value="custom" ${audience === "custom" ? "selected" : ""}>${safe(audienceLabels.custom)}</option>
                </select></label></div>`
              : `<input type="hidden" name="audience" value="branch" /><div class="module-form-section wide"><div class="module-form-section-title"><strong>المستلمون</strong><span>سيظهر التعميم لموظفي الفرع المحدد فقط بعد اعتماد المدير.</span></div><div class="field wide"><span>نطاق النشر</span><input value="${safe(audienceLabels.branch)} - ${safe(schoolName(schoolId))}" readonly /></div></div>`
          }
          <label class="field wide circular-recipient-picker" data-recipient-picker ${audience === "custom" ? "" : "hidden"}><span>اختيار المستلمين</span><select name="recipientIds" multiple size="8">${users.map((user) => `<option value="${safe(user.id)}" ${selected.has(user.id) ? "selected" : ""}>${safe(user.name)} - ${safe(schoolName(user.schoolId))}</option>`).join("")}</select></label>
        </div>
        ${currentRecipient ? `
          <div class="circular-ack-panel">
            <strong>${currentRecipient.readAt ? "تم تسجيل اطلاعك على هذا التعميم" : "تأكيد الاطلاع على التعميم"}</strong>
            <label class="field wide"><span>ملاحظة للادارة، اختياري</span><textarea id="circular-note-${safe(item.id)}" rows="3">${safe(currentRecipient.actionNote || "")}</textarea></label>
            <button class="btn success circular-read-btn" type="button" onclick="actions.markCircularRead('${safe(item.id)}', document.getElementById('circular-note-${safe(item.id)}')?.value || '')">${icons.check} تأكيد الاطلاع وحفظ الملاحظة</button>
          </div>` : ""}
        ${!readOnly ? `<div class="actions sticky-actions">
          <button class="btn" type="submit">${icons.save} حفظ التعميم</button>
          ${state.modal?.id && item.status === "draft" ? `<button class="btn secondary" type="button" onclick="actions.updateCircularStatus('${safe(item.id)}', 'approval')">إرسال للمدير للاعتماد</button>` : ""}
          ${state.modal?.id && canApproveCircular(item) && item.status === "approval" ? `<button class="btn success" type="button" onclick="actions.updateCircularStatus('${safe(item.id)}', 'published')">اعتماد ونشر وإشعار المستلمين</button>` : ""}
        </div>` : `<div class="actions sticky-actions"><button class="btn secondary" type="button" onclick="actions.closeModal()">إغلاق</button></div>`}
      </form></div>
    `;
  }

  return {
    canViewCirculars,
    canManageCirculars,
    canApproveCirculars,
    load,
    loadCloudData,
    renderCirculars,
    renderCircularModal,
    openCircular,
    saveCircular,
    setFilter,
    updateStatus,
    markRead,
    submitCircularAcknowledgement,
    deleteCircular,
    printCircularReport,
  };
}
