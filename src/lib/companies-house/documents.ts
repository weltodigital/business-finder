import { chRequest, chRequestRaw, CH_API_BASE, CH_DOCUMENT_BASE, CompaniesHouseError } from './client';
import type { CHDocumentMetadata } from './types';

export type DocumentFormat = 'xhtml' | 'xml' | 'pdf' | 'csv' | 'json' | 'unknown';

export interface FetchedDocument {
  documentId: string;
  format: DocumentFormat;
  contentType: string;
  bytes: Buffer;
  text?: string;
  sourceUrl: string;
}

const CONTENT_TYPES: Record<Exclude<DocumentFormat, 'unknown'>, string> = {
  xhtml: 'application/xhtml+xml',
  xml: 'application/xml',
  pdf: 'application/pdf',
  csv: 'text/csv',
  json: 'application/json',
};

export async function getDocumentMetadata(documentId: string): Promise<CHDocumentMetadata | null> {
  try {
    return await chRequest<CHDocumentMetadata>(`/document/${documentId}`, {
      base: CH_DOCUMENT_BASE,
      resource: 'document-metadata',
      cacheTtlSeconds: 60 * 60 * 24 * 30,
    });
  } catch (err) {
    if (err instanceof CompaniesHouseError && err.isNotFound) return null;
    throw err;
  }
}

/**
 * Retrieves an accounts document, preferring machine-readable formats.
 * iXBRL (xhtml) gives us tagged facts; PDF is the last resort.
 */
export async function fetchDocument(
  documentId: string,
  metadata?: CHDocumentMetadata | null,
): Promise<FetchedDocument | null> {
  const meta = metadata ?? (await getDocumentMetadata(documentId));
  const available = Object.keys(meta?.resources ?? {});

  const preference: DocumentFormat[] = ['xhtml', 'xml', 'json', 'csv', 'pdf'];
  const chosen =
    preference.find((fmt) => available.includes(CONTENT_TYPES[fmt as Exclude<DocumentFormat, 'unknown'>])) ??
    (available.length > 0 ? formatFromContentType(available[0]) : 'pdf');

  const accept = CONTENT_TYPES[chosen as Exclude<DocumentFormat, 'unknown'>] ?? 'application/pdf';

  const response = await chRequestRaw(`/document/${documentId}/content`, {
    base: CH_DOCUMENT_BASE,
    accept,
    resource: 'document-content',
  });

  const contentType = response.headers.get('content-type') ?? accept;
  const bytes = Buffer.from(await response.arrayBuffer());
  const format = formatFromContentType(contentType);

  return {
    documentId,
    format,
    contentType,
    bytes,
    text: format === 'pdf' ? undefined : bytes.toString('utf8'),
    sourceUrl: `${CH_DOCUMENT_BASE}/document/${documentId}/content`,
  };
}

export function formatFromContentType(contentType: string): DocumentFormat {
  const ct = contentType.toLowerCase();
  if (ct.includes('xhtml')) return 'xhtml';
  if (ct.includes('pdf')) return 'pdf';
  if (ct.includes('csv')) return 'csv';
  if (ct.includes('json')) return 'json';
  if (ct.includes('xml') || ct.includes('html')) return 'xml';
  return 'unknown';
}

export { CH_API_BASE, CH_DOCUMENT_BASE };
