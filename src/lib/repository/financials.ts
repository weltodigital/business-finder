import { getAdminClient } from '@/lib/supabase/admin';
import type { ExtractedFact } from '@/lib/accounts/metrics';
import type { FinancialPeriod } from '@/lib/accounts/normalise';
import type { FinancialSummary } from '@/lib/financials/analytics';

export async function replaceFactsForDocument(
  companyId: string,
  financialDocumentId: string,
  facts: ExtractedFact[],
): Promise<void> {
  const db = getAdminClient();
  await db.from('financial_facts').delete().eq('financial_document_id', financialDocumentId);
  if (facts.length === 0) return;

  await db.from('financial_facts').insert(
    facts.map((fact) => ({
      company_id: companyId,
      financial_document_id: financialDocumentId,
      metric: fact.metric,
      value: fact.value,
      currency: fact.currency ?? null,
      period_start: fact.periodStart ?? null,
      period_end: fact.periodEnd ?? null,
      is_instant: fact.isInstant,
      unit: fact.unit ?? null,
      scale: fact.scale ?? null,
      source_page: fact.sourcePage ?? null,
      source_location: fact.sourceLocation ?? null,
      extraction_method: fact.extractionMethod,
      confidence: fact.confidence,
      is_reported: fact.isReported,
      is_estimated: fact.isEstimated,
    })),
  );
}

export async function loadFactsForCompany(
  companyId: string,
): Promise<Array<ExtractedFact & { documentId?: string }>> {
  const db = getAdminClient();
  const { data } = await db
    .from('financial_facts')
    .select('*')
    .eq('company_id', companyId)
    .order('period_end', { ascending: true });

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    metric: row.metric as ExtractedFact['metric'],
    value: Number(row.value),
    currency: (row.currency as string) ?? undefined,
    periodStart: (row.period_start as string) ?? null,
    periodEnd: (row.period_end as string) ?? null,
    isInstant: Boolean(row.is_instant),
    unit: (row.unit as string) ?? undefined,
    scale: (row.scale as number) ?? undefined,
    sourcePage: (row.source_page as string) ?? undefined,
    sourceLocation: (row.source_location as string) ?? undefined,
    extractionMethod: row.extraction_method as ExtractedFact['extractionMethod'],
    confidence: Number(row.confidence ?? 0),
    isReported: Boolean(row.is_reported),
    isEstimated: Boolean(row.is_estimated),
    documentId: (row.financial_document_id as string) ?? undefined,
  }));
}

export async function replaceFinancialPeriods(
  companyId: string,
  periods: FinancialPeriod[],
): Promise<void> {
  const db = getAdminClient();
  await db.from('financial_periods').delete().eq('company_id', companyId);
  if (periods.length === 0) return;

  await db.from('financial_periods').insert(
    periods.map((period) => ({
      company_id: companyId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      months: period.months,
      revenue: period.revenue,
      cost_of_sales: period.costOfSales,
      gross_profit: period.grossProfit,
      operating_profit: period.operatingProfit,
      profit_before_tax: period.profitBeforeTax,
      tax: period.tax,
      net_profit: period.netProfit,
      dividends: period.dividends,
      cash: period.cash,
      trade_receivables: period.tradeReceivables,
      trade_payables: period.tradePayables,
      current_assets: period.currentAssets,
      current_liabilities: period.currentLiabilities,
      fixed_assets: period.fixedAssets,
      intangible_assets: period.intangibleAssets,
      total_assets: period.totalAssets,
      total_liabilities: period.totalLiabilities,
      net_assets: period.netAssets,
      short_term_debt: period.shortTermDebt,
      long_term_debt: period.longTermDebt,
      employee_count: period.employeeCount,
      directors_remuneration: period.directorsRemuneration,
      gross_margin: period.grossMargin,
      operating_margin: period.operatingMargin,
      net_margin: period.netMargin,
      current_ratio: period.currentRatio,
      source_document_ids: period.sourceDocumentIds,
      has_estimates: period.hasEstimates,
      validation_status: period.validationStatus,
      validation_issues: period.validationIssues,
    })),
  );
}

