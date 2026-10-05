import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { canAccessSchool, requireRequester } from "../_shared/auth.ts";
import { restoreBackupFiles } from "../_shared/backupStorage.ts";

const backupRoles = ["superadmin", "general_manager", "branch_manager", "school_principal"];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "الطريقة غير مدعومة." }, 405);
  try {
    const auth = await requireRequester(request, backupRoles);
    if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);
    const body = await request.json().catch(() => ({}));
    const backupId = String(body.backupId || "").trim();
    if (!backupId) return jsonResponse({ error: "معرّف النسخة الاحتياطية مطلوب." }, 400);
    const { data: backup, error: backupError } = await auth.adminClient
      .from("backups")
      .select("id, school_id, backup_data")
      .eq("id", backupId)
      .single();
    if (backupError || !backup) return jsonResponse({ error: "النسخة الاحتياطية غير موجودة." }, 404);
    const isSiteBackup = backup.backup_data?.scopeType === "site";
    if (isSiteBackup && auth.requester.role !== "superadmin") return jsonResponse({ error: "استعادة الموقع كاملًا متاحة لحساب SUPERADMIN فقط." }, 403);
    if (!isSiteBackup && !canAccessSchool(auth.requester, backup.school_id)) return jsonResponse({ error: "لا يمكن استعادة نسخة مدرسة أخرى." }, 403);

    const storageFiles = Array.isArray(backup.backup_data?.storageFiles) ? backup.backup_data.storageFiles : [];
    const { data, error } = await auth.adminClient.rpc("restore_complete_backup_internal", {
      p_backup_id: backupId,
      p_actor_id: auth.requester.id,
    });
    if (error) throw error;
    const storageResult = await restoreBackupFiles(auth.adminClient, storageFiles);

    const authWarnings: string[] = [];
    const profiles = Array.isArray(backup.backup_data?.profiles) ? backup.backup_data.profiles : [];
    for (let index = 0; index < profiles.length; index += 5) {
      const batch = profiles.slice(index, index + 5);
      const results = await Promise.all(batch.map((profile: Record<string, unknown>) => auth.adminClient.auth.admin.updateUserById(String(profile.id), {
        email: String(profile.email || ""),
        user_metadata: { name: String(profile.full_name || "") },
        ban_duration: profile.status === "active" ? "none" : "876000h",
      })));
      results.forEach((result, resultIndex) => {
        if (result.error) authWarnings.push(`${String(batch[resultIndex]?.email || batch[resultIndex]?.id || "مستخدم")}: ${result.error.message}`);
      });
    }

    return jsonResponse({
      ...data,
      restoredStorageFiles: storageResult.restored.length,
      storageWarnings: storageResult.warnings,
      authWarnings,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "تعذر استعادة النسخة الاحتياطية." }, 400);
  }
});
