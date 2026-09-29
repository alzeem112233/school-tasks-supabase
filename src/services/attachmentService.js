import { today } from "../utils/dateUtils.js";
import { createUuid } from "../utils/idUtils.js";
import { attachmentPreviewKind, attachmentTypeLabel } from "../components/attachments/attachmentPresentation.js";
import { createAttachmentView } from "../components/attachments/attachmentView.js";

export function createAttachmentsModule(getContext) {
  const bucketName = "task-attachments";
  const maxAttachmentSizeBytes = 10 * 1024 * 1024;
  const uploadState = { active: false, percent: 0, fileName: "", current: 0, total: 0, error: "" };
  const acceptedMimeTypes = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];
  const acceptedExtensionsByMimeType = {
    "image/png": ["png"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/webp": ["webp"],
    "image/gif": ["gif"],
    "application/pdf": ["pdf"],
    "application/msword": ["doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
    "application/vnd.ms-excel": ["xls"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
    "application/vnd.ms-powerpoint": ["ppt"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  };

  function getUploadState() {
    return { ...uploadState };
  }

  function syncUploadStateToDom() {
    if (typeof document === "undefined") return;
    const container = document.querySelector("[data-attachment-upload-progress]");
    if (!container) return;
    container.hidden = !uploadState.active && !uploadState.error;
    const details = container.querySelector("[data-upload-details]");
    const error = container.querySelector("[data-upload-error]");
    if (details) details.hidden = !uploadState.active;
    if (error) {
      error.hidden = !uploadState.error;
      error.textContent = uploadState.error;
    }
    const fileName = container.querySelector("[data-upload-file]");
    const percent = container.querySelector("[data-upload-percent]");
    const bar = container.querySelector("[data-upload-bar]");
    const count = container.querySelector("[data-upload-count]");
    if (fileName) fileName.textContent = uploadState.fileName;
    if (percent) percent.textContent = `${uploadState.percent}%`;
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, uploadState.percent))}%`;
    if (count) count.textContent = `الملف ${uploadState.current} من ${uploadState.total}`;
  }

  function updateUploadState(patch, shouldSync = true) {
    Object.assign(uploadState, patch);
    if (shouldSync) syncUploadStateToDom();
  }

  function safeStorageFileName(fileName, attachmentId) {
    const original = String(fileName || "file").normalize("NFKC");
    const dotIndex = original.lastIndexOf(".");
    const rawExtension = dotIndex > 0 ? original.slice(dotIndex + 1).toLowerCase() : "";
    const extension = /^[a-z0-9]{1,10}$/.test(rawExtension) ? `.${rawExtension}` : "";
    const rawBase = dotIndex > 0 ? original.slice(0, dotIndex) : original;
    const base = rawBase
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "file";
    return `${attachmentId}-${base}${extension}`;
  }

  function uploadToSignedUrl(storage, path, signedUpload, file, onProgress) {
    if (typeof XMLHttpRequest === "undefined") {
      return storage.uploadToSignedUrl(path, signedUpload.token, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      }).then(({ error }) => {
        if (error) throw error;
        onProgress(file.size, file.size);
      });
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      xhr.open("PUT", signedUpload.signedUrl, true);
      xhr.timeout = 120000;
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onProgress(event.loaded, event.total);
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(file.size, file.size);
          resolve();
          return;
        }
        let message = `تعذر رفع الملف (${xhr.status}).`;
        try {
          const payload = JSON.parse(xhr.responseText || "{}");
          message = payload.message || payload.error || message;
        } catch {
          // Keep the safe fallback message.
        }
        reject(new Error(message));
      });
      xhr.addEventListener("error", () => reject(new Error("انقطع الاتصال أثناء رفع الملف.")));
      xhr.addEventListener("timeout", () => reject(new Error("انتهت مهلة رفع الملف.")));
      xhr.send(body);
    });
  }

  function formatFileSize(bytes = 0) {
    const { formatNumber } = getContext();
    if (bytes < 1024) return `${formatNumber(bytes)} بايت`;
    if (bytes < 1024 * 1024) return `${formatNumber(Math.round(bytes / 102.4) / 10)} كيلوبايت`;
    return `${formatNumber(Math.round(bytes / 104857.6) / 10)} ميغابايت`;
  }

  function normalizeAttachment(attachment = {}) {
    return {
      id: attachment.id || createUuid(),
      name: attachment.name || "مرفق",
      size: Number(attachment.size || 0),
      type: attachment.type || "application/octet-stream",
      url: attachment.url || "#",
      storagePath: attachment.storagePath || "",
      uploadedAt: attachment.uploadedAt || today(),
      uploadedBy: attachment.uploadedBy || "",
      previewKind: attachment.previewKind || attachmentPreviewKind(attachment.type || ""),
    };
  }

  function validateFile(file) {
    if (!file) return "الملف غير صالح.";
    if (!file.name || file.size <= 0) return "لا يمكن رفع ملف فارغ أو بلا اسم.";
    if (file.size > maxAttachmentSizeBytes) return `${file.name} يتجاوز الحد الأقصى 10 ميجابايت.`;
    if (!acceptedMimeTypes.includes(file.type || "")) return `${file.name} من نوع غير مسموح.`;
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!acceptedExtensionsByMimeType[file.type]?.includes(extension)) return `${file.name} لا يطابق نوع الملف المسموح.`;
    return "";
  }

  function validateSelectedFiles(files = []) {
    const accepted = [];
    const errors = [];
    for (const file of files) {
      const error = validateFile(file);
      if (error) errors.push(error);
      else accepted.push(file);
    }
    return { accepted, errors };
  }

  const view = createAttachmentView(getContext, { formatFileSize, normalizeAttachment, validateSelectedFiles, attachmentTypeLabel });

  async function uploadTaskFiles(task) {
    const { cloud, consumeFileSelection, state, supabase, canUploadAttachment } = getContext();
    if (!canUploadAttachment(task)) throw new Error("لا توجد صلاحية لرفع مرفقات لهذه المهمة.");
    const fileSelection = consumeFileSelection(false);
    if (!cloud.enabled || !fileSelection.length) return [];
    const taskId = task.id;
    const schoolId = task.schoolId;

    const { accepted, errors } = validateSelectedFiles(fileSelection);
    if (errors.length) {
      throw new Error(errors.join(" "));
    }

    const attachments = [];
    const storage = cloud.client.storage.from(bucketName);
    let lastRenderedPercent = -1;
    updateUploadState({ active: true, percent: 0, fileName: accepted[0]?.name || "", current: 1, total: accepted.length, error: "" });

    try {
      for (let index = 0; index < accepted.length; index += 1) {
        const file = accepted[index];
        const attachmentId = createUuid();
        const path = `${schoolId}/${taskId}/${safeStorageFileName(file.name, attachmentId)}`;
        updateUploadState({ fileName: file.name, current: index + 1, total: accepted.length });

        const { data: signedUpload, error: signedUploadError } = await storage.createSignedUploadUrl(path, { upsert: false });
        if (signedUploadError) throw signedUploadError;
        await uploadToSignedUrl(storage, path, signedUpload, file, (loaded, total) => {
          const fileRatio = total > 0 ? loaded / total : 0;
          const overallPercent = Math.min(100, Math.round(((index + fileRatio) / accepted.length) * 100));
          const shouldRender = overallPercent === 100 || overallPercent - lastRenderedPercent >= 2;
          if (shouldRender) lastRenderedPercent = overallPercent;
          updateUploadState({ percent: overallPercent }, shouldRender);
        });

        const attachment = normalizeAttachment({
          id: attachmentId,
          name: file.name,
          size: file.size,
          type: file.type,
          storagePath: path,
          uploadedAt: today(),
          uploadedBy: state.currentUser?.id || "",
        });

        try {
          await supabase.saveCloudDoc("attachments", attachmentId, { ...attachment, schoolId, taskId }, false);
        } catch (metadataError) {
          await storage.remove([path]).catch(() => {});
          throw metadataError;
        }

        const { data: signedData, error: signedError } = await storage.createSignedUrl(path, 3600);
        if (signedError) throw signedError;
        attachments.push({ ...attachment, url: signedData.signedUrl });
      }

      consumeFileSelection(true);
      updateUploadState({ active: false, percent: 100, fileName: "", current: accepted.length, total: accepted.length, error: "" });
      return attachments;
    } catch (error) {
      updateUploadState({ active: false, error: error?.message || "تعذر رفع المرفقات." });
      throw error;
    }
  }

  async function deleteAttachmentsForTasks(tasks = []) {
    const { cloud, canDeleteAttachment } = getContext();
    if (!tasks.length || tasks.some((task) => !canDeleteAttachment(task))) return;
    if (!cloud.enabled) return;
    const paths = tasks.flatMap((task) => task.attachments || []).map(normalizeAttachment).map((attachment) => attachment.storagePath).filter(Boolean);
    if (!paths.length) return;
    const { error } = await cloud.client.storage.from(bucketName).remove(paths);
    if (error) throw error;
  }

  async function deleteTaskAttachments(task) {
    return deleteAttachmentsForTasks([task]);
  }

  async function removeAttachment(taskId, attachmentId) {
    const { state, cloud, persistLocal, showToast, supabase, tasks, canDeleteAttachment } = getContext();
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const attachment = (task.attachments || []).map(normalizeAttachment).find((item) => item.id === attachmentId);
    if (!attachment) return;
    if (!canDeleteAttachment(task, attachment)) {
      showToast("لا توجد صلاحية لحذف هذا المرفق.");
      return;
    }

    const confirmed = confirm(`هل تريد حذف المرفق "${attachment.name}"؟`);
    if (!confirmed) return;

    if (cloud.enabled && attachment.storagePath) {
      try {
        const { error } = await cloud.client.storage.from(bucketName).remove([attachment.storagePath]);
        if (error) throw error;
        await supabase.deleteCloudDoc("attachments", attachment.id);
      } catch (error) {
        console.error(error);
        showToast("تعذر حذف المرفق من التخزين.");
        return;
      }
    }

    const nextTask = tasks.normalizeTask({
      ...task,
      attachments: (task.attachments || []).map(normalizeAttachment).filter((item) => item.id !== attachmentId),
    });

    if (!cloud.enabled) {
      state.tasks = state.tasks.map((item) => (item.id === task.id ? nextTask : item));
      persistLocal();
    }

    showToast("تم حذف المرفق.");
  }

  async function downloadAttachment(taskId, attachmentId) {
    const { state, cloud, showToast, downloadBlob, canReadTask } = getContext();
    const task = state.tasks.find((item) => item.id === taskId);
    const attachment = task?.attachments?.map(normalizeAttachment).find((item) => item.id === attachmentId);
    if (!task || !attachment || !canReadTask(task) || !attachment.storagePath) return;
    try {
      const { data, error } = await cloud.client.storage.from(bucketName).download(attachment.storagePath);
      if (error) throw error;
      downloadBlob(attachment.name, data, attachment.type || data.type || "application/octet-stream");
    } catch (error) {
      console.error(error);
      showToast("تعذر تنزيل المرفق.");
    }
  }

  return {
    acceptedMimeTypes,
    acceptedExtensionsByMimeType,
    maxAttachmentSizeBytes,
    bucketName,
    getUploadState,
    safeStorageFileName,
    normalizeAttachment,
    validateSelectedFiles,
    ...view,
    uploadTaskFiles,
    deleteAttachmentsForTasks,
    deleteTaskAttachments,
    removeAttachment,
    downloadAttachment,
  };
}
