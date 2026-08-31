-- Core personal-injury checklist used for auto, trucking, dog bite, and premises cases.

INSERT INTO public.checklist_templates (name, case_type, version, active)
VALUES ('Personal Injury — Core', 'personal_injury', 1, true);

INSERT INTO public.checklist_template_items (template_id, title, stage, default_type, default_owner_role, sequence, default_due_rule)
SELECT t.id, x.title, x.stage::public.checklist_stage, x.default_type::public.checklist_task_type, x.default_owner_role::public.checklist_owner_role, x.sequence, x.default_due_rule
FROM public.checklist_templates t
CROSS JOIN (
  VALUES
    -- Intake
    ('Set up Dropbox case folder', 'intake', 'todo', 'legal_assistant', 10, 'plus_1'),
    ('Set up Slack case channel', 'intake', 'todo', 'legal_assistant', 20, 'plus_1'),
    ('Confirm first-party claims', 'intake', 'todo', 'paralegal', 30, 'plus_7'),
    ('Confirm third-party claims', 'intake', 'todo', 'paralegal', 40, 'plus_7'),
    ('Collect intake documents', 'intake', 'todo', 'legal_assistant', 50, 'plus_7'),
    ('Obtain HIPAA authorizations', 'intake', 'deadline', 'legal_assistant', 60, 'plus_14'),
    ('Send letters of representation', 'intake', 'todo', 'paralegal', 70, 'plus_7'),
    ('Calendar statute of limitations', 'intake', 'deadline', 'paralegal', 80, 'manual'),
    ('Confirm treatment started', 'intake', 'client_contact', 'paralegal', 90, 'plus_7'),
    ('Confirm liability theory', 'intake', 'todo', 'paralegal', 100, 'plus_14'),
    -- Investigation
    ('Request bodily-injury photos', 'investigation', 'todo', 'legal_assistant', 110, 'plus_14'),
    ('Request property-damage photos', 'investigation', 'todo', 'legal_assistant', 120, 'plus_14'),
    ('Request lost-wages documentation', 'investigation', 'todo', 'paralegal', 130, 'plus_21'),
    ('Obtain police report', 'investigation', 'todo', 'legal_assistant', 140, 'plus_14'),
    -- Medical / Billing
    ('Identify missing medical records', 'medical_billing', 'todo', 'paralegal', 150, 'plus_14'),
    ('Request provider affidavits', 'medical_billing', 'todo', 'legal_assistant', 160, 'plus_21'),
    ('Update medical tracker', 'medical_billing', 'todo', 'paralegal', 170, 'plus_7'),
    ('Request updated records', 'medical_billing', 'todo', 'legal_assistant', 180, 'plus_14'),
    -- Subrogation
    ('Open subrogation claim', 'subrogation', 'todo', 'paralegal', 190, 'plus_14'),
    ('Request itemized lien', 'subrogation', 'todo', 'paralegal', 200, 'plus_21'),
    -- Demand
    ('Draft demand', 'demand', 'todo', 'paralegal', 210, 'plus_21'),
    ('Compile demand package', 'demand', 'todo', 'legal_assistant', 220, 'plus_7'),
    ('Attorney review of demand', 'demand', 'todo', 'attorney', 230, 'plus_7'),
    ('Send demand', 'demand', 'deadline', 'paralegal', 240, 'plus_7'),
    ('Calendar demand response deadline', 'demand', 'deadline', 'paralegal', 250, 'manual'),
    ('Confirm demand receipt', 'demand', 'other_call', 'paralegal', 260, 'plus_7'),
    ('Log offer', 'demand', 'todo', 'paralegal', 270, 'manual'),
    -- Petition / Service
    ('Draft petition', 'petition_service', 'todo', 'paralegal', 280, 'plus_14'),
    ('E-file petition', 'petition_service', 'deadline', 'legal_assistant', 290, 'plus_7'),
    ('Prepare citations', 'petition_service', 'todo', 'legal_assistant', 300, 'plus_7'),
    ('Serve defendants', 'petition_service', 'deadline', 'legal_assistant', 310, 'plus_14'),
    ('Monitor answer deadline', 'petition_service', 'deadline', 'paralegal', 320, 'manual'),
    ('Confirm service status and invoice', 'petition_service', 'todo', 'legal_assistant', 330, 'plus_14'),
    -- Discovery
    ('Prepare initial disclosures', 'discovery', 'deadline', 'paralegal', 340, 'plus_30'),
    ('Draft discovery requests', 'discovery', 'todo', 'paralegal', 350, 'plus_21'),
    ('Calendar discovery responses', 'discovery', 'deadline', 'paralegal', 360, 'manual'),
    ('Schedule depositions', 'discovery', 'todo', 'paralegal', 370, 'plus_21'),
    ('Complete deposition prep', 'discovery', 'urgent_task', 'paralegal', 380, 'plus_7'),
    ('Send deposition reminders', 'discovery', 'client_contact', 'legal_assistant', 390, 'plus_3'),
    ('Track discovery deadlines', 'discovery', 'deadline', 'paralegal', 400, 'manual'),
    -- Mediation
    ('Schedule mediation', 'mediation', 'todo', 'paralegal', 410, 'plus_21'),
    ('Prepare mediation materials', 'mediation', 'todo', 'paralegal', 420, 'plus_14'),
    ('Confirm mediation invoice', 'mediation', 'todo', 'legal_assistant', 430, 'plus_7'),
    ('Send mediation confirmation', 'mediation', 'client_contact', 'legal_assistant', 440, 'plus_7'),
    ('Send mediation reminders', 'mediation', 'client_contact', 'legal_assistant', 450, 'plus_3'),
    ('Confirm provider and expert balances', 'mediation', 'todo', 'paralegal', 460, 'plus_7'),
    -- Trial
    ('Confirm trial witnesses', 'trial', 'todo', 'paralegal', 470, 'plus_21'),
    ('Collect trial affidavits', 'trial', 'todo', 'legal_assistant', 480, 'plus_14'),
    ('Complete trial prep', 'trial', 'urgent_task', 'paralegal', 490, 'plus_7'),
    ('Complete ASO workflow', 'trial', 'todo', 'paralegal', 500, 'plus_14'),
    ('File trial notice', 'trial', 'deadline', 'legal_assistant', 510, 'manual'),
    ('Ready announcement', 'trial', 'deadline', 'paralegal', 520, 'manual'),
    -- Settlement / Close
    ('Negotiate reductions', 'settlement_close', 'todo', 'paralegal', 530, 'plus_14'),
    ('Circulate releases', 'settlement_close', 'todo', 'paralegal', 540, 'plus_7'),
    ('Track settlement checks', 'settlement_close', 'todo', 'legal_assistant', 550, 'plus_14'),
    ('Prepare disbursement', 'settlement_close', 'todo', 'paralegal', 560, 'plus_14'),
    ('File dismissal', 'settlement_close', 'deadline', 'legal_assistant', 570, 'plus_14'),
    ('Confirm payments', 'settlement_close', 'todo', 'legal_assistant', 580, 'plus_14'),
    ('Close Slack and Dropbox systems', 'settlement_close', 'todo', 'legal_assistant', 590, 'plus_7')
) AS x(title, stage, default_type, default_owner_role, sequence, default_due_rule)
WHERE t.case_type = 'personal_injury' AND t.version = 1 AND t.active;
