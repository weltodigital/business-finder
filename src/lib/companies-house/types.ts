export interface CHAddress {
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  region?: string;
  postal_code?: string;
  country?: string;
  premises?: string;
  care_of?: string;
}

export interface CHCompanyProfile {
  company_number: string;
  company_name?: string;
  company_status?: string;
  company_status_detail?: string;
  type?: string;
  date_of_creation?: string;
  date_of_cessation?: string;
  jurisdiction?: string;
  sic_codes?: string[];
  registered_office_address?: CHAddress;
  previous_company_names?: { name: string; ceased_on?: string; effective_from?: string }[];
  accounts?: {
    accounting_reference_date?: { day?: string; month?: string };
    last_accounts?: { made_up_to?: string; type?: string; period_start_on?: string; period_end_on?: string };
    next_accounts?: { period_start_on?: string; period_end_on?: string; due_on?: string; overdue?: boolean };
    next_due?: string;
    next_made_up_to?: string;
    overdue?: boolean;
  };
  confirmation_statement?: {
    last_made_up_to?: string;
    next_due?: string;
    next_made_up_to?: string;
    overdue?: boolean;
  };
  has_insolvency_history?: boolean;
  has_charges?: boolean;
  can_file?: boolean;
  links?: Record<string, string>;
}

export interface CHOfficer {
  name?: string;
  officer_role?: string;
  appointed_on?: string;
  resigned_on?: string;
  nationality?: string;
  occupation?: string;
  country_of_residence?: string;
  date_of_birth?: { month?: number; year?: number };
  address?: CHAddress;
  links?: { self?: string; officer?: { appointments?: string } };
}

export interface CHPsc {
  name?: string;
  kind?: string;
  natures_of_control?: string[];
  notified_on?: string;
  ceased_on?: string;
  ceased?: boolean;
  nationality?: string;
  country_of_residence?: string;
  date_of_birth?: { month?: number; year?: number };
  identification?: Record<string, string>;
  links?: { self?: string };
}

export interface CHFilingHistoryItem {
  transaction_id: string;
  category?: string;
  subcategory?: string | string[];
  type?: string;
  description?: string;
  description_values?: Record<string, string>;
  date?: string;
  action_date?: string;
  paper_filed?: boolean;
  pages?: number;
  links?: { self?: string; document_metadata?: string };
}

export interface CHCharge {
  id?: string;
  charge_code?: string;
  charge_number?: number;
  classification?: { type?: string; description?: string };
  created_on?: string;
  delivered_on?: string;
  satisfied_on?: string;
  status?: string;
  persons_entitled?: { name?: string }[];
  secured_details?: { type?: string; description?: string };
  particulars?: Record<string, unknown>;
}

export interface CHInsolvencyCase {
  number?: string;
  type?: string;
  dates?: { type?: string; date?: string }[];
  practitioners?: { name?: string; role?: string; appointed_on?: string; ceased_to_act_on?: string }[];
}

export interface CHAppointment {
  appointed_to?: { company_number?: string; company_name?: string; company_status?: string };
  officer_role?: string;
  appointed_on?: string;
  resigned_on?: string;
  name?: string;
}

export interface CHAdvancedSearchItem {
  company_number: string;
  company_name?: string;
  company_status?: string;
  company_type?: string;
  date_of_creation?: string;
  date_of_cessation?: string;
  sic_codes?: string[];
  registered_office_address?: CHAddress;
}

export interface CHDocumentMetadata {
  company_number?: string;
  barcode?: string;
  significant_date?: string;
  significant_date_type?: string;
  category?: string;
  pages?: number;
  filename?: string;
  created_at?: string;
  resources?: Record<string, { content_length?: number }>;
  links?: { self?: string; document?: string };
}
