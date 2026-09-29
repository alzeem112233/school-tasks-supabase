import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireRequester } from "../_shared/auth.ts";
import { roles } from "../_shared/roles.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "الطريقة غير مدعومة." }, 405);
  try {
    const auth = await requireRequester(request, [...roles]);
    if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);
    const userAgent = request.headers.get("User-Agent") || "";
    const forwardedFor = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || null;
    const [activityResult, auditResult] = await Promise.all([
      auth.adminClient.from("activity_logs").insert({
        school_id: auth.requester.school_id,
        user_id: auth.requester.id,
        action: "login",
        entity_type: "session",
        entity_id: auth.requester.id,
        details: { title: "تم تسجيل الدخول", description: auth.requester.email },
      }),
      auth.adminClient.from("audit_logs").insert({
        school_id: auth.requester.school_id,
        user_id: auth.requester.id,
        action: "login",
        severity: "info",
        ip_address: forwardedFor,
        user_agent: userAgent.slice(0, 1000),
        details: { targetType: "session", targetId: auth.requester.id, message: "Successful sign-in" },
      }),
    ]);
    if (activityResult.error) throw activityResult.error;
    if (auditResult.error) throw auditResult.error;
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "تعذر تسجيل حدث الدخول." }, 400);
  }
});
