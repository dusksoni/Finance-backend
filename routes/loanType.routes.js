const express = require("express");
const router = express.Router();
const controller = require("../controllers/loanType.controller");
const { authMiddleware, adminOnly, onlyAdminOrEmployee } = require("../middleware/auth");

router.get("/rules/template", authMiddleware, onlyAdminOrEmployee, controller.getLoanTypeRuleTemplate);
router.post("/", authMiddleware, adminOnly, controller.createLoanType);
router.get("/", authMiddleware, onlyAdminOrEmployee, controller.getLoanTypes);
router.get("/:id/rules", authMiddleware, onlyAdminOrEmployee, controller.getLoanTypeRules);
router.put("/:id/rules", authMiddleware, adminOnly, controller.updateLoanTypeRules);
router.get("/:id", authMiddleware, onlyAdminOrEmployee, controller.getLoanTypeById);
router.put("/:id", authMiddleware, onlyAdminOrEmployee, controller.updateLoanType);
router.delete("/:id", authMiddleware, onlyAdminOrEmployee, controller.deleteLoanType);

module.exports = router;
