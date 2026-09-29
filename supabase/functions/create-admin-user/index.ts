import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireRequester } from "../_shared/auth.ts";
import { adminAccountRoles, generalAccountRoles, generalSchoolId } from "../_shared/roles.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "الطريقة غير مدعومة." }, 405);
  let createdUserId = "";
  try {
    const auth = await requireRequester(request, ["general_manager"]);
    if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.name || "").trim();
    const role = String(body.role || "").trim();
    const requestedSchoolId = String(body.schoolId || "").trim();
    const schoolId = generalAccountRoles.has(role) ? generalSchoolId : requestedSchoolId;
    if (!email || !fullName || !schoolId || password.length < 8 || !adminAccountRoles.has(role)) {
      return jsonResponse({ error: "بيانات حساب الإدارة غير مكتملة أو غير صالحة." }, 400);
    }
    if (!generalAccountRoles.has(role) && schoolId === generalSchoolId) {
      return jsonResponse({ error: "اختر فرعًا لهذا الحساب. الإدارة العامة مخصصة لحسابات الإدارة العامة فقط." }, 400);
    }
    const { data: created, error: createError } = await auth.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: fullName },
    });
    if (createError || !created.user) throw createError || new Error("تعذر إنشاء هوية المستخدم.");
    createdUserId = created.user.id;
    const now = new Date().toISOString();
    const { error: profileError } = await auth.adminClient.from("profiles").upsert({
      id: createdUserId,
      school_id: schoolId,
      full_name: fullName,
      email,
      role,
      status: body.active === false ? "inactive" : "active",
      department_name: null,
      updated_at: now,
    }, { onConflict: "id" });
    if (profileError) throw profileError;
    const logResults = await Promise.all([
      auth.adminClient.from("activity_logs").insert({ school_id: schoolId, user_id: auth.requester.id, action: "user_created", entity_type: "profile", entity_id: createdUserId, details: { title: "تم إنشاء مستخدم إداري", description: `${email} (${role})` } }),
      auth.adminClient.from("audit_logs").insert({ school_id: schoolId, user_id: auth.requester.id, action: "user_created", severity: "critical", details: { targetType: "profile", targetId: createdUserId, message: `${email} (${role})` } }),
    ]);
    const logError = logResults.find((result) => result.error)?.error;
    if (logError) throw logError;
    return jsonResponse({ ok: true, id: createdUserId });
  } catch (error) {
    console.error(error);
    if (createdUserId) {
      const auth = await requireRequester(request, ["general_manager"]);
      if (!("error" in auth)) await auth.adminClient.auth.admin.deleteUser(createdUserId);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "تعذر إنشاء المستخدم الإداري." }, 400);
  }
});
