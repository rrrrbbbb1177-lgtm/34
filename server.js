const express = require('express')
const path = require('path')

const app = express()

// يخلي index.html يشتغل
app.use(express.static(__dirname))

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

app.listen(process.env.PORT || 8080, () => {
  console.log('Server running...')
})
