import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { ExtractedFact, FinancialMetric } from './metrics';
import { INSTANT_METRICS } from './metrics';
import { metricForTag, stripNamespace } from './tag-map';

interface XbrlContext {
  id: string;
  startDate?: string;
  endDate?: string;
  instant?: string;
  hasDimensions: boolean;
}

export interface XbrlParseResult {
  facts: ExtractedFact[];
  method: 'ixbrl' | 'xbrl';
  contextsFound: number;
  /** Period ends seen, most recent first — used to pick the reporting period. */
  periodEnds: string[];
}

/**
 * Parses inline XBRL (the format Companies House serves for most modern
 * accounts) and plain XBRL instance documents. Facts carry their reporting
 * period so multiple comparative years in one document stay separate.
 */
export function parseXbrl(source: string): XbrlParseResult {
  const $ = cheerio.load(source, { xml: { xmlMode: true, lowerCaseAttributeNames: false, decodeEntities: true } });

  const contexts = collectContexts($);
  const isInline = /<ix:|xmlns:ix=/i.test(source);
  const method: 'ixbrl' | 'xbrl' = isInline ? 'ixbrl' : 'xbrl';

  const facts: ExtractedFact[] = [];
  const seen = new Set<string>();

  $('*').each((_i, node) => {
    const el = node as Element;
    if (!el.tagName) return;

    const local = stripNamespace(el.tagName).toLowerCase();
    const isInlineNumeric = local === 'nonfraction';

    // Inline XBRL puts the concept in @name; plain XBRL uses the element name.
    const conceptName = isInlineNumeric ? (el.attribs?.name ?? '') : el.tagName;
    if (!conceptName) return;

    const attribs = el.attribs ?? {};
    const contextRef = attribs.contextRef ?? attribs.contextref;
    if (!contextRef) return;

    const metric = metricForTag(stripNamespace(conceptName));
    if (!metric) return;

    const context = contexts.get(contextRef);
    // Dimensioned contexts describe segments (a subsidiary, a share class),
    // not the entity totals we want.
    if (!context || context.hasDimensions) return;

    const raw = $(el).text();
    const parsed = parseNumeric(raw, attribs);
    if (parsed === null) return;

    const instant = Boolean(context.instant);
    const periodEnd = context.instant ?? context.endDate ?? null;
    const periodStart = context.instant ? null : (context.startDate ?? null);

    const key = `${metric}|${periodStart ?? ''}|${periodEnd ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);

    facts.push({
      metric,
      value: parsed.value,
      currency: currencyFromUnit(attribs.unitRef ?? attribs.unitref, $),
      periodStart,
      periodEnd,
      isInstant: instant || INSTANT_METRICS.has(metric as FinancialMetric),
      unit: attribs.unitRef ?? attribs.unitref,
      scale: parsed.scale,
      sourceLocation: stripNamespace(conceptName),
      extractionMethod: method,
      confidence: 0.98,
      isReported: true,
      isEstimated: false,
    });
  });

  const periodEnds = Array.from(
    new Set(facts.map((f) => f.periodEnd).filter((d): d is string => Boolean(d))),
  ).sort((a, b) => b.localeCompare(a));

  return { facts, method, contextsFound: contexts.size, periodEnds };
}

function collectContexts($: cheerio.CheerioAPI): Map<string, XbrlContext> {
  const contexts = new Map<string, XbrlContext>();

  $('*').each((_i, node) => {
    const el = node as Element;
    if (!el.tagName || stripNamespace(el.tagName).toLowerCase() !== 'context') return;

    const id = el.attribs?.id;
    if (!id) return;

    const text = (selector: string) => {
      const found = findDescendant(el, selector);
      return found ? textOf(found).trim() : undefined;
    };

    contexts.set(id, {
      id,
      startDate: text('startdate'),
      endDate: text('enddate'),
      instant: text('instant'),
      hasDimensions:
        Boolean(findDescendant(el, 'explicitmember')) || Boolean(findDescendant(el, 'typedmember')),
    });
  });

  return contexts;
}

function findDescendant(el: Element, localName: string): Element | null {
  for (const child of (el.children ?? []) as AnyNode[]) {
    const node = child as Element;
    if (node.tagName && stripNamespace(node.tagName).toLowerCase() === localName) return node;
    if (node.children) {
      const nested = findDescendant(node, localName);
      if (nested) return nested;
    }
  }
  return null;
}

function textOf(el: Element): string {
  let out = '';
  for (const child of (el.children ?? []) as AnyNode[]) {
    if (child.type === 'text') out += (child as unknown as { data: string }).data;
    else if ((child as Element).children) out += textOf(child as Element);
  }
  return out;
}

/**
 * iXBRL numbers are presentation strings: they can carry thousands separators,
 * a `scale` multiplier, an explicit `sign`, and brackets for negatives.
 */
export function parseNumeric(
  raw: string,
  attribs: Record<string, string> = {},
): { value: number; scale: number } | null {
  let text = raw.replace(/\s| /g, '').trim();
  if (!text) return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }

  // Strip currency symbols and thousands separators, keep decimal point.
  text = text.replace(/[£$€,]/g, '');
  if (text === '-' || text === '—' || text === '') return { value: 0, scale: 0 };
  if (!/^-?\d*\.?\d+$/.test(text)) return null;

  let value = Number(text);
  if (!Number.isFinite(value)) return null;

  const scale = Number(attribs.scale ?? attribs.Scale ?? 0);
  if (Number.isFinite(scale) && scale !== 0) value *= 10 ** scale;

  const sign = attribs.sign ?? attribs.Sign;
  if (sign === '-') negative = true;
  if (negative) value = -Math.abs(value);

  return { value, scale: Number.isFinite(scale) ? scale : 0 };
}

function currencyFromUnit(unitRef: string | undefined, $: cheerio.CheerioAPI): string | undefined {
  if (!unitRef) return undefined;
  if (/gbp/i.test(unitRef)) return 'GBP';
  if (/eur/i.test(unitRef)) return 'EUR';
  if (/usd/i.test(unitRef)) return 'USD';

  let measure: string | undefined;
  $('*').each((_i, node) => {
    const el = node as Element;
    if (measure) return;
    if (!el.tagName || stripNamespace(el.tagName).toLowerCase() !== 'unit') return;
    if (el.attribs?.id !== unitRef) return;
    const m = findDescendant(el, 'measure');
    if (m) measure = textOf(m).trim();
  });

  if (!measure) return undefined;
  const local = stripNamespace(measure).toUpperCase();
  return /^[A-Z]{3}$/.test(local) ? local : undefined;
}
