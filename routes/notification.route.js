const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/notification.controller");

router.use(authMiddleware);

router.get("/", c.listNotifications);
router.get("/unread-count", c.getUnreadCount);
router.patch("/:id/read", c.markRead);
router.patch("/mark-all-read", c.markAllRead);
router.post("/", c.createNotification);
router.post("/broadcast", c.broadcastNotification);

module.exports = router;
