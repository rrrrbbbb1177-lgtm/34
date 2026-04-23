'use strict';

/**
 * parser.js
 * Extracts rows from raw PDF text.
 * STRICT RULE: No row is added, removed, merged, split, or modified.
 * Only reordering is permitted downstream.
 */

/**
 * Parse raw PDF text into an array of row objects.
 * Every line that carries meaningful data is preserved as-is.
 * Lines that cannot be interpreted are kept as "raw" rows so nothing is lost.
 *
 * Expected line formats (flexible):
 *   <receipt>  <store>  <amount>  <status>  <notes>  <date>
 * The function tries multiple strategies to split each line.
 *
 * @param {string} rawText
 * @returns {{ rows: Array, inputCount: number }}
 */
function parsePDF(rawText) {
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const rows = [];

  for (const line of lines) {
    const row = parseLine(line);
    if (row) {
      rows.push(row);
    }
  }

  return {
    rows,
    inputCount: rows.length
  };
}

/**
 * Try to extract structured fields from a single line.
 * Returns null for pure header / separator lines.
 * Returns a partial object for lines with at least some data.
 *
 * Fields extracted (all kept verbatim – NO normalization of output):
 *   receipt, store, amount, status, notes, date, raw
 */
function parseLine(line) {
  // Skip obvious header / separator lines
  if (isHeaderLine(line)) return null;

  // Try tab-separated
  const parts = line.split(/\t+/);
  if (parts.length >= 4) {
    return buildRow(parts, line);
  }

  // Try multiple-space separated (2+ spaces)
  const spaceParts = line.split(/\s{2,}/);
  if (spaceParts.length >= 4) {
    return buildRow(spaceParts, line);
  }

  // Try pipe-separated
  const pipeParts = line.split('|').map(p => p.trim()).filter(p => p.length > 0);
  if (pipeParts.length >= 4) {
    return buildRow(pipeParts, line);
  }

  // Fallback: keep entire line as a raw row so nothing is lost
  return {
    receipt: '',
    store: '',
    amount: '',
    status: '',
    notes: '',
    date: '',
    raw: line,
    isValid: false
  };
}

/**
 * Map an array of string parts to named fields.
 * Field order assumed: receipt, store, amount, status, notes, date
 * Handles arrays shorter than 6 gracefully (empty string for missing fields).
 * ALL values are taken verbatim from the source – no cleaning.
 */
function buildRow(parts, raw) {
  const get = i => (parts[i] !== undefined ? parts[i].trim() : '');

  const receipt = get(0);
  const store   = get(1);
  const amount  = get(2);
  const status  = get(3);
  const notes   = get(4);
  const date    = get(5);

  // Determine if row is "valid" (has receipt + store + numeric amount + delivered status)
  // IMPORTANT: even invalid rows are returned – they must appear in the output.
  const amountNum = parseFloat(amount.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const isDelivered = status.includes('تم التسليم');
  const isValid = receipt.length > 0
    && store.length > 0
    && !isNaN(amountNum)
    && isDelivered;

  return {
    receipt,
    store,
    amount,
    status,
    notes,
    date,
    raw,
    isValid
  };
}

/**
 * Detect header / separator lines that should be skipped entirely.
 * Uses conservative heuristics so real data is never silently dropped.
 */
function isHeaderLine(line) {
  const headerKeywords = [
    'receipt', 'store', 'amount', 'status', 'notes', 'date',
    'رقم', 'المتجر', 'المبلغ', 'الحالة', 'ملاحظات', 'التاريخ',
    '----', '====', '####'
  ];
  const lower = line.toLowerCase();
  const matchCount = headerKeywords.filter(k => lower.includes(k)).length;
  // Only skip if 3+ header keywords appear together (very confident it's a header)
  return matchCount >= 3;
}

module.exports = { parsePDF };
