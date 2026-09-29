import { createUuid } from "../utils/idUtils.js";
import { normalizeRole } from "../utils/permissionUtils.js";

export function createChatModule(getContext) {
  function normalizeChatMessage(message = {}) {
    return {
      id: message.id || createUuid(),
      schoolId: message.schoolId || message.school_id || "",
      senderId: message.senderId || message.sender_id || "",
      recipientId: message.recipientId || message.recipient_id || "",
      text: String(message.text || message.message || "").trim(),
      readAt: message.readAt || message.read_at || "",
      createdAt: message.createdAt || message.created_at || new Date().toISOString(),
    };
  }

  function isSameVisibleSchool(user) {
    const { state } = getContext();
    if (!user || user.active === false) return false;
    if (state.currentUser?.role === "general_manager") {
      return state.activeSchoolId === "all" || user.schoolId === state.activeSchoolId;
    }
    return user.schoolId === state.currentUser?.schoolId;
  }

  function canUseChat() {
    return !!getContext().state.currentUser;
  }

  function chatContacts() {
    const { state, compareTimestamp, roleLabel } = getContext();
    const current = state.currentUser;
    if (!current) return [];
    const currentRole = normalizeRole(current.role, "");
    const search = String(state.chatSearch || "").trim().toLowerCase();
    const contacts = state.users
      .filter((user) => user.id !== current.id && isSameVisibleSchool(user))
      .filter((user) => {
        const role = normalizeRole(user.role, "");
        if (currentRole === "general_manager") return role !== "general_manager";
        return role !== "general_manager";
      })
      .map((user) => {
        const messages = conversationMessages(user.id);
        const last = messages[messages.length - 1] || null;
        const unread = state.chatMessages.filter((message) => message.senderId === user.id && message.recipientId === current.id && !message.readAt).length;
        return { ...user, lastMessage: last, unread };
      })
      .filter((user) => {
        if (!search) return true;
        const haystack = [user.name, roleLabel(user.role), user.lastMessage?.text]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return haystack.includes(search);
      });
    return contacts.sort((a, b) => {
      const unreadDiff = (b.unread || 0) - (a.unread || 0);
      if (unreadDiff) return unreadDiff;
      const timeDiff = compareTimestamp(b.lastMessage?.createdAt || "", a.lastMessage?.createdAt || "");
      if (timeDiff) return timeDiff;
      return String(a.name || "").localeCompare(String(b.name || ""), "ar");
    });
  }

  function conversationMessages(contactId) {
    const { state, compareTimestamp } = getContext();
    const currentId = state.currentUser?.id || "";
    return (state.chatMessages || [])
      .filter((message) => (
        (message.senderId === currentId && message.recipientId === contactId)
        || (message.senderId === contactId && message.recipientId === currentId)
      ))
      .sort((a, b) => compareTimestamp(a.createdAt, b.createdAt));
  }

  function ensureSelectedContact(contacts) {
    const { state } = getContext();
    if (contacts.some((contact) => contact.id === state.chatSelectedUserId)) return state.chatSelectedUserId;
    state.chatSelectedUserId = contacts[0]?.id || "";
    return state.chatSelectedUserId;
  }

  function contactInitial(user) {
    return String(user?.name || "?").trim().slice(0, 1) || "?";
  }

  function formatChatTime(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value));
    } catch {
      return String(value).slice(0, 16);
    }
  }

  function selectContact(contactId) {
    const { state, render } = getContext();
    if (!chatContacts().some((contact) => contact.id === contactId)) return;
    state.chatSelectedUserId = contactId;
    render();
    markConversationRead(contactId).catch((error) => console.warn("Chat read sync failed", error));
  }

  function setSearch(value) {
    const { state, render } = getContext();
    state.chatSearch = String(value || "");
    render();
  }

  async function markConversationRead(contactId) {
    const { state, supabase, cloud } = getContext();
    if (!cloud.enabled || !state.currentUser) return;
    const now = new Date().toISOString();
    const unread = state.chatMessages.filter((message) => message.senderId === contactId && message.recipientId === state.currentUser.id && !message.readAt);
    for (const message of unread) {
      message.readAt = now;
      await supabase.saveCloudDoc("chatMessages", message.id, message, true);
    }
  }

  async function sendMessage(event) {
    event?.preventDefault?.();
    const { state, cloud, supabase, showToast, render } = getContext();
    const form = event?.currentTarget || document.getElementById("chat-compose-form");
    const recipientId = String(new FormData(form).get("recipientId") || state.chatSelectedUserId || "");
    const text = String(new FormData(form).get("message") || "").trim();
    const contact = chatContacts().find((item) => item.id === recipientId);
    if (!contact) return showToast("لا يمكن إرسال رسالة لهذا المستخدم.");
    if (!text) return showToast("اكتب نص الرسالة أولًا.");
    const message = normalizeChatMessage({
      id: createUuid(),
      schoolId: contact.schoolId || state.currentUser.schoolId,
      senderId: state.currentUser.id,
      recipientId,
      text,
      createdAt: new Date().toISOString(),
    });
    state.chatMessages = [...(state.chatMessages || []), message];
    state.chatSelectedUserId = recipientId;
    if (form?.reset) form.reset();
    render();
    try {
      if (cloud.enabled) await supabase.saveCloudDoc("chatMessages", message.id, message, false);
      showToast("تم إرسال الرسالة.");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "تعذر إرسال الرسالة.");
    } finally {
      render();
    }
  }

  function renderContact(contact) {
    const { state, safe, roleLabel } = getContext();
    const active = state.chatSelectedUserId === contact.id;
    return `
      <button class="chat-contact ${active ? "active" : ""}" type="button" onclick="actions.selectChatContact('${safe(contact.id)}')">
        <span class="chat-avatar">${safe(contactInitial(contact))}</span>
        <span class="chat-contact-main">
          <strong>${safe(contact.name)}</strong>
          <small>${safe(roleLabel(contact.role))}</small>
          <em>${safe(contact.lastMessage?.text || "لا توجد رسائل بعد")}</em>
        </span>
        <span class="chat-contact-side">
          <small>${safe(formatChatTime(contact.lastMessage?.createdAt))}</small>
          ${contact.unread ? `<b>${safe(contact.unread)}</b>` : ""}
        </span>
      </button>
    `;
  }

  function renderMessage(message) {
    const { state, safe, getUser } = getContext();
    const mine = message.senderId === state.currentUser?.id;
    return `
      <article class="chat-message ${mine ? "mine" : "theirs"}">
        <div class="chat-bubble">
          <strong>${safe(mine ? "أنت" : getUser(message.senderId)?.name || "مستخدم")}</strong>
          <p>${safe(message.text)}</p>
          <small>${safe(formatChatTime(message.createdAt))}</small>
        </div>
      </article>
    `;
  }

  function renderChat() {
    const { state, safe, roleLabel, icons } = getContext();
    const contacts = chatContacts();
    const selectedId = ensureSelectedContact(contacts);
    const selected = contacts.find((contact) => contact.id === selectedId);
    const messages = selected ? conversationMessages(selected.id) : [];
    return `
      <div class="topbar chat-topbar">
        <div class="section-title">
          <h2>الدردشة</h2>
          <p class="muted">محادثات داخلية سريعة بين الإدارة والموظفين حسب الصلاحيات.</p>
        </div>
        <div class="actions">
          <span class="role-pill">${safe(contacts.length)} جهة اتصال</span>
        </div>
      </div>
      <section class="chat-shell">
        <aside class="chat-contacts">
          <div class="chat-panel-title">
            <strong>المحادثات</strong>
            <span class="muted">${safe(roleLabel(state.currentUser.role))}</span>
          </div>
          <label class="chat-search">
            ${icons.search || ""}
            <input value="${safe(state.chatSearch || "")}" placeholder="بحث عن اسم..." oninput="actions.setChatSearch(this.value)" />
          </label>
          <div class="chat-contact-list">
            ${contacts.length ? contacts.map(renderContact).join("") : `<div class="empty">لا توجد جهات اتصال متاحة لهذا الحساب.</div>`}
          </div>
        </aside>
        <main class="chat-window">
          ${
            selected
              ? `
                <header class="chat-header">
                  <span class="chat-avatar">${safe(contactInitial(selected))}</span>
                  <div>
                    <strong>${safe(selected.name)}</strong>
                    <small>${safe(roleLabel(selected.role))}</small>
                  </div>
                </header>
                <div class="chat-messages">
                  ${messages.length ? messages.map(renderMessage).join("") : `<div class="chat-empty-state">${icons.message}<strong>ابدأ المحادثة</strong><span>اكتب رسالة واضحة ومختصرة وسيتم حفظها في النظام.</span></div>`}
                </div>
                <form id="chat-compose-form" class="chat-compose" onsubmit="actions.sendChatMessage(event)">
                  <input type="hidden" name="recipientId" value="${safe(selected.id)}" />
                  <textarea name="message" rows="1" maxlength="1200" placeholder="اكتب رسالتك هنا..." required></textarea>
                  <button class="btn" type="submit">${icons.message} إرسال</button>
                </form>
              `
              : `<div class="chat-empty-state">${icons.message}<strong>لا توجد محادثات متاحة</strong><span>سيظهر هنا الأشخاص المسموح لك بمراسلتهم.</span></div>`
          }
        </main>
      </section>
    `;
  }

  return {
    canUseChat,
    normalizeChatMessage,
    chatContacts,
    conversationMessages,
    selectContact,
    setSearch,
    sendMessage,
    renderChat,
  };
}
