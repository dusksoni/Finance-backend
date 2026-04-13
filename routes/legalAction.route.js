const express = require("express");
const router = express.Router();
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const c = require("../controllers/legalAction.controller");

router.use(authMiddleware, onlyAdminOrEmployee);

router.get("/summary", c.getLegalSummary);
router.get("/", c.listLegalActions);
router.get("/loan/:loanId", c.getLegalActionByLoan);
router.post("/", c.createLegalAction);
router.patch("/:id", c.updateLegalAction);

module.exports = router;
