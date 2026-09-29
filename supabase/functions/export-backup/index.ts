import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { canAccessSchool, requireRequester } from "../_shared/auth.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "الطريقة غير مدعومة." }, 405);
  try {
    const auth = await requireRequester(request, ["general_manager", "school_principal"]);
    if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);
    const body = await request.json().catch(() => ({}));
    const backupId = String(body.backupId || "").trim();
    if (!backupId) return jsonResponse({ error: "اختر نسخة احتياطية للتصدير." }, 400);
    const { data: backup, error } = await auth.adminClient.from("backups").select("id, school_id, backup_name, created_at, entity_counts, backup_data").eq("id", backupId).single();
    if (error || !backup) return jsonResponse({ error: "النسخة الاحتياطية غير موجودة." }, 404);
    const isSiteBackup = backup.backup_data?.scopeType === "site";
    if (isSiteBackup && auth.requester.role !== "general_manager") return jsonResponse({ error: "حفظ نسخة الموقع كاملة متاح للمدير العام فقط." }, 403);
    if (!isSiteBackup && !canAccessSchool(auth.requester, backup.school_id)) return jsonResponse({ error: "لا يمكن تصدير نسخة مدرسة أخرى." }, 403);
    return jsonResponse({ ok: true, backup });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "تعذر تصدير النسخة الاحتياطية." }, 400);
  }
});
