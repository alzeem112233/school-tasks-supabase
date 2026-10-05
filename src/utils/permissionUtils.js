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
];

export const legacyRoleMap = {
  general_director: "general_manager",
};

export const roleHierarchy = {
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

export const generalRoles = ["superadmin", "general_manager", "branch_manager", "finance_manager", "development_supervision_manager", "general_secretary"];
export const fullManagementRoles = ["superadmin", "general_manager", "branch_manager", "school_principal"];
export const userCreatorRoles = ["superadmin", "school_principal", "computer_unit"];
export const taskCreatorRoles = ["superadmin", "general_manager", "branch_manager", "development_supervision_manager", "general_secretary", "school_principal", "computer_unit"];
export const workerRoles = ["educational_supervisor", "specialist_supervisor", "stage_supervisor", "activity_supervisor", "finance", "computer_unit", "printing_unit"];

export const roleGroups = {
  createUsers: userCreatorRoles,
  viewUsers: ["superadmin", "general_manager", "branch_manager", "finance_manager", "development_supervision_manager", "general_secretary", "school_principal", "deputy_principal", "computer_unit"],
  editUsers: ["superadmin", "school_principal", "computer_unit"],
  createTasks: taskCreatorRoles,
  assignTasks: taskCreatorRoles,
  deleteTasks: ["superadmin", "general_manager", "branch_manager", "school_principal"],
  viewDashboard: roles,
  viewAuditLogs: ["superadmin", "general_manager", "branch_manager", "school_principal", "deputy_principal"],
  createBackups: ["superadmin"],
  restoreBackups: ["superadmin"],
  manageAttachments: [...taskCreatorRoles, ...workerRoles],
  approveTasks: ["superadmin", "general_manager", "branch_manager", "school_principal"],
  viewReports: ["superadmin", "general_manager", "branch_manager", "finance_manager", "development_supervision_manager", "general_secretary", "school_principal", "deputy_principal", "school_secretary"],
  schoolWideTaskRead: ["superadmin", "general_manager", "branch_manager", "finance_manager", "development_supervision_manager", "general_secretary", "school_principal", "deputy_principal"],
  sendNotifications: ["superadmin", "general_manager", "branch_manager", "school_principal"],
  viewFinance: ["superadmin", "general_manager", "finance_manager", "school_principal", "finance"],
  manageFinanceDiscounts: ["superadmin", "finance_manager", "school_principal"],
};

export const userAccessFlags = ["createUser", "createTask", "createNotebook"];

export function normalizeRole(role, fallback = "school_secretary") {
  const normalized = legacyRoleMap[role] || role;
  return roles.includes(normalized) ? normalized : fallback;
}

export function roleRank(role) {
  return roleHierarchy[normalizeRole(role, "")] || 0;
}

export function isHigherRole(actorRole, targetRole) {
  return roleRank(actorRole) > roleRank(targetRole);
}

export function isGeneralManager(user) {
  return ["superadmin", "general_manager", "branch_manager", "finance_manager", "development_supervision_manager", "general_secretary"].includes(normalizeRole(user?.role, ""));
}

export function isSuperAdmin(user) {
  return normalizeRole(user?.role, "") === "superadmin";
}

export function isSchoolPrincipal(user) {
  return normalizeRole(user?.role, "") === "school_principal";
}

export function isDeputyPrincipal(user) {
  return normalizeRole(user?.role, "") === "deputy_principal";
}

export function isTracker(user) {
  return false;
}

export function isFullManager(user) {
  return fullManagementRoles.includes(normalizeRole(user?.role, ""));
}

export function canOverrideManagerApprovalLock(user) {
  return isFullManager(user);
}

export function isManagerApprovedResource(resource) {
  const status = String(resource?.status || "").toLowerCase();
  return Boolean(
    resource?.principalApprovedAt ||
      resource?.principalApprovedBy ||
      resource?.approvedAt ||
      resource?.approvedBy ||
      (Array.isArray(resource?.approvals) && resource.approvals.some((approval) => approval?.action === "approved")) ||
      ["approved", "principal_approved", "published"].includes(status),
  );
}

export function canModifyManagerApprovedResource(user, resource) {
  return !isManagerApprovedResource(resource) || canOverrideManagerApprovalLock(user);
}

export function isActiveUser(user) {
  return !!user && user.active !== false && roles.includes(normalizeRole(user.role, ""));
}

export function hasRole(user, roleList) {
  return isActiveUser(user) && roleList.includes(normalizeRole(user.role));
}

export function accessFlag(user, key) {
  const flags = user?.accessFlags || user?.access_flags || {};
  if (!userAccessFlags.includes(key) || flags[key] === undefined || flags[key] === null || flags[key] === "inherit") return null;
  return flags[key] === true || flags[key] === "true" || flags[key] === "allow";
}

function canUseFeature(user, key, roleAllowed) {
  if (!isActiveUser(user)) return false;
  const override = accessFlag(user, key);
  return override === null ? roleAllowed : override;
}

function resourceSchoolId(resource) {
  if (typeof resource === "string") return resource;
  return resource?.schoolId || resource?.school_id || "";
}

export function linkedSchoolIds(user) {
  const values = user?.linkedSchoolIds || user?.linked_school_ids || [];
  return Array.isArray(values) ? [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))] : [];
}

