import { nowTimestamp, today } from "../utils/dateUtils.js";
import { createUuid } from "../utils/idUtils.js";
import { canOverrideManagerApprovalLock, isGeneralManager, isTracker, linkedSchoolIds, normalizeRole } from "../utils/permissionUtils.js";

const meetingRoles = ["general_manager", "school_principal", "deputy_principal", "school_secretary", "printing_unit", "computer_unit"];
const statusLabels = {
  draft: "مسودة",
  scheduled: "مجدول",
  active: "قيد الانعقاد",
  minutes_review: "محضر بانتظار الاعتماد",
  approved: "معتمد",
  archived: "مؤرشف",
  cancelled: "ملغي",
};
const attendanceLabels = { pending: "بانتظار", present: "حاضر", absent: "غائب", excused: "معتذر" };
const decisionLabels = { new: "لم تتم", in_progress: "قيد العمل", completed: "تمت", overdue: "متأخر", cancelled: "ملغي" };

function clean(value) {
  return String(value || "").trim();
}

function splitLines(value) {
  return clean(value).split(/\n+/u).map((item) => item.trim()).filter(Boolean);
}

export function createMeetingsModule(getContext) {
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

  function canViewMeetings(user = getContext().state.currentUser) {
    return !!user && user.active !== false;
  }

  function canManageMeetings(user = getContext().state.currentUser) {
    return !!user && user.active !== false && meetingRoles.includes(roleOf(user));
  }

  function isManagerLockedMeeting(item) {
    return item?.status === "approved" || Boolean(item?.approvedAt || item?.approvedBy);
  }

  function canEditManagerLockedMeeting(item, user = getContext().state.currentUser) {
    return !isManagerLockedMeeting(item) || canOverrideManagerApprovalLock(user);
  }

  function visibleUsers() {
    const { state } = getContext();
    const scope = schoolScopeId();
    return (state.users || [])
      .filter((user) => user.active !== false)
      .filter((user) => scope === "all" || user.schoolId === scope)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
  }

  function normalizeMeeting(row = {}) {
    const createdAt = row.createdAt || row.created_at || nowTimestamp();
    return {
      id: row.id || createUuid(),
      schoolId: row.schoolId || row.school_id || getContext().state.currentUser?.schoolId || "",
      number: clean(row.number || row.meeting_number || `MTG-${today().replaceAll("-", "")}`),
      title: clean(row.title || "اجتماع جديد"),
      type: clean(row.type || row.meeting_type || "administrative"),
      chairId: row.chairId || row.chair_id || getContext().state.currentUser?.id || null,
      organizerId: row.organizerId || row.organizer_id || getContext().state.currentUser?.id || null,
      date: row.date || row.meeting_date || today(),
      hijriLabel: clean(row.hijriLabel || row.hijri_label || ""),
      startTime: row.startTime || row.start_time || "",
      durationMinutes: Number(row.durationMinutes || row.duration_minutes || 60),
      location: clean(row.location || ""),
      onlineUrl: clean(row.onlineUrl || row.online_url || ""),
      confidentiality: row.confidentiality || "normal",
      status: statusLabels[row.status] ? row.status : "draft",
      agenda: Array.isArray(row.agenda) ? row.agenda : [],
      minutes: row.minutes || {},
      attachments: row.attachments || [],
      reminders: row.reminders || [],
      recurrence: row.recurrence || {},
      approvedBy: row.approvedBy || row.approved_by || null,
      createdBy: row.createdBy || row.created_by || getContext().state.currentUser?.id || null,
      updatedBy: row.updatedBy || row.updated_by || null,
      createdAt,
      updatedAt: row.updatedAt || row.updated_at || createdAt,
      approvedAt: row.approvedAt || row.approved_at || null,
    };
  }

  function meetingToRow(item) {
    return {
      id: item.id,
      school_id: item.schoolId,
      meeting_number: item.number,
      title: item.title,
      meeting_type: item.type,
      chair_id: item.chairId || null,
      organizer_id: item.organizerId || null,
      meeting_date: item.date,
      hijri_label: item.hijriLabel || "",
      start_time: item.startTime || null,
      duration_minutes: Number(item.durationMinutes || 60),
      location: item.location || "",
      online_url: item.onlineUrl || "",
      confidentiality: item.confidentiality || "normal",
      status: item.status,
      agenda: item.agenda || [],
      minutes: item.minutes || {},
      attachments: item.attachments || [],
      reminders: item.reminders || [],
      recurrence: item.recurrence || {},
      approved_by: item.approvedBy || null,
      created_by: item.createdBy || null,
      updated_by: item.updatedBy || null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      approved_at: item.approvedAt || null,
    };
  }

  function normalizeAttendee(row = {}) {
    return {
      id: row.id || createUuid(),
      meetingId: row.meetingId || row.meeting_id || "",
      schoolId: row.schoolId || row.school_id || "",
      userId: row.userId || row.user_id || "",
      inviteStatus: row.inviteStatus || row.invite_status || "invited",
      attendanceStatus: row.attendanceStatus || row.attendance_status || "pending",
      responseNote: clean(row.responseNote || row.response_note || ""),
      respondedAt: row.respondedAt || row.responded_at || null,
      createdAt: row.createdAt || row.created_at || nowTimestamp(),
    };
  }

  function attendeeToRow(item) {
    return {
      id: item.id,
      meeting_id: item.meetingId,
      school_id: item.schoolId,
      user_id: item.userId,
      invite_status: item.inviteStatus || "invited",
      attendance_status: item.attendanceStatus || "pending",
      response_note: item.responseNote || "",
      responded_at: item.respondedAt || null,
      created_at: item.createdAt,
    };
  }

  function normalizeDecision(row = {}) {
    return {
      id: row.id || createUuid(),
      meetingId: row.meetingId || row.meeting_id || "",
      schoolId: row.schoolId || row.school_id || "",
      title: clean(row.title || "قرار اجتماع"),
      description: clean(row.description || ""),
      ownerId: row.ownerId || row.owner_id || null,
      dueDate: row.dueDate || row.due_date || "",
      priority: row.priority || "medium",
      status: decisionLabels[row.status] ? row.status : "new",
      progress: Number(row.progress || 0),
      delayReason: clean(row.delayReason || row.delay_reason || ""),
      relatedTaskId: row.relatedTaskId || row.related_task_id || null,
      attachments: row.attachments || [],
      createdBy: row.createdBy || row.created_by || getContext().state.currentUser?.id || null,
      updatedBy: row.updatedBy || row.updated_by || null,
      createdAt: row.createdAt || row.created_at || nowTimestamp(),
      updatedAt: row.updatedAt || row.updated_at || nowTimestamp(),
    };
  }

  function decisionToRow(item) {
    return {
      id: item.id,
      meeting_id: item.meetingId,
      school_id: item.schoolId,
      title: item.title,
      description: item.description || "",
      owner_id: item.ownerId || null,
      due_date: item.dueDate || null,
      priority: item.priority || "medium",
      status: item.status || "new",
      progress: Number(item.progress || 0),
      delay_reason: item.delayReason || "",
      related_task_id: item.relatedTaskId || null,
      attachments: item.attachments || [],
      created_by: item.createdBy || null,
      updated_by: item.updatedBy || null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }

  async function loadCloudData(force = false) {
    const { state, cloud, render } = getContext();
    if (!cloud.enabled || !cloud.client || !state.currentUser || !canViewMeetings()) return;
    const key = `${state.currentUser.id}:${schoolScopeId()}`;
    if (!force && loadedKey === key) return;
    loadedKey = key;
    state.meetingsLoading = true;
    render();
    try {
      const scope = schoolScopeId();
      let meetingsQuery = cloud.client.from("meetings").select("*").order("meeting_date", { ascending: false }).limit(500);
      let attendeesQuery = cloud.client.from("meeting_attendees").select("*").order("created_at", { ascending: false }).limit(1500);
      let decisionsQuery = cloud.client.from("meeting_decisions").select("*").order("due_date", { ascending: true }).limit(1500);
      if (scope && scope !== "all") {
        meetingsQuery = meetingsQuery.eq("school_id", scope);
        attendeesQuery = attendeesQuery.eq("school_id", scope);
        decisionsQuery = decisionsQuery.eq("school_id", scope);
      }
      const [{ data: meetings, error }, { data: attendees, error: attendeesError }, { data: decisions, error: decisionsError }] = await Promise.all([
        meetingsQuery,
        attendeesQuery,
        decisionsQuery,
      ]);
      if (error) throw error;
      if (attendeesError) throw attendeesError;
      if (decisionsError) throw decisionsError;
      state.meetings = (meetings || []).map(normalizeMeeting);
      state.meetingAttendees = (attendees || []).map(normalizeAttendee);
      state.meetingDecisions = (decisions || []).map(normalizeDecision);
      state.meetingsError = "";
    } catch (error) {
      console.error(error);
      state.meetingsError = "تعذر تحميل الاجتماعات. تأكد من تطبيق تحديثات قاعدة البيانات.";
    } finally {
      state.meetingsLoading = false;
      render();
    }
  }

  function load() {
    loadCloudData().catch((error) => console.warn("Meetings cloud load failed", error));
  }

  function setFilter(key, value) {
    const { state, render } = getContext();
    state.meetingFilters = { ...(state.meetingFilters || {}), [key]: value };
    render();
  }

  function attendeesFor(meetingId) {
    return (getContext().state.meetingAttendees || []).filter((item) => item.meetingId === meetingId);
  }

  function decisionsFor(meetingId) {
    return (getContext().state.meetingDecisions || []).filter((item) => item.meetingId === meetingId);
  }

  function meetingCompletionRate(meetingId) {
    const decisions = decisionsFor(meetingId).filter((decision) => decision.status !== "cancelled");
    if (!decisions.length) return 0;
    return Math.round((decisions.filter((decision) => decision.status === "completed").length / decisions.length) * 100);
  }

  function canUpdateDecision(decision) {
    const { state } = getContext();
    const meeting = (state.meetings || []).find((item) => item.id === decision?.meetingId);
    if (!canEditManagerLockedMeeting(meeting)) return false;
    return canManageMeetings() || decision.ownerId === state.currentUser?.id;
  }

  function filteredMeetings() {
    const { state } = getContext();
    const filters = state.meetingFilters || {};
    const query = clean(filters.search).toLowerCase();
    return (state.meetings || []).filter((item) => {
      if (filters.status && filters.status !== "all" && item.status !== filters.status) return false;
      if (query && !`${item.number} ${item.title} ${item.location} ${item.type}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function openMeeting(id = "") {
    const { state, render } = getContext();
    state.modal = { type: "meeting", id };
    render();
  }

  function addMeetingPointRow(button) {
    const list = button?.closest(".module-form-section")?.querySelector(".meeting-points-list");
    const source = list?.querySelector(".meeting-point-row:last-child");
    if (!list || !source) return;
    const row = source.cloneNode(true);
    const number = list.querySelectorAll(".meeting-point-row").length + 1;
    const numberBox = row.querySelector("b");
    if (numberBox) numberBox.textContent = String(number);
    const meetingDate = button.closest("form")?.querySelector('[name="date"]')?.value || today();
    row.querySelectorAll("input, select").forEach((control) => {
      if (control.name === "decisionId") control.value = "";
      if (control.name === "decisionTitle") control.value = "";
      if (control.name === "decisionOwnerId") control.value = "";
      if (control.name === "decisionStatus") control.value = "new";
      if (control.name === "decisionDueDate") control.value = meetingDate;
    });
    list.appendChild(row);
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.querySelector('[name="decisionTitle"]')?.focus();
  }

  function closeModal() {
    const { state, render } = getContext();
    state.modal = null;
    render();
  }

  async function saveMeeting(event) {
    event.preventDefault();
    const { state, cloud, showToast } = getContext();
    if (!canManageMeetings()) {
      showToast("لا توجد صلاحية لحفظ الاجتماعات.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const id = clean(form.get("id")) || createUuid();
    const existing = (state.meetings || []).find((item) => item.id === id);
    if (existing && !canEditManagerLockedMeeting(existing)) {
      showToast("تم اعتماد هذا الاجتماع من المدير، ولا يمكن تعديله إلا من المدير.");
      return;
    }
    const attendeeIds = form.getAll("attendeeIds").map(String).filter(Boolean);
    const now = nowTimestamp();
    const item = normalizeMeeting({
      ...(existing || {}),
      id,
      schoolId: clean(form.get("schoolId")) || state.currentUser?.schoolId || "",
      number: clean(form.get("number")) || `MTG-${today().replaceAll("-", "")}`,
      title: clean(form.get("title")),
      type: clean(form.get("type")),
      chairId: clean(form.get("chairId")) || null,
      organizerId: state.currentUser?.id || null,
      date: clean(form.get("date")) || today(),
      startTime: clean(form.get("startTime")),
      durationMinutes: Number(form.get("durationMinutes") || 60),
      location: clean(form.get("location")),
      onlineUrl: clean(form.get("onlineUrl")),
      confidentiality: clean(form.get("confidentiality")) || "normal",
      status: clean(form.get("status")) || "draft",
      agenda: splitLines(form.get("agenda")).map((title, index) => ({ id: `agenda-${index + 1}`, title, summary: "" })),
      minutes: { summary: clean(form.get("minutesSummary")) },
      updatedBy: state.currentUser?.id || null,
      updatedAt: now,
      createdAt: existing?.createdAt || now,
      createdBy: existing?.createdBy || state.currentUser?.id || null,
    });
    const decisionIds = form.getAll("decisionId").map(String);
    const decisionTitles = form.getAll("decisionTitle").map(String);
    const decisionOwnerIds = form.getAll("decisionOwnerId").map(String);
    const decisionStatuses = form.getAll("decisionStatus").map(String);
    const decisionDueDates = form.getAll("decisionDueDate").map(String);
    const decisionRows = decisionTitles
      .map((title, index) => ({
        id: clean(decisionIds[index]) || createUuid(),
        title: clean(title),
        ownerId: clean(decisionOwnerIds[index]) || null,
        status: clean(decisionStatuses[index]) || "new",
        dueDate: clean(decisionDueDates[index]) || item.date,
      }))
      .filter((decision) => decision.title);
    try {
      if (!cloud.enabled || !cloud.client) throw new Error("قاعدة البيانات غير متصلة.");
      const { error } = await cloud.client.from("meetings").upsert(meetingToRow(item));
      if (error) throw error;
      if (attendeeIds.length) {
        const rows = attendeeIds.map((userId) => attendeeToRow(normalizeAttendee({ meetingId: item.id, schoolId: item.schoolId, userId })));
        const { error: attendeeError } = await cloud.client.from("meeting_attendees").upsert(rows, { onConflict: "meeting_id,user_id" });
        if (attendeeError) throw attendeeError;
      }
      if (decisionRows.length) {
        const rows = decisionRows.map((decision) =>
          decisionToRow(normalizeDecision({
            id: decision.id,
            meetingId: item.id,
            schoolId: item.schoolId,
            title: decision.title,
            ownerId: decision.ownerId,
            dueDate: decision.dueDate,
            status: decision.status,
            progress: decision.status === "completed" ? 100 : 0,
            createdBy: state.currentUser?.id || null,
            updatedBy: state.currentUser?.id || null,
          })),
        );
        const { error: decisionError } = await cloud.client.from("meeting_decisions").upsert(rows);
        if (decisionError) throw decisionError;
      }
      if (item.status === "scheduled") await notifyAttendees(item, attendeeIds);
      await loadCloudData(true);
      closeModal();
      showToast("تم حفظ الاجتماع.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر حفظ الاجتماع.");
    }
  }

  async function notifyAttendees(item, attendeeIds = []) {
    const { state, cloud } = getContext();
    const rows = attendeeIds
      .filter((userId) => userId !== state.currentUser?.id)
      .map((userId) => ({
        school_id: item.schoolId,
        user_id: userId,
        title: "دعوة اجتماع",
        message: `${item.number} - ${item.title}`,
        type: "meeting_invite",
        related_task_id: null,
        dedupe_key: `meeting:${item.id}:${userId}:${item.updatedAt}`,
      }));
    if (rows.length) await cloud.client.from("notifications").insert(rows);
  }

  async function updateStatus(id, status) {
    const { state, cloud, showToast } = getContext();
    const item = (state.meetings || []).find((inner) => inner.id === id);
    if (!item || !canManageMeetings()) return;
    if (status === "approved" && !canOverrideManagerApprovalLock(state.currentUser)) {
      showToast("اعتماد المحضر متاح للمدير فقط.");
      return;
    }
    if (isManagerLockedMeeting(item) && !canEditManagerLockedMeeting(item)) {
      showToast("تم اعتماد هذا الاجتماع من المدير، ولا يمكن تعديله إلا من المدير.");
      return;
    }
    const patch = { status, updated_at: nowTimestamp(), updated_by: state.currentUser?.id || null };
    if (status === "approved") {
      patch.approved_at = nowTimestamp();
      patch.approved_by = state.currentUser?.id || null;
    }
    try {
      const { error } = await cloud.client.from("meetings").update(patch).eq("id", id);
      if (error) throw error;
      await loadCloudData(true);
      showToast("تم تحديث حالة الاجتماع.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر تحديث الاجتماع.");
    }
  }

  async function updateAttendance(id, status) {
    const { state, cloud, showToast } = getContext();
    const attendee = (state.meetingAttendees || []).find((item) => item.id === id);
    const meeting = (state.meetings || []).find((item) => item.id === attendee?.meetingId);
    if (!canEditManagerLockedMeeting(meeting)) {
      showToast("تم اعتماد هذا الاجتماع من المدير، ولا يمكن تعديل الحضور إلا من المدير.");
      return;
    }
    try {
      const { error } = await cloud.client.from("meeting_attendees").update({ attendance_status: status, responded_at: nowTimestamp() }).eq("id", id);
      if (error) throw error;
      await loadCloudData(true);
      showToast("تم تحديث الحضور.");
    } catch (error) {
      console.error(error);
      showToast("تعذر تحديث الحضور.");
    }
  }

  async function updateDecision(id, status) {
    const { state, cloud, showToast } = getContext();
    const decision = (state.meetingDecisions || []).find((item) => item.id === id);
    if (!decision || !canUpdateDecision(decision)) {
      showToast("يمكن تعديل حالة النقطة من المسؤول عنها أو الإدارة فقط.");
      return;
    }
    try {
      const { error } = await cloud.client.from("meeting_decisions").update({
        status,
        progress: status === "completed" ? 100 : 0,
        updated_by: state.currentUser?.id || null,
        updated_at: nowTimestamp(),
      }).eq("id", id);
      if (error) throw error;
      await loadCloudData(true);
      showToast("تم تحديث القرار.");
    } catch (error) {
      console.error(error);
      showToast("تعذر تحديث القرار.");
    }
  }

  async function deleteMeeting(id) {
    const { state, cloud, showToast } = getContext();
    const meeting = (state.meetings || []).find((item) => item.id === id);
    if (!canEditManagerLockedMeeting(meeting)) {
      showToast("تم اعتماد هذا الاجتماع من المدير، ولا يمكن حذفه إلا من المدير.");
      return;
    }
    if (!window.confirm("هل تريد حذف الاجتماع؟ لا يمكن حذف الاجتماع المعتمد.")) return;
    try {
      const { error } = await cloud.client.from("meetings").delete().eq("id", id);
      if (error) throw error;
      await loadCloudData(true);
      showToast("تم حذف الاجتماع.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر حذف الاجتماع.");
    }
  }

  async function printMeetingReport() {
    const { state, safe, formatDate, getUser, schoolName, showToast } = getContext();
    try {
      await loadCloudData(true);
    } catch (error) {
      console.warn("Meeting report refresh failed", error);
    }
    const rows = filteredMeetings();
    if (!rows.length) {
      showToast("لا توجد اجتماعات لاستخراج التقرير.");
      return;
    }
    const totalDecisions = rows.reduce((sum, meeting) => sum + decisionsFor(meeting.id).filter((decision) => decision.status !== "cancelled").length, 0);
    const completedDecisions = rows.reduce((sum, meeting) => sum + decisionsFor(meeting.id).filter((decision) => decision.status === "completed").length, 0);
    const generatedAt = new Date().toLocaleString("ar");
    const meetingRows = rows.map((item, index) => {
      const attendees = attendeesFor(item.id);
      const decisions = decisionsFor(item.id);
      const presentCount = attendees.filter((attendee) => attendee.attendanceStatus === "present").length;
      const completionRate = meetingCompletionRate(item.id);
      return `
        <tr>
          <td>${safe(index + 1)}</td>
          <td>${safe(item.number)}</td>
          <td>${safe(item.title)}</td>
          <td>${safe(schoolName(item.schoolId))}</td>
          <td>${safe(formatDate(item.date))}</td>
          <td>${safe(item.startTime || "-")}</td>
          <td>${safe(getUser(item.chairId)?.name || "غير محدد")}</td>
          <td>${safe(item.location || "-")}</td>
          <td>${safe(statusLabels[item.status])}</td>
          <td>${safe(attendees.length)}</td>
          <td>${safe(presentCount)}</td>
          <td>${safe(decisions.length)}</td>
          <td>${safe(completionRate)}%</td>
        </tr>`;
    }).join("");
    const decisionRows = rows.flatMap((item) =>
      decisionsFor(item.id).map((decision) => `
        <tr>
          <td>${safe(item.number)}</td>
          <td>${safe(item.title)}</td>
          <td class="note-cell">${safe(decision.title)}</td>
          <td>${safe(getUser(decision.ownerId)?.name || "غير مسند")}</td>
          <td>${safe(decision.dueDate ? formatDate(decision.dueDate) : "-")}</td>
          <td>${safe(decisionLabels[decision.status])}</td>
          <td>${safe(decision.progress || (decision.status === "completed" ? 100 : 0))}%</td>
        </tr>`),
    ).join("");
    const attendeeRows = rows.flatMap((item) =>
      attendeesFor(item.id).map((attendee) => `
        <tr>
          <td>${safe(item.number)}</td>
          <td>${safe(item.title)}</td>
          <td>${safe(getUser(attendee.userId)?.name || "مستخدم")}</td>
          <td>${safe(attendanceLabels[attendee.attendanceStatus])}</td>
          <td>${safe(attendee.respondedAt ? new Date(attendee.respondedAt).toLocaleString("ar") : "-")}</td>
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
        <title>تقرير الاجتماعات</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 24px; color: #172033; font-family: "Tahoma", "Arial", sans-serif; background: #fff; }
          .report-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding-bottom: 14px; border-bottom: 4px solid #0f766e; }
          h1 { margin: 0 0 6px; color: #0f172a; font-size: 28px; }
          .muted { color: #64748b; font-size: 13px; line-height: 1.7; }
          .badge { display: inline-flex; align-items: center; padding: 8px 12px; border-radius: 999px; color: #115e59; background: #ccfbf1; font-weight: 800; }
          .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
          .card { padding: 12px; border: 1px solid #ccfbf1; border-radius: 12px; background: #f0fdfa; }
          .card span { display: block; color: #64748b; font-size: 12px; }
          .card strong { display: block; margin-top: 4px; color: #0f766e; font-size: 24px; }
          h2 { margin: 22px 0 10px; color: #115e59; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
          th, td { border: 1px solid #d7deea; padding: 8px; text-align: center; vertical-align: middle; font-size: 12px; line-height: 1.55; }
          th { color: #fff; background: #0f766e; font-weight: 800; }
          tbody tr:nth-child(even) td { background: #f8fafc; }
          .note-cell { text-align: right; }
          .footer { display: flex; justify-content: space-between; margin-top: 20px; padding-top: 12px; border-top: 1px solid #ccfbf1; color: #64748b; font-size: 12px; }
          @media print { body { padding: 12mm; } .no-print { display: none; } tr { page-break-inside: avoid; } }
        </style>
      </head>
      <body>
        <button class="no-print" onclick="window.print()" style="position:fixed;left:18px;top:18px;padding:10px 16px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-weight:800;cursor:pointer;">طباعة / حفظ PDF</button>
        <section class="report-head">
          <div>
            <h1>تقرير الاجتماعات</h1>
            <div class="muted">تقرير مستخرج من بيانات السحابة ويشمل الاجتماعات والحضور ونقاط الاجتماع ونسبة الإنجاز.</div>
          </div>
          <div class="badge">تاريخ التقرير: ${safe(generatedAt)}</div>
        </section>
        <section class="cards">
          <div class="card"><span>إجمالي الاجتماعات</span><strong>${safe(rows.length)}</strong></div>
          <div class="card"><span>النقاط</span><strong>${safe(totalDecisions)}</strong></div>
          <div class="card"><span>النقاط المنجزة</span><strong>${safe(completedDecisions)}</strong></div>
          <div class="card"><span>نسبة الإنجاز</span><strong>${safe(totalDecisions ? Math.round((completedDecisions / totalDecisions) * 100) : 0)}%</strong></div>
        </section>
        <h2>ملخص الاجتماعات</h2>
        <table>
          <thead><tr><th>م</th><th>رقم الاجتماع</th><th>العنوان</th><th>الفرع</th><th>التاريخ</th><th>الوقت</th><th>الرئيس</th><th>المكان</th><th>الحالة</th><th>المدعوون</th><th>الحاضرون</th><th>النقاط</th><th>الإنجاز</th></tr></thead>
          <tbody>${meetingRows}</tbody>
        </table>
        <h2>نقاط الاجتماعات والمتابعة</h2>
        <table>
          <thead><tr><th>رقم الاجتماع</th><th>الاجتماع</th><th>النقطة</th><th>الموظف المسؤول</th><th>تاريخ المتابعة</th><th>الحالة</th><th>الإنجاز</th></tr></thead>
          <tbody>${decisionRows || `<tr><td colspan="7">لا توجد نقاط اجتماعات.</td></tr>`}</tbody>
        </table>
        <h2>الحضور</h2>
        <table>
          <thead><tr><th>رقم الاجتماع</th><th>الاجتماع</th><th>الموظف</th><th>الحضور</th><th>وقت التحديث</th></tr></thead>
          <tbody>${attendeeRows || `<tr><td colspan="5">لا توجد بيانات حضور.</td></tr>`}</tbody>
        </table>
        <div class="footer"><span>منصة مهام المدارس</span><span>تقرير الاجتماعات</span></div>
      </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
  }

  function renderMeetings() {
    const { state, safe, icons, dashboard, formatDate, getUser } = getContext();
    load();
    const rows = filteredMeetings();
    const todayMeetings = rows.filter((item) => item.date === today()).length;
    const upcoming = rows.filter((item) => item.date > today() && !["archived", "cancelled"].includes(item.status)).length;
    const previous = rows.filter((item) => item.date < today()).length;
    const pendingMinutes = rows.filter((item) => item.status === "minutes_review").length;
    const lateDecisions = (state.meetingDecisions || []).filter((item) => item.dueDate && item.dueDate < today() && !["completed", "cancelled"].includes(item.status)).length;
    return `
      <section class="work-module meetings-page">
        <div class="topbar">
          <div class="section-title">
            <h2>الاجتماعات</h2>
            <p class="muted">جدولة الاجتماعات وإدارة الحضور والمحاضر والقرارات والمهام الناتجة عنها.</p>
          </div>
          <div class="actions">
            ${canManageMeetings() ? `<button class="btn secondary" onclick="actions.printMeetingReport()">${icons.print || ""} تقرير الاجتماعات</button>` : ""}
            ${canManageMeetings() ? `<button class="btn" onclick="actions.openMeeting()">${icons.plus} اجتماع جديد</button>` : ""}
          </div>
        </div>
        <div class="grid metrics compact-metrics">
          ${dashboard.metric("اجتماع اليوم", todayMeetings)}
          ${dashboard.metric("القادمة", upcoming)}
          ${dashboard.metric("السابقة", previous)}
          ${dashboard.metric("محاضر بانتظار الاعتماد", pendingMinutes)}
          ${dashboard.metric("قرارات متأخرة", lateDecisions)}
          ${dashboard.metric("مهام القرارات", (state.meetingDecisions || []).length)}
        </div>
        <div class="panel module-toolbar">
          <label class="field"><span>بحث</span><input value="${safe(state.meetingFilters?.search || "")}" placeholder="عنوان الاجتماع أو المكان" oninput="actions.setMeetingFilter('search', this.value)" /></label>
          <label class="field"><span>الحالة</span><select onchange="actions.setMeetingFilter('status', this.value)">
            <option value="all">كل الحالات</option>${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${state.meetingFilters?.status === value ? "selected" : ""}>${safe(label)}</option>`).join("")}
          </select></label>
        </div>
        ${state.meetingsLoading ? `<div class="skeleton-panel">جاري تحميل الاجتماعات...</div>` : ""}
        ${state.meetingsError ? `<div class="feedback danger">${safe(state.meetingsError)}</div>` : ""}
        <div class="module-card-list">
          ${rows.length ? rows.map((item) => {
            const attendees = attendeesFor(item.id);
            const decisions = decisionsFor(item.id);
            const completionRate = meetingCompletionRate(item.id);
            return `
              <article class="module-card">
                <div class="module-card-main">
                  <span class="role-pill">${safe(item.number)}</span>
                  <strong>${safe(item.title)}</strong>
                  <p>${safe(item.location || item.onlineUrl || "لم يحدد المكان")}</p>
                  <div class="meeting-progress">
                    <span>إنجاز نقاط الاجتماع</span>
                    <b>${safe(completionRate)}%</b>
                    <i><em style="width:${safe(completionRate)}%"></em></i>
                  </div>
                  <div class="task-meta">
                    <span>${safe(formatDate(item.date))}</span>
                    <span>${safe(item.startTime || "وقت غير محدد")}</span>
                    <span>الرئيس: ${safe(getUser(item.chairId)?.name || "غير محدد")}</span>
                    <span>الحضور: ${safe(attendees.length)}</span>
                    <span>القرارات: ${safe(decisions.length)}</span>
                  </div>
                </div>
                <div class="module-actions">
                  <span class="status-pill status-${item.status === "approved" ? "approved" : item.status === "cancelled" ? "overdue" : "new"}">${safe(statusLabels[item.status])}</span>
                  <button class="btn secondary" onclick="actions.openMeeting('${safe(item.id)}')">عرض</button>
                  ${canManageMeetings() && item.status === "scheduled" ? `<button class="btn secondary" onclick="actions.updateMeetingStatus('${safe(item.id)}', 'active')">بدء الاجتماع</button>` : ""}
                  ${canOverrideManagerApprovalLock(state.currentUser) && item.status === "minutes_review" ? `<button class="btn success" onclick="actions.updateMeetingStatus('${safe(item.id)}', 'approved')">اعتماد المحضر</button>` : ""}
                  ${canManageMeetings() && ["draft", "cancelled"].includes(item.status) ? `<button class="icon-btn danger-icon" onclick="actions.deleteMeeting('${safe(item.id)}')">${icons.trash}</button>` : ""}
                </div>
              </article>`;
          }).join("") : `<div class="empty">لا توجد اجتماعات ضمن الفلاتر الحالية.</div>`}
        </div>
        <div class="panel module-report-panel">
          <div class="section-title"><h2>متابعة القرارات</h2><p class="muted">القرارات والمهام الناتجة عن الاجتماعات ومواعيدها.</p></div>
          <div class="module-table-cards">
            ${(state.meetingDecisions || []).slice(0, 30).map((decision) => `
              <article>
                <strong>${safe(decision.title)}</strong>
                <span>${safe(getUser(decision.ownerId)?.name || "غير مسند")}</span>
                <span>${safe(decision.dueDate ? formatDate(decision.dueDate) : "بدون تاريخ")}</span>
                <span class="status-pill status-${decision.status === "completed" ? "completed" : decision.status === "overdue" ? "overdue" : "new"}">${safe(decisionLabels[decision.status])}</span>
                <select ${canUpdateDecision(decision) ? "" : "disabled"} onchange="actions.updateMeetingDecision('${safe(decision.id)}', this.value)">
                  ${Object.entries(decisionLabels).map(([value, label]) => `<option value="${value}" ${decision.status === value ? "selected" : ""}>${safe(label)}</option>`).join("")}
                </select>
              </article>`).join("") || `<div class="empty">لا توجد قرارات بعد.</div>`}
          </div>
        </div>
      </section>
    `;
  }

  function renderMeetingModal() {
    const { state, safe, icons, getUser } = getContext();
    const item = normalizeMeeting((state.meetings || []).find((inner) => inner.id === state.modal?.id) || {});
    const selected = new Set(attendeesFor(item.id).map((attendee) => attendee.userId));
    const users = visibleUsers();
    const existingDecisions = decisionsFor(item.id);
    const pointRows = existingDecisions.length ? existingDecisions : [{ id: "", title: "", ownerId: "", dueDate: item.date || today(), status: "new" }];
    const readOnly = !canManageMeetings() || !canEditManagerLockedMeeting(item);
    return `
      <div class="modal"><form class="modal-card module-modal" onsubmit="actions.saveMeeting(event)">
        <div class="modal-head">
          <h3>${safe(state.modal?.id ? "تعديل اجتماع" : "اجتماع جديد")}</h3>
          <button class="icon-btn" type="button" onclick="actions.closeModal()">${icons.close}</button>
        </div>
        <input type="hidden" name="id" value="${safe(state.modal?.id || "")}" />
        <input type="hidden" name="schoolId" value="${safe(item.schoolId || state.currentUser?.schoolId || "")}" />
        <fieldset class="module-form-fieldset" ${readOnly ? "disabled" : ""}>
        <div class="form-grid">
          <div class="module-form-section meeting-form-section wide">
            <div class="module-form-section-title">
              <strong>بيانات الاجتماع</strong>
              <span>أدخل عنوان الاجتماع وتاريخه ورئيسه، وسيتم حفظه مع الحضور ونقاط المتابعة للرجوع إليه في أي وقت.</span>
            </div>
            <div class="form-grid circular-inline-grid">
              <label class="field"><span>رقم الاجتماع</span><input name="number" value="${safe(item.number)}" required /></label>
              <label class="field wide"><span>عنوان الاجتماع</span><input name="title" value="${safe(item.title)}" placeholder="مثال: اجتماع متابعة أعمال الأسبوع" required /></label>
              <label class="field"><span>تاريخ الاجتماع</span><input type="date" name="date" value="${safe(item.date || today())}" required /></label>
              <label class="field"><span>رئيس الاجتماع</span><select name="chairId">${users.map((user) => `<option value="${safe(user.id)}" ${item.chairId === user.id ? "selected" : ""}>${safe(user.name)}</option>`).join("")}</select></label>
              <label class="field"><span>وقت البداية</span><input type="time" name="startTime" value="${safe(item.startTime)}" /></label>
              <label class="field"><span>المدة بالدقائق</span><input type="number" name="durationMinutes" min="15" step="15" value="${safe(item.durationMinutes)}" /></label>
              <label class="field"><span>مكان الاجتماع</span><input name="location" value="${safe(item.location)}" placeholder="المكتب، القاعة، أو الفرع" /></label>
              <label class="field"><span>حالة الاجتماع</span><select name="status">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${item.status === value ? "selected" : ""}>${safe(label)}</option>`).join("")}</select></label>
              <input type="hidden" name="type" value="${safe(item.type || "administrative")}" />
              <input type="hidden" name="confidentiality" value="${safe(item.confidentiality || "normal")}" />
              <input type="hidden" name="onlineUrl" value="${safe(item.onlineUrl)}" />
            </div>
          </div>
          <div class="module-form-section meeting-form-section wide">
            <div class="module-form-section-title">
              <strong>من حضر الاجتماع</strong>
              <span>حدد الموظفين المدعوين أو الحاضرين، وبعد الحفظ يمكن تعديل حالة كل شخص إلى حاضر أو غائب أو معتذر.</span>
            </div>
            <div class="meeting-attendee-picker">
              ${users.map((user) => `<label><input type="checkbox" name="attendeeIds" value="${safe(user.id)}" ${selected.has(user.id) || user.id === state.currentUser?.id ? "checked" : ""} /><span>${safe(user.name)}</span></label>`).join("")}
            </div>
          </div>
          <div class="module-form-section meeting-form-section wide">
            <div class="module-form-section-title">
              <strong>نقاط الاجتماع</strong>
              <span>اكتب كل نقطة، ثم اختر الموظف المسؤول عنها وحالتها. نسبة الإنجاز تحتسب تلقائيًا من النقاط التي تمت.</span>
            </div>
            <div class="meeting-points-list">
              ${pointRows.map((decision, index) => `
                <article class="meeting-point-row">
                  <b>${safe(index + 1)}</b>
                  <input type="hidden" name="decisionId" value="${safe(decision.id || "")}" />
                  <label class="field meeting-point-title"><span>نقطة الاجتماع</span><input name="decisionTitle" value="${safe(decision.title || "")}" placeholder="اكتب النقطة أو القرار" /></label>
                  <label class="field"><span>الموظف المسؤول</span><select name="decisionOwnerId"><option value="">غير مسند</option>${users.map((user) => `<option value="${safe(user.id)}" ${decision.ownerId === user.id ? "selected" : ""}>${safe(user.name)}</option>`).join("")}</select></label>
                  <label class="field"><span>الحالة</span><select name="decisionStatus">
                    <option value="new" ${decision.status === "new" ? "selected" : ""}>لم تتم</option>
                    <option value="completed" ${decision.status === "completed" ? "selected" : ""}>تمت</option>
                    <option value="in_progress" ${decision.status === "in_progress" ? "selected" : ""}>قيد العمل</option>
                  </select></label>
                  <label class="field"><span>تاريخ المتابعة</span><input type="date" name="decisionDueDate" value="${safe(decision.dueDate || item.date || today())}" /></label>
                </article>`).join("")}
            </div>
            <button class="btn secondary meeting-add-point-btn" type="button" onclick="actions.addMeetingPointRow(this)">${icons.plus} إضافة نقطة جديدة</button>
          </div>
          <div class="module-form-section meeting-form-section wide">
            <div class="module-form-section-title">
              <strong>محضر الاجتماع والتقرير</strong>
              <span>اكتب ملخصًا مختصرًا، وسيظهر مع الحضور ونسبة الإنجاز في تقارير الاجتماعات.</span>
            </div>
            <label class="field wide"><span>نقاط نقاش عامة، كل بند في سطر</span><textarea name="agenda" rows="4" placeholder="اكتب النقاط العامة التي نوقشت">${safe((item.agenda || []).map((agenda) => agenda.title || agenda).join("\n"))}</textarea></label>
            <label class="field wide"><span>ملخص المحضر</span><textarea name="minutesSummary" rows="5" placeholder="اكتب ملخص الاجتماع وما تم الاتفاق عليه">${safe(item.minutes?.summary || "")}</textarea></label>
          </div>
        </div>
        </fieldset>
        ${state.modal?.id ? `<div class="module-table-cards meeting-attendance-status">
          ${attendeesFor(item.id).map((attendee) => `<article><strong>${safe(getUser(attendee.userId)?.name || "مستخدم")}</strong><span>${safe(attendanceLabels[attendee.attendanceStatus])}</span><select ${readOnly ? "disabled" : ""} onchange="actions.updateMeetingAttendance('${safe(attendee.id)}', this.value)">${Object.entries(attendanceLabels).map(([value, label]) => `<option value="${value}" ${attendee.attendanceStatus === value ? "selected" : ""}>${safe(label)}</option>`).join("")}</select></article>`).join("")}
        </div>` : ""}
        ${!readOnly ? `<div class="actions sticky-actions">
          <button class="btn" type="submit">${icons.save} حفظ</button>
          ${state.modal?.id ? `<button class="btn success" type="button" onclick="actions.updateMeetingStatus('${safe(item.id)}', 'minutes_review')">رفع المحضر للاعتماد</button>` : ""}
        </div>` : `<div class="actions sticky-actions"><button class="btn secondary" type="button" onclick="actions.closeModal()">إغلاق</button></div>`}
      </form></div>
    `;
  }

  return {
    canViewMeetings,
    canManageMeetings,
    load,
    loadCloudData,
    renderMeetings,
    renderMeetingModal,
    openMeeting,
    addMeetingPointRow,
    printMeetingReport,
    saveMeeting,
    setFilter,
    updateStatus,
    updateAttendance,
    updateDecision,
    deleteMeeting,
  };
}
