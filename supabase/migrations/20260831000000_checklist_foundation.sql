-- Case Checklist work-management layer.
-- New tables only; sits on top of existing DocketFlow cases / tracker / Slack / Dropbox.

CREATE TYPE public.checklist_stage AS ENUM (
  'intake',
  'investigation',
  'medical_billing',
  'subrogation',
  'demand',
  'petition_service',
  'discovery',
  'mediation',
  'trial',
  'settlement_close'
);

CREATE TYPE public.checklist_task_type AS ENUM (
  'deadline',
  'urgent_client',
  'urgent_task',
  'client_contact',
  'other_call',
  'todo'
);

CREATE TYPE public.checklist_task_status AS ENUM (
  'upcoming',
  'active',
  'completed',
  'skipped',
  'na'
);

CREATE TYPE public.checklist_owner_role AS ENUM (
  'paralegal',
  'legal_assistant',
  'attorney',
  'any'
);

CREATE TYPE public.checklist_event_type AS ENUM (
  'created',
  'note',
  'status_changed',
  'due_changed',
  'owner_changed',
  'type_changed',
  'reopened',
  'follow_up_created'
);

CREATE TABLE public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  case_type text NOT NULL DEFAULT 'personal_injury',
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  stage public.checklist_stage NOT NULL,
  default_type public.checklist_task_type NOT NULL DEFAULT 'todo',
  default_owner_role public.checklist_owner_role NOT NULL DEFAULT 'paralegal',
  sequence integer NOT NULL,
  default_due_rule text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.checklist_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role public.checklist_owner_role NOT NULL DEFAULT 'paralegal',
  staff_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.checklist_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  template_item_id uuid REFERENCES public.checklist_template_items(id) ON DELETE SET NULL,
  follow_up_of_task_id uuid REFERENCES public.checklist_tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  stage public.checklist_stage NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_name text,
  owner_role public.checklist_owner_role NOT NULL DEFAULT 'paralegal',
  status public.checklist_task_status NOT NULL DEFAULT 'upcoming',
  type public.checklist_task_type NOT NULL DEFAULT 'todo',
  due_at date,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  skip_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.checklist_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.checklist_tasks(id) ON DELETE CASCADE,
  event_type public.checklist_event_type NOT NULL,
  note text,
  old_value text,
  new_value text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX checklist_template_items_template_seq_idx
  ON public.checklist_template_items (template_id, sequence);

CREATE INDEX checklist_tasks_case_status_idx
  ON public.checklist_tasks (case_id, status);

CREATE INDEX checklist_tasks_queue_idx
  ON public.checklist_tasks (status, due_at, type)
  WHERE status = 'active';

CREATE INDEX checklist_tasks_owner_idx
  ON public.checklist_tasks (owner_id, status, due_at);