export function canAccessSchool(user, resource) {
  if (!isActiveUser(user)) return false;
  if (isGeneralManager(user)) return true;
  const schoolId = resourceSchoolId(resource);
  if (!schoolId) return false;
  if (schoolId === user.schoolId) return true;
  return false;
}

export function isSameSchool(user, resource) {
  return canAccessSchool(user, resource);
}

export function canViewUser(user, targetUser) {
  if (!isActiveUser(user) || !targetUser) return false;
  if (user.id === targetUser.id) return true;
  if (isGeneralManager(user)) return true;
  if (!isSameSchool(user, targetUser)) return false;
  const targetRole = normalizeRole(targetUser.role, "");
  if (isSchoolPrincipal(user)) return targetRole !== "general_manager";
  if (isDeputyPrincipal(user)) return isHigherRole(user.role, targetRole);
  if (normalizeRole(user.role, "") === "computer_unit") return ![...generalRoles, "school_principal"].includes(targetRole);
  if (accessFlag(user, "createUser") === true) return ![...generalRoles, "school_principal"].includes(targetRole);
  return false;
}

export function canViewUsers(user) {
  return hasRole(user, roleGroups.viewUsers) || canCreateUsers(user);
}

export function canCreateUsers(user) {
  return canUseFeature(user, "createUser", hasRole(user, roleGroups.createUsers));
}

export function canEditUser(user, targetUser) {
  if (!hasRole(user, roleGroups.editUsers) || !targetUser) return false;
  if (user.id === targetUser.id) return false;
  if (isSuperAdmin(user)) return true;
  if (!isSameSchool(user, targetUser)) return false;
  if (isSchoolPrincipal(user)) return isHigherRole(user.role, targetUser.role);
  if (normalizeRole(user.role, "") === "computer_unit") {
    const targetRole = normalizeRole(targetUser.role, "");
    if ([...generalRoles, "school_principal"].includes(targetRole)) return false;
    return true;
  }
  return false;
}

export function canChangeUserRole(user) {
  return hasRole(user, ["superadmin", "school_principal"]);
}

export function canAssignUserRole(user, nextRole, currentRole = null) {
  const role = normalizeRole(nextRole, "");
  if (!canCreateUsers(user) || !roles.includes(role)) return false;
  const existingRole = normalizeRole(currentRole, "");
  if (existingRole && role === existingRole) return true;
  if (isSuperAdmin(user)) return true;
  if (isSchoolPrincipal(user)) {
    if (generalRoles.includes(role) || role === "school_principal") return false;
    if (existingRole && !isHigherRole(user.role, existingRole)) return false;
    return isHigherRole(user.role, role);
  }
  if (normalizeRole(user.role, "") === "computer_unit") {
    if (generalRoles.includes(role) || role === "school_principal") return false;
    if (existingRole && role !== existingRole) return false;
    return true;
  }
  return accessFlag(user, "createUser") === true && ![...generalRoles, "school_principal"].includes(role);
}

export function canCreateTasks(user, taskOrSchool = null) {
  const isNotebook = taskOrSchool?.recurrence === "permanent" || taskOrSchool?.type === "notebook" || taskOrSchool === "notebook";
  const featureKey = isNotebook ? "createNotebook" : "createTask";
  if (taskOrSchool && typeof taskOrSchool === "object" && !canModifyManagerApprovedResource(user, taskOrSchool)) return false;
  if (!canUseFeature(user, featureKey, hasRole(user, roleGroups.createTasks))) return false;
  return !taskOrSchool || isSameSchool(user, taskOrSchool);
}

export function canEditTaskDefinition(user, task) {
  if (!isActiveUser(user) || !task || !isSameSchool(user, task)) return false;
  if (!canModifyManagerApprovedResource(user, task)) return false;
  return isFullManager(user);
}

export function canAssignTask(user, taskOrSchool, assignee = null) {
  const isNotebook = taskOrSchool?.recurrence === "permanent" || taskOrSchool?.type === "notebook" || taskOrSchool === "notebook";
  const delegatedAssignment = accessFlag(user, isNotebook ? "createNotebook" : "createTask") === true;
  if ((!hasRole(user, roleGroups.assignTasks) && !delegatedAssignment) || !isSameSchool(user, taskOrSchool)) return false;
  if (!assignee) return true;
  const taskSchoolId = resourceSchoolId(taskOrSchool);
  const assigneeSchoolId = resourceSchoolId(assignee);
  if (!taskSchoolId || taskSchoolId !== assigneeSchoolId || !isSameSchool(user, assignee)) return false;
  if (isGeneralManager(user)) return true;
  if (isSchoolPrincipal(user)) return user.id === assignee.id || isHigherRole(user.role, assignee.role);
  if (normalizeRole(user.role, "") === "computer_unit") {
    return !generalRoles.includes(normalizeRole(assignee.role, ""));
  }
  if (delegatedAssignment) return user.id === assignee.id || isHigherRole(user.role, assignee.role);
  return user.id === assignee.id;
}

