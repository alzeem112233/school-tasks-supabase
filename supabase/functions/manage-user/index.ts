import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { canAssignUserRole, canCreateUsers, generalAccountRoles, generalSchoolId, isHigherRole, isKnownRole, roleLabels } from "../_shared/roles.ts";

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
      .select("id, role, school_id, status, access_flags")
      .eq("id", authData.user.id)
      .single();
    const requesterCanCreateUsers = canCreateUsers(requester?.role ?? "") || requester?.access_flags?.createUser === true;
    if (requesterError || requester?.status !== "active" || !requesterCanCreateUsers) {
      return jsonResponse({ error: "هذه العملية متاحة للمسؤولين فقط." }, 403);
    }

    const body = await request.json();
    const id = String(body.id ?? "").trim();
    const action = body.action === "delete" || body.active === false ? "delete" : "save";

    if (action === "delete") {
      if (!id) return jsonResponse({ error: "معرف المستخدم مطلوب للحذف." }, 400);
      if (id === requester.id) return jsonResponse({ error: "لا يمكنك حذف حسابك الحالي." }, 400);

      const existingResult = await adminClient.from("profiles").select("*").eq("id", id).single();
      if (existingResult.error || !existingResult.data) return jsonResponse({ error: "تعذر العثور على المستخدم المطلوب." }, 404);
      const existing = existingResult.data;
      if (requester.role !== "general_manager" && (existing.school_id !== requester.school_id || !isHigherRole(requester.role, String(existing.role)))) {
        return jsonResponse({ error: "لا توجد صلاحية لحذف هذا المستخدم." }, 403);
      }

      const now = new Date().toISOString();
      await Promise.all([
        adminClient.from("activity_logs").insert({
          school_id: existing.school_id,
          user_id: requester.id,
          action: "user_deleted",
          entity_type: "profile",
          entity_id: id,
          details: { title: "تم حذف مستخدم نهائيًا", description: `${existing.email} (${existing.role})` },
        }),
        adminClient.from("audit_logs").insert({
          school_id: existing.school_id,
          user_id: requester.id,
          action: "user_deleted",
          severity: "high",
          details: { targetType: "profile", targetId: id, message: `${existing.email} (${existing.role})`, deletedAt: now },
        }),
      ]);

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(id);
      if (deleteError) throw deleteError;
      return jsonResponse({ ok: true, id, deleted: true });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "").trim();
    const name = String(body.name ?? "").trim();
    const role = String(body.role ?? "").trim();
    const requestedSchoolId = String(body.schoolId ?? "").trim();
    const active = true;
    const accessFlags = typeof body.accessFlags === "object" && body.accessFlags !== null ? body.accessFlags : {};
    const linkedSchoolIds = Array.isArray(body.linkedSchoolIds)
      ? [...new Set(body.linkedSchoolIds.map((item) => String(item ?? "").trim()).filter(Boolean))]
      : [];
    const schoolId = generalAccountRoles.has(role) ? generalSchoolId : role === "tracker" ? (requestedSchoolId || linkedSchoolIds[0] || "") : requestedSchoolId;

    if (!name || !email || !schoolId || !isKnownRole(role)) return jsonResponse({ error: "بيانات المستخدم غير مكتملة أو غير صالحة." }, 400);
    if (!generalAccountRoles.has(role) && schoolId === generalSchoolId) {
      return jsonResponse({ error: "اختر فرعًا للموظف. الإدارة العامة مخصصة لحسابات الإدارة العامة فقط." }, 400);
    }
    if (role === "tracker" && !linkedSchoolIds.length) {
      return jsonResponse({ error: "اختر فرعًا واحدًا على الأقل لحساب المتعقب." }, 400);
    }
    if (role === "tracker" && requester.role !== "general_manager") {
      return jsonResponse({ error: "حساب المتعقب لا يمكن إنشاؤه أو تعديله إلا من المدير العام." }, 403);
    }
    if (!id && password.length < 6) return jsonResponse({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف." }, 400);
    if (id && password && password.length < 6) return jsonResponse({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف." }, 400);
    if (requester.role !== "general_manager" && schoolId !== requester.school_id) {
      return jsonResponse({ error: "مدير المدرسة يدير مستخدمي مدرسته فقط." }, 403);
    }
    if (id === requester.id && !active) return jsonResponse({ error: "لا يمكنك تعطيل حسابك الحالي." }, 400);

    let existing: Record<string, unknown> | null = null;
    if (id) {
      const existingResult = await adminClient.from("profiles").select("*").eq("id", id).single();
      if (existingResult.error || !existingResult.data) return jsonResponse({ error: "تعذر العثور على المستخدم المطلوب." }, 404);
      existing = existingResult.data;
      const existingRole = String(existing.role);
      const computerUnitCanEditExisting = requester.role === "computer_unit"
        && existing.school_id === requester.school_id
        && !["general_manager", "school_principal", "tracker"].includes(existingRole);
      if (requester.role !== "general_manager" && !computerUnitCanEditExisting && (existing.school_id !== requester.school_id || !isHigherRole(requester.role, existingRole))) {
        return jsonResponse({ error: "لا توجد صلاحية لتعديل هذا المستخدم." }, 403);
      }
      const canComputerUnitChangePassword = password && requester.role === "computer_unit"
        && existing.school_id === requester.school_id
        && !["general_manager", "school_principal", "tracker"].includes(existingRole);
      if (password && requester.role !== "general_manager" && !canComputerUnitChangePassword) {
        return jsonResponse({ error: "لا توجد صلاحية لتغيير كلمة مرور هذا المستخدم." }, 403);
      }
      const canAssignRequestedRole = canAssignUserRole(requester.role, role, existingRole) || (requester?.access_flags?.createUser === true && !["general_manager", "school_principal", "tracker"].includes(role));
      if (!canAssignRequestedRole) {
        return jsonResponse({ error: "لا توجد صلاحية لتعيين هذا الدور." }, 403);
      }
      if (existing.school_id !== schoolId) {
        const { count, error: taskReferenceError } = await adminClient
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .or(`assigned_to.eq.${id},created_by.eq.${id}`);
        if (taskReferenceError) throw taskReferenceError;
        if ((count ?? 0) > 0) return jsonResponse({ error: "لا يمكن نقل المستخدم إلى مدرسة أخرى قبل إعادة إسناد مهامه." }, 409);
      }
    }

    const canAssignNewRole = canAssignUserRole(requester.role, role) || (requester?.access_flags?.createUser === true && !["general_manager", "school_principal", "tracker"].includes(role));
    if (!existing && !canAssignNewRole) {
      return jsonResponse({ error: "لا توجد صلاحية لتعيين هذا الدور." }, 403);
    }

    let targetId = id;
    let createdAuthUser = false;
    if (!targetId) {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      if (error) throw error;
      targetId = data.user.id;
      createdAuthUser = true;
    } else {
      const attributes: Record<string, unknown> = { email, user_metadata: { name }, ban_duration: "none" };
      if (password) attributes.password = password;
      const { error } = await adminClient.auth.admin.updateUserById(targetId, attributes);
      if (error) throw error;
    }

    const now = new Date().toISOString();
    const profile = {
      id: targetId,
      full_name: name,
      email,
      role,
      school_id: schoolId,
      linked_school_ids: role === "tracker" ? linkedSchoolIds : [],
      department_name: null,
      access_flags: accessFlags,
      status: "active",
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    const { error: profileError } = await adminClient.from("profiles").upsert(profile, { onConflict: "id" });
    if (profileError) {
      if (createdAuthUser) await adminClient.auth.admin.deleteUser(targetId);
      throw profileError;
    }

    const eventType = existing ? "user_updated" : "user_created";
    await Promise.all([
      adminClient.from("activity_logs").insert({
        school_id: schoolId,
        user_id: requester.id,
        action: eventType,
        entity_type: "profile",
        entity_id: targetId,
        details: { title: existing ? "تم تحديث مستخدم" : "تم إنشاء مستخدم", description: `${email} (${role})` },
      }),
      adminClient.from("audit_logs").insert({
        school_id: schoolId,
        user_id: requester.id,
        action: eventType,
        severity: "high",
        details: { targetType: "profile", targetId, message: `${email} (${role})` },
      }),
    ]);

    const roleChanged = existing && existing.role !== role;
    const schoolChanged = existing && existing.school_id !== schoolId;
    const accessChanged = existing && (existing.status === "active") !== active;
    const passwordChanged = existing && Boolean(password);
    const changes: string[] = [];
    if (existing && (roleChanged || schoolChanged || accessChanged || passwordChanged)) {
      if (roleChanged) changes.push(`تم تغيير الدور إلى ${roleLabels[role] ?? role}`);
      if (schoolChanged) changes.push(`تم تغيير المدرسة إلى ${schoolId}`);
      if (accessChanged) changes.push(active ? "تمت إعادة تفعيل الحساب" : "تم تعطيل الحساب");
      if (passwordChanged) changes.push("تم تغيير كلمة المرور");
      const { error: targetNotificationError } = await adminClient.from("notifications").insert({
        user_id: targetId,
        school_id: schoolId,
        title: roleChanged ? "تم تحديث دورك" : "تم تحديث صلاحيات الوصول",
        message: changes.join(" | "),
        type: roleChanged ? "role_changed" : "access_changed",
        dedupe_key: `role-change:${targetId}:${role}:${schoolId}:${active}:${now}`,
      });
      if (targetNotificationError) console.error("Target user notification failed", targetNotificationError);
    }

    if (!existing) changes.push(`تم إنشاء الحساب بالدور ${roleLabels[role] ?? role}`);
    if (existing && !changes.length) changes.push("تم تحديث بيانات الحساب");

    const relevantSchoolIds = [...new Set([schoolId, String(existing?.school_id ?? "")].filter(Boolean))];
    const [schoolAdminResult, superAdminResult] = await Promise.all([
      adminClient
        .from("profiles")
        .select("id")
        .in("school_id", relevantSchoolIds)
        .in("role", ["school_principal", "deputy_principal"])
        .eq("status", "active"),
      adminClient
        .from("profiles")
        .select("id")
        .eq("role", "general_manager")
        .eq("status", "active"),
    ]);
    if (schoolAdminResult.error) console.error("School administrator lookup failed", schoolAdminResult.error);
    if (superAdminResult.error) console.error("Super administrator lookup failed", superAdminResult.error);
    const administratorIds = [...new Set([
      ...(schoolAdminResult.error ? [] : schoolAdminResult.data ?? []).map((item) => item.id),
      ...(superAdminResult.error ? [] : superAdminResult.data ?? []).map((item) => item.id),
    ])].filter((recipientId) => recipientId !== requester.id && recipientId !== targetId);
    if (administratorIds.length) {
      const { error: adminAlertError } = await adminClient.from("notifications").insert(
        administratorIds.map((recipientId) => ({
          user_id: recipientId,
          school_id: schoolId,
          title: existing ? "تنبيه إداري: تحديث مستخدم" : "تنبيه إداري: مستخدم جديد",
          message: `${name} (${email}) | ${changes.join(" | ")}`,
          type: "admin_alert",
          dedupe_key: `admin-user-event:${targetId}:${eventType}:${now}`,
        })),
      );
      if (adminAlertError) console.error("Administrator notification failed", adminAlertError);
    }

    return jsonResponse({ ok: true, id: targetId });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "تعذر حفظ المستخدم." }, 400);
  }
});
