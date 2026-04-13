const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");

exports.createTask = async (req, res) => {
  try {
    const { loanApplicationId, loanId, assignedToEmployeeId, priority, dueDate, notes, metadata } = req.body;

    const task = await prisma.underwriterTask.create({
      data: {
        loanApplicationId, loanId, assignedToEmployeeId,
        priority: priority || "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        notes, metadata,
        assignedByAdminId: req.user.adminId,
      },
    });

    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "UNDERWRITER_TASK_CREATED", table: "UnderwriterTask", targetId: task.id });
    res.status(201).json({ message: "Underwriter task created", data: task });
  } catch (err) {
    res.status(500).json({ error: "Failed to create underwriter task", message: err.message });
  }
};

exports.listTasks = async (req, res) => {
  try {
    const { status, assignedToEmployeeId, priority } = req.query;
    const where = {};
    if (status) where.status = status;
    if (assignedToEmployeeId) where.assignedToEmployeeId = assignedToEmployeeId;
    if (priority) where.priority = priority;

    const tasks = await prisma.underwriterTask.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      include: { assignedToEmployee: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.json({ data: tasks });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch underwriter tasks" });
  }
};

exports.getTask = async (req, res) => {
  try {
    const task = await prisma.underwriterTask.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ data: task });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch task" });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const { status, notes, decisionComment, dueDate, assignedToEmployeeId } = req.body;
    const data = {};
    if (status) data.status = status;
    if (notes) data.notes = notes;
    if (decisionComment) { data.decisionComment = decisionComment; data.decisionAt = new Date(); }
    if (dueDate) data.dueDate = new Date(dueDate);
    if (assignedToEmployeeId) data.assignedToEmployeeId = assignedToEmployeeId;

    const task = await prisma.underwriterTask.update({ where: { id: req.params.id }, data });
    res.json({ message: "Task updated", data: task });
  } catch (err) {
    res.status(500).json({ error: "Failed to update task", message: err.message });
  }
};

exports.escalateTask = async (req, res) => {
  try {
    const { escalationReason } = req.body;
    const task = await prisma.underwriterTask.update({
      where: { id: req.params.id },
      data: { status: "ESCALATED", escalationReason, escalatedAt: new Date() },
    });
    await logAction({ adminId: req.user.adminId, employeeId: req.user.employeeId, loginActivityId: req.user.activity, action: "UNDERWRITER_TASK_ESCALATED", table: "UnderwriterTask", targetId: task.id });
    res.json({ message: "Task escalated", data: task });
  } catch (err) {
    res.status(500).json({ error: "Failed to escalate task", message: err.message });
  }
};
