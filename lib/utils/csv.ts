/**
 * Minimal, dependency-free delimited-text parser for the read-only Koleksiyon
 * viewer. Handles quoted fields, escaped quotes ("") and embedded newlines, and
 * auto-detects comma vs tab. It is intentionally small — the viewer only ever
 * PARSES text in the browser to display it; nothing is written to the database.
 */

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  delimiter: "," | "\t";
}

/** Detect the most likely delimiter by comparing counts on the first line. */
function detectDelimiter(sample: string): "," | "\t" {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

/** RFC-4180-ish parse into a matrix of string cells. */
function parseMatrix(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  // Strip a leading BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field); field = ""; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); field = ""; row = []; continue; }
    if (ch === "\r") { continue; } // handled by \n
    field += ch;
  }
  // Flush trailing field/row.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export function parseDelimited(text: string): ParsedTable {
  const delimiter = detectDelimiter(text);
  const matrix = parseMatrix(text, delimiter);

  // Drop fully-empty trailing rows.
  const cleaned = matrix.filter((r) => r.some((c) => c.trim().length > 0));
  if (cleaned.length === 0) return { headers: [], rows: [], delimiter };

  const rawHeaders = cleaned[0].map((h, i) => {
    const t = h.trim();
    return t.length ? t : `Sütun ${i + 1}`;
  });
  const width = rawHeaders.length;
  const rows = cleaned.slice(1).map((r) => {
    // Normalise ragged rows to the header width.
    const out = r.slice(0, width);
    while (out.length < width) out.push("");
    return out;
  });

  return { headers: rawHeaders, rows, delimiter };
}

// Columns whose values are sensitive (cost / price / invoice) — surfaced with a
// small warning in the viewer, so it's clear these need Finance/Yönetim rights
// before they ever become part of the system.
const SENSITIVE_PATTERNS = [
  "maliyet", "fiyat", "tutar", "fatura", "satın alma", "satin alma", "birim başına", "birim basina",
];

export function isSensitiveColumn(header: string): boolean {
  const h = header.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => h.includes(p));
}
