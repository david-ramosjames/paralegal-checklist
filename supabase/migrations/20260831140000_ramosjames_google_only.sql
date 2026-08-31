-- Firm Google accounts only. auth.users cannot be triggered from this role,
-- so enforce on checklist tables via JWT email + Google provider.

CREATE OR REPLACE FUNCTION public.is_ramosjames_google_user()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 2) = 'ramosjames.com'
    AND coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google';
$$;

REVOKE ALL ON FUNCTION public.is_ramosjames_google_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ramosjames_google_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.hook_restrict_signup_ramosjames(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  email text;
BEGIN
  email := lower(coalesce(event->'user'->>'email', ''));
  IF split_part(email, '@', 2) <> 'ramosjames.com' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Only @ramosjames.com Google accounts can sign in.'
      )
    );
  END IF;
  RETURN '{}'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hook_restrict_signup_ramosjames(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_restrict_signup_ramosjames(jsonb) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS checklist_templates_select ON public.checklist_templates;
DROP POLICY IF EXISTS checklist_templates_write ON public.checklist_templates;
CREATE POLICY checklist_templates_select ON public.checklist_templates
  FOR SELECT TO authenticated USING (public.is_ramosjames_google_user());
CREATE POLICY checklist_templates_write ON public.checklist_templates
  FOR ALL TO authenticated
  USING (public.is_ramosjames_google_user())
  WITH CHECK (public.is_ramosjames_google_user());

DROP POLICY IF EXISTS checklist_template_items_select ON public.checklist_template_items;
DROP POLICY IF EXISTS checklist_template_items_write ON public.checklist_template_items;
CREATE POLICY checklist_template_items_select ON public.checklist_template_items
  FOR SELECT TO authenticated USING (public.is_ramosjames_google_user());
CREATE POLICY checklist_template_items_write ON public.checklist_template_items
  FOR ALL TO authenticated
  USING (public.is_ramosjames_google_user())
  WITH CHECK (public.is_ramosjames_google_user());

DROP POLICY IF EXISTS checklist_profiles_select ON public.checklist_profiles;
DROP POLICY IF EXISTS checklist_profiles_insert ON public.checklist_profiles;
DROP POLICY IF EXISTS checklist_profiles_update ON public.checklist_profiles;
CREATE POLICY checklist_profiles_select ON public.checklist_profiles
  FOR SELECT TO authenticated USING (public.is_ramosjames_google_user());
CREATE POLICY checklist_profiles_insert ON public.checklist_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_ramosjames_google_user());
CREATE POLICY checklist_profiles_update ON public.checklist_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_ramosjames_google_user())
  WITH CHECK (user_id = auth.uid() AND public.is_ramosjames_google_user());

DROP POLICY IF EXISTS checklist_tasks_select ON public.checklist_tasks;
DROP POLICY IF EXISTS checklist_tasks_write ON public.checklist_tasks;
CREATE POLICY checklist_tasks_select ON public.checklist_tasks
  FOR SELECT TO authenticated USING (public.is_ramosjames_google_user());
CREATE POLICY checklist_tasks_write ON public.checklist_tasks
  FOR ALL TO authenticated
  USING (public.is_ramosjames_google_user())
  WITH CHECK (public.is_ramosjames_google_user());

DROP POLICY IF EXISTS checklist_task_events_select ON public.checklist_task_events;
DROP POLICY IF EXISTS checklist_task_events_insert ON public.checklist_task_events;
CREATE POLICY checklist_task_events_select ON public.checklist_task_events
  FOR SELECT TO authenticated USING (public.is_ramosjames_google_user());
CREATE POLICY checklist_task_events_insert ON public.checklist_task_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ramosjames_google_user());
