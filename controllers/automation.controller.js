const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

// ─── Automation Rules ─────────────────────────────────────────────────────────

exports.createRule = async (req, res) => {
  try {
    const { name, description, triggerEvent, conditionJson, action, actionParamsJson, delayMinutes } = req.body;
    const rule = await prisma.automationRule.create({
      data: { name, description, triggerEvent, conditionJson, action, actionParamsJson, delayMinutes: delayMinutes ?? 0, createdByAdminId: req.user.adminId },
    });
    res.status(201).json({ message: "Automation rule created", data: rule });
  } catch (err) {
    res.status(500).json({ error: "Failed to create automation rule", message: err.message });
  }
};

exports.listRules = async (req, res) => {
  try {
    const { triggerEvent, isActive } = req.query;
    const where = {};
    if (triggerEvent) where.triggerEvent = triggerEvent;
    if (isActive !== undefined) where.isActive = isActive === "true";
    const rules = await prisma.automationRule.findMany({ where, orderBy: { triggerEvent: "asc" } });
    res.json({ data: rules });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch automation rules" });
  }
};

exports.updateRule = async (req, res) => {
  try {
    const rule = await prisma.automationRule.update({ where: { id: req.params.id }, data: req.body });
    res.json({ message: "Rule updated", data: rule });
  } catch (err) {
    res.status(500).json({ error: "Failed to update automation rule", message: err.message });
  }
};

exports.deleteRule = async (req, res) => {
  try {
    await prisma.automationRule.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: "Rule deactivated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to deactivate rule" });
  }
};

// ─── Task Queue ───────────────────────────────────────────────────────────────

exports.createTask = async (req, res) => {
  try {
    const { taskType, entityType, entityId, title, description, priority, dueAt, assignedToEmployeeId, assignedToAdminId, metadata } = req.body;
    const task = await prisma.taskQueue.create({
      data: { taskType, entityType, entityId, title, description, priority: priority ?? "MEDIUM", dueAt: dueAt ? new Date(dueAt) : null, assignedToEmployeeId, assignedToAdminId, metadata, createdByAdminId: req.user.adminId, createdByEmployeeId: req.user.employeeId },
    });
    res.status(201).json({ message: "Task created", data: task });
  } catch (err) {
    res.status(500).json({ error: "Failed to create task", message: err.message });
  }
};

exports.listTasks = async (req, res) => {
  try {
    const { status, priority, taskType, assignedToEmployeeId, assignedToAdminId, entityType, entityId } = req.query;
    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (taskType) where.taskType = taskType;
    if (assignedToEmployeeId) where.assignedToEmployeeId = assignedToEmployeeId;
    if (assignedToAdminId) where.assignedToAdminId = assignedToAdminId;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    const tasks = await prisma.taskQueue.findMany({ where, orderBy: [{ priority: "desc" }, { dueAt: "asc" }], take: 200 });
    res.json({ data: tasks });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.dueAt) data.dueAt = new Date(data.dueAt);
    if (data.status === "DONE") data.completedAt = new Date();
    const task = await prisma.taskQueue.update({ where: { id: req.params.id }, data });
    res.json({ message: "Task updated", data: task });
  } catch (err) {
    res.status(500).json({ error: "Failed to update task", message: err.message });
  }
};

exports.assignTask = async (req, res) => {
  try {
    const { assignedToEmployeeId, assignedToAdminId } = req.body;
    const task = await prisma.taskQueue.update({
      where: { id: req.params.id },
      data: { assignedToEmployeeId, assignedToAdminId, status: "IN_PROGRESS" },
    });
    res.json({ message: "Task assigned", data: task });
  } catch (err) {
    res.status(500).json({ error: "Failed to assign task", message: err.message });
  }
};

exports.completeTask = async (req, res) => {
  try {
    const task = await prisma.taskQueue.update({
      where: { id: req.params.id },
      data: { status: "DONE", completedAt: new Date() },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "TASK COMPLETED", table: "TaskQueue", targetId: task.id });
    res.json({ message: "Task marked done", data: task });
  } catch (err) {
    res.status(500).json({ error: "Failed to complete task", message: err.message });
  }
};

// ─── Notification Log ─────────────────────────────────────────────────────────

exports.listNotifications = async (req, res) => {
  try {
    const { targetType, targetId, status } = req.query;
    const where = {};
    if (targetType) where.targetType = targetType;
    if (targetId) where.targetId = targetId;
    if (status) where.status = status;
    const logs = await prisma.notificationLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    res.json({ data: logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};
