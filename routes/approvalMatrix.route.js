const express = require("express");
const router = express.Router();
const { authMiddleware, requirePermission } = require("../middleware/auth");
const c = require("../controllers/approvalMatrix.controller");

router.use(authMiddleware);

// Approval Matrix CRUD (admin only)
router.post("/", c.createMatrix);
router.get("/", c.listMatrices);
router.put("/:id", c.updateMatrix);
router.delete("/:id", c.deleteMatrix);

// Approval Requests
router.post("/requests", c.createRequest);
router.get("/requests", c.listRequests);
router.get("/requests/:id", c.getRequest);
router.post("/requests/:id/vote", c.vote);

// Override log
router.post("/overrides", c.logOverride);
router.get("/overrides", c.listOverrides);

module.exports = router;
