export function taskDateText(task) {
  return task.occurrenceDate ? `التنفيذ: ${task.occurrenceDate}` : `الاستحقاق: ${task.dueDate}`;
}

export function progressClass(progress) {
  if (progress >= 85) return "progress-complete";
  if (progress >= 60) return "progress-strong";
  if (progress >= 25) return "progress-mid";
  return "progress-low";
}
