import type { FinancialMetric } from './metrics';

/**
 * UK GAAP / FRS 102 / IFRS XBRL element names mapped to our canonical metrics.
 * Keys are lower-cased local names (namespace prefix stripped).
 *
 * Ordering matters where several tags map to the same metric: the more precise
 * tag wins because it is selected first by `metricForTag`, which returns on the
 * first exact match.
 */
const EXACT: Record<string, FinancialMetric> = {
  // Income statement
  turnoverrevenue: 'revenue',
  turnover: 'revenue',
  revenue: 'revenue',
  revenuefromsaleofgoods: 'revenue',
  turnovergrossoperatingrevenue: 'revenue',
  grossoperatingrevenue: 'revenue',
  revenuefromrenderingofservices: 'revenue',

  costofsales: 'cost_of_sales',
  costofsalescostofgoodssold: 'cost_of_sales',

  grossprofitloss: 'gross_profit',
  grossprofit: 'gross_profit',

  operatingprofitloss: 'operating_profit',
  operatingprofit: 'operating_profit',

  profitlossonordinaryactivitiesbeforetax: 'profit_before_tax',
  profitlossbeforetax: 'profit_before_tax',
  profitlossbeforetaxation: 'profit_before_tax',

  taxtaxcreditonprofitorlossonordinaryactivities: 'tax',
  taxexpensecreditonprofitorlossfromordinaryactivities: 'tax',
  taxexpensecredit: 'tax',
  taxonprofitorlossonordinaryactivities: 'tax',

  profitloss: 'net_profit',
  profitlossforperiod: 'net_profit',
  profitlossattributabletoownersofparent: 'net_profit',

  dividendspaid: 'dividends',
  dividendspaidonshares: 'dividends',
  dividendspaidclassordinaryshares: 'dividends',
  equitydividendspaid: 'dividends',

  // Balance sheet
  cashbankonhand: 'cash',
  cashbankinhand: 'cash',
  cashandcashequivalents: 'cash_and_equivalents',
  cashcashequivalents: 'cash_and_equivalents',

  tradedebtorstradereceivables: 'trade_receivables',
  tradereceivables: 'trade_receivables',
  tradedebtors: 'trade_receivables',

  tradecreditorstradepayables: 'trade_payables',
  tradepayables: 'trade_payables',
  tradecreditors: 'trade_payables',

  currentassets: 'current_assets',
  totalcurrentassets: 'current_assets',

  creditorsduewithinoneyear: 'current_liabilities',
  currentliabilities: 'current_liabilities',
  totalcurrentliabilities: 'current_liabilities',

  fixedassets: 'fixed_assets',
  totalfixedassets: 'fixed_assets',
  propertyplantequipment: 'fixed_assets',

  intangibleassets: 'intangible_assets',
  intangibleassetsotherthangoodwill: 'intangible_assets',

  assets: 'total_assets',
  totalassets: 'total_assets',

  liabilities: 'total_liabilities',
  totalliabilities: 'total_liabilities',

  netassetsliabilities: 'net_assets',
  netassetsliabilitiesincludingpensionassetliability: 'net_assets',
  netassets: 'net_assets',
  equity: 'net_assets',
  shareholderfunds: 'net_assets',

  bankborrowingsduewithinoneyear: 'short_term_debt',
  bankloansoverdrafts: 'short_term_debt',
  borrowingscurrent: 'short_term_debt',

  creditorsdueafteroneyear: 'long_term_debt',
  bankborrowingsdueafteroneyear: 'long_term_debt',
  borrowingsnoncurrent: 'long_term_debt',

  // Notes
  averagenumberemployeesduringperiod: 'employee_count',
  numberofemployeestotal: 'employee_count',
  averagenumberofemployees: 'employee_count',
  employeestotal: 'employee_count',

  directorsremuneration: 'directors_remuneration',
  directorsremunerationincludingsocialsecuritycosts: 'directors_remuneration',
};

/**
 * Derived metrics that are only meaningful when the exact tag is absent.
 * `total_assets_less_current_liabilities` is a very common FRS 102 line, but it
 * is not total assets, so it is deliberately not mapped.
 */
const IGNORED = new Set([
  'totalassetslesscurrentliabilities',
  'netcurrentassetsliabilities',
]);

export function metricForTag(localName: string): FinancialMetric | null {
  const key = localName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (IGNORED.has(key)) return null;
  return EXACT[key] ?? null;
}

export function stripNamespace(tagName: string): string {
  const idx = tagName.indexOf(':');
  return idx === -1 ? tagName : tagName.slice(idx + 1);
}
