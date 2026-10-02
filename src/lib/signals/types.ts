export const SIGNAL_TYPES = [
  'LONG_STANDING_OWNER',
  'OWNER_CONTROLLED',
  'CONCENTRATED_OWNERSHIP',
  'SOLE_DIRECTOR',
  'STRONG_REVENUE_GROWTH',
  'STRONG_PROFIT_GROWTH',
  'MARGIN_IMPROVEMENT',
  'STRONG_CASH_POSITION',
  'CONSISTENTLY_PROFITABLE',
  'RECENT_DIRECTOR_CHANGE',
  'DIRECTOR_TURNOVER',
  'NEW_CHARGE',
  'UNSATISFIED_CHARGES',
  'LATE_FILING',
  'INSOLVENCY',
  'LONG_ESTABLISHED',
  'MULTIPLE_RELATED_COMPANIES',
  'INSTITUTIONAL_OWNERSHIP',
  'DECLINING_REVENUE',
  'LOSS_MAKING',
  'NEGATIVE_NET_ASSETS',
  'LIMITED_FINANCIAL_VISIBILITY',
  'NO_ACCOUNTS_AVAILABLE',
  'STRONG_WEB_PRESENCE',
  'NO_WEBSITE_FOUND',
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export type SignalSeverity = 'positive' | 'neutral' | 'caution' | 'negative';

export interface Signal {
  signalType: SignalType;
  severity: SignalSeverity;
  title: string;
  description: string;
  source: 'companies_house' | 'financials' | 'website' | 'derived';
  evidence?: Record<string, unknown>;
  detectedAt: string;
}
