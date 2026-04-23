'use strict';

/**
 * sorter.js
 * Groups rows by store, then sorts within each group by notes.
 *
 * STRICT RULE:
 *   - No row is added, removed, or modified.
 *   - Normalization is done INTERNALLY only for sorting key computation.
 *   - All output values are original verbatim values.
 */

/**
 * Group rows by store and sort within each group by notes.
 *
 * @param {Array} rows  - Array of row objects from parser.js
 * @returns {Array}     - Array of { store, rows, summary } objects
 */
function groupAndSort(rows) {
  // ── 1. Group by store (preserve insertion order for stores) ────────────────
  const storeMap = new Map();

  for (const row of rows) {
    const storeKey = row.store || '__UNKNOWN__';
    if (!storeMap.has(storeKey)) {
      storeMap.set(storeKey, []);
    }
    storeMap.get(storeKey).push(row);
  }

  // ── 2. Sort rows within each store by notes ────────────────────────────────
  const groups = [];

  for (const [store, storeRows] of storeMap.entries()) {
    const sorted = sortByNotes(storeRows);
    const summary = buildSummary(store, sorted);
    groups.push({ store, rows: sorted, summary });
  }

  return groups;
}

/**
 * Sort an array of rows by their "notes" field.
 * Rules (internal sort key only – output values unchanged):
 *   1. Rows whose notes are purely numeric  → ascending numeric order
 *   2. Rows whose notes are purely text     → ascending Arabic-aware alphabetical
 *   3. Rows whose notes are mixed           → after pure numbers, before pure text? 
 *      Spec says: numbers first, then text, then mixed.
 *      Mixed = contains both digits and non-digit characters.
 *
 * @param {Array} rows
 * @returns {Array} new sorted array (original objects, verbatim values)
 */
function sortByNotes(rows) {
  return [...rows].sort((a, b) => {
    const ka = sortKey(a.notes);
    const kb = sortKey(b.notes);

    // Compare categories first (0=number, 1=mixed, 2=text, 3=empty)
    if (ka.category !== kb.category) {
      return ka.category - kb.category;
    }

    // Same category: compare by value
    if (ka.category === 0) {
      // Both numeric: numeric ascending
      return ka.numericValue - kb.numericValue;
    }

    // Both text or both mixed: Arabic-aware string compare
    return ka.normalized.localeCompare(kb.normalized, 'ar', { sensitivity: 'base', numeric: true });
  });
}

/**
 * Compute an internal sort key for a notes value.
 * This key is NEVER written to output.
 *
 * @param {string} notes
 * @returns {{ category: number, numericValue: number, normalized: string }}
 */
function sortKey(notes) {
  if (!notes || notes.trim() === '') {
    return { category: 3, numericValue: Infinity, normalized: '' };
  }

  // Normalize Arabic-Indic digits → ASCII digits (for sort key only)
  const norm = notes.trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());

  const isAllDigits = /^\d+(\.\d+)?$/.test(norm);
  const hasDigit    = /\d/.test(norm);
  const hasNonDigit = /\D/.test(norm);

  if (isAllDigits) {
    return { category: 0, numericValue: parseFloat(norm), normalized: norm };
  }

  if (hasDigit && hasNonDigit) {
    // Mixed
    return { category: 1, numericValue: Infinity, normalized: norm };
  }

  // Pure text
  return { category: 2, numericValue: Infinity, normalized: norm };
}

/**
 * Build a summary for a store group.
 * Summary is derived by COUNTING only – data is never modified.
 *
 * @param {string} store
 * @param {Array}  rows
 * @returns {{ totalOrders: number, breakdown: Array<{label, count}> }}
 */
function buildSummary(store, rows) {
  const totalOrders = rows.length;

  // Breakdown by notes value (verbatim)
  const countMap = new Map();
  for (const row of rows) {
    const key = row.notes || '(بدون ملاحظات)';
    countMap.set(key, (countMap.get(key) || 0) + 1);
  }

  const breakdown = [];
  for (const [label, count] of countMap.entries()) {
    breakdown.push({ label, count });
  }

  // Sort breakdown entries in the same order as sortByNotes
  breakdown.sort((a, b) => {
    const ka = sortKey(a.label);
    const kb = sortKey(b.label);
    if (ka.category !== kb.category) return ka.category - kb.category;
    if (ka.category === 0) return ka.numericValue - kb.numericValue;
    return ka.normalized.localeCompare(kb.normalized, 'ar', { sensitivity: 'base', numeric: true });
  });

  return { totalOrders, breakdown };
}

module.exports = { groupAndSort };
