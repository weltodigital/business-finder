-- Off-Market Acquisition Finder — core schema
-- Reference data (companies, filings, financials) is shared across users.
-- User-owned data (theses, targets, notes) is scoped by user_id.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Companies House reference data
-- ---------------------------------------------------------------------------

create table companies (
  id uuid primary key default gen_random_uuid(),

  company_number text unique not null,
  name text,
  status text,
  company_type text,

  incorporation_date date,
  dissolution_date date,

  sic_codes jsonb not null default '[]'::jsonb,

  registered_address jsonb,
  postcode text,
  region text,
  country text,

  previous_names jsonb not null default '[]'::jsonb,
  accounts_meta jsonb,
  confirmation_statement_meta jsonb,

  has_insolvency_history boolean not null default false,
  has_charges boolean not null default false,

  website text,
  phone text,
  email text,

  last_companies_house_update timestamptz,
  raw_profile jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_postcode_idx on companies (postcode);
create index companies_region_idx on companies (region);
create index companies_status_idx on companies (status);
create index companies_incorporation_idx on companies (incorporation_date);
create index companies_sic_idx on companies using gin (sic_codes);

create table directors (
  id uuid primary key default gen_random_uuid(),
  -- Companies House officer id where known; otherwise a normalised name key.
  officer_id text unique,
  name text not null,
  name_key text not null,
  date_of_birth jsonb,
  nationality text,
  occupation text,
  country_of_residence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index directors_name_key_idx on directors (name_key);

create table company_directors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  director_id uuid not null references directors(id) on delete cascade,
  officer_id text,
  role text,
  appointed_on date,
  resigned_on date,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, director_id, role, appointed_on)
);
create index company_directors_company_idx on company_directors (company_id);
create index company_directors_director_idx on company_directors (director_id);

-- Appointments pulled from /officers/{id}/appointments for shortlisted companies.
create table officer_appointments (
  id uuid primary key default gen_random_uuid(),
  director_id uuid not null references directors(id) on delete cascade,
  company_number text not null,
  company_name text,
  company_status text,
  role text,
  appointed_on date,
  resigned_on date,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  unique (director_id, company_number, appointed_on)
);
create index officer_appointments_company_number_idx on officer_appointments (company_number);

create table pscs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  psc_id text,
  name text,
  psc_type text,
  kind text,
  nature_of_control jsonb not null default '[]'::jsonb,
  notified_on date,
  ceased_on date,
  date_of_birth jsonb,
  nationality text,
  country_of_residence text,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, psc_id)
);
create index pscs_company_idx on pscs (company_id);

create table filings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  transaction_id text not null,
  filing_type text,
  category text,
  subcategory text,
  description text,
  description_values jsonb,
  filing_date date,
  action_date date,
  paper_filed boolean,
  document_id text,
  document_url text,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, transaction_id)
);
create index filings_company_idx on filings (company_id);
create index filings_category_idx on filings (category);
create index filings_date_idx on filings (filing_date);

create table charges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  charge_id text not null,
  charge_code text,
  classification jsonb,
  created_on date,
  delivered_on date,
  status text,
  persons_entitled jsonb not null default '[]'::jsonb,
  secured_details jsonb,
  particulars jsonb,
  satisfied_on date,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, charge_id)
);
create index charges_company_idx on charges (company_id);

create table company_insolvency (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  case_number text,
  case_type text,
  dates jsonb,
  practitioners jsonb,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, case_number)
);
create index company_insolvency_company_idx on company_insolvency (company_id);

-- ---------------------------------------------------------------------------
-- Accounts / financial model
-- ---------------------------------------------------------------------------

create table financial_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  filing_id uuid references filings(id) on delete set null,

  document_id text not null,
  document_type text,                 -- AA, AA01, accounts-type where known

  accounting_period_start date,
  accounting_period_end date,
  made_up_to date,

  file_type text,                     -- xhtml | xml | pdf | csv | json
  source_url text,
  content_length integer,

  retrieved_at timestamptz,

  -- pending | processing | complete | failed | needs_review | not_available
  extraction_status text not null default 'pending',
  extraction_method text,             -- ixbrl | xbrl | pdf_text | llm | none
  extraction_error text,

  raw_metadata jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, document_id)
);
create index financial_documents_company_idx on financial_documents (company_id);
create index financial_documents_status_idx on financial_documents (extraction_status);

