import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { canAccessSchool, requireRequester } from "../_shared/auth.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "الطريقة غير مدعومة." }, 405);
  try {
    const auth = await requireRequester(request, ["general_manager", "school_principal", "deputy_principal", "school_secretary"]);
    if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);
    const body = await request.json().catch(() => ({}));
    const schoolId = String(body.schoolId || auth.requester.school_id || "").trim();
    if (!schoolId || schoolId === "all") return jsonResponse({ error: "حدد مدرسة لفحص المهام المتأخرة." }, 400);
    if (!canAccessSchool(auth.requester, schoolId)) return jsonResponse({ error: "لا يمكن فحص مدرسة أخرى." }, 403);
    const { data, error } = await auth.adminClient.rpc("generate_due_notifications_internal", {
      p_mode: "overdue",
      p_school_id: schoolId,
      p_actor_id: auth.requester.id,
    });
    if (error) throw error;
    return jsonResponse(data);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "تعذر فحص المهام المتأخرة." }, 400);
  }
});
