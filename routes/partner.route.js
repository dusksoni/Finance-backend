const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/partner.controller");

router.use(authMiddleware);

// Partners
router.post("/", c.createPartner);
router.get("/", c.listPartners);
router.get("/:id", c.getPartner);
router.put("/:id", c.updatePartner);

// Commission Rules
router.post("/:partnerId/rules", c.addCommissionRule);
router.put("/:partnerId/rules/:ruleId", c.updateCommissionRule);
router.delete("/:partnerId/rules/:ruleId", c.deleteCommissionRule);

// Leads
router.post("/:partnerId/leads", c.createLead);
router.get("/:partnerId/leads", c.listLeads);
router.patch("/:partnerId/leads/:leadId/status", c.updateLeadStatus);

// Payouts
router.post("/payouts/auto-calculate", c.autoCalculatePayouts);
router.post("/payouts", c.createPayout);
router.get("/payouts/list", c.listPayouts);
router.patch("/payouts/:payoutId/process", c.processPayout);
router.patch("/payouts/:payoutId/clawback", c.clawbackPayout);

// Delinquency Metrics
router.post("/:partnerId/metrics", c.recordMetric);
router.get("/:partnerId/metrics", c.getPartnerMetrics);

module.exports = router;
