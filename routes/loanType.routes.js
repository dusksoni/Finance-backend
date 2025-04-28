const express = require("express");
const router = express.Router();
const controller = require("../controllers/loanType.controller");
const { authMiddleware, adminOnly, onlyAdminOrEmployee } = require("../middleware/auth");

router.post("/", authMiddleware, adminOnly, controller.createLoanType);
router.get("/", authMiddleware, onlyAdminOrEmployee, controller.getLoanTypes);
router.get("/:id", authMiddleware, onlyAdminOrEmployee, controller.getLoanTypeById);
router.put("/:id", authMiddleware, adminOnly, controller.updateLoanType);
router.delete("/:id", authMiddleware, adminOnly, controller.deleteLoanType);

module.exports = router;
