-- Safer Supabase advisor hardening.
-- This migration avoids broad function EXECUTE revokes and focuses on low-risk advisor fixes.

alter table public.password_reset_otps enable row level security;
alter table public.qz_app_sessions enable row level security;

drop policy if exists password_reset_otps_no_client_access on public.password_reset_otps;
create policy password_reset_otps_no_client_access
on public.password_reset_otps
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists qz_app_sessions_no_client_access on public.qz_app_sessions;
create policy qz_app_sessions_no_client_access
on public.qz_app_sessions
for all
to anon, authenticated
using (false)
with check (false);

alter function public.qz_role_key(text) set search_path = public, pg_temp;
alter function public.qz_normalize_phone(text) set search_path = public, pg_temp;
alter function public.qz_prepare_platform_account_phone() set search_path = public, pg_temp;
alter function public.qz_prepare_registration_request_phone() set search_path = public, pg_temp;
alter function public.qz_header(text) set search_path = public, pg_temp;
