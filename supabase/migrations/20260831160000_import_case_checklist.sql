-- Import a template onto a case as upcoming tasks. Do not auto-seed the docket.

CREATE OR REPLACE FUNCTION public.initialize_case_checklist(p_case_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN 0;
END;
$$;

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
    owner_name, owner_role, status, type
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
    i.default_type
  FROM public.checklist_template_items i
  WHERE i.template_id = p_template_id
  ORDER BY i.sequence;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_case_checklist(uuid, uuid) TO authenticated;
