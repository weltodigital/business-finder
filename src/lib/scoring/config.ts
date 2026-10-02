/** A band list is [threshold, points] pairs, evaluated highest threshold first. */
export type Band = [number, number];

export interface BandedRule {
  max: number;
  bands: Band[];
}

export interface ScoringConfig {
  max_score: number;
  components: {
    financial_quality: {
      max: number;
      /** Awarded when visibility is LOW: absence of data is not bad performance. */
      unknown_score: number;
      rules: {
        revenue_cagr: BandedRule;
        operating_margin: BandedRule;
        profit_consistency: BandedRule;
        cash_position: BandedRule;
        balance_sheet: BandedRule;
      };
    };
    acquisition_fit: {
      max: number;
      rules: { industry: number; geography: number; size: number; age: number };
    };
    ownership: {
      max: number;
      rules: {
        owner_controlled: number;
        concentrated_ownership: number;
        founder_or_long_standing_director: number;
        no_institutional_owner: number;
      };
    };
    succession_signal: {
      max: number;
      rules: {
        long_standing_director_years: BandedRule;
        company_age_years: BandedRule;
        few_directors: { max: number };
        concentrated_control: { max: number };
      };
    };
    company_quality: {
      max: number;
      rules: {
        longevity: number;
        web_presence: number;
        reputation: number;
        employees: number;
        filing_discipline: number;
      };
    };
    risk_adjustment: {
      min: number;
      rules: Record<string, number>;
    };
  };
}

export const SCORING_VERSION = 'v1';

/**
 * Mirrors supabase/migrations/0003_seed_scoring.sql. The database row is
 * authoritative at runtime; this is the fallback and the shape reference.
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  max_score: 100,
  components: {
    financial_quality: {
      max: 30,
      unknown_score: 15,
      rules: {
        revenue_cagr: { max: 8, bands: [[0.15, 8], [0.08, 6], [0.03, 4], [0.0, 2], [-1, 0]] },
        operating_margin: { max: 8, bands: [[0.15, 8], [0.1, 6], [0.06, 4], [0.02, 2], [-1, 0]] },
        profit_consistency: { max: 6, bands: [[1.0, 6], [0.75, 4], [0.5, 2], [0.0, 0]] },
        cash_position: { max: 4, bands: [[0.2, 4], [0.1, 3], [0.05, 2], [0.0, 1]] },
        balance_sheet: { max: 4, bands: [[2.0, 4], [1.5, 3], [1.0, 2], [0.0, 0]] },
      },
    },
    acquisition_fit: {
      max: 20,
      rules: { industry: 7, geography: 6, size: 4, age: 3 },
    },
    ownership: {
      max: 15,
      rules: {
        owner_controlled: 6,
        concentrated_ownership: 4,
        founder_or_long_standing_director: 3,
        no_institutional_owner: 2,
      },
    },
    succession_signal: {
      max: 15,
      rules: {
        long_standing_director_years: { max: 6, bands: [[25, 6], [20, 5], [15, 4], [10, 2], [0, 0]] },
        company_age_years: { max: 4, bands: [[30, 4], [20, 3], [15, 2], [0, 0]] },
        few_directors: { max: 3 },
        concentrated_control: { max: 2 },
      },
    },
    company_quality: {
      max: 10,
      rules: {
        longevity: 3,
        web_presence: 2,
        reputation: 2,
        employees: 2,
        filing_discipline: 1,
      },
    },
    risk_adjustment: {
      min: -10,
      rules: {
        insolvency: -10,
        dissolved_or_inactive: -6,
        repeated_late_filings: -3,
        recent_unsatisfied_charge: -2,
        high_director_turnover: -2,
        declining_revenue: -3,
        loss_making_latest: -3,
        negative_net_assets: -3,
      },
    },
  },
};

/** Highest matching band wins; returns 0 when nothing matches. */
export function scoreBand(value: number, bands: Band[]): number {
  const ordered = [...bands].sort((a, b) => b[0] - a[0]);
  for (const [threshold, points] of ordered) {
    if (value >= threshold) return points;
  }
  return 0;
}
