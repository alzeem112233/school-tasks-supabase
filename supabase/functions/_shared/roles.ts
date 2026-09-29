export const roles = [
  "general_manager",
  "school_principal",
  "deputy_principal",
  "school_secretary",
  "educational_supervisor",
  "specialist_supervisor",
  "stage_supervisor",
  "activity_supervisor",
  "finance",
  "computer_unit",
  "printing_unit",
  "tracker",
] as const;

export const legacyRoleMap: Record<string, string> = {
  general_secretary: "school_secretary",
};

export const roleRank: Record<string, number> = {
  general_manager: 100,
  school_principal: 90,
  deputy_principal: 80,
  school_secretary: 70,
  educational_supervisor: 60,
  specialist_supervisor: 50,
  stage_supervisor: 40,
  activity_supervisor: 35,
  finance: 30,
  computer_unit: 20,
  printing_unit: 10,
  tracker: 5,
};

export const roleSet = new Set<string>(roles);
export const userCreatorRoles = new Set<string>(["general_manager", "school_principal", "computer_unit"]);
export const roleChangeRoles = new Set<string>(["general_manager", "school_principal"]);
export const adminAccountRoles = new Set<string>(["general_manager", "school_principal"]);
export const generalSchoolId = "11111111-1111-4111-8111-111111111111";
export const generalAccountRoles = new Set<string>(["general_manager"]);

export const roleLabels: Record<string, string> = {
  general_manager: "مدير الإدارة العامة",
  school_principal: "مدير المدرسة",
  deputy_principal: "وكيل المدرسة",
  school_secretary: "اسكرتير المدرسة",
  educational_supervisor: "المشرف التربوي",
  specialist_supervisor: "المشرف الاخصائي",
  stage_supervisor: "مشرف المرحلة",
  activity_supervisor: "مشرف الأنشطة",
  finance: "المالية",
  computer_unit: "وحدة الحاسوب",
  printing_unit: "وحدة الطباعة",
  tracker: "متعقب",
};

export function normalizeRole(role: string) {
  return legacyRoleMap[role] || role;
}

export function isKnownRole(role: string) {
  return roleSet.has(normalizeRole(role));
}

export function canCreateUsers(role: string) {
  return userCreatorRoles.has(normalizeRole(role));
}

export function canChangeUserRoles(role: string) {
  return roleChangeRoles.has(normalizeRole(role));
}

export function isHigherRole(actorRole: string, targetRole: string) {
  return (roleRank[normalizeRole(actorRole)] ?? 0) > (roleRank[normalizeRole(targetRole)] ?? 0);
}

export function canAssignUserRole(actorRole: string, nextRole: string, currentRole = "") {
  const actor = normalizeRole(actorRole);
  const next = normalizeRole(nextRole);
  const current = normalizeRole(currentRole);
  if (!canCreateUsers(actor) || !isKnownRole(next)) return false;
  if (next === "tracker" && actor !== "general_manager") return false;
  if (current && next === current) return true;
  if (actor === "general_manager") return true;
  if (actor === "school_principal") {
    if (next === "general_manager" || next === "school_principal") return false;
    if (current && !isHigherRole(actor, current)) return false;
    return isHigherRole(actor, next);
  }
  if (actor === "computer_unit") {
    if (next === "general_manager" || next === "school_principal" || next === "tracker") return false;
    if (current && next !== current) return false;
    return true;
  }
  return false;
}
