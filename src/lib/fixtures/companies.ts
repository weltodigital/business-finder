import type {
  CHAdvancedSearchItem,
  CHCharge,
  CHCompanyProfile,
  CHFilingHistoryItem,
  CHOfficer,
  CHPsc,
} from '@/lib/companies-house/types';

export interface FixtureFinancialYear {
  period_start: string;
  period_end: string;
  revenue?: number;
  cost_of_sales?: number;
  gross_profit?: number;
  operating_profit?: number;
  profit_before_tax?: number;
  net_profit?: number;
  cash?: number;
  current_assets?: number;
  current_liabilities?: number;
  fixed_assets?: number;
  total_assets?: number;
  total_liabilities?: number;
  net_assets?: number;
  short_term_debt?: number;
  long_term_debt?: number;
  employee_count?: number;
}

export interface CompanyFixture {
  label: string;
  profile: CHCompanyProfile;
  officers: CHOfficer[];
  pscs: CHPsc[];
  filings: CHFilingHistoryItem[];
  charges: CHCharge[];
  financials: FixtureFinancialYear[];
}

function accountsFiling(id: string, date: string, madeUpTo: string): CHFilingHistoryItem {
  return {
    transaction_id: id,
    category: 'accounts',
    type: 'AA',
    description: 'accounts-with-accounts-type-full',
    description_values: { made_up_date: madeUpTo },
    date,
    links: { self: `/filing-history/${id}`, document_metadata: `https://document-api.company-information.service.gov.uk/document/doc-${id}` },
  };
}

function confirmationFiling(id: string, date: string): CHFilingHistoryItem {
  return {
    transaction_id: id,
    category: 'confirmation-statement',
    type: 'CS01',
    description: 'confirmation-statement',
    date,
    links: { self: `/filing-history/${id}` },
  };
}

