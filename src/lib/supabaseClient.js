import { createClient } from "@supabase/supabase-js";

const env = import.meta.env || {};

export const supabaseUrl = String(env.VITE_SUPABASE_URL || "").trim();
export const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY || "").trim();

export function isSupabaseConfigured() {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl),
  );
}

export const supabaseClient = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export default supabaseClient;
