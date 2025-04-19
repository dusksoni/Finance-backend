const express = require("express");
const router = express.Router();
const loanController = require("../controllers/loan.controller");
const { adminOnly, authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");

// Main Loan routes
router.post("", authMiddleware, onlyAdminOrEmployee, loanController.createLoan);
router.put("/:id", authMiddleware, onlyAdminOrEmployee, loanController.updateLoan);
router.get("/user/:userId",authMiddleware,  adminOnly, loanController.listLoansByUser);
router.post("/payment",authMiddleware, loanController.makePayment);
router.get("/pending", authMiddleware, onlyAdminOrEmployee,  loanController.getPendingLoanDetails);
router.get("/defaulters", authMiddleware, onlyAdminOrEmployee, loanController.getDefaulters);
router.put("/close/:id", authMiddleware, onlyAdminOrEmployee, loanController.closeLoan);

module.exports = router;