create table financial_facts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  financial_document_id uuid references financial_documents(id) on delete cascade,

  metric text not null,
  value numeric,
  currency text default 'GBP',

  period_start date,
  period_end date,
  is_instant boolean not null default false,

  unit text,
  scale integer,                      -- 1 | 1000 etc, as reported

  source_page text,
  source_location text,               -- XBRL tag name / PDF line / prompt id
  extraction_method text,
  confidence numeric,

  is_reported boolean not null default true,
  is_estimated boolean not null default false,

  raw_context jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index financial_facts_company_idx on financial_facts (company_id);
create index financial_facts_metric_idx on financial_facts (company_id, metric, period_end);
create unique index financial_facts_unique_idx
  on financial_facts (financial_document_id, metric, period_start, period_end)
  where financial_document_id is not null;

-- Normalised one-row-per-accounting-year view built from financial_facts.
create table financial_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,

  period_start date,
  period_end date not null,
  months integer,

  revenue numeric,
  cost_of_sales numeric,
  gross_profit numeric,
  operating_profit numeric,
  profit_before_tax numeric,
  tax numeric,
  net_profit numeric,
  dividends numeric,

  cash numeric,
  trade_receivables numeric,
  trade_payables numeric,
  current_assets numeric,
  current_liabilities numeric,
  fixed_assets numeric,
  intangible_assets numeric,
  total_assets numeric,
  total_liabilities numeric,
  net_assets numeric,
  short_term_debt numeric,
  long_term_debt numeric,

  employee_count numeric,
  directors_remuneration numeric,

  gross_margin numeric,
  operating_margin numeric,
  net_margin numeric,
  current_ratio numeric,

  source_document_ids jsonb not null default '[]'::jsonb,
  has_estimates boolean not null default false,
  validation_status text,             -- ok | needs_review
  validation_issues jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, period_end)
);
create index financial_periods_company_idx on financial_periods (company_id, period_end desc);

-- Rolled-up analytics per company (recomputed, never authoritative source data).
create table company_financials_summary (
  company_id uuid primary key references companies(id) on delete cascade,

  financial_visibility text not null default 'LOW',   -- HIGH | MEDIUM | LOW
  periods_available integer not null default 0,
  first_period_end date,
  latest_period_end date,

  latest_revenue numeric,
  latest_operating_profit numeric,
  latest_net_profit numeric,
  latest_cash numeric,
  latest_net_assets numeric,
  latest_total_debt numeric,
  latest_employee_count numeric,

  revenue_cagr numeric,
  operating_profit_cagr numeric,
  revenue_growth_yoy numeric,
  operating_profit_growth_yoy numeric,
  cash_growth_yoy numeric,

  avg_operating_margin numeric,
  latest_operating_margin numeric,
  latest_gross_margin numeric,
  latest_net_margin numeric,
  latest_current_ratio numeric,

  revenue_consistency numeric,        -- 0..1
  profit_consistency numeric,         -- 0..1 share of profitable years
  revenue_per_employee numeric,
  profit_per_employee numeric,
  debt_to_operating_profit numeric,

  computed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Enrichment
-- ---------------------------------------------------------------------------

create table company_enrichment (
  company_id uuid primary key references companies(id) on delete cascade,
  website text,
  website_status text,                -- found | not_found | error | skipped
  business_description text,
  services jsonb not null default '[]'::jsonb,
  industries jsonb not null default '[]'::jsonb,
  locations jsonb not null default '[]'::jsonb,
  owner_references jsonb not null default '[]'::jsonb,
  contact_email text,
  contact_phone text,
  social_links jsonb not null default '[]'::jsonb,
  google_place_id text,
  google_rating numeric,
  google_review_count integer,
  raw_website_text text,
  pages_crawled jsonb not null default '[]'::jsonb,
  enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Signals & scoring
-- ---------------------------------------------------------------------------

create table signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  signal_type text not null,
  severity text not null,             -- positive | neutral | caution | negative
  title text not null,
  description text,
  source text,                        -- companies_house | financials | website | derived
  evidence jsonb,
  detected_at timestamptz not null default now(),
  unique (company_id, signal_type)
);
create index signals_company_idx on signals (company_id);

create table scoring_configs (
  id uuid primary key default gen_random_uuid(),
  version text unique not null,
  is_active boolean not null default false,
  config jsonb not null,
  created_at timestamptz not null default now()
);

create table company_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  thesis_id uuid,                     -- fit components depend on the thesis
  scoring_version text not null,

  total_score numeric not null,
  financial_quality numeric not null default 0,
  acquisition_fit numeric not null default 0,
  ownership numeric not null default 0,
  succession_signal numeric not null default 0,
  company_quality numeric not null default 0,
  risk_adjustment numeric not null default 0,

  financial_visibility text,
  breakdown jsonb not null default '{}'::jsonb,   -- per-component reasons

  computed_at timestamptz not null default now(),
  unique (company_id, thesis_id, scoring_version)
);
create index company_scores_total_idx on company_scores (total_score desc);

