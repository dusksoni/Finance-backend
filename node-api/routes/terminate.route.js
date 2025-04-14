// node-api/routes/terminate.route.js
const express = require("express");
const router = express.Router();
const { terminateHypothecation, getTerminations } = require("../controllers/terminate.controller");
const { onlyAdminOrEmployee, authMiddleware } = require("../middleware/auth");

router.post("/",authMiddleware, onlyAdminOrEmployee, terminateHypothecation);
router.get("/",authMiddleware, onlyAdminOrEmployee, getTerminations);

module.exports = router;
