const express = require("express");
const router = express.Router();
const {
  getAllShowrooms,
  getShowroomsByBranch,
  getShowroomById,
  createShowroom,
  updateShowroom,
  deleteShowroom,
} = require("../controllers/showroom.controller");
const { onlyAdminOrEmployee, authMiddleware } = require("../middleware/auth");


module.exports = router;
