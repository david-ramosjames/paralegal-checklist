CREATE OR REPLACE FUNCTION public.checklist_sync_owners_on_paralegal_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_old_name text;
BEGIN
  IF NOT NEW.is_active OR NULLIF(btrim(NEW.paralegal_name), '') IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.is_active
    AND OLD.paralegal_name IS NOT DISTINCT FROM NEW.paralegal_name THEN
    RETURN NEW;
  END IF;

  v_old_name := CASE WHEN TG_OP = 'UPDATE' THEN OLD.paralegal_name ELSE NULL END;

  UPDATE public.checklist_tasks t
  SET
    owner_name = NEW.paralegal_name,
    additional_owners = ARRAY(
      SELECT DISTINCT x
      FROM unnest(COALESCE(t.additional_owners, ARRAY[]::text[])) AS x
      WHERE NULLIF(btrim(x), '') IS NOT NULL
        AND x IS DISTINCT FROM NEW.paralegal_name
        AND x IS DISTINCT FROM v_old_name
    )
  FROM public.cases c
  WHERE c.id = t.case_id
    AND c.case_number = NEW.case_number
    AND t.status IN ('active', 'upcoming');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS checklist_sync_owners_on_paralegal_change ON public.case_tracker_entries;
CREATE TRIGGER checklist_sync_owners_on_paralegal_change
  AFTER INSERT OR UPDATE OF paralegal_name, is_active
  ON public.case_tracker_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.checklist_sync_owners_on_paralegal_change();