CREATE INDEX checklist_task_events_task_idx
  ON public.checklist_task_events (task_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.checklist_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER checklist_templates_updated_at
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.checklist_set_updated_at();

CREATE TRIGGER checklist_profiles_updated_at
  BEFORE UPDATE ON public.checklist_profiles
  FOR EACH ROW EXECUTE FUNCTION public.checklist_set_updated_at();

CREATE TRIGGER checklist_tasks_updated_at
  BEFORE UPDATE ON public.checklist_tasks
  FOR EACH ROW EXECUTE FUNCTION public.checklist_set_updated_at();

CREATE OR REPLACE FUNCTION public.checklist_log_task_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('checklist.skip_log', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.checklist_task_events (task_id, event_type, old_value, new_value, actor_id)
      VALUES (
        NEW.id,
        (CASE
          WHEN OLD.status = 'completed' AND NEW.status <> 'completed' THEN 'reopened'
          ELSE 'status_changed'
        END)::public.checklist_event_type,
        OLD.status::text,
        NEW.status::text,
        auth.uid()
      );
    END IF;
    IF OLD.due_at IS DISTINCT FROM NEW.due_at THEN
      INSERT INTO public.checklist_task_events (task_id, event_type, old_value, new_value, actor_id)
      VALUES (NEW.id, 'due_changed'::public.checklist_event_type, OLD.due_at::text, NEW.due_at::text, auth.uid());
    END IF;
    IF OLD.owner_name IS DISTINCT FROM NEW.owner_name OR OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
      INSERT INTO public.checklist_task_events (task_id, event_type, old_value, new_value, actor_id)
      VALUES (NEW.id, 'owner_changed'::public.checklist_event_type, OLD.owner_name, NEW.owner_name, auth.uid());
    END IF;
    IF OLD.type IS DISTINCT FROM NEW.type THEN
      INSERT INTO public.checklist_task_events (task_id, event_type, old_value, new_value, actor_id)
      VALUES (NEW.id, 'type_changed'::public.checklist_event_type, OLD.type::text, NEW.type::text, auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER checklist_tasks_log_change
  AFTER UPDATE ON public.checklist_tasks
  FOR EACH ROW EXECUTE FUNCTION public.checklist_log_task_change();

CREATE OR REPLACE FUNCTION public.checklist_stage_rank(p_stage public.checklist_stage)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_stage
    WHEN 'intake' THEN 1
    WHEN 'investigation' THEN 2
    WHEN 'medical_billing' THEN 3
    WHEN 'subrogation' THEN 4
    WHEN 'demand' THEN 5
    WHEN 'petition_service' THEN 6
    WHEN 'discovery' THEN 7
    WHEN 'mediation' THEN 8
    WHEN 'trial' THEN 9
    WHEN 'settlement_close' THEN 10
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.checklist_map_tracker_stage(p_stage text)
RETURNS public.checklist_stage
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_stage, 'intake'))
    WHEN 'intake' THEN 'intake'::public.checklist_stage
    WHEN 'treatment' THEN 'medical_billing'::public.checklist_stage
    WHEN 'demand' THEN 'demand'::public.checklist_stage
    WHEN 'litigation' THEN 'discovery'::public.checklist_stage
    WHEN 'lit' THEN 'discovery'::public.checklist_stage
    WHEN 'settlement' THEN 'settlement_close'::public.checklist_stage
    WHEN 'settled' THEN 'settlement_close'::public.checklist_stage
    WHEN 'disbursement' THEN 'settlement_close'::public.checklist_stage
    WHEN 'closed' THEN 'settlement_close'::public.checklist_stage
    WHEN 'disengaged' THEN 'settlement_close'::public.checklist_stage
    ELSE 'intake'::public.checklist_stage
  END;
$$;

CREATE OR REPLACE FUNCTION public.initialize_case_checklist(p_case_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_template_id uuid;
  v_tracker_stage text;
  v_current_stage public.checklist_stage;
  v_paralegal text;
  v_inserted integer := 0;
  v_hash integer;
  v_base_due date;
  v_active_count integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.checklist_tasks WHERE case_id = p_case_id) THEN
    RETURN 0;
  END IF;

  SELECT id INTO v_template_id
  FROM public.checklist_templates
  WHERE active
  ORDER BY version DESC, created_at DESC
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'No active checklist template';
  END IF;

  PERFORM set_config('checklist.skip_log', 'on', true);

  SELECT e.case_stage::text, e.paralegal_name
    INTO v_tracker_stage, v_paralegal
  FROM public.case_tracker_entries e
  JOIN public.cases c ON c.case_number = e.case_number
  WHERE c.id = p_case_id AND e.is_active
  ORDER BY e.updated_at DESC
  LIMIT 1;

  v_current_stage := public.checklist_map_tracker_stage(v_tracker_stage);
  v_hash := abs(hashtext(p_case_id::text));
  v_base_due := current_date + ((v_hash % 8) - 2);

  INSERT INTO public.checklist_tasks (
    case_id, template_item_id, title, stage, sequence,
    owner_name, owner_role, status, type, due_at, completed_at
  )
  SELECT
    p_case_id,
    i.id,
    i.title,
    i.stage,
    i.sequence,
    v_paralegal,
    i.default_owner_role,
    CASE
      WHEN public.checklist_stage_rank(i.stage) < public.checklist_stage_rank(v_current_stage)
        THEN 'completed'::public.checklist_task_status
      WHEN i.stage = v_current_stage AND i.sequence = (
        SELECT MIN(i2.sequence)
        FROM public.checklist_template_items i2
        WHERE i2.template_id = i.template_id AND i2.stage = v_current_stage
      ) THEN 'active'::public.checklist_task_status
      ELSE 'upcoming'::public.checklist_task_status
    END,
    i.default_type,
    CASE
      WHEN public.checklist_stage_rank(i.stage) < public.checklist_stage_rank(v_current_stage)
        THEN NULL
      WHEN i.stage = v_current_stage AND i.sequence = (
        SELECT MIN(i2.sequence)
        FROM public.checklist_template_items i2
        WHERE i2.template_id = i.template_id AND i2.stage = v_current_stage
      ) THEN v_base_due
      ELSE NULL
    END,
    CASE
      WHEN public.checklist_stage_rank(i.stage) < public.checklist_stage_rank(v_current_stage)
        THEN now() - (((i.sequence % 20) + 1) || ' days')::interval
      ELSE NULL
    END
  FROM public.checklist_template_items i
  WHERE i.template_id = v_template_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Activate one more current-stage item (deadline or client contact) as "next".
  UPDATE public.checklist_tasks t
  SET
    status = 'active',
    due_at = v_base_due + CASE t.type
      WHEN 'deadline' THEN 3
      WHEN 'urgent_client' THEN 0
      WHEN 'urgent_task' THEN 1
      WHEN 'client_contact' THEN 2
      WHEN 'other_call' THEN 2
      ELSE 5
    END
  WHERE t.id = (
    SELECT t2.id
    FROM public.checklist_tasks t2
    WHERE t2.case_id = p_case_id
      AND t2.stage = v_current_stage
      AND t2.status = 'upcoming'
      AND t2.type IN ('deadline', 'urgent_client', 'client_contact', 'other_call')
    ORDER BY
      CASE t2.type
        WHEN 'deadline' THEN 1
        WHEN 'urgent_client' THEN 2
        WHEN 'client_contact' THEN 3
        ELSE 4
      END,
      t2.sequence
    LIMIT 1
  );

  SELECT COUNT(*) INTO v_active_count
  FROM public.checklist_tasks
  WHERE case_id = p_case_id AND status = 'active';

  -- If the mapped stage has no items for some reason, activate the first upcoming task.
  IF v_active_count = 0 THEN
    UPDATE public.checklist_tasks t
    SET status = 'active', due_at = v_base_due
    WHERE t.id = (
      SELECT t2.id
      FROM public.checklist_tasks t2
      WHERE t2.case_id = p_case_id AND t2.status = 'upcoming'
      ORDER BY public.checklist_stage_rank(t2.stage), t2.sequence
      LIMIT 1
    );
  END IF;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE VIEW public.checklist_case_overview
WITH (security_invoker = true) AS
SELECT
  c.id AS case_id,
  c.case_number,
  c.client_name,
  c.case_type,
  c.status AS case_status,
  coalesce(te.case_stage::text, 'Intake') AS litigation_status,
  public.checklist_map_tracker_stage(te.case_stage::text) AS stage,
  te.paralegal_name,
  te.attorney_name,
  sc.slack_channel_id,
  sc.slack_channel_name,
  df.dropbox_case_path,
  nxt.id AS next_task_id,
  nxt.title AS next_action,
  nxt.due_at AS next_due_at,
  nxt.type AS next_type,
  nxt.status AS next_status,
  nxt.owner_name AS next_owner_name,
  CASE
    WHEN nxt.id IS NULL THEN 'needs_plan'
    WHEN nxt.due_at < current_date THEN 'overdue'
    WHEN nxt.type = 'deadline' AND nxt.due_at <= current_date + 3 THEN 'deadline'
    WHEN nxt.type IN ('urgent_client', 'urgent_task') THEN 'urgent'
    ELSE 'on_track'
  END AS risk,
  (
    SELECT COUNT(*)
    FROM public.checklist_tasks ct
    WHERE ct.case_id = c.id AND ct.status = 'active' AND ct.due_at < current_date
  ) AS overdue_count,
  (
    SELECT COUNT(*)
    FROM public.checklist_tasks ct
    WHERE ct.case_id = c.id AND ct.status = 'completed'
  ) AS completed_count,
  (
    SELECT COUNT(*)
    FROM public.checklist_tasks ct
    WHERE ct.case_id = c.id
  ) AS task_count
FROM public.cases c
LEFT JOIN LATERAL (
  SELECT e.case_stage, e.paralegal_name, e.attorney_name
  FROM public.case_tracker_entries e
  WHERE e.case_number = c.case_number AND e.is_active
  ORDER BY e.updated_at DESC
  LIMIT 1
) te ON true
LEFT JOIN LATERAL (
  SELECT s.slack_channel_id, s.slack_channel_name
  FROM public.case_slack_channels s
  WHERE s.case_number = c.case_number
  ORDER BY s.updated_at DESC
  LIMIT 1
) sc ON true
LEFT JOIN LATERAL (
  SELECT regexp_replace(f.dropbox_path, '^(/[^/]+/[^/]+).*$', '\1') AS dropbox_case_path
  FROM public.case_folders f
  WHERE f.case_number = c.case_number
  ORDER BY length(f.dropbox_path)
  LIMIT 1
) df ON true
LEFT JOIN LATERAL (
  SELECT t.id, t.title, t.due_at, t.type, t.status, t.owner_name
  FROM public.checklist_tasks t
  WHERE t.case_id = c.id AND t.status = 'active'
  ORDER BY
    CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
    t.due_at,
    CASE t.type
      WHEN 'deadline' THEN 1
      WHEN 'urgent_client' THEN 2
      WHEN 'urgent_task' THEN 3
      WHEN 'client_contact' THEN 4
      WHEN 'other_call' THEN 5
      ELSE 6
    END,
    t.sequence
  LIMIT 1
) nxt ON true;

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_task_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY checklist_templates_select ON public.checklist_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY checklist_templates_write ON public.checklist_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY checklist_template_items_select ON public.checklist_template_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY checklist_template_items_write ON public.checklist_template_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY checklist_profiles_select ON public.checklist_profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY checklist_profiles_insert ON public.checklist_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY checklist_profiles_update ON public.checklist_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY checklist_tasks_select ON public.checklist_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY checklist_tasks_write ON public.checklist_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY checklist_task_events_select ON public.checklist_task_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY checklist_task_events_insert ON public.checklist_task_events
  FOR INSERT TO authenticated WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_template_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_tasks TO authenticated;
GRANT SELECT, INSERT ON public.checklist_task_events TO authenticated;
GRANT SELECT ON public.checklist_case_overview TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_case_checklist(uuid) TO authenticated;
