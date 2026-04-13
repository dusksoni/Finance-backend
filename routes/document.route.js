const express = require("express");
const router = express.Router();
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const c = require("../controllers/document.controller");

router.use(authMiddleware, onlyAdminOrEmployee);

// KFS — Key Fact Statement
router.get("/kfs/:loanId", c.generateKFS);

// Sanction Letter
router.get("/sanction-letter/:loanId", c.generateSanctionLetter);

// No Dues Certificate (only for closed loans)
router.get("/no-dues/:loanId", c.generateNoDuesCertificate);

// Statement of Account
router.get("/soa/:loanId", c.generateSOA);

module.exports = router;
