const prisma = require("../lib/prisma");
const logAction = require("../utils/adminLogger");
const { pushInApp } = require("../utils/notificationService");
const { notifyGrievanceManagers, notifyCreator } = require("../utils/notifyRegional");
const { getBranchFilter } = require("../utils/regionFilter");

async function notifyAdmins(title, message, linkUrl, triggerEvent = "GRIEVANCE_EVENT") {
  try {
    const admin = await prisma.admin.findFirst({ select: { id: true } });
    if (admin) await pushInApp({ targetType: "ADMIN", targetId: admin.id, title, message, triggerEvent, linkUrl });
  } catch (_) {}
}
const {
  buildGrievanceTicketNumber,
  calculateDueAtForPriority,
  getGrievanceSettings,
  resolveGrievanceCategory,
  resolveGrievancePriority,
  resolveGrievanceSource,
} = require("../utils/grievanceConfig");

const resolveActor = (req) => ({
  createdByAdminId: req.user?.adminId || null,
  createdByEmployeeId: req.user?.employeeId || null,
});

const buildAssignmentActor = (req) => ({
  assignedByAdminId: req.user?.adminId || null,
  assignedByEmployeeId: req.user?.employeeId || null,
});

const buildResolutionActor = (req) => ({
  resolvedByAdminId: req.user?.adminId || null,
  resolvedByEmployeeId: req.user?.employeeId || null,
});

const getAutoAssignableEmployee = async (branchId) => {
  if (!branchId) return null;

  return prisma.employee.findFirst({
    where: {
      branchId,
      isDeleted: false,
      isBlocked: false,
    },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
    },
  });
};

