// controllers/notification.controller.js
// In-app notification bell: list, mark read, mark all read, count unread

const prisma = require("../lib/prisma");
const { emitNotification, emitUnreadCount } = require("../utils/socket");

// ─── List notifications for the logged-in user ────────────────────────────
exports.listNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Determine target based on who is logged in (admin or employee)
    const targetType = req.user.adminId ? "ADMIN" : "EMPLOYEE";
    const targetId = req.user.adminId || req.user.employeeId;

    const where = { targetType, targetId };
    if (unreadOnly === "true") where.isRead = false;

    const [notifications, total] = await Promise.all([
      prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.notificationLog.count({ where }),
    ]);

    const unreadCount = await prisma.notificationLog.count({
      where: { targetType, targetId, isRead: false },
    });

    res.json({ data: notifications, total, unreadCount, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications", message: err.message });
  }
};

// ─── Mark a single notification as read ───────────────────────────────────
exports.markRead = async (req, res) => {
  try {
    const notification = await prisma.notificationLog.update({
      where: { id: req.params.id },
      data: { status: "SENT", sentAt: new Date(), isRead: true },
    });
    res.json({ data: notification });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark notification as read", message: err.message });
  }
};

// ─── Mark all notifications as read ───────────────────────────────────────
exports.markAllRead = async (req, res) => {
  try {
    const targetType = req.user.adminId ? "ADMIN" : "EMPLOYEE";
    const targetId = req.user.adminId || req.user.employeeId;

    const result = await prisma.notificationLog.updateMany({
      where: { targetType, targetId, isRead: false },
      data: { status: "SENT", sentAt: new Date(), isRead: true },
    });

    res.json({ message: `${result.count} notifications marked as read` });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark all read", message: err.message });
  }
};

// ─── Unread count (for bell badge) ────────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
  try {
    const targetType = req.user.adminId ? "ADMIN" : "EMPLOYEE";
    const targetId = req.user.adminId || req.user.employeeId;

    const count = await prisma.notificationLog.count({
      where: { targetType, targetId, isRead: false },
    });

    res.json({ unreadCount: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to get unread count", message: err.message });
  }
};

// ─── Create notification (internal use / admin broadcast) ─────────────────
exports.createNotification = async (req, res) => {
  try {
    const { targetType, targetId, channel = "IN_APP", triggerEvent, content, title, linkUrl } = req.body;

    const notification = await prisma.notificationLog.create({
      data: {
        targetType,
        targetId,
        channel,
        triggerEvent,
        contentRendered: content,
        title: title || null,
        linkUrl: linkUrl || null,
        status: "PENDING",
      },
    });

    // Push to connected user instantly via WebSocket
    emitNotification(targetType, targetId, notification);
    const unreadCount = await prisma.notificationLog.count({
      where: { targetType, targetId, isRead: false },
    });
    emitUnreadCount(targetType, targetId, unreadCount);

    res.status(201).json({ data: notification });
  } catch (err) {
    res.status(500).json({ error: "Failed to create notification", message: err.message });
  }
};

// ─── Broadcast to all admins/employees in a branch ────────────────────────
exports.broadcastNotification = async (req, res) => {
  try {
    const { message, targetRole = "ALL", branchId } = req.body;

    const adminWhere = {};
    const empWhere = {};
    if (branchId) empWhere.branchId = branchId;

    let targets = [];

    if (targetRole === "ALL" || targetRole === "ADMIN") {
      const admins = await prisma.admin.findMany({ where: adminWhere, select: { id: true } });
      targets = [...targets, ...admins.map((a) => ({ targetType: "ADMIN", targetId: a.id }))];
    }

    if (targetRole === "ALL" || targetRole === "EMPLOYEE") {
      const employees = await prisma.employee.findMany({ where: empWhere, select: { id: true } });
      targets = [...targets, ...employees.map((e) => ({ targetType: "EMPLOYEE", targetId: e.id }))];
    }

    await prisma.notificationLog.createMany({
      data: targets.map((t) => ({
        ...t,
        channel: "IN_APP",
        triggerEvent: "BROADCAST",
        contentRendered: message,
        status: "PENDING",
      })),
    });

    // Push to all connected users via WebSocket
    for (const t of targets) {
      emitNotification(t.targetType, t.targetId, { contentRendered: message, triggerEvent: "BROADCAST", status: "PENDING", createdAt: new Date() });
    }

    res.json({ message: `Broadcast sent to ${targets.length} users` });
  } catch (err) {
    res.status(500).json({ error: "Failed to broadcast notification", message: err.message });
  }
};
