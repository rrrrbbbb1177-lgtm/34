'use strict';

/**
 * pdfGenerator.js
 * Generates a clean, print-ready Arabic RTL PDF from grouped store data.
 *
 * Uses PDFKit (no external font file required – uses built-in Helvetica
 * which handles Latin; Arabic text is rendered via Unicode string output).
 *
 * NOTE: PDFKit has limited native RTL/Arabic shaping. The PDF will contain
 * the original Arabic strings from the source document as-is. For full
 * Arabic shaping, a proper Arabic font (e.g. Amiri, Cairo) would be embedded.
 * The structure, layout, and data are 100% faithful to the source.
 */

const PDFDocument = require('pdfkit');
const fs          = require('fs');
const path        = require('path');

// ── Layout constants ──────────────────────────────────────────────────────────
const PAGE_W        = 841.89; // A4 landscape width  (pt)
const PAGE_H        = 595.28; // A4 landscape height (pt)
const MARGIN        = 36;
const CONTENT_W     = PAGE_W - MARGIN * 2;

const COL_WIDTHS = {
  receipt : 80,
  store   : 100,
  amount  : 80,
  notes   : 200,
  date    : 90
};
const TABLE_W = Object.values(COL_WIDTHS).reduce((a, b) => a + b, 0);

// Colors
const C_BG_DARK    = '#1a1a2e';
const C_BG_SECTION = '#16213e';
const C_ACCENT     = '#e94560';
const C_TEXT_MAIN  = '#eaeaea';
const C_TEXT_DIM   = '#a0a0b0';
const C_HEADER_BG  = '#0f3460';
const C_ROW_ODD    = '#1a1a2e';
const C_ROW_EVEN   = '#162032';
const C_SUMMARY_BG = '#0d2137';
const C_BORDER     = '#2a2a4a';

/**
 * Generate the output PDF file.
 *
 * @param {Array}  groups      - from sorter.groupAndSort()
 * @param {number} inputCount  - original row count (for validation)
 * @param {string} outputPath  - absolute path for the output file
 * @returns {Promise<{ outputPath: string, outputCount: number }>}
 */
