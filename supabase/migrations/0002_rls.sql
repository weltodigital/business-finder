-- Row Level Security.
-- Reference data: readable by any authenticated user, written only by the
-- service role (which bypasses RLS) from server-side pipeline code.
-- User data: owner-only.

alter table companies                enable row level security;
alter table directors                enable row level security;
alter table company_directors        enable row level security;
alter table officer_appointments     enable row level security;
alter table pscs                     enable row level security;
alter table filings                  enable row level security;
alter table charges                  enable row level security;
alter table company_insolvency       enable row level security;
alter table financial_documents      enable row level security;
alter table financial_facts          enable row level security;
alter table financial_periods        enable row level security;
alter table company_financials_summary enable row level security;
alter table company_enrichment       enable row level security;
alter table signals                  enable row level security;
alter table scoring_configs          enable row level security;
alter table company_scores           enable row level security;
alter table companies_house_cache    enable row level security;
alter table app_logs                 enable row level security;
alter table jobs                     enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'companies','directors','company_directors','officer_appointments','pscs',
    'filings','charges','company_insolvency','financial_documents','financial_facts',
    'financial_periods','company_financials_summary','company_enrichment','signals',
    'scoring_configs','company_scores'
  ] loop
    execute format(
      'create policy %I_read_authenticated on %I for select to authenticated using (true)', t, t
    );
  end loop;
end $$;

-- Cache, logs and jobs are server-side only: no policies => no client access.

alter table acquisition_theses  enable row level security;
alter table thesis_runs         enable row level security;
alter table thesis_run_companies enable row level security;
alter table targets             enable row level security;
alter table target_notes        enable row level security;
alter table target_feedback     enable row level security;

create policy theses_owner on acquisition_theses
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy runs_owner on thesis_runs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy run_companies_owner on thesis_run_companies
  for all to authenticated
  using (exists (select 1 from thesis_runs r where r.id = run_id and r.user_id = auth.uid()))
  with check (exists (select 1 from thesis_runs r where r.id = run_id and r.user_id = auth.uid()));

create policy targets_owner on targets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notes_owner on target_notes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy feedback_owner on target_feedback
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
