const express = require('express')
const path = require('path')
const multer = require('multer')
const fs = require('fs')

const app = express()

// يخلي index.html يشتغل
app.use(express.static(__dirname))
app.use(express.json())

// رفع ملفات
const upload = multer({ dest: 'uploads/' })

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

// 🔥 هذا المهم — حتى يختفي خطأ 404
app.post('/process', upload.single('pdf'), (req, res) => {

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }

  console.log('File received:', req.file.originalname)

  // حالياً فقط تجربة (بدون معالجة حقيقية)
  res.json({
    status: 'success',
    message: 'File uploaded successfully (processing not implemented yet)'
  })

})

// fallback
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

app.listen(process.env.PORT || 8080, '0.0.0.0', () => {
  console.log('Server running...')
})
