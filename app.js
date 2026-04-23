'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const fileInput    = document.getElementById('fileInput');
const dropZone     = document.getElementById('dropZone');
const filePreview  = document.getElementById('filePreview');
const fileNameEl   = document.getElementById('fileName');
const fileSizeEl   = document.getElementById('fileSize');
const btnRemove    = document.getElementById('btnRemove');
const btnProcess   = document.getElementById('btnProcess');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel= document.getElementById('progressLabel');
const resultBox    = document.getElementById('resultBox');
const resultMeta   = document.getElementById('resultMeta');
const btnDownload  = document.getElementById('btnDownload');
const errorBox     = document.getElementById('errorBox');
const errorMsg     = document.getElementById('errorMsg');

let selectedFile = null;

// ── File selection ────────────────────────────────────────────────────────────
fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) setFile(fileInput.files[0]);
});

btnRemove.addEventListener('click', clearFile);

function setFile(file) {
  selectedFile = file;
  fileNameEl.textContent  = file.name;
  fileSizeEl.textContent  = formatBytes(file.size);
  filePreview.classList.remove('hidden');
  dropZone.classList.add('hidden');
  btnProcess.disabled = false;
  hideResults();
}

function clearFile() {
  selectedFile = null;
  fileInput.value = '';
  filePreview.classList.add('hidden');
  dropZone.classList.remove('hidden');
  btnProcess.disabled = true;
  hideResults();
}

function hideResults() {
  resultBox.classList.add('hidden');
  errorBox.classList.add('hidden');
  progressWrap.classList.add('hidden');
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

['dragleave', 'dragend'].forEach(ev =>
  dropZone.addEventListener(ev, () => dropZone.classList.remove('drag-over'))
);

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && (file.type === 'application/pdf' || file.name.endsWith('.pdf'))) {
    setFile(file);
  } else {
    showError('الرجاء رفع ملف PDF فقط.');
  }
});

// Click on drop zone opens file picker (but not the button inside it)
dropZone.addEventListener('click', e => {
  if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
    fileInput.click();
  }
});

// ── Process ───────────────────────────────────────────────────────────────────
btnProcess.addEventListener('click', processFile);

async function processFile() {
  if (!selectedFile) return;

  btnProcess.disabled = true;
  hideResults();
  showProgress(10, 'جارٍ رفع الملف…');

  const formData = new FormData();
  formData.append('pdf', selectedFile);

  try {
    showProgress(30, 'جارٍ استخراج البيانات من PDF…');

    const response = await fetch('/api/process', {
      method: 'POST',
      body  : formData
    });

    showProgress(70, 'جارٍ توليد PDF المنظَّم…');

    if (!response.ok) {
      let errMsg = `خطأ ${response.status}`;
      try {
        const json = await response.json();
        errMsg = json.error || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    showProgress(90, 'جارٍ التحضير للتنزيل…');

    const inputCount  = response.headers.get('X-Input-Count')  || '?';
    const outputCount = response.headers.get('X-Output-Count') || '?';

    const blob = await response.blob();
    const url  = URL.createObjectURL(blob);

    showProgress(100, 'اكتمل!');

    setTimeout(() => {
      progressWrap.classList.add('hidden');
      showResult(url, inputCount, outputCount);
      btnProcess.disabled = false;
    }, 400);

  } catch (err) {
    progressWrap.classList.add('hidden');
    showError(err.message || 'حدث خطأ غير متوقع.');
    btnProcess.disabled = false;
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function showProgress(pct, label) {
  progressWrap.classList.remove('hidden');
  progressFill.style.width  = pct + '%';
  progressLabel.textContent = label;
}

function showResult(blobUrl, inputCount, outputCount) {
  resultBox.classList.remove('hidden');
  errorBox.classList.add('hidden');
  resultMeta.textContent = `الصفوف المُدخَلة: ${inputCount} · الصفوف المُخرَجة: ${outputCount}`;
  btnDownload.href = blobUrl;
  btnDownload.download = `تقرير_منظم_${dateStamp()}.pdf`;
}

function showError(msg) {
  errorBox.classList.remove('hidden');
  resultBox.classList.add('hidden');
  errorMsg.textContent = msg;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }
