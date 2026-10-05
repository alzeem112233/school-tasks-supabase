import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const generalAccountRoles = new Set([
  "superadmin",
  "general_manager",
  "branch_manager",
  "finance_manager",
  "development_supervision_manager",
  "general_secretary",
]);

export async function requireRequester(request: Request, allowedRoles: string[]) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorization = request.headers.get("Authorization") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase function secrets are incomplete.");
  if (!authorization) return { error: "المصادقة مطلوبة.", status: 401 } as const;

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return { error: "جلسة الدخول غير صالحة.", status: 401 } as const;

  const { data: requester, error: requesterError } = await adminClient
    .from("profiles")
    .select("id, role, school_id, status, full_name, email")
    .eq("id", authData.user.id)
    .single();
  if (requesterError || requester?.status !== "active" || !allowedRoles.includes(requester.role)) {
    return { error: "لا توجد صلاحية لتنفيذ هذه العملية.", status: 403 } as const;
  }
  return { adminClient, userClient, requester, authUser: authData.user } as const;
}

export function canAccessSchool(requester: { role: string; school_id: string }, schoolId: string) {
  return generalAccountRoles.has(requester.role) || requester.school_id === schoolId;
}
