const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🔥 Railway working 100%");
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});