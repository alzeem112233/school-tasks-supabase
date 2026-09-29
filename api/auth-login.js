import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey");
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    send(response, 204, {});
    return;
  }
  if (request.method !== "POST") {
    send(response, 405, { message: "Method not allowed" });
    return;
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    send(response, 500, { message: "Supabase configuration is missing." });
    return;
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let body = {};
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    send(response, 400, { message: "Invalid JSON body." });
    return;
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) {
    send(response, 400, { message: "Email and password are required." });
    return;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    send(response, error?.status || 401, { message: error?.message || "Invalid login credentials." });
    return;
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    send(response, 500, { message: profileError.message });
    return;
  }

  send(response, 200, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.user,
    profile,
  });
}
