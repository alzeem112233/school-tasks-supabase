export function createAttachmentView(getContext, { formatFileSize, normalizeAttachment, validateSelectedFiles, attachmentTypeLabel }) {
  function renderUploadProgress() {
    const { safe, attachments } = getContext();
    const upload = attachments?.getUploadState?.() || {};
    return `
      <div class="attachment-upload-progress" data-attachment-upload-progress aria-live="polite" ${!upload.active && !upload.error ? "hidden" : ""}>
        <p class="attachment-upload-error" data-upload-error role="alert" ${upload.error ? "" : "hidden"}>${safe(upload.error || "")}</p>
        <div data-upload-details ${upload.active ? "" : "hidden"}>
          <div class="progress-meta"><strong>رفع <span data-upload-file>${safe(upload.fileName || "")}</span></strong><span data-upload-percent>${safe(upload.percent || 0)}%</span></div>
          <div class="progress-bar"><span data-upload-bar class="progress-strong" style="width:${Math.max(0, Math.min(100, upload.percent || 0))}%"></span></div>
          <p class="muted" data-upload-count>الملف ${safe(upload.current || 0)} من ${safe(upload.total || 0)}</p>
        </div>
      </div>`;
  }

  function renderPendingFiles() {
    const { safe, consumeFileSelection } = getContext();
    const pending = consumeFileSelection(false);
    if (!pending.length) return `<p class="muted attachment-help">الأنواع المسموحة: PDF، الصور، Word، Excel وPowerPoint. الحد الأقصى 10 ميجابايت لكل ملف.</p>${renderUploadProgress()}`;
    const { accepted, errors } = validateSelectedFiles(pending);
    return `<div class="attachment-picker-summary"><strong>الملفات المحددة</strong><div class="attachment-list compact">${accepted.map((file) => `<div class="attachment-mini"><span>${safe(file.name)}</span><span class="muted">${safe(formatFileSize(file.size))}</span></div>`).join("")}</div>${errors.length ? `<div class="attachment-errors">${errors.map((error) => `<p>${safe(error)}</p>`).join("")}</div>` : ""}${renderUploadProgress()}</div>`;
  }

  function renderPreview(attachment, safe) {
    const hasUrl = attachment.url && attachment.url !== "#";
    const extension = attachment.name.split(".").pop()?.toUpperCase() || "FILE";
    if (attachment.previewKind === "image") return hasUrl ? `<a href="${safe(attachment.url)}" target="_blank" rel="noreferrer"><img src="${safe(attachment.url)}" alt="${safe(attachment.name)}" loading="lazy" /></a>` : `<span>صورة</span>`;
    if (attachment.previewKind === "pdf") return hasUrl ? `<a href="${safe(attachment.url)}" target="_blank" rel="noreferrer" aria-label="معاينة ${safe(attachment.name)}">PDF</a>` : `<span>PDF</span>`;
    return `<span>${safe(extension || "FILE")}</span>`;
  }

  function renderAttachments(task, options = {}) {
    const { safe, canDeleteAttachment, formatDate } = getContext();
    const settings = { compact: false, allowDelete: false, ...options };
    const items = (task.attachments || []).map(normalizeAttachment);
    if (!items.length) return settings.compact ? "" : `<div class="feedback"><strong>المرفقات</strong><p class="muted">لا توجد مرفقات بعد.</p></div>`;
    return `
      <div class="${settings.compact ? "attachment-panel compact" : "attachment-panel"}">
        ${settings.compact ? `<strong>المرفقات الحالية</strong>` : `<div class="feedback-title"><strong>المرفقات</strong></div>`}
        <div class="attachment-list">${items.map((attachment) => {
          const hasUrl = attachment.url && attachment.url !== "#";
          const canDelete = settings.allowDelete && canDeleteAttachment(task, attachment);
          return `
            <article class="attachment-card">
              <div class="attachment-preview attachment-${safe(attachment.previewKind)} ${hasUrl ? "" : "attachment-offline"}">${renderPreview(attachment, safe)}</div>
              <div class="attachment-copy"><strong>${safe(attachment.name)}</strong><p class="muted">${safe(formatFileSize(attachment.size))} | ${safe(attachmentTypeLabel(attachment))} | ${safe(formatDate(attachment.uploadedAt))}</p></div>
              <div class="actions">
                ${hasUrl ? `<a class="btn secondary" href="${safe(attachment.url)}" target="_blank" rel="noreferrer">معاينة</a><button class="btn secondary" type="button" onclick="actions.downloadAttachment('${safe(task.id)}', '${safe(attachment.id)}')">تنزيل</button>` : ""}
                ${canDelete ? `<button class="btn danger" type="button" onclick="actions.removeAttachment('${safe(task.id)}', '${safe(attachment.id)}')">حذف</button>` : ""}
              </div>
            </article>`;
        }).join("")}</div>
      </div>`;
  }

  return { renderUploadProgress, renderPendingFiles, renderAttachments };
}
