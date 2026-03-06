const path = require("path");
const fs = require("fs");
const express = require("express");
const activityRoutes = require("./activity");

const router = express.Router();

router.use("/api", activityRoutes);

const distRoot = fs.existsSync(path.join(__dirname, "..", "..", "dist", "index.html"))
  ? path.join(__dirname, "..", "..", "dist")
  : null;

router.get("/", (req, res) => {
  if (distRoot) return res.sendFile(path.join(distRoot, "index.html"));
  res.sendFile(path.join(__dirname, "..", "..", "index.html"));
});

if (distRoot) router.use(express.static(distRoot));

module.exports = router;
