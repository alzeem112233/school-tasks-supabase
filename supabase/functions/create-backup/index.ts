import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { canAccessSchool, requireRequester } from "../_shared/auth.ts";
import { snapshotBackupFiles } from "../_shared/backupStorage.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "الطريقة غير مدعومة." }, 405);
  try {
    const auth = await requireRequester(request, ["general_manager", "school_principal"]);
    if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);
    const body = await request.json().catch(() => ({}));
    const requestedSchoolId = String(body.schoolId || auth.requester.school_id || "").trim();
    const includeAll = body.includeAll === true || requestedSchoolId === "all";
    const schoolId = includeAll ? auth.requester.school_id || null : requestedSchoolId;
    const settings = typeof body.settings === "object" && body.settings !== null ? body.settings : {};
    if (!includeAll && !schoolId) return jsonResponse({ error: "اختر نطاق النسخة الاحتياطية." }, 400);
    if (includeAll && auth.requester.role !== "general_manager") return jsonResponse({ error: "النسخة الكاملة للموقع متاحة للمدير العام فقط." }, 403);
    if (!includeAll && !canAccessSchool(auth.requester, String(schoolId))) return jsonResponse({ error: "لا يمكن نسخ بيانات مدرسة أخرى." }, 403);
    if (JSON.stringify(settings).length > 200000) return jsonResponse({ error: "حجم إعدادات النسخة الاحتياطية أكبر من المسموح." }, 400);

    const { data, error } = await auth.adminClient.rpc("create_complete_backup_internal", {
      p_school_id: schoolId,
      p_actor_id: auth.requester.id,
      p_include_all: includeAll,
      p_client_settings: settings,
    });
    if (error) throw error;
    const attachmentQuery = auth.adminClient.from("attachments").select("file_path, file_type");
    const profileQuery = auth.adminClient.from("profiles").select("avatar_url");
    if (!includeAll) {
      attachmentQuery.eq("school_id", String(schoolId));
      profileQuery.eq("school_id", String(schoolId));
    }
    const [attachmentResult, profileResult] = await Promise.all([attachmentQuery, profileQuery]);
    if (attachmentResult.error) throw attachmentResult.error;
    if (profileResult.error) throw profileResult.error;

    const storageResult = await snapshotBackupFiles(
      auth.adminClient,
      String(data.backupId),
      attachmentResult.data || [],
      profileResult.data || [],
    );
    return jsonResponse({
      ...data,
      entityCounts: storageResult.entityCounts,
      storageWarnings: storageResult.warnings.length,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "تعذر إنشاء النسخة الاحتياطية." }, 400);
  }
});
