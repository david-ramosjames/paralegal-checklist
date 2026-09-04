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
        'deliverable'::public.checklist_task_type,
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

UPDATE public.checklist_template_items SET title = 'Liability Status'
WHERE lower(title) = lower('Confirm liability theory');
UPDATE public.checklist_tasks SET title = 'Liability Status'
WHERE lower(title) = lower('Confirm liability theory');

UPDATE public.checklist_template_items SET title = 'Received citations', default_type = 'deliverable'
WHERE lower(title) = lower('Prepare citations');
UPDATE public.checklist_tasks SET title = 'Received citations'
WHERE lower(title) = lower('Prepare citations');

UPDATE public.checklist_template_items SET title = 'received Defendant''s Answer', default_type = 'deliverable'
WHERE lower(title) = lower('Monitor answer deadline');
UPDATE public.checklist_tasks SET title = 'received Defendant''s Answer'
WHERE lower(title) = lower('Monitor answer deadline');

UPDATE public.checklist_template_items SET title = 'Draft Discovery Request to Def.'
WHERE lower(title) = lower('Draft discovery requests');
UPDATE public.checklist_tasks SET title = 'Draft Discovery Request to Def.'
WHERE lower(title) = lower('Draft discovery requests');

UPDATE public.checklist_template_items SET title = 'Announce ready for Trial'
WHERE lower(title) = lower('Ready announcement');
UPDATE public.checklist_tasks SET title = 'Announce ready for Trial'
WHERE lower(title) = lower('Ready announcement');

UPDATE public.checklist_template_items SET title = 'Dismissal/Nonsuit filed'
WHERE lower(title) = lower('File dismissal');
UPDATE public.checklist_tasks SET title = 'Dismissal/Nonsuit filed'
WHERE lower(title) = lower('File dismissal');

UPDATE public.checklist_template_items SET title = 'Case disbursed'
WHERE lower(title) = lower('Confirm payments');
UPDATE public.checklist_tasks SET title = 'Case disbursed'
WHERE lower(title) = lower('Confirm payments');

DELETE FROM public.checklist_template_items
WHERE lower(title) IN (
  lower('Prepare initial disclosures'),
  lower('Collect trial affidavits'),
  lower('Complete trial prep'),
  lower('Complete ASO workflow'),
  lower('Negotiate reductions'),
  lower('Circulate releases')
);

DELETE FROM public.checklist_tasks
WHERE lower(title) IN (
  lower('Prepare initial disclosures'),
  lower('Collect trial affidavits'),
  lower('Complete trial prep'),
  lower('Complete ASO workflow'),
  lower('Negotiate reductions'),
  lower('Circulate releases')
);

