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
    WHEN 'miscellaneous' THEN 11
    ELSE 0
  END;
$$;
