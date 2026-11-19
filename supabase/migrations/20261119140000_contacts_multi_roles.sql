-- Mirror of shared contacts.roles support (applied on docket-flow project).
-- Safe to re-run: IF NOT EXISTS / CREATE OR REPLACE.

alter table public.contacts
  add column if not exists roles text[] not null default '{}'::text[];

create or replace function public.contact_has_role(
  p_roles text[],
  p_primary text,
  p_want text
)
returns boolean
language sql
immutable
as $$
  select
    case
      when p_want is null or btrim(p_want) = '' then false
      when p_roles is not null and cardinality(p_roles) > 0 then p_want = any (p_roles)
      else p_primary = p_want
    end;
$$;
