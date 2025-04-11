const express = require("express");
const router = express.Router();
const { authMiddleware, onlyAdminOrEmployee, adminOnly } = require("../middleware/auth");
const {
  createLoan,
  createTwoWheelerLoanDetails,
  createAgricultureLoanDetails,
  listLoansByUser,
  makePayment,
  getDefaulterList
} = require("../controllers/loan.controller");
const { getPendingUsers } = require("../controllers/loan.controller");
const { getUserMonthlyPayment } = require("../controllers/loan.controller");

router.post("/create", authMiddleware, onlyAdminOrEmployee, createLoan);
router.post("/create/2wheeler", authMiddleware, onlyAdminOrEmployee, createTwoWheelerLoanDetails);
router.post("/create/agriculture", authMiddleware, onlyAdminOrEmployee, createAgricultureLoanDetails);
router.get("/user/:userId", authMiddleware, onlyAdminOrEmployee, listLoansByUser);
router.post("/payment", authMiddleware, onlyAdminOrEmployee, makePayment);
router.get("/defaulters", authMiddleware, onlyAdminOrEmployee, getDefaulterList);
router.get("/user/:userId/monthly-payment", authMiddleware, onlyAdminOrEmployee, getUserMonthlyPayment);
router.get("/admin/pending-users", authMiddleware, adminOnly, getPendingUsers);


module.exports = router;