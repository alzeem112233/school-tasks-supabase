import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { canAccessSchool, requireRequester } from "../_shared/auth.ts";

const backupRoles = ["superadmin", "general_manager", "branch_manager", "school_principal"];

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayLength(payload: Record<string, unknown>, key: string) {
  return Array.isArray(payload[key]) ? (payload[key] as unknown[]).length : 0;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "الطريقة غير مدعومة." }, 405);
  try {
    const auth = await requireRequester(request, backupRoles);
    if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);
    const body = await request.json().catch(() => ({}));
    const source = objectValue(body.backup);
    if (!source) return jsonResponse({ error: "ملف النسخة الاحتياطية غير صالح." }, 400);
    const payload = objectValue(source.backup_data) || objectValue(source.backupData) || objectValue(source.payload);
    if (!payload) return jsonResponse({ error: "بيانات قاعدة البيانات غير موجودة في ملف النسخة." }, 400);
    const schemaVersion = Number(payload.schemaVersion || 0);
    if (![1, 2].includes(schemaVersion)) return jsonResponse({ error: "إصدار النسخة الاحتياطية غير مدعوم." }, 400);
    if (!Array.isArray(payload.tasks) || (!Array.isArray(payload.profiles) && !Array.isArray(payload.users))) {
      return jsonResponse({ error: "ملف النسخة ناقص ولا يحتوي على المستخدمين والمهام." }, 400);
    }
    if (!Array.isArray(payload.profiles)) {
      return jsonResponse({ error: "هذا الملف محلي ولا يمكن استعادته إلى قاعدة البيانات السحابية." }, 400);
    }
    const scopeType = String(payload.scopeType || source.scopeType || "school") === "site" ? "site" : "school";
    const schoolId = String(payload.schoolId || source.school_id || source.schoolId || "").trim();
    if (scopeType === "site" && auth.requester.role !== "superadmin") {
      return jsonResponse({ error: "استيراد نسخة الموقع كاملة متاح لحساب SUPERADMIN فقط." }, 403);
    }
    if (scopeType === "school") {
      if (!schoolId) return jsonResponse({ error: "معرّف فرع النسخة غير موجود." }, 400);
      if (!canAccessSchool(auth.requester, schoolId)) return jsonResponse({ error: "لا يمكن استيراد نسخة فرع آخر." }, 403);
      const { data: school } = await auth.adminClient.from("schools").select("id").eq("id", schoolId).maybeSingle();
      if (!school) return jsonResponse({ error: "الفرع الموجود في النسخة غير موجود في قاعدة البيانات الحالية." }, 400);
    }
    const entityCounts = {
      scopeType,
      schools: arrayLength(payload, "schools"),
      profiles: arrayLength(payload, "profiles"),
      departments: arrayLength(payload, "departments"),
      tasks: arrayLength(payload, "tasks"),
      attachments: arrayLength(payload, "attachments"),
      notifications: arrayLength(payload, "notifications"),
      activityLogs: arrayLength(payload, "activityLogs"),
      auditLogs: arrayLength(payload, "auditLogs"),
      storageFiles: arrayLength(payload, "storageFiles"),
    };
    const labelSource = String(source.backup_name || source.label || `نسخة مستوردة ${new Date().toISOString().slice(0, 10)}`).trim();
    const backupId = crypto.randomUUID();
    const backupSchoolId = scopeType === "site" ? auth.requester.school_id : schoolId;
    const { error } = await auth.adminClient.from("backups").insert({
      id: backupId,
      school_id: backupSchoolId || null,
      created_by: auth.requester.id,
      backup_name: `استيراد - ${labelSource.slice(0, 180)}`,
      backup_data: payload,
      entity_counts: entityCounts,
    });
    if (error) throw error;
    return jsonResponse({ ok: true, backupId, scopeType, entityCounts });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "تعذر استيراد ملف النسخة الاحتياطية." }, 400);
  }
});
