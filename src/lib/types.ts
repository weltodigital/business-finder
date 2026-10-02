import type { FinancialPeriod } from '@/lib/accounts/normalise';
import type { FinancialSummary } from '@/lib/financials/analytics';

export interface CompanyRecord {
  id?: string;
  companyNumber: string;
  name: string | null;
  status: string | null;
  companyType: string | null;
  incorporationDate: string | null;
  dissolutionDate?: string | null;
  sicCodes: string[];
  registeredAddress: Record<string, string | undefined> | null;
  postcode: string | null;
  region: string | null;
  country?: string | null;
  hasInsolvencyHistory: boolean;
  hasCharges: boolean;
  accountsMeta?: Record<string, unknown> | null;
  confirmationStatementMeta?: Record<string, unknown> | null;
  website?: string | null;
}

export interface DirectorRecord {
  name: string;
  officerId: string | null;
  role: string | null;
  appointedOn: string | null;
  resignedOn: string | null;
  nationality: string | null;
  occupation: string | null;
  countryOfResidence: string | null;
  dateOfBirth: { month?: number; year?: number } | null;
  /** Populated only for shortlisted companies. */
  otherAppointments?: number;
}

export interface PscRecord {
  name: string | null;
  pscType: string | null;
  kind: string | null;
  natureOfControl: string[];
  notifiedOn: string | null;
  ceasedOn: string | null;
  /** Lower bound of the Companies House ownership band. */
  controlPercentFloor: number;
}

export interface FilingRecord {
  transactionId: string;
  category: string | null;
  filingType: string | null;
  description: string | null;
  filingDate: string | null;
  documentId: string | null;
}

export interface ChargeRecord {
  chargeId: string;
  createdOn: string | null;
  deliveredOn: string | null;
  satisfiedOn: string | null;
  status: string | null;
  personsEntitled: string[];
}

export interface EnrichmentRecord {
  website: string | null;
  websiteStatus: string | null;
  businessDescription: string | null;
  services: string[];
  industries: string[];
  locations: string[];
  ownerReferences: string[];
  contactEmail: string | null;
  contactPhone: string | null;
  socialLinks: string[];
  googleRating: number | null;
  googleReviewCount: number | null;
}

/** Everything the signal and scoring engines need about one company. */
export interface CompanyDossier {
  company: CompanyRecord;
  directors: DirectorRecord[];
  pscs: PscRecord[];
  filings: FilingRecord[];
  charges: ChargeRecord[];
  insolvencyCaseCount: number;
  periods: FinancialPeriod[];
  financials: FinancialSummary;
  enrichment: EnrichmentRecord | null;
  /** Reference date for age calculations; defaults to today. */
  asOf?: string;
}

export interface AcquisitionThesis {
  id?: string;
  name: string;
  description?: string | null;
  industries: string[];
  sicCodes: string[];
  geography: {
    locations?: string[];
    postcodePrefixes?: string[];
    radiusMiles?: number;
  };
  revenueMin: number | null;
  revenueMax: number | null;
  employeeMin: number | null;
  employeeMax: number | null;
  companyAgeMin: number | null;
  companyAgeMax: number | null;
  ownerManaged: boolean;
  excludeInsolvency: boolean;
  keywordsInclude: string[];
  keywordsExclude: string[];
}

export const PIPELINE_STATUSES = [
  'DISCOVERED',
  'RESEARCHING',
  'SHORTLISTED',
  'CONTACTED',
  'CONVERSATION',
  'INTERESTED',
  'NDA',
  'DUE_DILIGENCE',
  'OFFER',
  'ACQUIRED',
  'REJECTED',
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const FEEDBACK_VERDICTS = [
  'interesting',
  'not_interesting',
  'contact',
  'not_a_fit',
  'potential_target',
  'excellent_target',
] as const;

export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number];

export const FEEDBACK_REASONS = [
  'Too small',
  'Too founder-dependent',
  'Wrong industry',
  'Poor margins',
  'Too corporate',
  'Excellent business',
  'Interesting succession opportunity',
] as const;
