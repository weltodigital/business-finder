/**
 * Curated SIC groupings for the industries this user searches, arranged by
 * sector. Not a complete SIC index: the search form offers these as starting
 * points and lets any other code be added from {@link SIC_CODE_LIST}.
 */
export interface SicGroup {
  label: string;
  sector: string;
  codes: string[];
  keywords: string[];
}

export const SIC_GROUPS: SicGroup[] = [
  // Trades & construction
  { label: 'Electrical contracting', sector: 'Trades & construction', codes: ['43210'], keywords: ['electrical contractor', 'electrical installation'] },
  { label: 'Plumbing, heating & air conditioning', sector: 'Trades & construction', codes: ['43220'], keywords: ['plumbing', 'heating', 'HVAC'] },
  { label: 'Building & construction trades', sector: 'Trades & construction', codes: ['41201', '41202', '43999', '43390'], keywords: ['construction', 'building contractor'] },
  { label: 'Roofing', sector: 'Trades & construction', codes: ['43910'], keywords: ['roofing', 'roofer'] },
  { label: 'Joinery & carpentry', sector: 'Trades & construction', codes: ['43320'], keywords: ['joinery', 'carpentry'] },
  { label: 'Plastering, painting & glazing', sector: 'Trades & construction', codes: ['43310', '43341', '43342'], keywords: ['plastering', 'decorating', 'glazing'] },
  { label: 'Flooring & wall covering', sector: 'Trades & construction', codes: ['43330'], keywords: ['flooring', 'tiling'] },
  { label: 'Demolition & groundworks', sector: 'Trades & construction', codes: ['43110', '43120', '43130'], keywords: ['demolition', 'groundworks'] },
  { label: 'Civil engineering', sector: 'Trades & construction', codes: ['42110', '42210', '42220', '42910', '42990'], keywords: ['civil engineering'] },
  { label: 'Scaffolding', sector: 'Trades & construction', codes: ['43991'], keywords: ['scaffolding'] },
  { label: 'Insulation, security & other installation', sector: 'Trades & construction', codes: ['43290'], keywords: ['insulation', 'installation'] },
  // Manufacturing & engineering
  { label: 'Precision engineering & machining', sector: 'Manufacturing & engineering', codes: ['25620', '28490', '28990', '25730'], keywords: ['precision engineering', 'CNC', 'machining', 'toolmaking'] },
  { label: 'Metal fabrication', sector: 'Manufacturing & engineering', codes: ['25110', '25120', '25610', '25990'], keywords: ['fabrication', 'welding', 'sheet metal'] },
  { label: 'Industrial machinery manufacture', sector: 'Manufacturing & engineering', codes: ['28290', '28960', '28220', '33200'], keywords: ['machinery', 'plant', 'automation'] },
  { label: 'Machinery repair & maintenance', sector: 'Manufacturing & engineering', codes: ['33110', '33120', '33140', '33190'], keywords: ['repair', 'maintenance', 'servicing'] },
  { label: 'Plastics & rubber products', sector: 'Manufacturing & engineering', codes: ['22190', '22210', '22220', '22230', '22290'], keywords: ['plastics', 'moulding', 'rubber'] },
  { label: 'Electronics & electrical equipment', sector: 'Manufacturing & engineering', codes: ['26110', '26120', '26511', '27120', '27330', '27900'], keywords: ['electronics', 'control panels'] },
  { label: 'Food & drink manufacturing', sector: 'Manufacturing & engineering', codes: ['10130', '10710', '10890', '11050', '11070'], keywords: ['bakery', 'food production', 'brewery'] },
  { label: 'Printing & packaging', sector: 'Manufacturing & engineering', codes: ['17211', '17219', '18121', '18129', '18140'], keywords: ['printing', 'packaging'] },
  { label: 'Furniture & wood products', sector: 'Manufacturing & engineering', codes: ['16230', '16290', '31010', '31090'], keywords: ['furniture', 'joinery manufacture'] },
  // Business services
  { label: 'IT & managed services', sector: 'Business services', codes: ['62020', '62090', '63110'], keywords: ['managed services', 'IT support'] },
  { label: 'Software development', sector: 'Business services', codes: ['62011', '62012', '58290'], keywords: ['software', 'development'] },
  { label: 'Accountancy & bookkeeping', sector: 'Business services', codes: ['69201', '69202', '69203'], keywords: ['accountants', 'bookkeeping'] },
  { label: 'Legal services', sector: 'Business services', codes: ['69102', '69109'], keywords: ['solicitors', 'legal'] },
  { label: 'Marketing & advertising', sector: 'Business services', codes: ['70210', '73110', '73120'], keywords: ['marketing', 'advertising', 'PR'] },
  { label: 'Recruitment & staffing', sector: 'Business services', codes: ['78109', '78200', '78300'], keywords: ['recruitment', 'staffing'] },
  { label: 'Engineering & technical consultancy', sector: 'Business services', codes: ['71121', '71122', '71129', '71200'], keywords: ['engineering consultancy', 'testing'] },
  { label: 'Architecture & surveying', sector: 'Business services', codes: ['71111', '71112'], keywords: ['architects', 'surveyors'] },
  { label: 'Insurance brokers', sector: 'Business services', codes: ['66220'], keywords: ['insurance broker'] },
  { label: 'Training & education', sector: 'Business services', codes: ['85320', '85590', '85600'], keywords: ['training', 'education'] },
  // Property & facilities
  { label: 'Property & facilities services', sector: 'Property & facilities', codes: ['81100', '81210', '68320'], keywords: ['facilities management', 'property maintenance'] },
  { label: 'Cleaning services', sector: 'Property & facilities', codes: ['81210', '81221', '81222', '81229', '81299'], keywords: ['cleaning', 'commercial cleaning'] },
  { label: 'Landscaping & grounds maintenance', sector: 'Property & facilities', codes: ['81300'], keywords: ['landscaping', 'grounds maintenance'] },
  { label: 'Security services', sector: 'Property & facilities', codes: ['80100', '80200'], keywords: ['security', 'alarms', 'CCTV'] },
  { label: 'Waste & recycling', sector: 'Property & facilities', codes: ['38110', '38120', '38210', '38320', '39000'], keywords: ['waste', 'recycling', 'skip hire'] },
  { label: 'Estate & letting agents', sector: 'Property & facilities', codes: ['68310', '68320'], keywords: ['estate agent', 'lettings'] },
  { label: 'Equipment & plant hire', sector: 'Property & facilities', codes: ['77110', '77320', '77390'], keywords: ['plant hire', 'equipment hire'] },
  // Health & care
  { label: 'Healthcare services', sector: 'Health & care', codes: ['86210', '86900', '87100', '88100'], keywords: ['clinic', 'care', 'healthcare'] },
  { label: 'Dental practices', sector: 'Health & care', codes: ['86230'], keywords: ['dental', 'dentist'] },
  { label: 'Care homes & home care', sector: 'Health & care', codes: ['87100', '87300', '88100'], keywords: ['care home', 'domiciliary care'] },
  { label: 'Veterinary practices', sector: 'Health & care', codes: ['75000'], keywords: ['veterinary', 'vets'] },
  { label: 'Pharmacies', sector: 'Health & care', codes: ['47730'], keywords: ['pharmacy', 'chemist'] },
  { label: 'Nurseries & childcare', sector: 'Health & care', codes: ['88910'], keywords: ['nursery', 'childcare'] },
  // Distribution, retail & leisure
  { label: 'Logistics & distribution', sector: 'Distribution, retail & leisure', codes: ['49410', '52103', '52290'], keywords: ['haulage', 'logistics', 'distribution'] },
  { label: 'Wholesale distribution', sector: 'Distribution, retail & leisure', codes: ['46499', '46520', '46690', '46730', '46740', '46900'], keywords: ['wholesale', 'distributor', 'merchant'] },
  { label: 'Motor trade & vehicle repair', sector: 'Distribution, retail & leisure', codes: ['45111', '45112', '45200', '45310', '45320'], keywords: ['garage', 'vehicle repair', 'MOT'] },
  { label: 'Pubs, restaurants & hotels', sector: 'Distribution, retail & leisure', codes: ['55100', '56101', '56102', '56210', '56302'], keywords: ['restaurant', 'pub', 'hotel', 'catering'] },
  { label: 'Specialist retail', sector: 'Distribution, retail & leisure', codes: ['47190', '47520', '47599', '47789'], keywords: ['retail', 'shop'] },
  { label: 'Travel agencies & tour operators', sector: 'Distribution, retail & leisure', codes: ['79110', '79120'], keywords: ['travel agent', 'tour operator'] },
  { label: 'Gyms & leisure', sector: 'Distribution, retail & leisure', codes: ['93110', '93130', '93199'], keywords: ['gym', 'fitness', 'leisure'] },
  { label: 'Hair & beauty', sector: 'Distribution, retail & leisure', codes: ['96020', '96040'], keywords: ['salon', 'beauty'] },
  { label: 'Funeral services', sector: 'Distribution, retail & leisure', codes: ['96030'], keywords: ['funeral'] },
  { label: 'Agricultural contractors', sector: 'Distribution, retail & leisure', codes: ['01610'], keywords: ['agricultural contractor', 'farm services'] },
];

export const SIC_SECTORS: string[] = Array.from(new Set(SIC_GROUPS.map((g) => g.sector)));

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
