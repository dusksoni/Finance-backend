const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/reconciliation.controller");

router.use(authMiddleware);

// Day-End Closing
router.get("/day-end", c.getDayEnd);
router.post("/day-end", c.upsertDayEnd);
router.get("/day-end/list", c.listDayEnds);
router.patch("/day-end/:id/submit", c.submitDayEnd);
router.patch("/day-end/:id/approve", c.approveDayEnd);
router.patch("/day-end/:id/reject", c.rejectDayEnd);

// Bank Reconciliation
router.post("/bank", c.createBankRecon);
router.get("/bank", c.listBankRecons);
router.patch("/bank/:id/reconcile", c.markBankReconReconciled);

// Suspense Account
router.post("/suspense", c.createSuspense);
router.get("/suspense", c.listSuspense);
router.patch("/suspense/:id/resolve", c.resolveSuspense);

// Reversals
router.post("/reversals", c.createReversal);
router.get("/reversals", c.listReversals);
router.patch("/reversals/:id/approve", c.approveReversal);
router.patch("/reversals/:id/reject", c.rejectReversal);

module.exports = router;
