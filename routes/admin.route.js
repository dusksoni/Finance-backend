const express = require("express");
const router = express.Router();
const { adminLogin } = require("../controllers/admin.controller");
const { authMiddleware, adminOnly, onlyAdminOrEmployee } = require("../middleware/auth");
const { listEmployees, getEmployeeById } = require("../controllers/list.controller");
const { getAllUsers } = require("../controllers/user.controller");

router.post("/login", adminLogin);
router.get("/employees", authMiddleware, adminOnly, listEmployees);
router.get("/employees/:id", authMiddleware, onlyAdminOrEmployee, getEmployeeById);
router.get("/users", authMiddleware, adminOnly, getAllUsers);

module.exports = router;