-- ---------------------------------------------------------------------------
-- User-owned: theses, runs, targets
-- ---------------------------------------------------------------------------

create table acquisition_theses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  industries jsonb not null default '[]'::jsonb,
  sic_codes jsonb not null default '[]'::jsonb,
  geography jsonb not null default '{}'::jsonb,
  revenue_min numeric,
  revenue_max numeric,
  employee_min integer,
  employee_max integer,
  company_age_min integer,
  company_age_max integer,
  owner_managed boolean not null default true,
  exclude_insolvency boolean not null default true,
  keywords_include jsonb not null default '[]'::jsonb,
  keywords_exclude jsonb not null default '[]'::jsonb,
  is_saved boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index acquisition_theses_user_idx on acquisition_theses (user_id);

create table thesis_runs (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid not null references acquisition_theses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  stage text,
  companies_found integer not null default 0,
  candidates integer not null default 0,
  enriched integer not null default 0,
  scored integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index thesis_runs_thesis_idx on thesis_runs (thesis_id);

create table thesis_run_companies (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references thesis_runs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  stage_reached text not null default 'universe',  -- universe | candidate | enriched | scored | rejected
  rejected_reason text,
  created_at timestamptz not null default now(),
  unique (run_id, company_id)
);
create index thesis_run_companies_run_idx on thesis_run_companies (run_id);

create table targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  thesis_id uuid references acquisition_theses(id) on delete set null,

  status text not null default 'DISCOVERED',
  algorithm_score numeric,
  manual_score numeric,
  manual_score_reason text,

  ai_analysis jsonb,
  ai_analysed_at timestamptz,
  ai_model text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id)
);
create index targets_user_idx on targets (user_id, status);

create table target_notes (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references targets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index target_notes_target_idx on target_notes (target_id);

create table target_feedback (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references targets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verdict text not null,              -- interesting | not_interesting | contact | not_a_fit | potential_target | excellent_target
  reason text,
  created_at timestamptz not null default now()
);
create index target_feedback_target_idx on target_feedback (target_id);

-- ---------------------------------------------------------------------------
-- Jobs, caching, logging
-- ---------------------------------------------------------------------------

create table jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status text not null default 'PENDING',   -- PENDING|PROCESSING|COMPLETE|FAILED|NEEDS_REVIEW
  company_id uuid references companies(id) on delete cascade,
  run_id uuid references thesis_runs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  attempts integer not null default 0,
  priority integer not null default 100,
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index jobs_status_idx on jobs (status, priority, scheduled_for);
create index jobs_company_idx on jobs (company_id);

create table companies_house_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,
  resource text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz
);
create index companies_house_cache_expiry_idx on companies_house_cache (expires_at);

create table app_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'info',
  scope text not null,
  message text not null,
  company_number text,
  context jsonb,
  created_at timestamptz not null default now()
);
create index app_logs_created_idx on app_logs (created_at desc);
create index app_logs_scope_idx on app_logs (scope, level);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies','directors','company_directors','pscs','financial_documents',
    'financial_facts','financial_periods','company_enrichment','acquisition_theses','targets'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()',
      t, t
    );
  end loop;
end $$;
