export function attachmentPreviewKind(type = "") {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("text/")) return "text";
  return "file";
}

export function attachmentTypeLabel(attachment = {}) {
  if (attachment.previewKind === "image") return "صورة";
  if (attachment.previewKind === "pdf") return "مستند بي دي إف";
  if (attachment.previewKind === "text") return "ملف نصي";
  if ((attachment.type || "").includes("wordprocessingml") || attachment.type === "application/msword") return "مستند وورد";
  if ((attachment.type || "").includes("spreadsheetml") || attachment.type === "application/vnd.ms-excel") return "جدول بيانات";
  if ((attachment.type || "").includes("presentationml") || attachment.type === "application/vnd.ms-powerpoint") return "عرض تقديمي";
  return "ملف مرفق";
}
