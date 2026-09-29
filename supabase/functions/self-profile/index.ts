import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "الطريقة غير مدعومة." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorization = request.headers.get("Authorization") ?? "";

  try {
    if (!authorization) return jsonResponse({ error: "المصادقة مطلوبة." }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "جلسة الدخول غير صالحة." }, 401);

    const { data: requester, error: requesterError } = await adminClient
      .from("profiles")
      .select("id, full_name, email, role, school_id, status, avatar_url")
      .eq("id", authData.user.id)
      .single();
    if (requesterError || requester?.status !== "active") {
      return jsonResponse({ error: "الحساب غير نشط أو غير موجود." }, 403);
    }

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "").trim();
    const avatarUrl = String(body.avatarUrl ?? "").trim();
    if (!name) return jsonResponse({ error: "الاسم مطلوب." }, 400);
    if (password && password.length < 6) return jsonResponse({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف." }, 400);

    const profileUpdate: Record<string, unknown> = {
      full_name: name,
      updated_at: new Date().toISOString(),
    };
    if (avatarUrl) profileUpdate.avatar_url = avatarUrl;

    const authAttributes: Record<string, unknown> = { user_metadata: { name } };
    if (password) authAttributes.password = password;
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(requester.id, authAttributes);
    if (authUpdateError) throw authUpdateError;

    const { error: profileUpdateError } = await adminClient.from("profiles").update(profileUpdate).eq("id", requester.id);
    if (profileUpdateError) throw profileUpdateError;

    const changes: string[] = [];
    if (requester.full_name !== name) changes.push("تعديل الاسم");
    if (avatarUrl && requester.avatar_url !== avatarUrl) changes.push("تحديث الصورة الشخصية");
    if (password) changes.push("تغيير كلمة المرور");
    if (!changes.length) changes.push("تحديث الملف الشخصي");

    const now = new Date().toISOString();
    await Promise.all([
      adminClient.from("activity_logs").insert({
        school_id: requester.school_id,
        user_id: requester.id,
        action: "self_profile_updated",
        entity_type: "profile",
        entity_id: requester.id,
        details: { title: "تم تحديث الملف الشخصي", description: changes.join(" | ") },
      }),
      adminClient.from("audit_logs").insert({
        school_id: requester.school_id,
        user_id: requester.id,
        action: "self_profile_updated",
        severity: password ? "high" : "medium",
        details: { targetType: "profile", targetId: requester.id, message: changes.join(" | ") },
      }),
    ]);

    const { data: managers, error: managerError } = await adminClient
      .from("profiles")
      .select("id, school_id")
      .eq("role", "general_manager")
      .eq("status", "active");
    if (managerError) console.error("General manager lookup failed", managerError);
    const recipients = (managerError ? [] : managers ?? []).filter((manager) => manager.id !== requester.id);
    if (recipients.length) {
      const { error: notificationError } = await adminClient.from("notifications").insert(
        recipients.map((manager) => ({
          user_id: manager.id,
          school_id: manager.school_id || requester.school_id,
          title: "تنبيه إداري: تحديث ملف شخصي",
          message: `${name} (${requester.email}) | ${changes.join(" | ")}`,
          type: "admin_alert",
          dedupe_key: `self-profile:${requester.id}:${now}`,
        })),
      );
      if (notificationError) console.error("Profile notification failed", notificationError);
    }

    return jsonResponse({ ok: true, id: requester.id, avatarUrl: avatarUrl || requester.avatar_url || "" });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "تعذر تحديث الملف الشخصي." }, 400);
  }
});