exports.createGrievanceTicket = async (req, res) => {
  try {
    const settings = await getGrievanceSettings(prisma);
    const {
      category,
      subject,
      description,
      priority,
      source = "BRANCH",
      userId,
      loanId,
      branchId,
      metadata,
    } = req.body || {};

    if (!category || !subject || !description) {
      return res.status(400).json({
        status: 400,
        error: "category, subject, and description are required",
      });
    }

    const normalizedCategory = resolveGrievanceCategory(settings, category);
    const normalizedPriority = resolveGrievancePriority(settings, priority);
    const normalizedSource = resolveGrievanceSource(source);
    const dueAt = calculateDueAtForPriority(settings, normalizedPriority);
    const ticketNumber = await buildGrievanceTicketNumber(prisma, settings.ticketPrefix);

    let autoAssignedEmployee = null;
    if (settings.autoAssignToBranchEmployee && branchId) {
      autoAssignedEmployee = await getAutoAssignableEmployee(branchId);
    }

    const ticket = await prisma.grievanceTicket.create({
      data: {
        ticketNumber,
        category: normalizedCategory,
        subject,
        description,
        priority: normalizedPriority,
        source: normalizedSource,
        userId: userId || null,
        loanId: loanId || null,
        branchId: branchId || null,
        metadata: metadata || null,
        dueAt,
        assignedToEmployeeId: autoAssignedEmployee?.id || null,
        ...(autoAssignedEmployee ? buildAssignmentActor(req) : {}),
        ...(autoAssignedEmployee ? { status: "IN_PROGRESS" } : {}),
        ...resolveActor(req),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        loan: { select: { id: true, fileNo: true, fileStatus: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    await logAction({
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: "CREATED GRIEVANCE",
      table: "GrievanceTicket",
        targetId: ticket.id,
        metadata: {
          ticketNumber: ticket.ticketNumber,
          category: ticket.category,
          priority: ticket.priority,
          autoAssignedEmployeeId: autoAssignedEmployee?.id || null,
        },
      });

    const grievanceLink = `/grievances/${ticket.id}`;
    // Notify all GRIEVANCE_MANAGE employees (company-wide dedicated support team)
    notifyGrievanceManagers({ title: "New Grievance Ticket", message: `Ticket ${ticket.ticketNumber}: ${ticket.subject} (${ticket.priority})`, linkUrl: grievanceLink, excludeEmployeeId: req.user?.employeeId });
    // If auto-assigned, notify the specific assigned employee
    if (autoAssignedEmployee?.id) {
      pushInApp({ targetType: "EMPLOYEE", targetId: autoAssignedEmployee.id, title: "Grievance Assigned to You", message: `Ticket ${ticket.ticketNumber}: ${ticket.subject}`, triggerEvent: "GRIEVANCE_ASSIGNED", linkUrl: grievanceLink }).catch(() => {});
    }

    return res.status(201).json({
      status: 201,
      message: "Grievance ticket created successfully",
      data: ticket,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to create grievance ticket",
      message: error.message,
    });
  }
};

exports.listGrievanceTickets = async (req, res) => {
  try {
    const {
      status,
      priority,
      category,
      assignedToEmployeeId,
      loanId,
      userId,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const parsedPage = Number(page) || 1;
    const parsedLimit = Number(limit) || 20;
    const skip = (parsedPage - 1) * parsedLimit;

    const valid = (v) => v && v !== "undefined" && v !== "null";
    // Grievance tickets have branchId — use branch region filter
    const branchRegionFilter = getBranchFilter(req.user);
    const where = {
      ...(valid(status) ? { status: String(status) } : {}),
      ...(valid(priority) ? { priority: String(priority) } : {}),
      ...(valid(category) ? { category: String(category) } : {}),
      ...(valid(assignedToEmployeeId) ? { assignedToEmployeeId: String(assignedToEmployeeId) } : {}),
      ...(valid(loanId) ? { loanId: String(loanId) } : {}),
      ...(valid(userId) ? { userId: String(userId) } : {}),
      // Apply regional scope only when no explicit loanId/userId filter given
      ...(!valid(loanId) && !valid(userId) && branchRegionFilter ? branchRegionFilter : {}),
      ...(search
        ? {
            OR: [
              { ticketNumber: { contains: String(search), mode: "insensitive" } },
              { subject: { contains: String(search), mode: "insensitive" } },
              { description: { contains: String(search), mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [tickets, total] = await Promise.all([
      prisma.grievanceTicket.findMany({
        where,
        skip,
        take: parsedLimit,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        include: {
          user: { select: { id: true, firstName: true, lastName: true, phone: true } },
          loan: { select: { id: true, fileNo: true, fileStatus: true } },
          branch: { select: { id: true, name: true } },
          assignedToEmployee: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.grievanceTicket.count({ where }),
    ]);

    return res.json({
      status: 200,
      data: tickets,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch grievance tickets",
      message: error.message,
    });
  }
};

exports.getGrievanceSummary = async (req, res) => {
  try {
    const { assignedToEmployeeId, branchId, status } = req.query;
    const where = {
      ...(assignedToEmployeeId ? { assignedToEmployeeId: String(assignedToEmployeeId) } : {}),
      ...(branchId ? { branchId: String(branchId) } : {}),
      ...(status ? { status: String(status) } : {}),
    };

    const tickets = await prisma.grievanceTicket.findMany({
      where,
      select: {
        id: true,
        status: true,
        priority: true,
        category: true,
        dueAt: true,
        firstResponseAt: true,
        assignedToEmployeeId: true,
      },
    });

    const now = new Date();
    const summary = tickets.reduce(
      (acc, ticket) => {
        acc.total += 1;
        acc.byStatus[ticket.status] = (acc.byStatus[ticket.status] || 0) + 1;
        acc.byPriority[ticket.priority] = (acc.byPriority[ticket.priority] || 0) + 1;
        acc.byCategory[ticket.category] = (acc.byCategory[ticket.category] || 0) + 1;

        if (!ticket.assignedToEmployeeId) acc.unassigned += 1;
        if (!ticket.firstResponseAt) acc.awaitingFirstResponse += 1;
        if (
          ticket.dueAt &&
          new Date(ticket.dueAt) < now &&
          !["RESOLVED", "CLOSED", "REJECTED"].includes(ticket.status)
        ) {
          acc.overdue += 1;
        }

        return acc;
      },
      {
        total: 0,
        overdue: 0,
        unassigned: 0,
        awaitingFirstResponse: 0,
        byStatus: {},
        byPriority: {},
        byCategory: {},
      }
    );

    return res.json({
      status: 200,
      data: summary,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch grievance summary",
      message: error.message,
    });
  }
};

exports.getGrievanceTicketById = async (req, res) => {
  try {
    const ticket = await prisma.grievanceTicket.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        loan: { select: { id: true, fileNo: true, fileStatus: true } },
        branch: { select: { id: true, name: true } },
        assignedToEmployee: { select: { id: true, name: true, email: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            createdByAdmin: { select: { id: true, name: true, email: true } },
            createdByEmployee: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!ticket) {
      return res.status(404).json({
        status: 404,
        error: "Grievance ticket not found",
      });
    }

    return res.json({
      status: 200,
      data: ticket,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to fetch grievance ticket",
      message: error.message,
    });
  }
};

exports.assignGrievanceTicket = async (req, res) => {
  try {
    const { assignedToEmployeeId } = req.body || {};
    if (!assignedToEmployeeId) {
      return res.status(400).json({
        status: 400,
        error: "assignedToEmployeeId is required",
      });
    }

    const updated = await prisma.grievanceTicket.update({
      where: { id: req.params.id },
      data: {
        assignedToEmployeeId,
        status: "IN_PROGRESS",
        ...buildAssignmentActor(req),
      },
    });

    await logAction({
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: "ASSIGNED GRIEVANCE",
      table: "GrievanceTicket",
      targetId: updated.id,
      metadata: {
        ticketNumber: updated.ticketNumber,
        assignedToEmployeeId,
      },
    });

    // Notify the assigned employee
    pushInApp({ targetType: "EMPLOYEE", targetId: assignedToEmployeeId, title: "Grievance Assigned to You", message: `Ticket ${updated.ticketNumber} has been assigned to you`, triggerEvent: "GRIEVANCE_ASSIGNED", linkUrl: `/grievances/${updated.id}` }).catch(() => {});

    return res.json({
      status: 200,
      message: "Grievance assigned successfully",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to assign grievance ticket",
      message: error.message,
    });
  }
};

exports.updateGrievanceTicketStatus = async (req, res) => {
  try {
    const { status, resolutionSummary, resolutionMetadata, firstResponseAt } = req.body || {};
    if (!status) {
      return res.status(400).json({
        status: 400,
        error: "status is required",
      });
    }

    const data = {
      status,
      ...(firstResponseAt
        ? { firstResponseAt: new Date(firstResponseAt) }
        : ["IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)
          ? { firstResponseAt: new Date() }
          : {}),
    };

    if (["RESOLVED", "CLOSED"].includes(status)) {
      data.resolvedAt = new Date();
      data.resolutionSummary = resolutionSummary || null;
      data.resolutionMetadata = resolutionMetadata || null;
      Object.assign(data, buildResolutionActor(req));
    }

    const updated = await prisma.grievanceTicket.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true, ticketNumber: true, subject: true, status: true,
        createdByEmployeeId: true, assignedToEmployeeId: true,
      },
    });

    await logAction({
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: "UPDATED GRIEVANCE STATUS",
      table: "GrievanceTicket",
      targetId: updated.id,
      metadata: { ticketNumber: updated.ticketNumber, status: updated.status },
    });

    // On resolve/close: notify ticket creator and assigned employee
    if (["RESOLVED", "CLOSED"].includes(status)) {
      const link = `/grievances/${updated.id}`;
      const msg = `Ticket ${updated.ticketNumber}: ${updated.subject} has been ${status.toLowerCase()}`;
      if (updated.createdByEmployeeId && updated.createdByEmployeeId !== req.user?.employeeId) {
        notifyCreator({ employeeId: updated.createdByEmployeeId, title: `Grievance ${status === "RESOLVED" ? "Resolved" : "Closed"}`, message: msg, linkUrl: link, triggerEvent: "GRIEVANCE_RESOLVED" });
      }
      if (updated.assignedToEmployeeId && updated.assignedToEmployeeId !== req.user?.employeeId && updated.assignedToEmployeeId !== updated.createdByEmployeeId) {
        notifyCreator({ employeeId: updated.assignedToEmployeeId, title: `Grievance ${status === "RESOLVED" ? "Resolved" : "Closed"}`, message: msg, linkUrl: link, triggerEvent: "GRIEVANCE_RESOLVED" });
      }
    }

    return res.json({
      status: 200,
      message: "Grievance status updated successfully",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to update grievance status",
      message: error.message,
    });
  }
};

exports.addGrievanceComment = async (req, res) => {
  try {
    const { message, isInternal = false } = req.body || {};
    if (!message) {
      return res.status(400).json({
        status: 400,
        error: "message is required",
      });
    }

    const comment = await prisma.grievanceComment.create({
      data: {
        ticketId: req.params.id,
        message,
        isInternal: Boolean(isInternal),
        createdByAdminId: req.user?.adminId || null,
        createdByEmployeeId: req.user?.employeeId || null,
      },
      include: {
        createdByAdmin: { select: { id: true, name: true, email: true } },
        createdByEmployee: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.grievanceTicket.update({
      where: { id: req.params.id },
      data: {
        firstResponseAt: new Date(),
        ...(isInternal ? {} : { status: "IN_PROGRESS" }),
      },
    });

    await logAction({
      adminId: req.user?.adminId,
      employeeId: req.user?.employeeId,
      loginActivityId: req.user?.loginActivityId,
      action: "ADDED GRIEVANCE COMMENT",
      table: "GrievanceComment",
      targetId: comment.id,
      metadata: {
        ticketId: req.params.id,
        isInternal: comment.isInternal,
      },
    });

    return res.status(201).json({
      status: 201,
      message: "Grievance comment added successfully",
      data: comment,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: "Failed to add grievance comment",
      message: error.message,
    });
  }
};
