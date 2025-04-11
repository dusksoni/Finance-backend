// node-api/routes/terminate.route.js
const express = require("express");
const router = express.Router();
const { terminateHypothecation } = require("../controllers/terminate.controller");

router.post("/terminate", terminateHypothecation);

module.exports = router;
