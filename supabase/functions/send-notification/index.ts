import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { canAccessSchool, requireRequester } from "../_shared/auth.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "الطريقة غير مدعومة." }, 405);
  try {
    const auth = await requireRequester(request, ["general_manager", "school_principal"]);
    if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);
    const body = await request.json();
    const userId = String(body.userId || "").trim();
    const title = String(body.title || "").trim().slice(0, 160);
    const message = String(body.message || "").trim().slice(0, 2000);
    const type = String(body.type || "general").trim().slice(0, 80);
    if (!userId || !title || !message) return jsonResponse({ error: "بيانات التنبيه غير مكتملة." }, 400);
    const { data: target, error: targetError } = await auth.adminClient
      .from("profiles")
      .select("id, school_id, status")
      .eq("id", userId)
      .single();
    if (targetError || !target || target.status !== "active") return jsonResponse({ error: "المستخدم المستهدف غير متاح." }, 404);
    if (!canAccessSchool(auth.requester, target.school_id)) return jsonResponse({ error: "لا يمكن إرسال تنبيه إلى مدرسة أخرى." }, 403);
    const taskId = String(body.taskId || "").trim();
    if (taskId) {
      const { data: task, error: taskError } = await auth.adminClient.from("tasks").select("id, school_id").eq("id", taskId).single();
      if (taskError || !task || task.school_id !== target.school_id) return jsonResponse({ error: "المهمة المرتبطة لا تتبع مدرسة المستلم." }, 400);
    }
    const { data, error } = await auth.adminClient.from("notifications").insert({
      school_id: target.school_id,
      user_id: target.id,
      title,
      message,
      type,
      related_task_id: taskId || null,
      dedupe_key: String(body.dedupeKey || `manual:${crypto.randomUUID()}`),
    }).select("id").single();
    if (error) throw error;
    const { error: auditError } = await auth.adminClient.from("audit_logs").insert({
      school_id: target.school_id,
      user_id: auth.requester.id,
      action: "notification_sent",
      severity: "medium",
      details: { targetType: "profile", targetId: target.id, message: title, notificationId: data.id },
    });
    if (auditError) console.error("Notification audit failed", auditError);
    return jsonResponse({ ok: true, id: data.id });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "تعذر إرسال التنبيه." }, 400);
  }
});
