-- Default scoring configuration (v1). Weights are data, not code, so the model
-- can be retuned without re-extracting any company data.
insert into scoring_configs (version, is_active, config) values (
  'v1',
  true,
  '{
    "max_score": 100,
    "components": {
      "financial_quality": {
        "max": 30,
        "unknown_score": 15,
        "rules": {
          "revenue_cagr":       { "max": 8,  "bands": [[0.15, 8], [0.08, 6], [0.03, 4], [0.0, 2], [-1, 0]] },
          "operating_margin":   { "max": 8,  "bands": [[0.15, 8], [0.10, 6], [0.06, 4], [0.02, 2], [-1, 0]] },
          "profit_consistency": { "max": 6,  "bands": [[1.0, 6], [0.75, 4], [0.5, 2], [0.0, 0]] },
          "cash_position":      { "max": 4,  "bands": [[0.20, 4], [0.10, 3], [0.05, 2], [0.0, 1]] },
          "balance_sheet":      { "max": 4,  "bands": [[2.0, 4], [1.5, 3], [1.0, 2], [0.0, 0]] }
        }
      },
      "acquisition_fit": {
        "max": 20,
        "rules": { "industry": 7, "geography": 6, "size": 4, "age": 3 }
      },
      "ownership": {
        "max": 15,
        "rules": {
          "owner_controlled": 6,
          "concentrated_ownership": 4,
          "founder_or_long_standing_director": 3,
          "no_institutional_owner": 2
        }
      },
      "succession_signal": {
        "max": 15,
        "rules": {
          "long_standing_director_years": { "max": 6, "bands": [[25, 6], [20, 5], [15, 4], [10, 2], [0, 0]] },
          "company_age_years":            { "max": 4, "bands": [[30, 4], [20, 3], [15, 2], [0, 0]] },
          "few_directors":                { "max": 3 },
          "concentrated_control":         { "max": 2 }
        }
      },
      "company_quality": {
        "max": 10,
        "rules": {
          "longevity": 3,
          "web_presence": 2,
          "reputation": 2,
          "employees": 2,
          "filing_discipline": 1
        }
      },
      "risk_adjustment": {
        "min": -10,
        "rules": {
          "insolvency": -10,
          "dissolved_or_inactive": -6,
          "repeated_late_filings": -3,
          "recent_unsatisfied_charge": -2,
          "high_director_turnover": -2,
          "declining_revenue": -3,
          "loss_making_latest": -3,
          "negative_net_assets": -3
        }
      }
    }
  }'::jsonb
);
