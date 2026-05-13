const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/loanTypeVersion.controller");

router.use(authMiddleware);

router.post("/", c.createVersion);
router.get("/", c.listVersions);
router.get("/:id", c.getVersion);
router.post("/:id/rollback", c.rollbackToVersion);

module.exports = router;
