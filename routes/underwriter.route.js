const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/underwriter.controller");

router.use(authMiddleware);

router.post("/", c.createTask);
router.get("/", c.listTasks);
router.get("/:id", c.getTask);
router.put("/:id", c.updateTask);
router.patch("/:id/escalate", c.escalateTask);

module.exports = router;
