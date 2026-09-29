import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireRequester } from "../_shared/auth.ts";
import { isKnownRole } from "../_shared/roles.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "الطريقة غير مدعومة." }, 405);
  try {
    const auth = await requireRequester(request, ["general_manager", "school_principal"]);
    if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);
    const body = await request.json();
    const userId = String(body.id || "").trim();
    const nextRole = String(body.role || "").trim();
    if (!userId || !isKnownRole(nextRole)) return jsonResponse({ error: "الدور أو المستخدم غير صالح." }, 400);
    const { data, error } = await auth.adminClient.rpc("change_user_role_internal", {
      p_user_id: userId,
      p_role: nextRole,
      p_actor_id: auth.requester.id,
    });
    if (error) throw error;
    return jsonResponse(data);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "تعذر تغيير دور المستخدم." }, 400);
  }
});
