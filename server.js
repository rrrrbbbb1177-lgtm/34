'use strict';

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const multer   = require('multer');
const pdfParse = require('pdf-parse');

const { parsePDF }     = require('./parser');
const { groupAndSort } = require('./sorter');
const { generatePDF }  = require('./pdfGenerator');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Multer — use OS temp dir (writable on Railway/Render) ────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename   : (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── POST /upload  (alias) ─────────────────────────────────────────────────────
app.post('/upload', upload.single('pdf'), (_req, res) => {
  res.json({ status: 'received' });
});

// ── Core handler (shared by /process and /api/process) ───────────────────────
async function handleProcess(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const uploadedPath = req.file.path;

  try {
    const pdfBuffer = fs.readFileSync(uploadedPath);

    let rawText = '';
    try {
      const parsed = await pdfParse(pdfBuffer);
      rawText = parsed.text || '';
    } catch (_) {
      rawText = pdfBuffer.toString('utf8');
    }

    if (!rawText.trim()) {
      return res.status(422).json({ error: 'Could not extract text from the PDF. The file may be image-based or empty.' });
    }

    const { rows, inputCount } = parsePDF(rawText);

    if (inputCount === 0) {
      return res.status(422).json({ error: 'No data rows found in the PDF.' });
    }

    const groups = groupAndSort(rows);

    const outputCount = groups.reduce((s, g) => s + g.rows.length, 0);
    if (outputCount !== inputCount) {
      return res.status(500).json({
        error: `Row count mismatch – input: ${inputCount}, output: ${outputCount}. Export aborted.`
      });
    }

    const outputPath = path.join(os.tmpdir(), `organized_${Date.now()}.pdf`);
    await generatePDF(groups, inputCount, outputPath);

    res.setHeader('Content-Type',        'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="organized_report.pdf"');
    res.setHeader('X-Input-Count',       String(inputCount));
    res.setHeader('X-Output-Count',      String(outputCount));
    res.setHeader('Access-Control-Expose-Headers', 'X-Input-Count, X-Output-Count');

    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);
    fileStream.on('close', () => {
      try { fs.unlinkSync(uploadedPath); } catch (_) {}
      try { fs.unlinkSync(outputPath);   } catch (_) {}
    });

  } catch (err) {
    console.error('[process error]', err);
    try { fs.unlinkSync(uploadedPath); } catch (_) {}
    return res.status(500).json({ error: `Processing failed: ${err.message}` });
  }
}

// ── POST /process ─────────────────────────────────────────────────────────────
app.post('/process', upload.single('pdf'), handleProcess);

// ── POST /api/process (backwards compat) ─────────────────────────────────────
app.post('/api/process', upload.single('pdf'), handleProcess);

// ── GET /download (stub) ──────────────────────────────────────────────────────
app.get('/download', (_req, res) => {
  res.status(410).json({ error: 'Use POST /process — the file is streamed directly in the response.' });
});

// ── Catch-all 404 ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Start — bind 0.0.0.0 required for Railway/Render ─────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🚚  Delivery Organizer → http://0.0.0.0:${PORT}`);
  console.log('  Routes: GET /health  POST /process  POST /api/process  POST /upload\n');
});

module.exports = app;
