const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/restructuring.controller");

router.use(authMiddleware);

// Restructuring Requests
router.post("/", c.createRequest);
router.get("/", c.listRequests);
router.get("/:id", c.getRequest);
router.patch("/:id/submit", c.submitForApproval);
router.patch("/:id/approve", c.approveRequest);
router.patch("/:id/reject", c.rejectRequest);
router.patch("/:id/apply", c.applyRequest);

// Waivers
router.post("/waivers", c.createWaiver);
router.get("/waivers", c.listWaivers);
router.patch("/waivers/:id/approve", c.approveWaiver);
router.patch("/waivers/:id/reject", c.rejectWaiver);

module.exports = router;