export const FIXTURES: Record<string, CompanyFixture> = {
  // 1. Excellent acquisition target: growing, profitable, owner-controlled, long-established.
  '01000001': {
    label: 'Excellent acquisition target',
    profile: {
      company_number: '01000001',
      company_name: 'HAMPSHIRE PRECISION ENGINEERING LIMITED',
      company_status: 'active',
      type: 'ltd',
      date_of_creation: '1993-04-12',
      sic_codes: ['25620', '28990'],
      registered_office_address: {
        address_line_1: 'Unit 4 Test Valley Business Park',
        locality: 'Andover',
        region: 'Hampshire',
        postal_code: 'SP10 3SA',
        country: 'England',
      },
      accounts: { last_accounts: { made_up_to: '2025-03-31', type: 'full' }, next_due: '2026-12-31' },
      confirmation_statement: { last_made_up_to: '2025-04-20', next_due: '2026-05-04' },
      has_insolvency_history: false,
      has_charges: false,
    },
    officers: [
      {
        name: 'HARRISON, Michael John',
        officer_role: 'director',
        appointed_on: '1993-04-12',
        nationality: 'British',
        occupation: 'Engineer',
        country_of_residence: 'England',
        date_of_birth: { month: 6, year: 1958 },
        links: { officer: { appointments: '/officers/mh-fixture-1/appointments' } },
      },
      {
        name: 'HARRISON, Susan',
        officer_role: 'director',
        appointed_on: '1998-09-01',
        nationality: 'British',
        occupation: 'Company Director',
        country_of_residence: 'England',
        date_of_birth: { month: 2, year: 1961 },
        links: { officer: { appointments: '/officers/sh-fixture-1/appointments' } },
      },
    ],
    pscs: [
      {
        name: 'Mr Michael John Harrison',
        kind: 'individual-person-with-significant-control',
        natures_of_control: ['ownership-of-shares-75-to-100-percent', 'voting-rights-75-to-100-percent'],
        notified_on: '2016-04-06',
        nationality: 'British',
        date_of_birth: { month: 6, year: 1958 },
      },
    ],
    filings: [
      accountsFiling('fx-1-a5', '2025-09-20', '2025-03-31'),
      accountsFiling('fx-1-a4', '2024-09-18', '2024-03-31'),
      accountsFiling('fx-1-a3', '2023-09-22', '2023-03-31'),
      accountsFiling('fx-1-a2', '2022-09-15', '2022-03-31'),
      confirmationFiling('fx-1-c1', '2025-04-20'),
    ],
    charges: [],
    financials: [
      { period_start: '2021-04-01', period_end: '2022-03-31', revenue: 2_100_000, cost_of_sales: 1_260_000, gross_profit: 840_000, operating_profit: 250_000, profit_before_tax: 246_000, net_profit: 199_000, cash: 220_000, current_assets: 940_000, current_liabilities: 430_000, fixed_assets: 610_000, total_assets: 1_550_000, total_liabilities: 560_000, net_assets: 990_000, employee_count: 24 },
      { period_start: '2022-04-01', period_end: '2023-03-31', revenue: 2_400_000, cost_of_sales: 1_416_000, gross_profit: 984_000, operating_profit: 310_000, profit_before_tax: 305_000, net_profit: 247_000, cash: 340_000, current_assets: 1_080_000, current_liabilities: 455_000, fixed_assets: 640_000, total_assets: 1_720_000, total_liabilities: 585_000, net_assets: 1_135_000, employee_count: 26 },
      { period_start: '2023-04-01', period_end: '2024-03-31', revenue: 2_800_000, cost_of_sales: 1_624_000, gross_profit: 1_176_000, operating_profit: 390_000, profit_before_tax: 386_000, net_profit: 313_000, cash: 480_000, current_assets: 1_290_000, current_liabilities: 470_000, fixed_assets: 680_000, total_assets: 1_970_000, total_liabilities: 600_000, net_assets: 1_370_000, employee_count: 29 },
      { period_start: '2024-04-01', period_end: '2025-03-31', revenue: 3_100_000, cost_of_sales: 1_767_000, gross_profit: 1_333_000, operating_profit: 430_000, profit_before_tax: 428_000, net_profit: 347_000, cash: 620_000, current_assets: 1_510_000, current_liabilities: 490_000, fixed_assets: 700_000, total_assets: 2_210_000, total_liabilities: 620_000, net_assets: 1_590_000, employee_count: 31 },
    ],
  },

  // 2. Average company: flat revenue, thin margins, no strong signal either way.
  '01000002': {
    label: 'Average company',
    profile: {
      company_number: '01000002',
      company_name: 'SOUTHERN FABRICATION SERVICES LIMITED',
      company_status: 'active',
      type: 'ltd',
      date_of_creation: '2008-11-03',
      sic_codes: ['25110'],
      registered_office_address: { address_line_1: '12 Mill Lane', locality: 'Guildford', region: 'Surrey', postal_code: 'GU1 4RT', country: 'England' },
      accounts: { last_accounts: { made_up_to: '2024-12-31', type: 'full' } },
      confirmation_statement: { last_made_up_to: '2025-01-10' },
      has_insolvency_history: false,
      has_charges: true,
    },
    officers: [
      { name: 'PATEL, Anil', officer_role: 'director', appointed_on: '2008-11-03', nationality: 'British', occupation: 'Director', country_of_residence: 'England', date_of_birth: { month: 3, year: 1975 }, links: { officer: { appointments: '/officers/ap-fixture-2/appointments' } } },
      { name: 'WRIGHT, Claire', officer_role: 'director', appointed_on: '2019-06-14', nationality: 'British', occupation: 'Director', country_of_residence: 'England', date_of_birth: { month: 11, year: 1982 } },
    ],
    pscs: [
      { name: 'Mr Anil Patel', kind: 'individual-person-with-significant-control', natures_of_control: ['ownership-of-shares-50-to-75-percent'], notified_on: '2016-04-06' },
      { name: 'Ms Claire Wright', kind: 'individual-person-with-significant-control', natures_of_control: ['ownership-of-shares-25-to-50-percent'], notified_on: '2019-06-14' },
    ],
    filings: [
      accountsFiling('fx-2-a3', '2025-09-01', '2024-12-31'),
      accountsFiling('fx-2-a2', '2024-09-05', '2023-12-31'),
      accountsFiling('fx-2-a1', '2023-08-30', '2022-12-31'),
    ],
    charges: [
      { id: 'fx-2-ch1', charge_code: '010000020001', created_on: '2021-05-11', delivered_on: '2021-05-14', status: 'outstanding', classification: { description: 'A registered charge' }, persons_entitled: [{ name: 'Barclays Bank PLC' }] },
    ],
    financials: [
      { period_start: '2022-01-01', period_end: '2022-12-31', revenue: 1_450_000, gross_profit: 380_000, operating_profit: 62_000, profit_before_tax: 54_000, net_profit: 43_000, cash: 71_000, current_assets: 520_000, current_liabilities: 470_000, net_assets: 210_000, total_assets: 830_000, total_liabilities: 620_000, employee_count: 18 },
      { period_start: '2023-01-01', period_end: '2023-12-31', revenue: 1_490_000, gross_profit: 372_000, operating_profit: 55_000, profit_before_tax: 44_000, net_profit: 35_000, cash: 64_000, current_assets: 505_000, current_liabilities: 480_000, net_assets: 216_000, total_assets: 840_000, total_liabilities: 624_000, employee_count: 18 },
      { period_start: '2024-01-01', period_end: '2024-12-31', revenue: 1_460_000, gross_profit: 351_000, operating_profit: 41_000, profit_before_tax: 29_000, net_profit: 23_000, cash: 58_000, current_assets: 498_000, current_liabilities: 492_000, net_assets: 224_000, total_assets: 846_000, total_liabilities: 622_000, employee_count: 17 },
    ],
  },

  // 3. Distressed: declining revenue, losses, negative net assets, insolvency history.
  '01000003': {
    label: 'Distressed company',
    profile: {
      company_number: '01000003',
      company_name: 'COASTAL METALWORKS LIMITED',
      company_status: 'active',
      company_status_detail: 'in administration',
      type: 'ltd',
      date_of_creation: '2011-02-18',
      sic_codes: ['25610'],
      registered_office_address: { address_line_1: '3 Dock Road', locality: 'Portsmouth', region: 'Hampshire', postal_code: 'PO1 3AX', country: 'England' },
      accounts: { last_accounts: { made_up_to: '2024-06-30', type: 'full' }, overdue: true },
      has_insolvency_history: true,
      has_charges: true,
    },
    officers: [
      { name: 'BROWN, Gary', officer_role: 'director', appointed_on: '2011-02-18', nationality: 'British', occupation: 'Director', country_of_residence: 'England', date_of_birth: { month: 1, year: 1970 } },
      { name: 'COLE, Janet', officer_role: 'director', appointed_on: '2023-03-01', resigned_on: '2025-01-15', nationality: 'British' },
    ],
    pscs: [{ name: 'Mr Gary Brown', kind: 'individual-person-with-significant-control', natures_of_control: ['ownership-of-shares-75-to-100-percent'], notified_on: '2016-04-06' }],
    filings: [accountsFiling('fx-3-a2', '2025-06-30', '2024-06-30'), accountsFiling('fx-3-a1', '2024-05-20', '2023-06-30')],
    charges: [
      { id: 'fx-3-ch1', charge_code: '010000030001', created_on: '2024-08-01', delivered_on: '2024-08-04', status: 'outstanding', persons_entitled: [{ name: 'Alternative Finance Partners Ltd' }] },
      { id: 'fx-3-ch2', charge_code: '010000030002', created_on: '2025-02-10', delivered_on: '2025-02-12', status: 'outstanding', persons_entitled: [{ name: 'Invoice Finance Co' }] },
    ],
    financials: [
      { period_start: '2022-07-01', period_end: '2023-06-30', revenue: 1_900_000, gross_profit: 260_000, operating_profit: -85_000, profit_before_tax: -120_000, net_profit: -120_000, cash: 22_000, current_assets: 410_000, current_liabilities: 690_000, net_assets: -140_000, total_assets: 620_000, total_liabilities: 760_000, short_term_debt: 300_000, employee_count: 22 },
      { period_start: '2023-07-01', period_end: '2024-06-30', revenue: 1_420_000, gross_profit: 140_000, operating_profit: -230_000, profit_before_tax: -280_000, net_profit: -280_000, cash: 9_000, current_assets: 300_000, current_liabilities: 780_000, net_assets: -420_000, total_assets: 480_000, total_liabilities: 900_000, short_term_debt: 380_000, employee_count: 16 },
    ],
  },

  // 4. Missing accounts: strong-looking business, but nothing extractable.
  '01000004': {
    label: 'Missing accounts',
    profile: {
      company_number: '01000004',
      company_name: 'WEALD INDUSTRIAL HOLDINGS LIMITED',
      company_status: 'active',
      type: 'ltd',
      date_of_creation: '1989-07-05',
      sic_codes: ['28290'],
      registered_office_address: { address_line_1: 'The Old Foundry', locality: 'Haywards Heath', region: 'West Sussex', postal_code: 'RH16 1XX', country: 'England' },
      accounts: { last_accounts: { made_up_to: '2025-01-31', type: 'unaudited-abridged' } },
      has_insolvency_history: false,
      has_charges: false,
    },
    officers: [
      { name: 'FIELDING, Robert Charles', officer_role: 'director', appointed_on: '1989-07-05', nationality: 'British', occupation: 'Managing Director', country_of_residence: 'England', date_of_birth: { month: 9, year: 1954 } },
    ],
    pscs: [{ name: 'Mr Robert Charles Fielding', kind: 'individual-person-with-significant-control', natures_of_control: ['ownership-of-shares-75-to-100-percent'], notified_on: '2016-04-06' }],
    filings: [accountsFiling('fx-4-a1', '2025-10-01', '2025-01-31')],
    charges: [],
    financials: [],
  },

  // 5. Micro company: filleted accounts, balance sheet only, no turnover disclosed.
  '01000005': {
    label: 'Micro company',
    profile: {
      company_number: '01000005',
      company_name: 'BASINGSTOKE TOOLING LIMITED',
      company_status: 'active',
      type: 'ltd',
      date_of_creation: '2016-05-30',
      sic_codes: ['25730'],
      registered_office_address: { address_line_1: '8 Chineham Court', locality: 'Basingstoke', region: 'Hampshire', postal_code: 'RG24 8AA', country: 'England' },
      accounts: { last_accounts: { made_up_to: '2025-05-31', type: 'micro-entity' } },
      has_insolvency_history: false,
      has_charges: false,
    },
    officers: [{ name: 'OKAFOR, Daniel', officer_role: 'director', appointed_on: '2016-05-30', nationality: 'British', occupation: 'Toolmaker', country_of_residence: 'England', date_of_birth: { month: 4, year: 1988 } }],
    pscs: [{ name: 'Mr Daniel Okafor', kind: 'individual-person-with-significant-control', natures_of_control: ['ownership-of-shares-75-to-100-percent'], notified_on: '2016-05-30' }],
    filings: [accountsFiling('fx-5-a2', '2025-11-10', '2025-05-31'), accountsFiling('fx-5-a1', '2024-11-08', '2024-05-31')],
    charges: [],
    financials: [
      { period_start: '2023-06-01', period_end: '2024-05-31', cash: 41_000, current_assets: 96_000, current_liabilities: 58_000, fixed_assets: 34_000, net_assets: 72_000, total_assets: 130_000, total_liabilities: 58_000 },
      { period_start: '2024-06-01', period_end: '2025-05-31', cash: 52_000, current_assets: 112_000, current_liabilities: 61_000, fixed_assets: 31_000, net_assets: 82_000, total_assets: 143_000, total_liabilities: 61_000 },
    ],
  },

  // 6. Multiple directors, dispersed ownership: good business, poor ownership fit.
  '01000006': {
    label: 'Multiple-director company',
    profile: {
      company_number: '01000006',
      company_name: 'THAMES VALLEY ENGINEERING GROUP LIMITED',
      company_status: 'active',
      type: 'ltd',
      date_of_creation: '2005-01-24',
      sic_codes: ['28990', '71121'],
      registered_office_address: { address_line_1: 'Kingfisher House', locality: 'Reading', region: 'Berkshire', postal_code: 'RG1 8LS', country: 'England' },
      accounts: { last_accounts: { made_up_to: '2024-12-31', type: 'full' } },
      has_insolvency_history: false,
      has_charges: false,
    },
    officers: [
      { name: 'CLARKE, Peter', officer_role: 'director', appointed_on: '2005-01-24', nationality: 'British', date_of_birth: { month: 5, year: 1966 } },
      { name: 'NGUYEN, Linh', officer_role: 'director', appointed_on: '2012-03-11', nationality: 'British', date_of_birth: { month: 7, year: 1979 } },
      { name: 'ROBERTS, Alan', officer_role: 'director', appointed_on: '2016-08-19', nationality: 'British', date_of_birth: { month: 12, year: 1974 } },
      { name: 'SHAW, Emily', officer_role: 'director', appointed_on: '2021-02-02', nationality: 'British', date_of_birth: { month: 8, year: 1985 } },
      { name: 'DUNN, Marcus', officer_role: 'director', appointed_on: '2023-10-05', nationality: 'British', date_of_birth: { month: 3, year: 1990 } },
    ],
    pscs: [
      { name: 'TVE Investments LLP', kind: 'corporate-entity-person-with-significant-control', natures_of_control: ['ownership-of-shares-25-to-50-percent'], notified_on: '2016-04-06' },
      { name: 'Mr Peter Clarke', kind: 'individual-person-with-significant-control', natures_of_control: ['ownership-of-shares-25-to-50-percent'], notified_on: '2016-04-06' },
    ],
    filings: [accountsFiling('fx-6-a2', '2025-08-14', '2024-12-31'), accountsFiling('fx-6-a1', '2024-08-12', '2023-12-31')],
    charges: [],
    financials: [
      { period_start: '2023-01-01', period_end: '2023-12-31', revenue: 6_800_000, gross_profit: 2_040_000, operating_profit: 610_000, profit_before_tax: 600_000, net_profit: 470_000, cash: 900_000, current_assets: 3_100_000, current_liabilities: 1_800_000, net_assets: 2_050_000, total_assets: 4_400_000, total_liabilities: 2_350_000, employee_count: 74 },
      { period_start: '2024-01-01', period_end: '2024-12-31', revenue: 7_400_000, gross_profit: 2_280_000, operating_profit: 690_000, profit_before_tax: 678_000, net_profit: 530_000, cash: 1_050_000, current_assets: 3_400_000, current_liabilities: 1_900_000, net_assets: 2_400_000, total_assets: 4_800_000, total_liabilities: 2_400_000, employee_count: 79 },
    ],
  },

  // 7. Long-standing owner-controlled: modest growth, very strong succession signal.
  '01000007': {
    label: 'Long-standing owner-controlled company',
    profile: {
      company_number: '01000007',
      company_name: 'DOWNLAND ELECTRICAL CONTRACTORS LIMITED',
      company_status: 'active',
      type: 'ltd',
      date_of_creation: '1986-10-09',
      sic_codes: ['43210'],
      registered_office_address: { address_line_1: '17 Priory Road', locality: 'Winchester', region: 'Hampshire', postal_code: 'SO23 9QH', country: 'England' },
      accounts: { last_accounts: { made_up_to: '2025-02-28', type: 'full' } },
      confirmation_statement: { last_made_up_to: '2025-10-11' },
      has_insolvency_history: false,
      has_charges: false,
    },
    officers: [
      { name: 'WHITTAKER, Alan George', officer_role: 'director', appointed_on: '1991-01-15', nationality: 'British', occupation: 'Electrical Contractor', country_of_residence: 'England', date_of_birth: { month: 10, year: 1951 }, links: { officer: { appointments: '/officers/aw-fixture-7/appointments' } } },
    ],
    pscs: [{ name: 'Mr Alan George Whittaker', kind: 'individual-person-with-significant-control', natures_of_control: ['ownership-of-shares-75-to-100-percent', 'voting-rights-75-to-100-percent', 'right-to-appoint-and-remove-directors'], notified_on: '2016-04-06' }],
    filings: [
      accountsFiling('fx-7-a4', '2025-11-20', '2025-02-28'),
      accountsFiling('fx-7-a3', '2024-11-18', '2024-02-29'),
      accountsFiling('fx-7-a2', '2023-11-21', '2023-02-28'),
      accountsFiling('fx-7-a1', '2022-11-16', '2022-02-28'),
    ],
    charges: [],
    financials: [
      { period_start: '2021-03-01', period_end: '2022-02-28', revenue: 1_620_000, gross_profit: 486_000, operating_profit: 168_000, profit_before_tax: 166_000, net_profit: 134_000, cash: 310_000, current_assets: 700_000, current_liabilities: 290_000, net_assets: 640_000, total_assets: 960_000, total_liabilities: 320_000, employee_count: 14 },
      { period_start: '2022-03-01', period_end: '2023-02-28', revenue: 1_710_000, gross_profit: 522_000, operating_profit: 182_000, profit_before_tax: 180_000, net_profit: 145_000, cash: 366_000, current_assets: 750_000, current_liabilities: 295_000, net_assets: 700_000, total_assets: 1_010_000, total_liabilities: 310_000, employee_count: 14 },
      { period_start: '2023-03-01', period_end: '2024-02-29', revenue: 1_805_000, gross_profit: 559_000, operating_profit: 196_000, profit_before_tax: 195_000, net_profit: 157_000, cash: 421_000, current_assets: 806_000, current_liabilities: 300_000, net_assets: 770_000, total_assets: 1_080_000, total_liabilities: 310_000, employee_count: 15 },
      { period_start: '2024-03-01', period_end: '2025-02-28', revenue: 1_890_000, gross_profit: 592_000, operating_profit: 211_000, profit_before_tax: 210_000, net_profit: 170_000, cash: 488_000, current_assets: 870_000, current_liabilities: 305_000, net_assets: 845_000, total_assets: 1_155_000, total_liabilities: 310_000, employee_count: 15 },
    ],
  },
};

export function fixtureSearchItems(): CHAdvancedSearchItem[] {
  return Object.values(FIXTURES).map(({ profile }) => ({
    company_number: profile.company_number,
    company_name: profile.company_name,
    company_status: profile.company_status,
    company_type: profile.type,
    date_of_creation: profile.date_of_creation,
    sic_codes: profile.sic_codes,
    registered_office_address: profile.registered_office_address,
  }));
}
