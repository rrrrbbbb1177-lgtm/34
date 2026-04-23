const express = require('express')
const path = require('path')
const multer = require('multer')

const app = express()

app.use(express.static(__dirname))

// رفع ملفات (بدون مكتبات ثقيلة)
const upload = multer({ dest: 'uploads/' })

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

// هذا يحل مشكلة 404 بدون ما يطيح السيرفر
app.post('/process', upload.single('pdf'), (req, res) => {

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }

  console.log('File received:', req.file.originalname)

  // حالياً فقط تأكيد نجاح
  res.json({
    success: true,
    message: 'File uploaded successfully'
  })
})

app.listen(process.env.PORT || 8080, '0.0.0.0', () => {
  console.log('Server running...')
})