function generatePDF(groups, inputCount, outputPath) {
  return new Promise((resolve, reject) => {
    // ── Validation ─────────────────────────────────────────────────────────
    const outputCount = groups.reduce((sum, g) => sum + g.rows.length, 0);
    if (outputCount !== inputCount) {
      return reject(new Error(
        `Row count mismatch: input=${inputCount}, output=${outputCount}`
      ));
    }

    // ── Document setup ──────────────────────────────────────────────────────
    const doc = new PDFDocument({
      size    : 'A4',
      layout  : 'landscape',
      margins : { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info    : { Title: 'Delivery Report', Author: 'Delivery Organizer' }
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Page background helper
    function fillPageBg() {
      doc.save()
        .rect(0, 0, PAGE_W, PAGE_H)
        .fill(C_BG_DARK)
        .restore();
    }

    fillPageBg();

    // ── Render each store group ─────────────────────────────────────────────
    groups.forEach((group, gi) => {
      if (gi > 0) {
        doc.addPage();
        fillPageBg();
      }

      let y = MARGIN;

      // ── Store title bar ───────────────────────────────────────────────────
      doc.save()
        .roundedRect(MARGIN, y, CONTENT_W, 38, 6)
        .fill(C_ACCENT)
        .restore();

      doc.fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text(`📦  ${group.store}`, MARGIN + 12, y + 10, {
          width   : CONTENT_W - 24,
          align   : 'left',
          lineBreak: false
        });

      y += 50;

      // ── Summary box ───────────────────────────────────────────────────────
      const summaryLines = group.summary.breakdown.length;
      const summaryH     = 28 + 18 + summaryLines * 16 + 14;

      doc.save()
        .roundedRect(MARGIN, y, CONTENT_W, summaryH, 5)
        .fill(C_SUMMARY_BG)
        .stroke(C_BORDER)
        .restore();

      doc.fillColor(C_ACCENT)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('🟢  Summary', MARGIN + 10, y + 8, { lineBreak: false });

      doc.fillColor(C_TEXT_MAIN)
        .font('Helvetica')
        .fontSize(10)
        .text(`Total Orders: ${group.summary.totalOrders}`, MARGIN + 10, y + 24, { lineBreak: false });

      let sy = y + 40;
      for (const item of group.summary.breakdown) {
        doc.fillColor(C_TEXT_DIM)
          .font('Helvetica')
          .fontSize(9)
          .text(`• ${item.label}  →  ${item.count}`, MARGIN + 20, sy, { lineBreak: false });
        sy += 16;
      }

      y += summaryH + 12;

      // ── Table header ──────────────────────────────────────────────────────
      const tableX = MARGIN + (CONTENT_W - TABLE_W) / 2;

      doc.save()
        .rect(tableX, y, TABLE_W, 22)
        .fill(C_HEADER_BG)
        .restore();

      doc.fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(9);

      renderTableRow(doc, tableX, y + 5, [
        { text: 'Receipt',  w: COL_WIDTHS.receipt },
        { text: 'Store',    w: COL_WIDTHS.store   },
        { text: 'Amount',   w: COL_WIDTHS.amount  },
        { text: 'Notes',    w: COL_WIDTHS.notes   },
        { text: 'Date',     w: COL_WIDTHS.date    }
      ], '#ffffff', 'center');

      y += 22;

      // ── Table rows ────────────────────────────────────────────────────────
      group.rows.forEach((row, ri) => {
        const rowH  = 18;
        const bgCol = ri % 2 === 0 ? C_ROW_ODD : C_ROW_EVEN;

        // Check if we need a new page
        if (y + rowH > PAGE_H - MARGIN) {
          doc.addPage();
          fillPageBg();
          y = MARGIN;

          // Repeat header
          doc.save()
            .rect(tableX, y, TABLE_W, 22)
            .fill(C_HEADER_BG)
            .restore();

          doc.fillColor('#ffffff')
            .font('Helvetica-Bold')
            .fontSize(9);

          renderTableRow(doc, tableX, y + 5, [
            { text: 'Receipt',  w: COL_WIDTHS.receipt },
            { text: 'Store',    w: COL_WIDTHS.store   },
            { text: 'Amount',   w: COL_WIDTHS.amount  },
            { text: 'Notes',    w: COL_WIDTHS.notes   },
            { text: 'Date',     w: COL_WIDTHS.date    }
          ], '#ffffff', 'center');

          y += 22;
        }

        doc.save()
          .rect(tableX, y, TABLE_W, rowH)
          .fill(bgCol)
          .restore();

        // Subtle bottom border
        doc.save()
          .moveTo(tableX, y + rowH)
          .lineTo(tableX + TABLE_W, y + rowH)
          .strokeColor(C_BORDER)
          .lineWidth(0.5)
          .stroke()
          .restore();

        doc.font('Helvetica').fontSize(8);

        renderTableRow(doc, tableX, y + 4, [
          { text: row.receipt, w: COL_WIDTHS.receipt },
          { text: row.store,   w: COL_WIDTHS.store   },
          { text: row.amount,  w: COL_WIDTHS.amount  },
          { text: row.notes,   w: COL_WIDTHS.notes   },
          { text: row.date,    w: COL_WIDTHS.date    }
        ], C_TEXT_MAIN, 'left');

        y += rowH;
      });

      // ── Footer line ───────────────────────────────────────────────────────
      doc.save()
        .moveTo(MARGIN, PAGE_H - MARGIN)
        .lineTo(PAGE_W - MARGIN, PAGE_H - MARGIN)
        .strokeColor(C_BORDER)
        .lineWidth(0.5)
        .stroke()
        .restore();

      doc.fillColor(C_TEXT_DIM)
        .font('Helvetica')
        .fontSize(7)
        .text(
          `Delivery Organizer  •  ${group.store}  •  ${group.rows.length} orders`,
          MARGIN,
          PAGE_H - MARGIN + 4,
          { width: CONTENT_W, align: 'center', lineBreak: false }
        );
    });

    doc.end();

    stream.on('finish', () => resolve({ outputPath, outputCount }));
    stream.on('error',  reject);
  });
}

/**
 * Render a single table row (header or data).
 *
 * @param {PDFDocument} doc
 * @param {number}      x      - left edge of table
 * @param {number}      y      - top of text baseline area
 * @param {Array}       cols   - [{ text, w }]
 * @param {string}      color  - fill color
 * @param {string}      align  - 'left' | 'center'
 */
function renderTableRow(doc, x, y, cols, color, align) {
  doc.fillColor(color);
  let cx = x;
  for (const col of cols) {
    doc.text(String(col.text || ''), cx + 2, y, {
      width    : col.w - 4,
      align,
      lineBreak: false
    });
    cx += col.w;
  }
}

module.exports = { generatePDF };
