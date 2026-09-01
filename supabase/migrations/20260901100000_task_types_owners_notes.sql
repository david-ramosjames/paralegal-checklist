ALTER TABLE public.checklist_tasks
  ADD COLUMN IF NOT EXISTS types public.checklist_task_type[] NOT NULL DEFAULT ARRAY['todo'::public.checklist_task_type],
  ADD COLUMN IF NOT EXISTS additional_owners text[] NOT NULL DEFAULT '{}';

UPDATE public.checklist_tasks
SET types = ARRAY[type]
WHERE types IS NULL OR types = ARRAY['todo'::public.checklist_task_type] AND type IS DISTINCT FROM 'todo';

UPDATE public.checklist_tasks
SET types = ARRAY[type]
WHERE cardinality(types) = 1 AND types[1] IS DISTINCT FROM type;

CREATE OR REPLACE FUNCTION public.checklist_sync_primary_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.types IS NULL OR cardinality(NEW.types) = 0 THEN
    NEW.types := ARRAY[COALESCE(NEW.type, 'todo'::public.checklist_task_type)];
  END IF;
  NEW.type := COALESCE(
    (
      SELECT x
      FROM unnest(ARRAY[
        'deadline'::public.checklist_task_type,
        'urgent_client'::public.checklist_task_type,
        'urgent_task'::public.checklist_task_type,
        'client_contact'::public.checklist_task_type,
        'other_call'::public.checklist_task_type,
        'todo'::public.checklist_task_type
      ]) AS x
      WHERE x = ANY (NEW.types)
      LIMIT 1
    ),
    'todo'::public.checklist_task_type
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS checklist_tasks_sync_primary_type ON public.checklist_tasks;
CREATE TRIGGER checklist_tasks_sync_primary_type
  BEFORE INSERT OR UPDATE OF types, type ON public.checklist_tasks
  FOR EACH ROW EXECUTE FUNCTION public.checklist_sync_primary_type();

CREATE TABLE IF NOT EXISTS public.checklist_task_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.checklist_tasks(id) ON DELETE CASCADE,
  body text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checklist_task_notes_task_idx
  ON public.checklist_task_notes (task_id, created_at);

INSERT INTO public.checklist_task_notes (task_id, body, actor_id, actor_name, created_at)
SELECT task_id, note, actor_id, actor_name, created_at
FROM public.checklist_task_events
WHERE event_type = 'note' AND note IS NOT NULL AND note <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.checklist_task_notes n
    WHERE n.task_id = checklist_task_events.task_id
      AND n.body = checklist_task_events.note
      AND n.created_at = checklist_task_events.created_at
  );

ALTER TABLE public.checklist_task_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_task_notes_select ON public.checklist_task_notes;
DROP POLICY IF EXISTS checklist_task_notes_insert ON public.checklist_task_notes;
CREATE POLICY checklist_task_notes_select ON public.checklist_task_notes
  FOR SELECT TO authenticated USING (public.is_ramosjames_google_user());
CREATE POLICY checklist_task_notes_insert ON public.checklist_task_notes
  FOR INSERT TO authenticated WITH CHECK (public.is_ramosjames_google_user());

GRANT SELECT, INSERT ON public.checklist_task_notes TO authenticated;

CREATE OR REPLACE FUNCTION public.import_case_checklist(p_case_id uuid, p_template_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_paralegal text;
  v_inserted integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.checklist_tasks WHERE case_id = p_case_id) THEN
    RAISE EXCEPTION 'This case already has a checklist';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.checklist_templates WHERE id = p_template_id AND active) THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  SELECT e.paralegal_name INTO v_paralegal
  FROM public.case_tracker_entries e
  JOIN public.cases c ON c.case_number = e.case_number
  WHERE c.id = p_case_id AND e.is_active
  ORDER BY e.updated_at DESC
  LIMIT 1;

  INSERT INTO public.checklist_tasks (
    case_id, template_item_id, title, stage, sequence,
    owner_name, owner_role, status, type, types
  )
  SELECT
    p_case_id,
    i.id,
    i.title,
    i.stage,
    i.sequence,
    v_paralegal,
    i.default_owner_role,
    'upcoming'::public.checklist_task_status,
    i.default_type,
    ARRAY[i.default_type]
  FROM public.checklist_template_items i
  WHERE i.template_id = p_template_id
  ORDER BY i.sequence;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;
