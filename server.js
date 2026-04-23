const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();

app.use(express.static(__dirname));
app.use(express.json());

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const upload = multer({ dest: 'uploads/' });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/process', upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  return res.json({
    success: true,
    fileName: req.file.originalname,
    message: 'File uploaded successfully'
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(process.env.PORT || 8080, '0.0.0.0', () => {
  console.log('Server running...');
});
