export interface PdfText {
  text: string;
  pages: number;
}

/**
 * Older / paper-filed accounts arrive as PDFs with no tagged data. We only get
 * text out of them here; interpretation happens in text-extract or the LLM
 * fallback.
 */
export async function extractPdfText(bytes: Buffer): Promise<PdfText> {
  // Import the implementation module directly: pdf-parse's index runs a debug
  // harness that reads a sample file from disk when required as a main module.
  const mod = await import('pdf-parse/lib/pdf-parse.js');
  const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string; numpages: number }>;
  const result = await pdfParse(bytes);
  return { text: result.text ?? '', pages: result.numpages ?? 0 };
}