WITH template AS (
  SELECT id FROM public.checklist_templates
  WHERE name = 'Personal Injury — Core' AND active
  ORDER BY created_at
  LIMIT 1
)
INSERT INTO public.checklist_template_items (template_id, title, stage, default_type, default_owner_role, sequence, default_due_rule)
SELECT template.id, x.title, x.stage::public.checklist_stage, x.default_type::public.checklist_task_type, x.default_owner_role::public.checklist_owner_role, x.sequence, x.default_due_rule
FROM template
CROSS JOIN (VALUES
  ('Property Damage completed', 'investigation', 'deliverable', 'paralegal', 125, 'plus_14'),
  ('Calendar Initial Disclosures & Ch. 18 Notice Deadline', 'petition_service', 'deadline', 'paralegal', 335, 'manual'),
  ('Plt''s Initial Disclosures Deadline', 'discovery', 'deadline', 'paralegal', 341, 'manual'),
  ('Plt''s Ch. 18 Notice Deadline', 'discovery', 'deadline', 'paralegal', 342, 'manual'),
  ('Draft Discovery Request to Def(s) to Serve with Plt''s Initial Disclosures', 'discovery', 'todo', 'paralegal', 351, 'plus_21'),
  ('Rec''d Def''s Initial Disclosures', 'discovery', 'deliverable', 'paralegal', 361, 'manual'),
  ('Received Discovery Requests to Plt (s)', 'discovery', 'deliverable', 'paralegal', 362, 'manual'),
  ('Plt Responded to Defendant(s) Discovery Request', 'discovery', 'deliverable', 'paralegal', 363, 'manual'),
  ('Received Def''s Discovery Responses to Plt', 'discovery', 'deliverable', 'paralegal', 364, 'manual'),
  ('Scheduled Def''s Deposition(Confirm if Interpreter is required)', 'discovery', 'todo', 'paralegal', 371, 'plus_21'),
  ('Schedule Plt(s) Deposition', 'discovery', 'todo', 'paralegal', 372, 'plus_21'),
  ('Schedule Plt''s Deposition Prep Meeting', 'discovery', 'todo', 'paralegal', 373, 'plus_7'),
  ('Remind Client of deposition & depo Prep Meeting', 'discovery', 'client_contact', 'legal_assistant', 391, 'plus_3'),
  ('Received Mediation Confirmation & Invoice from Mediator', 'mediation', 'deliverable', 'legal_assistant', 431, 'plus_7'),
  ('Request payment for mediation Invoice and Confirm Mediation Invoice paid', 'mediation', 'todo', 'legal_assistant', 432, 'plus_7'),
  ('Schedule mediation prep meeting for client', 'mediation', 'todo', 'paralegal', 441, 'plus_7'),
  ('Remind Client of Mediation Prep Meeting & Mediation', 'mediation', 'client_contact', 'legal_assistant', 451, 'plus_3'),
  ('Verify Provider Balances one week before mediation', 'mediation', 'todo', 'paralegal', 461, 'plus_7'),
  ('Retained experts, confirm we have on file all updated invoices from experts', 'mediation', 'todo', 'paralegal', 462, 'plus_7'),
  ('Schedule Trial/Set with court', 'trial', 'todo', 'paralegal', 465, 'plus_21'),
  ('Draft ASO and propose to OC', 'trial', 'todo', 'paralegal', 466, 'plus_14'),
  ('Rec''d signed ASO from court', 'trial', 'deliverable', 'paralegal', 467, 'manual'),
  ('Schedule Trial prep with client', 'trial', 'todo', 'paralegal', 486, 'plus_7'),
  ('Confirm we have all Medical & Billing Records with Affidavits', 'trial', 'todo', 'paralegal', 487, 'plus_14')
) AS x(title, stage, default_type, default_owner_role, sequence, default_due_rule)
WHERE NOT EXISTS (
  SELECT 1 FROM public.checklist_template_items i
  WHERE i.template_id = template.id AND lower(i.title) = lower(x.title)
);

INSERT INTO public.checklist_tasks (
  case_id, template_item_id, title, stage, sequence, owner_name, owner_role, status, type, types
)
SELECT
  c.id,
  i.id,
  i.title,
  i.stage,
  i.sequence,
  te.paralegal_name,
  i.default_owner_role,
  'upcoming'::public.checklist_task_status,
  i.default_type,
  ARRAY[i.default_type]
FROM public.cases c
JOIN public.checklist_template_items i ON i.template_id = (
  SELECT id FROM public.checklist_templates WHERE name = 'Personal Injury — Core' AND active ORDER BY created_at LIMIT 1
)
LEFT JOIN LATERAL (
  SELECT e.paralegal_name
  FROM public.case_tracker_entries e
  WHERE e.case_number = c.case_number AND e.is_active
  ORDER BY e.updated_at DESC
  LIMIT 1
) te ON true
WHERE EXISTS (SELECT 1 FROM public.checklist_tasks t WHERE t.case_id = c.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.checklist_tasks t
    WHERE t.case_id = c.id AND lower(t.title) = lower(i.title)
  );