export function canDeleteTask(user, task) {
  if (!canModifyManagerApprovedResource(user, task)) return false;
  return hasRole(user, roleGroups.deleteTasks) && !!task && isSameSchool(user, task);
}

export function canViewDashboard(user) {
  return hasRole(user, roleGroups.viewDashboard);
}

export function canViewAuditLogs(user) {
  return hasRole(user, roleGroups.viewAuditLogs);
}

export function canCreateBackups(user, backupOrSchool = null) {
  if (!hasRole(user, roleGroups.createBackups)) return false;
  return !backupOrSchool || isSameSchool(user, backupOrSchool);
}

export function canRestoreBackup(user, backup) {
  return hasRole(user, roleGroups.restoreBackups) && !!backup && isSameSchool(user, backup);
}

export function canUploadAttachment(user, task) {
  if (!isActiveUser(user) || !task || !isSameSchool(user, task)) return false;
  const assignedWorker = task.assigneeId === user.id;
  return isFullManager(user) || assignedWorker;
}

export function canDeleteAttachment(user, task, attachment = null) {
  if (!canUploadAttachment(user, task)) return false;
  return !attachment || !attachment.uploadedBy || isSameSchool(user, task);
}

export function canManageUsers(user) {
  return canCreateUsers(user);
}

export function canManageTaskDefinitions(user) {
  return canCreateTasks(user);
}

export function canApproveTasks(user) {
  return hasRole(user, roleGroups.approveTasks);
}

export function canViewReports(user) {
  return hasRole(user, roleGroups.viewReports);
}

export function canSendNotifications(user) {
  return hasRole(user, roleGroups.sendNotifications);
}

export function canViewFinance(user) {
  return hasRole(user, roleGroups.viewFinance);
}

export function canManageFinanceDiscounts(user) {
  return hasRole(user, roleGroups.manageFinanceDiscounts);
}

export function canViewGradeAdjustments(user) {
  return ["superadmin", "general_manager", "branch_manager", "development_supervision_manager", "school_principal", "deputy_principal", "computer_unit"].includes(normalizeRole(user?.role, ""));
}

export function canManageGradeAdjustments(user) {
  return ["superadmin", "general_manager", "branch_manager", "development_supervision_manager", "school_principal", "deputy_principal"].includes(normalizeRole(user?.role, ""));
}

export function canViewStaffEvaluations(user) {
  return isActiveUser(user);
}

export function canManageStaffEvaluations(user) {
  return ["superadmin", "general_manager", "branch_manager", "development_supervision_manager", "general_secretary", "school_principal", "deputy_principal", "school_secretary", "computer_unit", "printing_unit"].includes(normalizeRole(user?.role, ""));
}

export function canViewStaffEvaluationReports(user) {
  return ["superadmin", "general_manager", "branch_manager", "development_supervision_manager", "general_secretary", "school_principal", "deputy_principal"].includes(normalizeRole(user?.role, ""));
}

export function canControlStaffEvaluationAccess(user) {
  return canViewStaffEvaluationReports(user);
}

export function canReadSchoolTasks(user) {
  return hasRole(user, roleGroups.schoolWideTaskRead);
}

export function canManageDepartmentTask(user, task) {
  return isActiveUser(user) && !!task && isSameSchool(user, task) && task.assigneeId === user.id;
}

export function canReadTask(user, task, getUserById = null) {
  if (!isActiveUser(user) || !task || !isSameSchool(user, task)) return false;
  if (task.assigneeId === user.id) return true;
  if (isGeneralManager(user)) return true;
  if (isSchoolPrincipal(user)) return true;
  if (isDeputyPrincipal(user)) {
    const assignee = getUserById?.(task.assigneeId);
    return assignee ? isHigherRole(user.role, assignee.role) : false;
  }
  return false;
}

export function canActOnTask(user, task) {
  if (!isActiveUser(user) || !task || !isSameSchool(user, task)) return false;
  if (!canModifyManagerApprovedResource(user, task)) return false;
  if (task.assigneeId === user.id) return true;
  if (isGeneralManager(user)) return true;
  if (isSchoolPrincipal(user)) return true;
  return false;
}

export function canCommentOnTask(user, task) {
  return canReadTask(user, task) && canActOnTask(user, task);
}

export function canApproveTask(user, task, effectiveStatus) {
  if (!canReadTask(user, task) || !task.approvalRequired) return false;
  if (!canApproveTasks(user)) return false;
  if (task.approverRole && task.approverRole !== normalizeRole(user.role) && !isFullManager(user)) return false;
  return effectiveStatus(task) === "under_review";
}
