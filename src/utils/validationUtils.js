export function isNonEmpty(value) {
  return String(value ?? "").trim().length > 0;
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

export function validateUserInput(user, allowedRoles) {
  if (!isNonEmpty(user.name) || !isValidEmail(user.email) || !isNonEmpty(user.schoolId)) {
    return "الاسم والبريد الإلكتروني والمدرسة حقول مطلوبة، ويجب أن يكون البريد صالحًا.";
  }
  if (!allowedRoles.includes(user.role)) return "يرجى اختيار دور صالح.";
  return "";
}

export function validateTaskInput(task) {
  if (!isNonEmpty(task.title) || !isNonEmpty(task.assigneeId) || !isNonEmpty(task.dueDate)) {
    return "عنوان المهمة والمكلف وتاريخ الاستحقاق حقول مطلوبة.";
  }
  if (task.title.length > 180) return "عنوان المهمة يتجاوز الحد المسموح.";
  if (task.description.length > 5000) return "وصف المهمة يتجاوز الحد المسموح.";
  return "";
}
