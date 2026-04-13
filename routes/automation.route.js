const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/automation.controller");

router.use(authMiddleware);

// Automation Rules
router.post("/rules", c.createRule);
router.get("/rules", c.listRules);
router.put("/rules/:id", c.updateRule);
router.delete("/rules/:id", c.deleteRule);

// Task Queue
router.post("/tasks", c.createTask);
router.get("/tasks", c.listTasks);
router.put("/tasks/:id", c.updateTask);
router.patch("/tasks/:id/assign", c.assignTask);
router.patch("/tasks/:id/complete", c.completeTask);

// Notification logs
router.get("/notifications", c.listNotifications);

module.exports = router;
