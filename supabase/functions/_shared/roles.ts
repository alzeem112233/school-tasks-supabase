export const roles = [
  "superadmin",
  "general_manager",
  "branch_manager",
  "finance_manager",
  "development_supervision_manager",
  "general_secretary",
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
] as const;

export const legacyRoleMap: Record<string, string> = {
  general_director: "general_manager",
};

export const roleRank: Record<string, number> = {
  superadmin: 120,
  general_manager: 110,
  branch_manager: 105,
  finance_manager: 104,
  development_supervision_manager: 103,
  general_secretary: 102,
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
};

export const roleSet = new Set<string>(roles);
export const generalAccountRoles = new Set<string>(["superadmin", "general_manager", "branch_manager", "finance_manager", "development_supervision_manager", "general_secretary"]);
export const userCreatorRoles = new Set<string>(["superadmin", "school_principal", "computer_unit"]);
export const roleChangeRoles = new Set<string>(["superadmin", "school_principal"]);
export const adminAccountRoles = new Set<string>(["superadmin", "general_manager", "branch_manager", "finance_manager", "development_supervision_manager", "general_secretary", "school_principal"]);
export const generalSchoolId = "11111111-1111-4111-8111-111111111111";

export const roleLabels: Record<string, string> = {
  superadmin: "SUPERADMIN",
  general_manager: "مدير الإدارة العامة",
  branch_manager: "مدير الفروع",
  finance_manager: "مدير المالية",
  development_supervision_manager: "مدير التطوير والإشراف التربوي",
  general_secretary: "سكرتير الإدارة العامة",
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
  if (current && next === current) return true;
  if (actor === "superadmin") return true;
  if (actor === "school_principal") {
    if (generalAccountRoles.has(next) || next === "school_principal") return false;
    if (current && !isHigherRole(actor, current)) return false;
    return isHigherRole(actor, next);
  }
  if (actor === "computer_unit") {
    if (generalAccountRoles.has(next) || next === "school_principal") return false;
    if (current && next !== current) return false;
    return true;
  }
  return false;
}
