'use strict';

const express    = require('express');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const pdfParse   = require('pdf-parse');

const { parsePDF }      = require('../parser');
const { groupAndSort }  = require('../sorter');
const { generatePDF }   = require('../pdfGenerator');

const router  = express.Router();

// ── Multer storage ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ts   = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${ts}_${safe}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB
});

// ── POST /api/process ─────────────────────────────────────────────────────────
router.post('/process', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const uploadedPath = req.file.path;

  try {
    // 1. Read PDF bytes
    const pdfBuffer = fs.readFileSync(uploadedPath);

    // 2. Extract raw text
    let rawText = '';
    try {
      const parsed = await pdfParse(pdfBuffer);
      rawText = parsed.text || '';
    } catch (parseErr) {
      // pdf-parse failed – attempt to read as plain text (for demo/test files)
      rawText = pdfBuffer.toString('utf8');
    }

    if (!rawText.trim()) {
      return res.status(422).json({ error: 'Could not extract text from the PDF. The file may be image-based or empty.' });
    }

    // 3. Parse rows
    const { rows, inputCount } = parsePDF(rawText);

    if (inputCount === 0) {
      return res.status(422).json({ error: 'No data rows found in the PDF.' });
    }

    // 4. Group + sort
    const groups = groupAndSort(rows);

    // 5. Validate counts (pre-generate check)
    const outputCount = groups.reduce((s, g) => s + g.rows.length, 0);
    if (outputCount !== inputCount) {
      return res.status(500).json({
        error: `Row count mismatch – input: ${inputCount}, output: ${outputCount}. Export aborted.`
      });
    }

    // 6. Generate PDF
    const outputDir  = path.join(__dirname, '../../outputs');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `organized_${Date.now()}.pdf`);

    await generatePDF(groups, inputCount, outputPath);

    // 7. Send file
    const filename = path.basename(outputPath);
    res.setHeader('Content-Type',        'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Input-Count',       String(inputCount));
    res.setHeader('X-Output-Count',      String(outputCount));

    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);

    fileStream.on('close', () => {
      // Clean up temp files after sending
      try { fs.unlinkSync(uploadedPath); } catch (_) {}
      try { fs.unlinkSync(outputPath);   } catch (_) {}
    });

  } catch (err) {
    console.error('[process error]', err);
    // Clean up upload on error
    try { fs.unlinkSync(uploadedPath); } catch (_) {}

    if (err.message && err.message.includes('Row count mismatch')) {
      return res.status(500).json({ error: err.message });
    }
    return res.status(500).json({ error: `Processing failed: ${err.message}` });
  }
});

module.exports = router;