export async function loadFinancialPeriods(companyId: string): Promise<FinancialPeriod[]> {
  const db = getAdminClient();
  const { data } = await db
    .from('financial_periods')
    .select('*')
    .eq('company_id', companyId)
    .order('period_end', { ascending: true });

  return ((data ?? []) as Record<string, unknown>[]).map(rowToPeriod);
}

function num(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function rowToPeriod(row: Record<string, unknown>): FinancialPeriod {
  return {
    periodStart: (row.period_start as string) ?? null,
    periodEnd: row.period_end as string,
    months: num(row.months),
    revenue: num(row.revenue),
    costOfSales: num(row.cost_of_sales),
    grossProfit: num(row.gross_profit),
    operatingProfit: num(row.operating_profit),
    profitBeforeTax: num(row.profit_before_tax),
    tax: num(row.tax),
    netProfit: num(row.net_profit),
    dividends: num(row.dividends),
    cash: num(row.cash),
    tradeReceivables: num(row.trade_receivables),
    tradePayables: num(row.trade_payables),
    currentAssets: num(row.current_assets),
    currentLiabilities: num(row.current_liabilities),
    fixedAssets: num(row.fixed_assets),
    intangibleAssets: num(row.intangible_assets),
    totalAssets: num(row.total_assets),
    totalLiabilities: num(row.total_liabilities),
    netAssets: num(row.net_assets),
    shortTermDebt: num(row.short_term_debt),
    longTermDebt: num(row.long_term_debt),
    employeeCount: num(row.employee_count),
    directorsRemuneration: num(row.directors_remuneration),
    grossMargin: num(row.gross_margin),
    operatingMargin: num(row.operating_margin),
    netMargin: num(row.net_margin),
    currentRatio: num(row.current_ratio),
    hasEstimates: Boolean(row.has_estimates),
    validationStatus: (row.validation_status as 'ok' | 'needs_review') ?? 'ok',
    validationIssues: (row.validation_issues as FinancialPeriod['validationIssues']) ?? [],
    sourceDocumentIds: (row.source_document_ids as string[]) ?? [],
  };
}

export async function saveFinancialSummary(
  companyId: string,
  summary: FinancialSummary,
): Promise<void> {
  const db = getAdminClient();
  await db.from('company_financials_summary').upsert(
    {
      company_id: companyId,
      financial_visibility: summary.financialVisibility,
      periods_available: summary.periodsAvailable,
      first_period_end: summary.firstPeriodEnd,
      latest_period_end: summary.latestPeriodEnd,
      latest_revenue: summary.latestRevenue,
      latest_operating_profit: summary.latestOperatingProfit,
      latest_net_profit: summary.latestNetProfit,
      latest_cash: summary.latestCash,
      latest_net_assets: summary.latestNetAssets,
      latest_total_debt: summary.latestTotalDebt,
      latest_employee_count: summary.latestEmployeeCount,
      revenue_cagr: summary.revenueCagr,
      operating_profit_cagr: summary.operatingProfitCagr,
      revenue_growth_yoy: summary.revenueGrowthYoY,
      operating_profit_growth_yoy: summary.operatingProfitGrowthYoY,
      cash_growth_yoy: summary.cashGrowthYoY,
      avg_operating_margin: summary.avgOperatingMargin,
      latest_operating_margin: summary.latestOperatingMargin,
      latest_gross_margin: summary.latestGrossMargin,
      latest_net_margin: summary.latestNetMargin,
      latest_current_ratio: summary.latestCurrentRatio,
      revenue_consistency: summary.revenueConsistency,
      profit_consistency: summary.profitConsistency,
      revenue_per_employee: summary.revenuePerEmployee,
      profit_per_employee: summary.profitPerEmployee,
      debt_to_operating_profit: summary.debtToOperatingProfit,
      computed_at: new Date().toISOString(),
    },
    { onConflict: 'company_id' },
  );
}
