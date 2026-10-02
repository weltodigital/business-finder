/**
 * A small, curated set of SIC groupings for the industries this user searches.
 * Not a complete SIC index — it exists so the search form can offer sensible
 * starting points instead of asking for raw codes.
 */
export interface SicGroup {
  label: string;
  codes: string[];
  keywords: string[];
}

export const SIC_GROUPS: SicGroup[] = [
  {
    label: 'Precision engineering & machining',
    codes: ['25620', '28490', '28990', '25730'],
    keywords: ['precision engineering', 'CNC', 'machining', 'toolmaking'],
  },
  {
    label: 'Metal fabrication',
    codes: ['25110', '25120', '25610', '25990'],
    keywords: ['fabrication', 'welding', 'sheet metal'],
  },
  {
    label: 'Industrial machinery manufacture',
    codes: ['28290', '28960', '28220', '33200'],
    keywords: ['machinery', 'plant', 'automation'],
  },
  {
    label: 'Electrical contracting',
    codes: ['43210'],
    keywords: ['electrical contractor', 'electrical installation'],
  },
  {
    label: 'Plumbing, heating & air conditioning',
    codes: ['43220'],
    keywords: ['plumbing', 'heating', 'HVAC'],
  },
  {
    label: 'Building & construction trades',
    codes: ['41201', '41202', '43999', '43390'],
    keywords: ['construction', 'building contractor'],
  },
  {
    label: 'Property & facilities services',
    codes: ['81100', '81210', '68320'],
    keywords: ['facilities management', 'property maintenance'],
  },
  {
    label: 'Healthcare services',
    codes: ['86210', '86900', '87100', '88100'],
    keywords: ['clinic', 'care', 'healthcare'],
  },
  {
    label: 'IT & managed services',
    codes: ['62020', '62090', '63110'],
    keywords: ['managed services', 'IT support'],
  },
  {
    label: 'Logistics & distribution',
    codes: ['49410', '52103', '52290'],
    keywords: ['haulage', 'logistics', 'distribution'],
  },
];

export function codesForLabels(labels: string[]): string[] {
  const codes = new Set<string>();
  for (const label of labels) {
    const group = SIC_GROUPS.find((g) => g.label === label);
    group?.codes.forEach((code) => codes.add(code));
  }
  return Array.from(codes);
}

export function keywordsForLabels(labels: string[]): string[] {
  const keywords = new Set<string>();
  for (const label of labels) {
    const group = SIC_GROUPS.find((g) => g.label === label);
    group?.keywords.forEach((keyword) => keywords.add(keyword));
  }
  return Array.from(keywords);
}
