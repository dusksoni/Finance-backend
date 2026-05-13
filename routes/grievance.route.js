const express = require("express");
const router = express.Router();
const controller = require("../controllers/grievance.controller");
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");

router.use(authMiddleware, onlyAdminOrEmployee);

router.post("/", controller.createGrievanceTicket);
router.get("/", controller.listGrievanceTickets);
router.get("/summary", controller.getGrievanceSummary);
router.get("/:id", controller.getGrievanceTicketById);
router.patch("/:id/assign", controller.assignGrievanceTicket);
router.patch("/:id/status", controller.updateGrievanceTicketStatus);
router.post("/:id/comments", controller.addGrievanceComment);

module.exports = router;
