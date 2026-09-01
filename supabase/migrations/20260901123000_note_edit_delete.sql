ALTER TABLE public.checklist_task_notes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.checklist_task_notes
SET updated_at = created_at
WHERE updated_at IS NULL;

DROP POLICY IF EXISTS checklist_task_notes_update ON public.checklist_task_notes;
DROP POLICY IF EXISTS checklist_task_notes_delete ON public.checklist_task_notes;

CREATE POLICY checklist_task_notes_update ON public.checklist_task_notes
  FOR UPDATE TO authenticated
  USING (public.is_ramosjames_google_user())
  WITH CHECK (public.is_ramosjames_google_user());

CREATE POLICY checklist_task_notes_delete ON public.checklist_task_notes
  FOR DELETE TO authenticated
  USING (public.is_ramosjames_google_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_task_notes TO authenticated;
