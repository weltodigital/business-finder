import { getAdminClient } from '@/lib/supabase/admin';
import { loadDossier } from '@/lib/repository/dossier';
import { detectSignals, type Signal } from '@/lib/signals';
import { scoreCompany, type ScoreResult } from '@/lib/scoring';
import { DEFAULT_SCORING_CONFIG, SCORING_VERSION, type ScoringConfig } from '@/lib/scoring/config';
import type { AcquisitionThesis, CompanyDossier } from '@/lib/types';

export interface ScoredCompany {
  dossier: CompanyDossier;
  signals: Signal[];
  score: ScoreResult;
}

let configCache: { version: string; config: ScoringConfig } | null = null;

/**
 * Scoring rules live in the database so the model can be retuned without a
 * deploy. The bundled default is the fallback when no active row exists.
 */
export async function loadActiveScoringConfig(): Promise<{ version: string; config: ScoringConfig }> {
  if (configCache) return configCache;

  try {
    const { data } = await getAdminClient()
      .from('scoring_configs')
      .select('version, config')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.config) {
      configCache = { version: data.version as string, config: data.config as ScoringConfig };
      return configCache;
    }
  } catch {
    // Fall through to the bundled default.
  }

  configCache = { version: SCORING_VERSION, config: DEFAULT_SCORING_CONFIG };
  return configCache;
}

export function clearScoringConfigCache(): void {
  configCache = null;
}

/** Recomputes signals and the acquisition score, and stores both. */
export async function scoreAndPersist(
  companyNumber: string,
  thesis: AcquisitionThesis | null = null,
): Promise<ScoredCompany | null> {
  const dossier = await loadDossier(companyNumber);
  if (!dossier || !dossier.company.id) return null;

  const signals = detectSignals(dossier);
  const { version, config } = await loadActiveScoringConfig();
  const score = scoreCompany(dossier, signals, { thesis, config });

  const db = getAdminClient();

  await db.from('signals').delete().eq('company_id', dossier.company.id);
  if (signals.length > 0) {
    await db.from('signals').insert(
      signals.map((signal) => ({
        company_id: dossier.company.id,
        signal_type: signal.signalType,
        severity: signal.severity,
        title: signal.title,
        description: signal.description,
        source: signal.source,
        evidence: signal.evidence ?? null,
        detected_at: signal.detectedAt,
      })),
    );
  }

  const component = (key: string) => score.components.find((c) => c.key === key)?.score ?? 0;

  await db.from('company_scores').upsert(
    {
      company_id: dossier.company.id,
      thesis_id: thesis?.id ?? null,
      scoring_version: version,
      total_score: score.total,
      financial_quality: component('financial_quality'),
      acquisition_fit: component('acquisition_fit'),
      ownership: component('ownership'),
      succession_signal: component('succession_signal'),
      company_quality: component('company_quality'),
      risk_adjustment: component('risk_adjustment'),
      financial_visibility: score.financialVisibility,
      breakdown: { components: score.components },
      computed_at: new Date().toISOString(),
    },
    { onConflict: 'company_id,thesis_id,scoring_version' },
  );

  return { dossier, signals, score };
}
