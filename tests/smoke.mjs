import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const appNode = { innerHTML: "" };
const themeMeta = { setAttribute() {} };
const storage = new Map();

globalThis.window = globalThis;
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
globalThis.document = {
  documentElement: { setAttribute() {}, classList: { toggle() {} } },
  body: { classList: { toggle() {} }, appendChild() {} },
  querySelector(selector) {
    if (selector === "#app") return appNode;
    if (selector === 'meta[name="theme-color"]') return themeMeta;
    return null;
  },
  createElement() {
    return { click() {}, remove() {} };
  },
};
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};

await import("../src/main.js");
await new Promise((resolve) => setTimeout(resolve, 50));

assert.match(appNode.innerHTML, /يلزم إعداد بيئة التشغيل/);
assert.match(appNode.innerHTML, /VITE_SUPABASE_URL/);
const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(indexHtml, /<html lang="ar" dir="rtl">/);
assert.match(indexHtml, /<meta name="viewport"/);
assert.match(indexHtml, /href="\/icon-32\.png"/);
assert.match(indexHtml, /href="\/icon-192\.png"/);
assert.match(indexHtml, /startup-screen/);
assert.match(indexHtml, /جاري تجهيز التطبيق/);
assert.ok((await stat(new URL("../public/school-tasks-logo.jpeg", import.meta.url))).size > 1000);
assert.ok((await stat(new URL("../public/icon-32.png", import.meta.url))).size > 100);
assert.ok((await stat(new URL("../public/icon-192.png", import.meta.url))).size > 1000);
const mainCss = await readFile(new URL("../src/styles/main.css", import.meta.url), "utf8");
const stylesEntry = await readFile(new URL("../src/styles/main.js", import.meta.url), "utf8");
const adminReportDarkFixCss = await readFile(new URL("../src/styles/adminReportDarkFix.css", import.meta.url), "utf8");
assert.match(mainCss, /direction:\s*rtl/);
assert.match(mainCss, /capacitor-native/);
assert.match(mainCss, /keyboard-open/);
assert.match(mainCss, /body\.capacitor-native \.mobile-header[\s\S]*display:\s*flex !important/);
assert.match(mainCss, /body\.capacitor-native \.mobile-nav[\s\S]*display:\s*grid !important/);
assert.match(mainCss, /Final Android shell override/);
assert.match(mainCss, /body\.capacitor-native \.content[\s\S]*overflow-y:\s*auto !important/);
assert.match(mainCss, /body\.capacitor-native[\s\S]*overflow:\s*hidden !important/);
assert.match(mainCss, /native-report-viewer/);
assert.match(mainCss, /native-report-body[\s\S]*overflow:\s*auto/);
assert.match(mainCss, /native-report-paper[\s\S]*width:\s*210mm/);
assert.match(mainCss, /native-report-paper[\s\S]*min-height:\s*297mm/);
assert.match(mainCss, /body\.native-report-open > \*:not\(\.native-report-viewer\)/);
assert.match(mainCss, /@media \(max-width:\s*760px\)/);
assert.match(mainCss, /\.finance-page-head/);
assert.match(mainCss, /\.finance-status-pill\.finance-status-completed/);
assert.match(mainCss, /task-filter-toolbar[\s\S]*grid-auto-flow:\s*column/);
assert.match(mainCss, /task-filter-toolbar[\s\S]*grid-template-rows:\s*repeat\(2/);
assert.match(mainCss, /task-filter-panel:not\(\.open\) \.task-filter-toolbar[\s\S]*display:\s*none/);
const administrativeReportSource = await readFile(new URL("../src/services/administrativeReportService.js", import.meta.url), "utf8");
assert.match(administrativeReportSource, /المستأذنون/);
assert.match(administrativeReportSource, /openedReportSections/);
assert.match(administrativeReportSource, /restoreReportModalPosition/);
assert.match(administrativeReportSource, /data-section-id/);
assert.match(administrativeReportSource, /\["students", "عدد الطلاب"\]/);

const gradeAdjustmentSource = await readFile(new URL("../src/services/gradeAdjustmentService.js", import.meta.url), "utf8");
assert.match(gradeAdjustmentSource, /طلبات تعديل الدرجات/);
assert.match(gradeAdjustmentSource, /type=\"number\" inputmode=\"decimal\" min=\"0\.01\"/);
assert.match(gradeAdjustmentSource, /محرم \(يوليو\)/);
assert.match(gradeAdjustmentSource, /نهاية الفصل الثاني/);
assert.match(gradeAdjustmentSource, /تحريري.*شفوي.*واجبات.*مواظبة/);
assert.doesNotMatch(gradeAdjustmentSource, /<legend>فترة الرصد<\/legend>/);
assert.match(gradeAdjustmentSource, /gradeLimit/);
assert.match(gradeAdjustmentSource, /printGradeAdjustmentReport/);
const gradeAdjustmentMigration = await readFile(new URL("../supabase/migrations/202609080003_grade_adjustments.sql", import.meta.url), "utf8");
assert.match(gradeAdjustmentMigration, /create table if not exists public\.grade_adjustments/);
assert.match(gradeAdjustmentMigration, /'general_manager','school_principal','deputy_principal'/);
assert.match(gradeAdjustmentMigration, /actor_role = 'computer_unit'/);
assert.match(administrativeReportSource, /\["featuredNotebooks", "الدفاتر المميزة"\]/);
assert.match(administrativeReportSource, /\["excellentCount", "الدفاتر الغير مميزة"\]/);
assert.match(administrativeReportSource, /\["stage", "القسم"\]/);
assert.match(administrativeReportSource, /absenceStageLabels/);
assert.match(administrativeReportSource, /أساسي/);
assert.match(administrativeReportSource, /ثانوي/);
assert.match(administrativeReportSource, /function absenceStageTotals/);
assert.match(administrativeReportSource, /ملخص الغياب والاستئذان حسب القسم/);
assert.match(administrativeReportSource, /numericReportFields/);
assert.match(administrativeReportSource, /type="\$\{numericField \? "number" : "text"\}"/);
assert.match(administrativeReportSource, /replace\(\/\[\^\\d\]\/g, ""\)/);
assert.match(administrativeReportSource, /"absences\.absent"/);
assert.match(administrativeReportSource, /"absences\.excused"/);
assert.match(administrativeReportSource, /"absences\.replied"/);
assert.match(administrativeReportSource, /"absences\.notReplied"/);
assert.match(administrativeReportSource, /function groupedReportsBySupervisor/);
assert.match(administrativeReportSource, /groupedReportsBySupervisor\(reportList\)\.map/);
assert.match(administrativeReportSource, /admin-report-group-links/);
assert.match(administrativeReportSource, /admin-report-group-link/);
assert.match(administrativeReportSource, /teacherPositives: 0/);
assert.match(administrativeReportSource, /parentNotes: 0/);
assert.match(administrativeReportSource, /parentContactOptions/);
assert.match(administrativeReportSource, /admin-parent-contact-toggle/);
assert.match(administrativeReportSource, /طريقة التواصل/);
assert.match(administrativeReportSource, /normalizeParentContactMethod/);
assert.match(administrativeReportSource, /absentTotal: 0/);
assert.match(administrativeReportSource, /renderMissingSupervisorsReportField/);
assert.match(administrativeReportSource, /renderMissingSupervisorsTab/);
assert.match(administrativeReportSource, /missing: "من لم يفعلوا"/);
assert.match(administrativeReportSource, /colors: "تقرير التفعيل"/);
assert.match(administrativeReportSource, /missingSupervisorsRowsForPrint/);
assert.match(administrativeReportSource, /من لم يفعل تقرير الإشراف/);
assert.match(administrativeReportSource, /@page \{ size: A4 portrait; margin: 10mm; \}/);
assert.match(administrativeReportSource, /\.print-page \{ width: 210mm; min-height: 297mm;/);
assert.match(administrativeReportSource, /table-layout: fixed/);
assert.match(administrativeReportSource, /thead \{ display: table-header-group; \}/);
assert.match(administrativeReportSource, /value="digest"/);
assert.match(administrativeReportSource, /تقرير الخلاصة/);
assert.match(administrativeReportSource, /function aggregateDigestSummaries/);
assert.match(administrativeReportSource, /function supervisorAbsenceDigest/);
assert.match(administrativeReportSource, /function digestRowsForPrint/);
assert.match(administrativeReportSource, /خلاصة الغياب حسب المشرف/);
const deputyNotebookVisibilitySource = await readFile(new URL("../src/services/taskService.js", import.meta.url), "utf8");
assert.match(deputyNotebookVisibilitySource, /restrictToDeputyOwnNotebook/);
assert.match(deputyNotebookVisibilitySource, /task\.assigneeId !== currentUserId/);

const { createSupabaseModule } = await import("../src/lib/supabaseRepository.js");
const dataModule = createSupabaseModule(() => ({}));
const row = dataModule.toDatabaseRow("tasks", {
  taskNumber: "TSK-20260620-ABCD",
  schoolId: "school-a",
  assigneeId: "00000000-0000-0000-0000-000000000001",
  attachments: [{ storagePath: "school-a/task/file.pdf", url: "signed", previewKind: "pdf" }],
});

assert.equal(row.task_number, "TSK-20260620-ABCD");
assert.equal(row.school_id, "school-a");
assert.equal(row.assigned_to, "00000000-0000-0000-0000-000000000001");
assert.equal(row.attachments, undefined);
const financeRow = dataModule.toDatabaseRow("financeDiscounts", {
  id: "00000000-0000-4000-8000-000000000002",
  schoolId: "22222222-2222-4222-8222-222222222222",
  studentName: "طالب تجريبي",
  assignedTo: "",
  receivedAt: "",
  completedAt: "",
});
assert.equal(financeRow.school_id, "22222222-2222-4222-8222-222222222222");
assert.equal(financeRow.student_name, "طالب تجريبي");
assert.equal(financeRow.assigned_to, null);
assert.equal(financeRow.received_at, null);
assert.equal(financeRow.completed_at, null);
assert.equal(
  dataModule.formatCloudError({ message: "Could not find the function public.write_log_entry(p_entry) in the schema cache" }, "تعذر الحفظ."),
  "تم حفظ البيانات، لكن تعذر تحديث سجل النشاط مؤقتًا. حدّث الصفحة وحاول مرة أخرى إذا لزم.",
);

const schema = await readFile(new URL("../supabase/migrations/202606200001_initial_schema.sql", import.meta.url), "utf8");
for (const table of ["schools", "profiles", "departments", "tasks", "attachments", "notifications", "activity_logs", "audit_logs", "backups"]) {
  assert.match(schema, new RegExp(`create table (?:if not exists )?public\\.${table}`));
  assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`));
}
const schemaSnapshot = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
for (const role of ["general_manager", "school_principal", "deputy_principal", "school_secretary", "educational_supervisor", "specialist_supervisor", "stage_supervisor", "activity_supervisor", "finance", "computer_unit", "printing_unit", "tracker"]) {
  assert.match(schemaSnapshot, new RegExp(`'${role}'`));
}
assert.match(schema, /create trigger task_change_events/);
assert.match(schema, /create policy task_files_read/);
assert.match(schema, /id uuid primary key references auth\.users\(id\) on delete cascade/);
assert.equal((schema.match(/\$\$/g) || []).length % 2, 0);

const permissions = await import("../src/utils/permissionUtils.js");
const { createUuid } = await import("../src/utils/idUtils.js");
const fallbackUuid = createUuid({
  getRandomValues(bytes) {
    bytes.forEach((_, index) => { bytes[index] = index; });
    return bytes;
  },
});
assert.match(fallbackUuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(createUuid({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }), "00000000-0000-4000-8000-000000000001");
const generalManager = { id: "general", role: "general_manager", schoolId: "school-a", active: true };
const schoolPrincipal = { id: "principal", role: "school_principal", schoolId: "school-a", active: true };
const deputy = { id: "deputy", role: "deputy_principal", schoolId: "school-a", active: true };
const schoolSecretary = { id: "secretary", role: "school_secretary", schoolId: "school-a", active: true };
const delegatedSecretary = { ...schoolSecretary, id: "delegated-secretary", accessFlags: { createTask: true, createNotebook: false } };
const delegatedUserCreator = { ...schoolSecretary, id: "delegated-user-creator", accessFlags: { createUser: true } };
const stageSupervisor = { id: "stage", role: "stage_supervisor", schoolId: "school-a", department: "Mathematics", active: true };
const educationalSupervisor = { id: "educational", role: "educational_supervisor", schoolId: "school-a", active: true };
const activitySupervisor = { id: "activity", role: "activity_supervisor", schoolId: "school-a", active: true };
const finance = { id: "finance", role: "finance", schoolId: "school-a", active: true };
const otherEducationalSupervisor = { id: "other", role: "educational_supervisor", schoolId: "school-b", active: true };
const computerUnit = { id: "computer", role: "computer_unit", schoolId: "school-a", active: true };
const printingUnit = { id: "printing", role: "printing_unit", schoolId: "school-a", active: true };
const tracker = { id: "tracker", role: "tracker", schoolId: "school-a", linkedSchoolIds: ["school-a", "school-b"], active: true };
const inactivePrincipal = { ...schoolPrincipal, active: false };
const schoolTask = { id: "task", schoolId: "school-a", department: "Mathematics", assigneeId: educationalSupervisor.id };
const otherTask = { ...schoolTask, id: "other-task", assigneeId: computerUnit.id };
const usersById = new Map([generalManager, schoolPrincipal, deputy, schoolSecretary, stageSupervisor, educationalSupervisor, activitySupervisor, finance, otherEducationalSupervisor, computerUnit].map((user) => [user.id, user]));
const getUser = (id) => usersById.get(id);

assert.equal(permissions.canCreateUsers(schoolPrincipal), true);
assert.equal(permissions.canCreateUsers(computerUnit), true);
assert.equal(permissions.canCreateUsers(deputy), false);
assert.equal(permissions.canCreateUsers(stageSupervisor), false);
assert.equal(permissions.canViewUsers(deputy), true);
assert.equal(permissions.canViewUsers(computerUnit), true);
assert.equal(permissions.canViewUsers(schoolSecretary), false);
assert.equal(permissions.canViewUsers(delegatedUserCreator), true);
assert.equal(permissions.canViewUser(schoolPrincipal, generalManager), false);
assert.equal(permissions.canViewUser(schoolPrincipal, educationalSupervisor), true);
assert.equal(permissions.canViewUser(deputy, schoolPrincipal), false);
assert.equal(permissions.canViewUser(deputy, educationalSupervisor), true);
assert.equal(permissions.canViewUser(computerUnit, schoolPrincipal), false);
assert.equal(permissions.canViewUser(computerUnit, educationalSupervisor), true);
assert.equal(permissions.canViewUser(schoolSecretary, educationalSupervisor), false);
assert.equal(permissions.canViewUser(delegatedUserCreator, educationalSupervisor), true);
assert.equal(permissions.canViewUser(delegatedUserCreator, schoolPrincipal), false);
assert.equal(permissions.canEditUser(schoolPrincipal, educationalSupervisor), true);
assert.equal(permissions.canEditUser(computerUnit, printingUnit), true);
assert.equal(permissions.canEditUser(computerUnit, educationalSupervisor), true);
assert.equal(permissions.canEditUser(computerUnit, deputy), true);
assert.equal(permissions.canEditUser(computerUnit, schoolPrincipal), false);
assert.equal(permissions.canEditUser(computerUnit, tracker), false);
assert.equal(permissions.canEditUser(delegatedUserCreator, educationalSupervisor), false);
assert.equal(permissions.canEditUser(schoolPrincipal, otherEducationalSupervisor), false);
assert.equal(permissions.canCreateTasks(deputy, schoolTask), false);
assert.equal(permissions.canCreateTasks(schoolSecretary, schoolTask), false);
assert.equal(permissions.canCreateTasks(delegatedSecretary, schoolTask), true);
assert.equal(permissions.canCreateTasks(computerUnit, schoolTask), true);
assert.equal(permissions.canCreateTasks(computerUnit, { ...schoolTask, recurrence: "permanent" }), true);
assert.equal(permissions.canEditTaskDefinition(educationalSupervisor, { ...schoolTask, creatorId: schoolPrincipal.id }), false);
assert.equal(permissions.canEditTaskDefinition(delegatedSecretary, { ...schoolTask, creatorId: delegatedSecretary.id }), false);
assert.equal(permissions.canEditTaskDefinition(schoolPrincipal, { ...schoolTask, creatorId: schoolPrincipal.id }), true);
assert.equal(permissions.canEditTaskDefinition(generalManager, { ...schoolTask, schoolId: "school-b", creatorId: schoolPrincipal.id }), true);
assert.equal(permissions.canAssignTask(delegatedSecretary, schoolTask, educationalSupervisor), true);
assert.equal(permissions.canAssignTask(delegatedSecretary, { ...schoolTask, recurrence: "permanent" }, educationalSupervisor), false);
assert.equal(permissions.canAssignTask(delegatedSecretary, schoolTask, deputy), false);
assert.equal(permissions.canCreateTasks(stageSupervisor, schoolTask), false);
assert.equal(permissions.canAssignTask(schoolPrincipal, schoolTask, educationalSupervisor), true);
assert.equal(permissions.canAssignTask(generalManager, schoolTask, otherEducationalSupervisor), false);
assert.equal(permissions.canAssignTask(generalManager, { ...schoolTask, schoolId: "school-b" }, otherEducationalSupervisor), true);
assert.equal(permissions.canAssignTask(schoolPrincipal, schoolTask, schoolPrincipal), true);
assert.equal(permissions.canAssignTask(schoolPrincipal, schoolTask, generalManager), false);
assert.equal(permissions.canAssignTask(computerUnit, schoolTask, educationalSupervisor), true);
assert.equal(permissions.canAssignTask(computerUnit, { ...schoolTask, recurrence: "permanent" }, educationalSupervisor), true);
assert.equal(permissions.canAssignTask(computerUnit, schoolTask, deputy), true);
assert.equal(permissions.canAssignTask(computerUnit, schoolTask, schoolPrincipal), true);
assert.equal(permissions.canAssignTask(computerUnit, schoolTask, generalManager), false);
assert.equal(permissions.canAssignTask(computerUnit, schoolTask, tracker), false);
assert.equal(permissions.canDeleteTask(deputy, schoolTask), false);
assert.equal(permissions.canDeleteTask(schoolPrincipal, schoolTask), true);
assert.equal(permissions.canViewDashboard(educationalSupervisor), true);
assert.equal(permissions.canViewDashboard(inactivePrincipal), false);
assert.equal(permissions.canViewAuditLogs(deputy), true);
assert.equal(permissions.canViewAuditLogs(stageSupervisor), false);
assert.equal(permissions.canCreateBackups(schoolPrincipal, "school-a"), true);
assert.equal(permissions.canCreateBackups(deputy, "school-a"), false);
assert.equal(permissions.canRestoreBackup(schoolPrincipal, { schoolId: "school-b" }), false);
assert.equal(permissions.canUploadAttachment(educationalSupervisor, schoolTask), true);
assert.equal(permissions.canUploadAttachment(otherEducationalSupervisor, schoolTask), false);
assert.equal(permissions.canDeleteAttachment(deputy, schoolTask), false);
assert.equal(permissions.canReadSchoolTasks(stageSupervisor), false);
assert.equal(permissions.canReadTask(stageSupervisor, schoolTask), false);
assert.equal(permissions.canReadTask(stageSupervisor, { ...schoolTask, assigneeId: stageSupervisor.id }), true);
assert.equal(permissions.canReadTask(educationalSupervisor, schoolTask), true);
assert.equal(permissions.canReadTask(computerUnit, schoolTask), false);
assert.equal(permissions.canReadTask(deputy, schoolTask, getUser), true);
assert.equal(permissions.canReadTask(deputy, { ...schoolTask, assigneeId: schoolPrincipal.id }, getUser), false);
assert.equal(permissions.canReadSchoolTasks(tracker), true);
assert.equal(permissions.canReadTask(tracker, { ...schoolTask, schoolId: "school-b" }, getUser), true);
assert.equal(permissions.canReadTask(tracker, { ...schoolTask, schoolId: "school-c" }, getUser), false);
assert.equal(permissions.canActOnTask(tracker, { ...schoolTask, schoolId: "school-b" }), false);
assert.equal(permissions.canApproveTasks(tracker), false);
assert.equal(permissions.canActOnTask(deputy, schoolTask), false);
assert.equal(permissions.canActOnTask(computerUnit, { ...schoolTask, assigneeId: computerUnit.id }), true);
assert.equal(permissions.canApproveTasks(deputy), false);
assert.equal(permissions.canApproveTasks(schoolPrincipal), true);
assert.equal(permissions.canChangeUserRole(generalManager), true);
assert.equal(permissions.canChangeUserRole(schoolPrincipal), true);
assert.equal(permissions.canAssignUserRole(schoolPrincipal, "school_secretary"), true);
assert.equal(permissions.canAssignUserRole(schoolPrincipal, "deputy_principal", "school_secretary"), true);
assert.equal(permissions.canAssignUserRole(schoolPrincipal, "school_principal"), false);
assert.equal(permissions.canAssignUserRole(schoolPrincipal, "general_manager"), false);
assert.equal(permissions.canAssignUserRole(schoolPrincipal, "educational_supervisor", "educational_supervisor"), true);
assert.equal(permissions.canAssignUserRole(schoolPrincipal, "activity_supervisor"), true);
assert.equal(permissions.canAssignUserRole(schoolPrincipal, "finance"), true);
assert.equal(permissions.canAssignUserRole(generalManager, "tracker"), true);
assert.equal(permissions.canAssignUserRole(schoolPrincipal, "tracker"), false);
assert.equal(permissions.canAssignUserRole(computerUnit, "school_secretary"), true);
assert.equal(permissions.canAssignUserRole(computerUnit, "deputy_principal"), true);
assert.equal(permissions.canAssignUserRole(computerUnit, "deputy_principal", "deputy_principal"), true);
assert.equal(permissions.canAssignUserRole(computerUnit, "stage_supervisor", "deputy_principal"), false);
assert.equal(permissions.canAssignUserRole(computerUnit, "tracker"), false);
assert.equal(permissions.canAssignUserRole(computerUnit, "school_principal"), false);
assert.equal(permissions.canAssignUserRole(computerUnit, "general_manager"), false);
assert.equal(permissions.canAssignUserRole(delegatedUserCreator, "tracker"), false);
assert.equal(permissions.canAssignUserRole(schoolSecretary, "stage_supervisor", "educational_supervisor"), false);
assert.equal(permissions.canViewFinance(generalManager), true);
assert.equal(permissions.canViewFinance(schoolPrincipal), true);
assert.equal(permissions.canViewFinance(finance), true);
assert.equal(permissions.canViewFinance(tracker), true);
assert.equal(permissions.canViewFinance(deputy), false);
assert.equal(permissions.canManageFinanceDiscounts(schoolPrincipal), true);
assert.equal(permissions.canManageFinanceDiscounts(finance), false);

const hardenedRls = await readFile(new URL("../supabase/migrations/202606210001_harden_rls.sql", import.meta.url), "utf8");
for (const table of ["schools", "profiles", "departments", "tasks", "attachments", "notifications", "activity_logs", "audit_logs", "backups"]) {
  assert.match(hardenedRls, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(hardenedRls, new RegExp(`alter table public\\.${table} force row level security`));
}
assert.match(hardenedRls, /create policy tasks_read[\s\S]*can_view_task_values/);
assert.match(hardenedRls, /create policy tasks_update[\s\S]*can_update_task_values/);
assert.match(hardenedRls, /revoke insert, update, delete on table public\.profiles, public\.activity_logs, public\.audit_logs, public\.backups from authenticated/);
assert.match(hardenedRls, /Only super administrators and school administrators can restore backups/);
assert.match(hardenedRls, /Cross-school backup restore is forbidden/);
assert.match(hardenedRls, /Audit logs are append-only/);
assert.match(hardenedRls, /create trigger task_security_guard/);
assert.equal((hardenedRls.match(/\$\$/g) || []).length % 2, 0);

const roleModelUpdate = await readFile(new URL("../supabase/migrations/202606240002_role_model_update.sql", import.meta.url), "utf8");
assert.match(roleModelUpdate, /when 'super_admin' then 'general_manager'/);
assert.match(roleModelUpdate, /profiles_role_check[\s\S]*general_manager[\s\S]*printing_unit/);
assert.match(roleModelUpdate, /tasks_approver_role_check[\s\S]*school_principal/);
assert.match(roleModelUpdate, /create or replace function public\.can_manage_users\(\)[\s\S]*general_secretary[\s\S]*school_secretary/);
assert.match(roleModelUpdate, /create policy tasks_delete[\s\S]*school_principal/);
assert.equal((roleModelUpdate.match(/\$\$/g) || []).length % 2, 0);

const trackerRoleMigration = await readFile(new URL("../supabase/migrations/202608250001_tracker_role_linked_schools.sql", import.meta.url), "utf8");
assert.match(trackerRoleMigration, /linked_school_ids uuid\[\]/);
assert.match(trackerRoleMigration, /'tracker'/);
assert.match(trackerRoleMigration, /current_user_linked_school_ids/);
assert.match(trackerRoleMigration, /public\.can_access_school\(school_id\)/);
assert.match(trackerRoleMigration, /administrative_reports_read/);
assert.match(trackerRoleMigration, /finance_discounts_read/);
assert.equal((trackerRoleMigration.match(/\$\$/g) || []).length % 2, 0);
const taskDefinitionEditLock = await readFile(new URL("../supabase/migrations/202608260001_task_definition_edit_lock.sql", import.meta.url), "utf8");
assert.match(taskDefinitionEditLock, /Assigned users can only update task workflow fields/);
assert.match(taskDefinitionEditLock, /to_jsonb\(new\) - array\['status','progress','comments','feedback','completed_at','updated_at'\]/);
assert.match(taskDefinitionEditLock, /actor_role in \('general_manager', 'school_principal'\)/);

const roleHelpers = await readFile(new URL("../supabase/migrations/202606210002_role_helpers.sql", import.meta.url), "utf8");
for (const helper of [
  "get_current_user_role",
  "get_current_school_id",
  "is_super_admin",
  "is_school_admin",
  "can_manage_users",
  "can_manage_tasks",
]) {
  assert.match(roleHelpers, new RegExp(`create or replace function public\\.${helper}\\(\\)`));
}
assert.match(roleHelpers, /revoke execute[\s\S]*from public, anon/);
assert.match(roleHelpers, /grant execute[\s\S]*to authenticated/);
assert.equal((roleHelpers.match(/\$\$/g) || []).length % 2, 0);

const authServiceSource = await readFile(new URL("../src/services/authService.js", import.meta.url), "utf8");
assert.match(authServiceSource, /signInWithPassword\(\{ email, password \}\)/);
assert.match(authServiceSource, /auth\.signOut\(\{ scope: "local" \}\)/);
assert.match(authServiceSource, /auth\.getSession\(\)/);
assert.match(authServiceSource, /auth\.onAuthStateChange\(callback\)/);

const authViewSource = await readFile(new URL("../src/components/layout/authView.js", import.meta.url), "utf8");
assert.match(authViewSource, /school-tasks-logo\.jpeg/);
assert.match(authViewSource, /icon-192\.png/);
assert.match(authViewSource, /login-logo-panel/);

const layoutSource = await readFile(new URL("../src/components/layout/layout.js", import.meta.url), "utf8");
assert.match(layoutSource, /brand-logo/);
assert.match(layoutSource, /mobile-logo/);
assert.match(layoutSource, /icon-192\.png/);
assert.doesNotMatch(layoutSource, /inactiveUsers/);
assert.match(layoutSource, /إنشاء وحفظ نسخة كاملة/);
assert.match(layoutSource, /استعادة من ملف/);
assert.match(layoutSource, /backup-counts/);
assert.match(layoutSource, /المالية والتخفيضات/);
assert.match(layoutSource, /finance\.renderFinance\(\)/);
assert.match(layoutSource, /التخفيضات:/);
assert.match(layoutSource, /const schoolScopeLabel = scopedSchoolId\(\)/);
assert.match(layoutSource, /account-summary/);
assert.match(layoutSource, /theme-switch-row/);
assert.match(layoutSource, /theme-mode-select/);
assert.match(layoutSource, /function attentionText\(count\)/);
assert.match(layoutSource, /لا توجد عناصر تحتاج انتباهك الآن/);

const repositorySource = await readFile(new URL("../src/lib/supabaseRepository.js", import.meta.url), "utf8");
assert.match(repositorySource, /from\("profiles"\)\.select\("\*"\)\.eq\("id", uid\)/);
assert.match(repositorySource, /state\.activityLogs = \[\]/);
assert.match(repositorySource, /state\.auditLogs = \[\]/);
assert.match(repositorySource, /state\.backups = \[\]/);
assert.match(repositorySource, /state\.taskActionBusy = \{\}/);
assert.match(repositorySource, /function formatCloudError/);
assert.match(repositorySource, /target\.update\(updateRow\)\.eq\("id", id\)\.select\("id"\)/);
assert.match(repositorySource, /async function refreshCloudData\(refreshDashboard = true\)/);
assert.match(repositorySource, /scheduleReload\(getContext\(\)\.state\.currentUser, "users"\)/);
assert.match(repositorySource, /isTracker/);
assert.match(repositorySource, /linkedSchoolIds/);
assert.match(repositorySource, /query\.in\("school_id", readSchoolIds\(\)\)/);
assert.match(repositorySource, /refreshCloudData,/);
assert.match(repositorySource, /schoolTaskProfileCacheV1/);
assert.match(repositorySource, /financeDiscounts:\s*"finance_discounts"/);
assert.match(repositorySource, /state\.financeDiscounts = core\.financeDiscounts\.map/);
assert.match(repositorySource, /deferSecondary/);
assert.doesNotMatch(repositorySource, /\.upsert\(row, \{ onConflict: "id" \}\)/);

const authProfiles = await readFile(new URL("../supabase/migrations/202606210003_auth_profiles.sql", import.meta.url), "utf8");
assert.match(authProfiles, /create or replace function public\.handle_new_auth_user\(\)/);
assert.match(authProfiles, /after insert on auth\.users/);
assert.match(authProfiles, /'school_secretary',[\s\S]*'inactive'/);
assert.match(authProfiles, /from auth\.users auth_user[\s\S]*where profile\.id is null/);
assert.doesNotMatch(authProfiles, /raw_user_meta_data->>'(?:role|school_id)'/);
assert.equal((authProfiles.match(/\$\$/g) || []).length % 2, 0);

const mainSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
assert.match(mainSource, /userFilters: \{ query: "", role: "all", status: "active", schoolId: "all" \}/);
assert.match(mainSource, /toggleTaskFilters/);
assert.match(mainSource, /taskFiltersOpen/);
assert.match(mainSource, /if \(view === "inactiveUsers"\) view = "users"/);
assert.match(mainSource, /addNotebookItemRow\(button\)/);
assert.match(mainSource, /removeNotebookItemRow\(button\)/);
assert.match(mainSource, /data-notebook-items/);
assert.match(mainSource, /approvePermanentDailyEntry: modules\.tasks\.approvePermanentDailyEntry/);
assert.match(mainSource, /approvePermanentDailyGroup: modules\.tasks\.approvePermanentDailyGroup/);
assert.match(mainSource, /approveAllPermanentDailyNotebooks: modules\.tasks\.approveAllPermanentDailyNotebooks/);
assert.match(mainSource, /approveAllDailyExtraTasks: modules\.tasks\.approveAllDailyExtraTasks/);
assert.match(mainSource, /createFinanceModule/);
assert.match(mainSource, /saveFinanceDiscount: modules\.finance\.saveFinanceDiscount/);
assert.match(mainSource, /window\.__notificationPermissionBusy = true/);
assert.match(mainSource, /Notification permission action failed/);
assert.match(mainSource, /افتح إعدادات التطبيق/);
assert.match(mainSource, /schoolTaskNotificationStatus/);
assert.match(mainSource, /schoolTaskNotificationPromptDismissed/);
assert.match(mainSource, /function effectiveTheme\(\)/);
assert.match(mainSource, /setThemeMode\(value\)/);
assert.match(mainSource, /data-theme-mode/);
assert.match(mainSource, /window\.__setNativeTheme\?\.\(resolvedTheme\)/);

const notificationServiceSource = await readFile(new URL("../src/services/notificationService.js", import.meta.url), "utf8");
assert.match(notificationServiceSource, /deviceNotificationTypes/);
assert.match(notificationServiceSource, /task_assigned/);
assert.match(notificationServiceSource, /chat_message/);
assert.match(notificationServiceSource, /administrative_circular/);
assert.match(notificationServiceSource, /showPendingDeviceNotifications/);
assert.match(notificationServiceSource, /renderPhoneNotificationPrompt/);
assert.match(notificationServiceSource, /السماح بالتنبيهات/);
assert.match(notificationServiceSource, /async function checkNativeNotificationPermission\(\)/);
assert.match(notificationServiceSource, /async function requestNativeNotificationPermissionStatus\(\)/);
assert.match(notificationServiceSource, /const permission = await checkNativeNotificationPermission\(\)/);
assert.match(notificationServiceSource, /const permission = await requestNativeNotificationPermissionStatus\(\)/);
assert.match(notificationServiceSource, /state\.notificationPromptDismissed = granted/);
assert.match(notificationServiceSource, /permission === "error"/);
assert.match(notificationServiceSource, /تعذر فتح طلب إذن التنبيهات/);
assert.match(notificationServiceSource, /Native notification enable failed/);
assert.match(notificationServiceSource, /إشعارات الهاتف محظورة/);
assert.match(notificationServiceSource, /const allowed = await ensureNativeNotificationPermission\(\)/);
assert.match(repositorySource, /showPendingDeviceNotifications\?\.\("load"\)/);

const circularServiceSource = await readFile(new URL("../src/services/circularService.js", import.meta.url), "utf8");
assert.match(circularServiceSource, /إدارة جميع الفروع/);
assert.doesNotMatch(circularServiceSource, /إدارة الإدارة العامة/);

const financeServiceSource = await readFile(new URL("../src/services/financeService.js", import.meta.url), "utf8");
assert.match(financeServiceSource, /سجل تخفيضات الطلاب/);
assert.match(financeServiceSource, /استلام العملية/);
assert.match(financeServiceSource, /تم إدخال التخفيض/);
assert.match(financeServiceSource, /receivedByName/);

const financeMigration = await readFile(new URL("../supabase/migrations/202607210001_finance_discounts.sql", import.meta.url), "utf8");
assert.match(financeMigration, /create table if not exists public\.finance_discounts/);
assert.match(financeMigration, /create trigger finance_discount_workflow_trigger/);
assert.match(financeMigration, /alter table public\.finance_discounts force row level security/);
assert.match(financeMigration, /create policy finance_discounts_read/);
assert.match(financeMigration, /received_by_name text not null default ''/);
assert.equal((financeMigration.match(/\$\$/g) || []).length % 2, 0);

const financeBackupMigration = await readFile(new URL("../supabase/migrations/202607210002_finance_discounts_backup.sql", import.meta.url), "utf8");
assert.match(financeBackupMigration, /financeDiscounts/);
assert.match(financeBackupMigration, /create_complete_backup_base_internal/);
assert.match(financeBackupMigration, /restore_complete_backup_base_internal/);
assert.equal((financeBackupMigration.match(/\$\$/g) || []).length % 2, 0);

const writeLogRepairMigration = await readFile(new URL("../supabase/migrations/202607210003_repair_write_log_entry.sql", import.meta.url), "utf8");
assert.match(writeLogRepairMigration, /create or replace function public\.write_log_entry\(p_entry jsonb\)/);
assert.match(writeLogRepairMigration, /notify pgrst, 'reload schema'/);
assert.equal((writeLogRepairMigration.match(/\$\$/g) || []).length % 2, 0);

const auditServiceSource = await readFile(new URL("../src/services/auditService.js", import.meta.url), "utf8");
assert.match(auditServiceSource, /دون التأثير على العملية الأساسية/);

const dashboardSource = await readFile(new URL("../src/services/dashboardService.js", import.meta.url), "utf8");
assert.match(dashboardSource, /type === "discount"/);
assert.match(dashboardSource, /تقرير التخفيضات|مؤشرات التخفيضات/);

const userViewSource = await readFile(new URL("../src/components/users/userView.js", import.meta.url), "utf8");
assert.match(userViewSource, /function filteredUsers\(\)/);
assert.match(userViewSource, /filter\(\(user\) => user\.active\)/);
assert.doesNotMatch(userViewSource, /state\.view === "inactiveUsers"/);
assert.match(userViewSource, /actions\.searchUsers\(event\)/);
assert.match(userViewSource, /setUserFilter\('role'/);
assert.match(userViewSource, /setUserFilter\('schoolId'/);
assert.match(userViewSource, /renderPagination\(pageInfo, "usersPage"\)/);
assert.match(userViewSource, /user-linked-schools/);
assert.match(userViewSource, /name="linkedSchoolIds"/);
assert.match(userViewSource, /فروع المتعقب/);
assert.match(userViewSource, /actions\.deleteUser/);
assert.doesNotMatch(userViewSource, /name="active"/);
assert.match(userViewSource, /function renderProfileModal\(\)/);
assert.match(userViewSource, /name="avatar" type="file"/);
assert.doesNotMatch(userViewSource, /القسم الوظيفي/);
assert.match(userViewSource, /كلمة مرور جديدة/);
assert.match(userViewSource, /state\.currentUser\.role === "general_manager"[\s\S]*state\.currentUser\.role === "computer_unit"[\s\S]*autocomplete="new-password"/);

const manageUserFunction = await readFile(new URL("../supabase/functions/manage-user/index.ts", import.meta.url), "utf8");
assert.match(manageUserFunction, /auth\.admin\.createUser/);
assert.match(manageUserFunction, /auth\.admin\.updateUserById/);
assert.match(manageUserFunction, /linkedSchoolIds/);
assert.match(manageUserFunction, /linked_school_ids/);
assert.match(manageUserFunction, /اختر فرعًا واحدًا على الأقل لحساب المتعقب/);
assert.match(manageUserFunction, /auth\.admin\.deleteUser/);
assert.match(manageUserFunction, /body\.action === "delete" \|\| body\.active === false/);
assert.match(manageUserFunction, /requester\.role !== "general_manager" && schoolId !== requester\.school_id/);
assert.match(manageUserFunction, /isHigherRole\(requester\.role, String\(existing\.role\)\)/);
assert.doesNotMatch(manageUserFunction, /general_secretary/);
assert.match(manageUserFunction, /canAssignUserRole\(requester\.role, role/);
assert.match(manageUserFunction, /canCreateUsers\(requester\?\.role \?\? ""\)/);
assert.match(manageUserFunction, /department_name: null/);
assert.doesNotMatch(manageUserFunction, /role !== existing\.role/);
assert.doesNotMatch(manageUserFunction, /القسم المحدد لا يتبع المدرسة المختارة/);
assert.match(manageUserFunction, /canComputerUnitChangePassword/);
assert.match(manageUserFunction, /password && requester\.role !== "general_manager" && !canComputerUnitChangePassword/);
assert.match(manageUserFunction, /attributes\.password = password/);
assert.match(manageUserFunction, /status: "active"/);
assert.match(manageUserFunction, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
assert.match(manageUserFunction, /type: "admin_alert"/);
assert.match(manageUserFunction, /type: roleChanged \? "role_changed" : "access_changed"/);

const roleCleanupMigration = await readFile(new URL("../supabase/migrations/202606250001_user_role_permissions_cleanup.sql", import.meta.url), "utf8");
assert.match(roleCleanupMigration, /p_user_id uuid default null/);
assert.match(roleCleanupMigration, /create or replace function public\.change_user_role_internal/);
assert.match(roleCleanupMigration, /school_secretary[\s\S]*stage_supervisor[\s\S]*educational_supervisor/);
assert.doesNotMatch(roleCleanupMigration, /'super_admin'|'school_admin'|'teacher'|'employee'|'viewer'/);
assert.equal((roleCleanupMigration.match(/\$\$/g) || []).length % 2, 0);

const roleHierarchyPrivacy = await readFile(new URL("../supabase/migrations/202606270003_role_hierarchy_privacy_profiles.sql", import.meta.url), "utf8");
assert.match(roleHierarchyPrivacy, /create or replace function public\.role_rank\(p_role text\)/);
assert.match(roleHierarchyPrivacy, /create or replace function public\.change_user_role_internal/);
assert.match(roleHierarchyPrivacy, /create or replace function public\.can_view_profile_values/);
assert.match(roleHierarchyPrivacy, /create or replace function public\.can_assign_task_values/);
assert.match(roleHierarchyPrivacy, /public\.current_user_role\(\) in \('general_manager', 'school_principal'\)/);
assert.match(roleHierarchyPrivacy, /profile-avatars/);
assert.match(roleHierarchyPrivacy, /storage\.foldername\(name\)/);
assert.match(roleHierarchyPrivacy, /public\.can_manage_profile_values\(id, school_id, role\)/);
assert.match(roleHierarchyPrivacy, /grant execute on function public\.change_user_role_internal\(uuid, text, uuid\) to service_role/);
assert.equal((roleHierarchyPrivacy.match(/\$\$/g) || []).length % 2, 0);

const principalRoleChangeFix = await readFile(new URL("../supabase/migrations/202606270004_fix_school_principal_role_changes.sql", import.meta.url), "utf8");
assert.match(principalRoleChangeFix, /create or replace function public\.change_user_role_internal/);
assert.match(principalRoleChangeFix, /target\.role in \('general_manager', 'school_principal'\)/);
assert.match(principalRoleChangeFix, /or p_role in \('general_manager', 'school_principal'\)/);
assert.match(principalRoleChangeFix, /not public\.is_higher_role\(actor\.role, p_role\)/);
assert.match(principalRoleChangeFix, /grant execute on function public\.change_user_role_internal\(uuid, text, uuid\) to service_role/);
assert.equal((principalRoleChangeFix.match(/\$\$/g) || []).length % 2, 0);

const assignmentStability = await readFile(new URL("../supabase/migrations/202607200001_task_assignment_stability.sql", import.meta.url), "utf8");
assert.match(assignmentStability, /create or replace function public\.can_create_task_values/);
assert.match(assignmentStability, /actor_role in \('general_manager', 'school_principal'\)/);
assert.match(assignmentStability, /old\.assigned_to = auth\.uid\(\)/);
assert.match(assignmentStability, /set school_id = assignee\.school_id/);
assert.match(assignmentStability, /tasks_assignee_school_status_idx/);
assert.equal((assignmentStability.match(/\$\$/g) || []).length % 2, 0);

const notebookDuplicateGuard = await readFile(new URL("../supabase/migrations/202607200002_prevent_duplicate_notebook_tasks.sql", import.meta.url), "utf8");
assert.match(notebookDuplicateGuard, /pg_advisory_xact_lock/);
assert.match(notebookDuplicateGuard, /Duplicate notebook task for this employee/);
assert.match(notebookDuplicateGuard, /create trigger prevent_duplicate_notebook_task/);
assert.equal((notebookDuplicateGuard.match(/\$\$/g) || []).length % 2, 0);

const todayDuplicateCleanup = await readFile(new URL("../supabase/migrations/202607200003_remove_today_duplicate_tasks.sql", import.meta.url), "utf8");
assert.match(todayDuplicateCleanup, /create temporary table task_dedupe_map/);
assert.match(todayDuplicateCleanup, /at time zone 'Asia\/Aden'/);
assert.match(todayDuplicateCleanup, /update public\.attachments/);
assert.match(todayDuplicateCleanup, /delete from public\.tasks/);
assert.equal((todayDuplicateCleanup.match(/\$\$/g) || []).length % 2, 0);

const todayNotebookCleanup = await readFile(new URL("../supabase/migrations/202607200004_keep_one_notebook_task_per_employee_today.sql", import.meta.url), "utf8");
assert.match(todayNotebookCleanup, /partition by task\.school_id, task\.assigned_to/);
assert.match(todayNotebookCleanup, /task\.recurrence_type = 'permanent'/);
assert.match(todayNotebookCleanup, /task\.source_task_id is null/);
assert.match(todayNotebookCleanup, /delete from public\.tasks/);
assert.equal((todayNotebookCleanup.match(/\$\$/g) || []).length % 2, 0);

const incidentTaskCleanup = await readFile(new URL("../supabase/migrations/202607200006_cleanup_july19_excess_standard_tasks.sql", import.meta.url), "utf8");
assert.match(incidentTaskCleanup, /coalesce\(task\.recurrence_type, 'once'\) = 'once'/);
assert.match(incidentTaskCleanup, /date '2026-07-19'/);
assert.match(incidentTaskCleanup, /partition by task\.school_id, task\.assigned_to/);
assert.match(incidentTaskCleanup, /delete from public\.tasks/);
assert.equal((incidentTaskCleanup.match(/\$\$/g) || []).length % 2, 0);

const inactiveAndNotebookCleanup = await readFile(new URL("../supabase/migrations/202607200008_remove_inactive_users_and_dedupe_notebooks.sql", import.meta.url), "utf8");
assert.match(inactiveAndNotebookCleanup, /delete from auth\.users/);
assert.match(inactiveAndNotebookCleanup, /create temporary table notebook_task_dedupe_map/);
assert.match(inactiveAndNotebookCleanup, /task\.recurrence_type = 'permanent'/);
assert.match(inactiveAndNotebookCleanup, /existing\.status <> 'archived'/);
assert.match(inactiveAndNotebookCleanup, /Duplicate notebook task for this employee/);
assert.equal((inactiveAndNotebookCleanup.match(/\$\$/g) || []).length % 2, 0);

const userServiceSource = await readFile(new URL("../src/services/userService.js", import.meta.url), "utf8");
assert.match(userServiceSource, /callFunction\("manage-user"/);
assert.match(userServiceSource, /role: user\.role/);
assert.match(userServiceSource, /const savedUser = \{ \.\.\.user, id: result\?\.id \|\| user\.id/);
assert.match(userServiceSource, /refreshCloudData\?\.\(false\)/);
assert.match(userServiceSource, /action: "delete"/);
assert.match(userServiceSource, /state\.users = state\.users\.filter\(\(item\) => item\.id !== id\)/);
assert.doesNotMatch(userServiceSource, /callFunction\("changeUserRole"/);
assert.match(userServiceSource, /async function saveMyProfile\(event\)/);
assert.match(userServiceSource, /profile-avatars/);
assert.match(userServiceSource, /callFunction\("selfProfile"/);
assert.match(userServiceSource, /avatarUrl/);
assert.doesNotMatch(userServiceSource, /SERVICE_ROLE|auth\.admin/i);

const taskServiceSource = await readFile(new URL("../src/services/taskService.js", import.meta.url), "utf8");
assert.doesNotMatch(taskServiceSource, /crypto\.randomUUID/);
assert.match(taskServiceSource, /async function saveTask\(event\)/);
assert.match(taskServiceSource, /async function deleteTask\(id\)/);
assert.match(taskServiceSource, /async function updateStatus\(id, status\)/);
assert.match(taskServiceSource, /async function reopenTask\(id\)/);
assert.match(taskServiceSource, /async function runTaskAction/);
assert.match(taskServiceSource, /user\.active && canViewUser\(user\)/);
assert.match(taskServiceSource, /taskActionBusy/);
assert.match(taskServiceSource, /جاري الحفظ/);
assert.match(taskServiceSource, /function standardWorkTasks/);
assert.match(taskServiceSource, /function taskDepartmentValue/);
assert.match(taskServiceSource, /branchName !== "الإدارة العامة"/);
assert.match(taskServiceSource, /department: taskDepartmentValue\(\{ \.\.\.task, schoolId \}\)/);
assert.doesNotMatch(taskServiceSource, /task\.recurrence !== "once" \|\| !task\.dueDate/);
assert.match(taskServiceSource, /المهام المسندة لك/);
assert.match(taskServiceSource, /function renderTaskRow/);
assert.match(taskServiceSource, /function renderTaskCard/);
assert.match(taskServiceSource, /const canEdit = canEditTask\(task\)/);
assert.match(taskServiceSource, /const canEditTaskDefinition = canEditTask\(task\)/);
assert.match(taskServiceSource, /لا يمكن تعديل بيانات مهمة أنشأها المدير/);
assert.match(taskServiceSource, /managerView \? 20 : 6/);
assert.match(taskServiceSource, /general_manager.*school_principal/);
assert.match(taskServiceSource, /user-task-card-list/);
assert.match(taskServiceSource, /manager-task-card-list/);
assert.match(taskServiceSource, /task-card-pro/);
assert.match(taskServiceSource, /التفاصيل والتعليقات/);
assert.match(taskServiceSource, /function setTaskDisplayStatus/);
assert.match(taskServiceSource, /لم يتم/);
assert.match(taskServiceSource, /قيد العمل/);
assert.doesNotMatch(taskServiceSource, /نسبة الإنجاز/);
assert.match(taskServiceSource, /function renderDailyNotebook/);
assert.match(taskServiceSource, /renderPermanentDailyTasks/);
assert.match(taskServiceSource, /function renderPermanentDailyReport/);
assert.match(taskServiceSource, /function permanentDailyEmployeeGroups/);
assert.match(taskServiceSource, /function dailyNotebookStats/);
assert.match(taskServiceSource, /eligibleEmployees/);
assert.match(taskServiceSource, /!activeEmployeeIds\.has\(user\.id\)/);
assert.match(taskServiceSource, /function renderEmployeeDailyReport/);
assert.match(taskServiceSource, /function renderEmployeeDailyNotebook/);
assert.match(taskServiceSource, /function permanentDailyRecord/);
assert.match(taskServiceSource, /function savePermanentDailyEntry/);
assert.match(taskServiceSource, /function approvePermanentDailyEntry/);
assert.match(taskServiceSource, /function approvePermanentDailyGroup/);
assert.match(taskServiceSource, /function approveAllPermanentDailyNotebooks/);
assert.match(taskServiceSource, /function approveAllDailyExtraTasks/);
assert.match(taskServiceSource, /function createNotebookMetaRecord/);
assert.match(taskServiceSource, /function uniqueNotebookItems/);
assert.match(taskServiceSource, /existingNotebookKeys/);
assert.match(taskServiceSource, /تجاهل \$\{skippedNotebookDuplicates\} من البنود المكررة/);
assert.match(taskServiceSource, /name="outcome-\$\{safe\(task\.id\)\}" value="completed"/);
assert.doesNotMatch(taskServiceSource, /name="outcome-\$\{safe\(task\.id\)\}" value="not_done"/);
assert.match(taskServiceSource, /notebook-check-row/);
assert.match(taskServiceSource, /notebook-line-number/);
assert.match(taskServiceSource, /const stateClass = outcome === "not_done"/);
assert.doesNotMatch(taskServiceSource, /جاهزة للتفعيل عند الحفظ/);
assert.match(taskServiceSource, /تعديل الدفتر/);
assert.match(taskServiceSource, /notebookTaskId/);
assert.match(taskServiceSource, /employee-daily-form/);
assert.match(taskServiceSource, /حفظ ورفع دفتر المهام للمدير/);
assert.match(taskServiceSource, /اعتماد كامل الدفتر/);
assert.match(taskServiceSource, /اعتماد كل الدفاتر/);
assert.match(taskServiceSource, /المهام المستحدثة لجميع الموظفين/);
assert.match(taskServiceSource, /اعتماد كل المهام المستحدثة/);
assert.match(taskServiceSource, /setUTCDate\(renewedDate\.getUTCDate\(\) \+ 60\)/);
assert.match(taskServiceSource, /تجديد دفتر المهام لمدة 60 يومًا/);
assert.match(taskServiceSource, /function dailyExtraTaskArchive/);
assert.match(taskServiceSource, /function addDailyExtraTaskRow/);
assert.match(taskServiceSource, /daily-extra-input-row/);
assert.match(taskServiceSource, /حفظ ورفع جميع المهام للمدير/);
assert.match(taskServiceSource, /daily-extra-save-btn/);
assert.match(taskServiceSource, /function printDailyExtraTasks/);
assert.match(taskServiceSource, /daily-chart-legend/);
assert.match(taskServiceSource, /extra-bar-approved/);
assert.match(taskServiceSource, /100 - completedHeight - notDoneHeight/);
assert.match(taskServiceSource, /عنوان المهمة.*التفاصيل.*اسم الموظف.*تاريخ المهمة/s);
assert.match(taskServiceSource, /طباعة \/ حفظ PDF/);
assert.match(taskServiceSource, /المهام التي لم تنفذ/);
assert.match(taskServiceSource, /approvedAt/);
assert.match(taskServiceSource, /name="notebookItemTitle"/);
assert.match(taskServiceSource, /notebook_title/);
assert.match(taskServiceSource, /notebook_item_title/);
assert.match(taskServiceSource, /notebook_number/);
assert.match(taskServiceSource, /taskNumber: itemExisting\?\.taskNumber/);
assert.match(taskServiceSource, /removedNotebookTasks/);
assert.match(taskServiceSource, /deleteCloudDoc\("tasks", removedTask\.id\)/);
assert.match(taskServiceSource, /employee-daily-notebook/);
assert.match(taskServiceSource, /daily-paper-table/);
assert.match(taskServiceSource, /دفتر المهام اليومية/);
assert.match(taskServiceSource, /انتهت فترة دفتر المهام/);
assert.match(taskServiceSource, /async function renewPermanentDailyNotebook\(employeeId\)/);
assert.match(taskServiceSource, /async function archivePermanentDailyNotebook\(employeeId\)/);
assert.match(taskServiceSource, /notebook_archived_at/);
assert.match(taskServiceSource, /إسناد دفتر مهام جاهز/);
assert.match(taskServiceSource, /async function saveAssignedNotebook\(event\)/);
assert.match(taskServiceSource, /updateNotebookAssignmentSource/);
assert.match(taskServiceSource, /permanent_daily/);
assert.match(taskServiceSource, /daily-report-panel/);
assert.match(taskServiceSource, /daily-notebook-one-page/);
assert.match(taskServiceSource, /notebook-check-option/);
assert.match(taskServiceSource, /renderDailyNotebook/);
assert.match(taskServiceSource, /function visibleNotebookTasks/);
assert.match(taskServiceSource, /ignoreSchoolScope = state\.currentUser\.role === "general_manager"/);
assert.match(taskServiceSource, /renderFilters\(true\)/);
assert.match(taskServiceSource, /state\.filters\.assigneeId/);
assert.match(taskServiceSource, /state\.filters\.priority/);
assert.match(taskServiceSource, /state\.filters\.department/);
assert.match(taskServiceSource, /state\.filters\.from/);
assert.match(taskServiceSource, /state\.filters\.to/);
assert.match(taskServiceSource, /task\.title[\s\S]*task\.description/);
assert.match(taskServiceSource, /\["daily", "permanent"\]/);
assert.match(taskServiceSource, /task\.recurrence === "daily" && !task\.sourceTaskId/);
assert.match(taskServiceSource, /return "overdue"/);
assert.match(taskServiceSource, /function filterTaskAssigneesBySchool/);
assert.match(taskServiceSource, /roleRank\(b\.role\) - roleRank\(a\.role\)/);
assert.match(taskServiceSource, /String\(a\.name \|\| ""\)\.localeCompare\(String\(b\.name \|\| ""\), "ar"/);
assert.match(taskServiceSource, /<span>تحديد الفرع<\/span><select name="schoolId"/);
assert.match(taskServiceSource, /name="assigneeIds" required[\s\S]*multiple/);
assert.match(taskServiceSource, /const selectedAssignees = \[\.\.\.new Set/);
assert.match(taskServiceSource, /data-school-id/);
assert.match(taskServiceSource, /اختر موظفًا من نفس الفرع المحدد/);
assert.match(taskServiceSource, /taskAssignableUsers\(assignableSchoolIds, isDailyNotebook \? "permanent"/);
assert.match(taskServiceSource, /function uniquePermanentTaskRoots/);
assert.match(taskServiceSource, /function notebookTaskIdentity/);
assert.match(taskServiceSource, /const decided = completed \+ notDone/);
assert.match(taskServiceSource, /status: "new"[\s\S]*progress: 0[\s\S]*completedAt: ""[\s\S]*dueDate: renewedEndDate/);
assert.match(taskServiceSource, /"notebook_renewed_at", "notebook_archived_at"/);
assert.match(taskServiceSource, /form\.has\(`outcome-\$\{taskId\}`\) \? "completed" : "not_done"/);
assert.match(taskServiceSource, /\.filter\(\(item\) => item\.task\)/);
assert.match(taskServiceSource, /task-comment-highlight/);
assert.match(taskServiceSource, /compact-status-select/);
assert.match(taskServiceSource, /actions\.approveTask/);

const continuousTaskMigration = await readFile(new URL("../supabase/migrations/202607200010_continuous_task_next_day.sql", import.meta.url), "utf8");
assert.match(continuousTaskMigration, /create or replace function public\.schedule_continuous_task_next_day/);
assert.match(continuousTaskMigration, /new\.recurrence_type is distinct from 'daily'/);
assert.match(continuousTaskMigration, /next_date := \(now\(\) at time zone 'Asia\/Aden'\)::date \+ 1/);
assert.match(continuousTaskMigration, /after update of status on public\.tasks/);
assert.match(continuousTaskMigration, /'pending'/);
assert.equal((continuousTaskMigration.match(/\$\$/g) || []).length % 2, 0);

const supabaseRepositorySource = await readFile(new URL("../src/lib/supabaseRepository.js", import.meta.url), "utf8");
assert.match(supabaseRepositorySource, /window\.addEventListener\("online", \(\) => refreshAfterResume\(true\)\)/);
assert.match(supabaseRepositorySource, /document\.addEventListener\("visibilitychange"/);
assert.match(supabaseRepositorySource, /activeAssigneeIds/);

const completionWorkflow = await readFile(new URL("../supabase/migrations/202606210004_task_completion_workflow.sql", import.meta.url), "utf8");
assert.match(completionWorkflow, /create trigger task_completion_guard/);
assert.match(completionWorkflow, /new\.completed_at := coalesce\(new\.completed_at, now\(\)\)/);
assert.match(completionWorkflow, /new\.completed_at := null/);
assert.match(completionWorkflow, /Approval is required before completing this task/);
assert.equal((completionWorkflow.match(/\$\$/g) || []).length % 2, 0);

const attachmentServiceSource = await readFile(new URL("../src/services/attachmentService.js", import.meta.url), "utf8");
assert.match(attachmentServiceSource, /const bucketName = "task-attachments"/);
assert.match(attachmentServiceSource, /createSignedUploadUrl\(path, \{ upsert: false \}\)/);
assert.match(attachmentServiceSource, /new XMLHttpRequest\(\)/);
assert.match(attachmentServiceSource, /xhr\.upload\.addEventListener\("progress"/);
assert.match(attachmentServiceSource, /saveCloudDoc\("attachments"/);
assert.match(attachmentServiceSource, /createSignedUrl\(path, 3600\)/);
assert.match(attachmentServiceSource, /storage\.remove\(\[path\]\)/);
assert.match(attachmentServiceSource, /storage\.from\(bucketName\)\.download/);

const { createAttachmentsModule } = await import("../src/services/attachmentService.js");
const attachmentModule = createAttachmentsModule(() => ({}));
const safeStoredName = attachmentModule.safeStorageFileName("خطة نهائية.pdf", "attachment-id");
assert.equal(safeStoredName, "attachment-id-file.pdf");
assert.doesNotMatch(safeStoredName, /[\\/]/);
assert.equal(attachmentModule.validateSelectedFiles([{ name: "empty.pdf", size: 0, type: "application/pdf" }]).errors.length, 1);
assert.equal(attachmentModule.validateSelectedFiles([{ name: "safe.pdf", size: 1024, type: "application/pdf" }]).accepted.length, 1);
assert.equal(attachmentModule.validateSelectedFiles([{ name: "notes.txt", size: 1024, type: "text/plain" }]).errors.length, 1);
assert.equal(attachmentModule.validateSelectedFiles([{ name: "archive.zip", size: 1024, type: "application/zip" }]).errors.length, 1);
assert.equal(attachmentModule.validateSelectedFiles([{ name: "renamed.pdf", size: 1024, type: "image/png" }]).errors.length, 1);

const attachmentStorage = await readFile(new URL("../supabase/migrations/202606210005_attachment_storage.sql", import.meta.url), "utf8");
assert.match(attachmentStorage, /'task-attachments',[\s\S]*false,[\s\S]*10485760/);
assert.match(attachmentStorage, /allowed_mime_types/);
assert.match(attachmentStorage, /create trigger attachment_metadata_guard/);
assert.match(attachmentStorage, /schoolId\/taskId\/fileName/);
assert.match(attachmentStorage, /public\.can_update_task\(task\.id\)/);
assert.equal((attachmentStorage.match(/\$\$/g) || []).length % 2, 0);

const attachmentTypeAllowlist = await readFile(new URL("../supabase/migrations/202606210006_attachment_type_allowlist.sql", import.meta.url), "utf8");
assert.match(attachmentTypeAllowlist, /allowed_mime_types/);
assert.match(attachmentTypeAllowlist, /file_extension in \('jpg', 'jpeg'\)/);
assert.doesNotMatch(attachmentTypeAllowlist, /text\/plain|application\/zip|rar/i);
assert.equal((attachmentTypeAllowlist.match(/\$\$/g) || []).length % 2, 0);

assert.match(notificationServiceSource, /async function markNotificationRead\(id\)/);
assert.match(notificationServiceSource, /async function markAllNotificationsRead\(\)/);
assert.match(notificationServiceSource, /\.update\(\{ is_read: true \}\)/);
assert.match(notificationServiceSource, /async function openNotificationTask\(notificationId, taskId\)/);
assert.match(notificationServiceSource, /function startAlertScheduler\(\)/);
assert.match(notificationServiceSource, /5 \* 60 \* 1000/);
assert.match(notificationServiceSource, /function taskNotificationDedupeKey/);
assert.match(notificationServiceSource, /dedupeKey: options\.dedupeKey \|\| taskNotificationDedupeKey/);
assert.match(notificationServiceSource, /deadline-reminder:\$\{task\.id\}/);
assert.match(notificationServiceSource, /overdue-alert:\$\{task\.id\}/);
assert.match(notificationServiceSource, /function persistNotificationDeviceState\(status\)/);
assert.match(notificationServiceSource, /schoolTaskNotificationStatus/);
assert.match(notificationServiceSource, /ensureNativeNotificationChannel/);
assert.match(notificationServiceSource, /school_tasks_default/);
assert.match(notificationServiceSource, /channelId: "school_tasks_default"/);
assert.doesNotMatch(notificationServiceSource, /deadline-reminder:\$\{task\.id\}:\$\{task\.dueDate\}/);
assert.doesNotMatch(notificationServiceSource, /overdue-alert:\$\{task\.id\}:\$\{today\(\)\}/);

const notificationMigration = await readFile(new URL("../supabase/migrations/202606210007_notifications.sql", import.meta.url), "utf8");
for (const type of ["task_assigned", "task_updated", "deadline_reminder", "overdue_alert", "admin_alert"]) {
  assert.match(notificationMigration, new RegExp(`'${type}'`));
}
assert.match(notificationMigration, /create trigger task_change_events/);
assert.match(notificationMigration, /user_id = auth\.uid\(\)/);
assert.match(notificationMigration, /alter publication supabase_realtime add table public\.notifications/);
assert.equal((notificationMigration.match(/\$\$/g) || []).length % 2, 0);

const singleTaskNotifications = await readFile(new URL("../supabase/migrations/202606270002_single_task_notifications.sql", import.meta.url), "utf8");
assert.match(singleTaskNotifications, /create or replace function public\.handle_task_change/);
assert.match(singleTaskNotifications, /create or replace function public\.sync_task_notifications/);
assert.match(singleTaskNotifications, /create or replace function public\.generate_due_notifications_internal/);
assert.match(singleTaskNotifications, /'task_assigned:' \|\| item\.id/);
assert.match(singleTaskNotifications, /'deadline_reminder:' \|\| task\.id/);
assert.match(singleTaskNotifications, /'overdue_alert:' \|\| task\.id/);
assert.match(singleTaskNotifications, /on conflict on constraint notifications_user_dedupe_key do nothing/);
assert.match(singleTaskNotifications, /general_manager[\s\S]*school_principal[\s\S]*deputy_principal/);
assert.doesNotMatch(singleTaskNotifications, /extract\(epoch from .*updated_at\)::bigint/);
assert.equal((singleTaskNotifications.match(/\$\$/g) || []).length % 2, 0);

const selfProfileFunction = await readFile(new URL("../supabase/functions/self-profile/index.ts", import.meta.url), "utf8");
assert.match(selfProfileFunction, /auth\.admin\.updateUserById/);
assert.match(selfProfileFunction, /avatar_url/);
assert.match(selfProfileFunction, /self_profile_updated/);
assert.match(selfProfileFunction, /type: "admin_alert"/);
assert.match(selfProfileFunction, /role", "general_manager"/);

const dashboardMigration = await readFile(new URL("../supabase/migrations/202606210008_dashboard_realtime.sql", import.meta.url), "utf8");
assert.match(dashboardMigration, /create or replace function public\.get_dashboard_data\(/);
assert.match(dashboardMigration, /language sql stable security invoker/);
for (const metricKey of [
  "totalTasks",
  "completedTasks",
  "pendingTasks",
  "activeTasks",
  "overdueTasks",
  "completionPercentage",
  "byPriority",
  "byStatus",
  "byDepartment",
  "byAssignee",
  "recentActivity",
  "upcomingDeadlines",
]) {
  assert.match(dashboardMigration, new RegExp(`'${metricKey}'`));
}
assert.match(dashboardMigration, /task\.effective_status = p_status/);
assert.match(dashboardMigration, /array\['tasks', 'activity_logs', 'notifications'\]/);
assert.match(dashboardMigration, /grant execute[\s\S]*to authenticated/);
assert.equal((dashboardMigration.match(/\$\$/g) || []).length % 2, 0);

const dashboardServiceSource = await readFile(new URL("../src/services/dashboardService.js", import.meta.url), "utf8");
assert.match(dashboardServiceSource, /remoteDashboardData\(\)\?\.byPriority/);
assert.match(dashboardServiceSource, /remoteDashboardData\(\)\?\.byAssignee/);
assert.match(dashboardServiceSource, /renderPriorityPanel/);
assert.match(dashboardServiceSource, /renderAssigneePanel/);
assert.match(dashboardServiceSource, /function renderReportGuide/);
assert.match(dashboardServiceSource, /function renderReportInsightPanel/);
assert.match(dashboardServiceSource, /assignee-workload-panel/);
assert.match(dashboardServiceSource, /compact-task-card/);
assert.match(dashboardServiceSource, /notebook-dashboard-chart/);
assert.match(dashboardServiceSource, /permanentDailySummary/);
assert.doesNotMatch(dashboardServiceSource, /\$\{renderOverdueCleanupPanel\(allVisible\)\}/);
assert.doesNotMatch(dashboardServiceSource, /\$\{renderRecentActivityPanel\(\)\}/);
assert.match(dashboardServiceSource, /tasks\.reportBaseTasks\(\)/);
assert.match(dashboardServiceSource, /isThursdayOrFriday/);
assert.match(dashboardServiceSource, /dateRange/);
assert.match(dashboardServiceSource, /function dailyNotebookReportPeriod/);
assert.match(dashboardServiceSource, /workingDates/);
assert.match(dashboardServiceSource, /dates\.filter\(\(date\) => !isThursdayOrFriday\(date\)\)/);
assert.match(dashboardServiceSource, /لا يحتوي أيام عمل، وتم استبعاد الخميس والجمعة/);
assert.match(dashboardServiceSource, /notebook-report-hero/);
assert.match(dashboardServiceSource, /notebook-report-donut/);
assert.match(dashboardServiceSource, /إنجاز الفترة/);
assert.match(dashboardServiceSource, /function activeReportUser\(userId\)/);
assert.match(dashboardServiceSource, /filter\(activeReportAssignment\)/);
assert.match(dashboardServiceSource, /notebookTasks\.forEach\(\(task\) => ensureEmployee\(task\.assigneeId\)\)/);
assert.match(dashboardServiceSource, /user\.active && baseTasks\.some/);
assert.match(dashboardServiceSource, /const decided = item\.completed \+ item\.notDone/);
assert.match(dashboardServiceSource, /tasks\.dailyNotebookStats\?\.\(\)/);
assert.match(dashboardServiceSource, /const chartTotal = Math\.max\(1,/);
assert.match(dashboardServiceSource, /100 - completedWidth - notDoneWidth - pendingWidth/);
assert.match(dashboardServiceSource, /الدفاتر المفعلة/);
assert.match(dashboardServiceSource, /المقصرين/);
assert.match(dashboardServiceSource, /لم يفعّلوا دفتر المهام/);
assert.doesNotMatch(dashboardServiceSource, /metric\("المرفقات"/);
assert.doesNotMatch(dashboardServiceSource, /metric\("المؤرشفة"/);
assert.doesNotMatch(dashboardServiceSource, /tasks\.renderDailyNotebook\(\{ compact: true \}\)/);
assert.match(dashboardServiceSource, /<img src="\/icon-192\.png"/);
assert.match(dashboardServiceSource, /topbar dashboard-topbar/);
assert.match(dashboardServiceSource, /dashboard-summary-grid/);
assert.match(repositorySource, /rpc\("get_dashboard_data"/);
assert.match(repositorySource, /\["tasks", "activityLogs", "users"\]\.includes\(changedTable\)/);

const browserConfig = await readFile(new URL("../src/lib/supabaseClient.js", import.meta.url), "utf8");
assert.match(browserConfig, /VITE_SUPABASE_URL/);
assert.match(browserConfig, /VITE_SUPABASE_ANON_KEY/);
assert.doesNotMatch(browserConfig, /SERVICE_ROLE/i);

const secureOperations = await readFile(new URL("../supabase/migrations/202606210009_secure_operations.sql", import.meta.url), "utf8");
for (const helper of ["create_backup_internal", "restore_backup_internal", "generate_due_notifications_internal", "change_user_role_internal"]) {
  assert.match(secureOperations, new RegExp(`create or replace function public\\.${helper}`));
}
for (const action of ["backup_created", "backup_restored", "task_assigned", "task_completed", "attachment_uploaded", "attachment_deleted"]) {
  assert.match(secureOperations, new RegExp(`'${action}'`));
}
assert.match(secureOperations, /grant execute[\s\S]*to service_role/);
assert.match(secureOperations, /revoke execute[\s\S]*from public, anon, authenticated/);
assert.match(secureOperations, /grant select \(id, school_id, created_by, backup_name, created_at, entity_counts\)/);
assert.match(secureOperations, /set timezone = 'Asia\/Aden'/);
assert.equal((secureOperations.match(/\$\$/g) || []).length % 2, 0);

const completeBackups = await readFile(new URL("../supabase/migrations/202607190001_complete_site_backups.sql", import.meta.url), "utf8");
assert.match(completeBackups, /create_complete_backup_internal/);
assert.match(completeBackups, /restore_complete_backup_internal/);
assert.match(completeBackups, /'schemaVersion', 2/);
assert.match(completeBackups, /'site-backups'/);
assert.match(completeBackups, /'storageFiles'/);
assert.match(completeBackups, /'appSettings'/);
assert.match(completeBackups, /insert into public\.profiles/);
assert.equal((completeBackups.match(/\$\$/g) || []).length % 2, 0);

for (const edgeFunction of [
  "create-admin-user",
  "change-user-role",
  "create-backup",
  "restore-backup",
  "import-backup",
  "send-notification",
  "overdue-task-check",
  "deadline-reminder",
  "log-login",
]) {
  const source = await readFile(new URL(`../supabase/functions/${edgeFunction}/index.ts`, import.meta.url), "utf8");
  assert.match(source, /requireRequester/);
}

const backupServiceSource = await readFile(new URL("../src/services/backupService.js", import.meta.url), "utf8");
assert.match(backupServiceSource, /callFunction\("createBackup"/);
assert.match(backupServiceSource, /callFunction\("restoreBackup"/);
assert.match(backupServiceSource, /includeAll/);
assert.match(backupServiceSource, /storageWarnings/);
assert.match(backupServiceSource, /stopCloudListeners/);
assert.match(backupServiceSource, /showSaveFilePicker/);
assert.match(backupServiceSource, /restoreBackupFile/);
assert.match(backupServiceSource, /callFunction\("importBackup"/);
const createBackupFunctionSource = await readFile(new URL("../supabase/functions/create-backup/index.ts", import.meta.url), "utf8");
const restoreBackupFunctionSource = await readFile(new URL("../supabase/functions/restore-backup/index.ts", import.meta.url), "utf8");
const backupStorageSource = await readFile(new URL("../supabase/functions/_shared/backupStorage.ts", import.meta.url), "utf8");
assert.match(createBackupFunctionSource, /create_complete_backup_internal/);
assert.match(createBackupFunctionSource, /snapshotBackupFiles/);
assert.match(restoreBackupFunctionSource, /restore_complete_backup_internal/);
assert.match(restoreBackupFunctionSource, /restoreBackupFiles/);
assert.match(backupStorageSource, /site-backups/);
assert.match(repositorySource, /createBackup: "create-backup"/);
assert.match(repositorySource, /restoreBackup: "restore-backup"/);
assert.match(repositorySource, /importBackup: "import-backup"/);
assert.doesNotMatch(repositorySource, /createBackup:\s*\["create_backup"/);
assert.doesNotMatch(repositorySource, /restoreBackup:\s*\["restore_backup"/);

const backupCompatibility = await readFile(new URL("../supabase/migrations/202607190003_backup_uuid_compatibility.sql", import.meta.url), "utf8");
assert.match(backupCompatibility, /rename column backup_uuid to id/);
const backupLegacyCompatibility = await readFile(new URL("../supabase/migrations/202607190004_backup_legacy_id_nullable.sql", import.meta.url), "utf8");
assert.match(backupLegacyCompatibility, /legacy_id drop not null/);

const dateUtilsSource = await readFile(new URL("../src/utils/dateUtils.js", import.meta.url), "utf8");
assert.match(dateUtilsSource, /APP_TIME_ZONE = "Asia\/Aden"/);
assert.match(dateUtilsSource, /export function toStorageTimestamp/);
assert.match(dateUtilsSource, /export function isThursdayOrFriday/);
assert.match(repositorySource, /row\.due_date = toStorageTimestamp\(data\.dueDate\)/);
const dateUtils = await import("../src/utils/dateUtils.js");
assert.equal(dateUtils.toStorageTimestamp("2026-06-21"), "2026-06-21T09:00:00.000Z");
assert.equal(dateUtils.localDateValue("2026-06-20T22:30:00.000Z"), "2026-06-21");
assert.ok(dateUtils.compareTimestamp("2026-06-21T10:00:00Z", "2026-06-21T09:00:00Z") > 0);
assert.equal(dateUtils.isThursdayOrFriday("2026-07-23"), true);
assert.equal(dateUtils.isThursdayOrFriday("2026-07-24"), true);
assert.equal(dateUtils.isThursdayOrFriday("2026-07-25"), false);

const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
assert.equal(envExample.trim(), "VITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY=");
assert.match(mainCss, /overflow-x:\s*hidden/);
assert.match(mainCss, /--bg-app:\s*#080F1D/);
assert.match(mainCss, /--bg-surface:\s*#101A2B/);
assert.match(mainCss, /--primary:\s*#4F8CFF/);
assert.match(mainCss, /body\.theme-dark[\s\S]*#080F1D/);
assert.match(mainCss, /:root\[data-theme="dark"\] \.mobile-header/);
assert.match(mainCss, /:root\[data-theme="dark"\] \.mobile-nav/);
assert.match(mainCss, /\.sidebar-overlay[\s\S]*background:\s*var\(--overlay\)/);
assert.match(mainCss, /body\.mobile-menu-open[\s\S]*overflow:\s*hidden !important/);
assert.match(mainCss, /\.theme-switch-row/);
assert.match(mainCss, /\.compact-sync/);
assert.match(mainCss, /Final mobile visual QA pass/);
assert.match(mainCss, /--content-bottom-safe/);
assert.match(mainCss, /--floating-safe-bottom/);
assert.match(mainCss, /\.home-quick-card[\s\S]*background:\s*var\(--bg-surface-elevated\) !important/);
assert.match(mainCss, /\.daily-notebook-one-page[\s\S]*background:\s*var\(--bg-surface-elevated\) !important/);
assert.match(mainCss, /\.notebook-check-option[\s\S]*background:\s*var\(--bg-surface\) !important/);
assert.match(mainCss, /\.mobile-nav \.nav-badge[\s\S]*inset-inline-end/);
assert.match(mainCss, /\.floating-refresh,[\s\S]*\.floating-sync[\s\S]*bottom:\s*var\(--floating-safe-bottom\) !important/);
assert.match(mainCss, /:root\[data-theme="dark"\] \.phone-notification-prompt/);
assert.match(mainCss, /:root\[data-theme="dark"\] \.toast/);
assert.match(indexHtml, /\/src\/styles\/main\.css/);
assert.match(indexHtml, /\/src\/styles\/adminReportDarkFix\.css/);
assert.doesNotMatch(stylesEntry, /import\("\.\/main\.css"\)/);
assert.match(adminReportDarkFixCss, /admin-report-entry/);
assert.match(adminReportDarkFixCss, /background:\s*var\(--bg-surface-elevated\) !important/);
assert.match(mainCss, /min-height:\s*44px/);
assert.match(mainCss, /permanent-daily-row/);
assert.match(mainCss, /\.task-assignee-banner/);
assert.match(mainCss, /check-option/);
assert.match(mainCss, /employee-daily-report/);
assert.match(mainCss, /employee-daily-actions/);
assert.match(mainCss, /daily-paper-table/);
assert.match(mainCss, /notebook-item-row/);
assert.match(mainCss, /not-done-panel/);
assert.match(mainCss, /compact-btn/);
assert.match(mainCss, /login-logo-panel/);
assert.match(mainCss, /login-form > \.actions \.btn\[type="submit"\]/);
assert.match(mainCss, /linear-gradient\(135deg, var\(--blue\), var\(--cyan\)\)/);
assert.match(mainCss, /brand-logo/);
assert.match(mainCss, /report-logo img/);
assert.match(mainCss, /dashboard-topbar[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(mainCss, /dashboard-hero-metrics[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(mainCss, /dashboard-summary-grid[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(mainCss, /compact-task-card/);
assert.match(mainCss, /assignee-workload-card/);
assert.match(mainCss, /notebook-dashboard-donut/);
assert.match(mainCss, /report-guide-card/);
assert.match(mainCss, /report-insight-board/);
assert.match(mainCss, /scroll-snap-type:\s*x mandatory/);
assert.match(mainCss, /flex:\s*0 0 min\(82vw, 320px\)/);
assert.match(mainCss, /completion-ring[\s\S]*width:\s*152px/);
assert.match(mainCss, /task-dashboard-primary-grid[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);

const webManifest = await readFile(new URL("../public/site.webmanifest", import.meta.url), "utf8");
assert.match(webManifest, /"src": "\/icon-192\.png"/);
assert.match(webManifest, /"src": "\/icon-512\.png"/);
const serviceWorker = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
assert.match(serviceWorker, /school-tasks-supabase-v\d+/);
assert.match(serviceWorker, /caches\.open\(CACHE_NAME\)/);
assert.match(serviceWorker, /request\.mode === "navigate"/);
assert.doesNotMatch(serviceWorker, /registration\.unregister\(\)/);
assert.match(mainSource, /OFFLINE_QUEUE_KEY/);
assert.match(mainSource, /syncOfflineChanges/);
assert.match(mainSource, /refreshCloudData\(true, \{ deferSecondary: true, secondaryDelay: 250 \}\)/);
assert.match(layoutSource, /offline-banner/);
assert.match(layoutSource, /floating-sync/);
assert.match(mainCss, /offline-mode/);

const capacitorConfigUrl = new URL("../capacitor.config.json", import.meta.url);
const hasAndroidBundle = await stat(capacitorConfigUrl).then(() => true, () => false);
if (hasAndroidBundle) {
  const capacitorConfig = await readFile(capacitorConfigUrl, "utf8");
  assert.match(capacitorConfig, /"appId": "com\.schooltasks\.platform"/);
  assert.match(capacitorConfig, /"webDir": "dist"/);
  assert.doesNotMatch(capacitorConfig, /"server"\s*:/);
  assert.match(capacitorConfig, /"Keyboard"/);
  assert.match(capacitorConfig, /"SplashScreen"/);
  assert.match(capacitorConfig, /"StatusBar"/);
}

const capacitorPlatformSource = await readFile(new URL("../src/platform/capacitorPlatform.js", import.meta.url), "utf8");
assert.match(capacitorPlatformSource, /backButton/);
assert.match(capacitorPlatformSource, /Keyboard/);
assert.match(capacitorPlatformSource, /SplashScreen/);
assert.match(capacitorPlatformSource, /Browser\?\.open/);
assert.match(capacitorPlatformSource, /renderNativeReportViewer/);
assert.match(capacitorPlatformSource, /window\.open = \(url = ""/);
assert.match(capacitorPlatformSource, /closeNativeReportViewer\(\)/);
assert.match(capacitorPlatformSource, /native-report-paper/);
assert.match(capacitorPlatformSource, /window\.__notificationPermissionBusy/);
assert.match(capacitorPlatformSource, /event\.preventDefault\?\.\(\)/);

if (hasAndroidBundle) {
  const androidManifest = await readFile(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  assert.match(androidManifest, /android:allowBackup="false"/);
  assert.match(androidManifest, /android:usesCleartextTraffic="false"/);
  assert.match(androidManifest, /android:windowSoftInputMode="adjustResize"/);
  assert.match(androidManifest, /school-tasks-supabase\.vercel\.app/);

  const androidColors = await readFile(new URL("../android/app/src/main/res/values/colors.xml", import.meta.url), "utf8");
  assert.match(androidColors, /#2563EB/);
  assert.match(androidColors, /#0F766E/);

  const androidReadme = await readFile(new URL("../README_ANDROID.md", import.meta.url), "utf8");
  assert.match(androidReadme, /Android/);
  assert.match(androidReadme, /AAB/);
  const qaChecklist = await readFile(new URL("../QA_CHECKLIST.md", import.meta.url), "utf8");
  assert.match(qaChecklist, /320/);
  assert.match(qaChecklist, /زر الرجوع/);
}

for (const path of [
  "../src/services/authService.js",
  "../src/services/userService.js",
  "../src/services/taskService.js",
  "../src/services/dashboardService.js",
  "../src/services/notificationService.js",
  "../src/services/attachmentService.js",
  "../src/services/backupService.js",
  "../src/services/auditService.js",
  "../src/utils/validationUtils.js",
  "../supabase/schema.sql",
  "../supabase/policies.sql",
  "../supabase/seed.sql",
]) {
  assert.ok((await readFile(new URL(path, import.meta.url), "utf8")).length > 0, `${path} must exist`);
}

console.log("Smoke tests passed");
