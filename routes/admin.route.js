const express = require("express");
const router = express.Router();
const { adminLogin, getEmployees, updateAdmin, updateAdminPassword } = require("../controllers/admin.controller");
const { authMiddleware, adminOnly, onlyAdminOrEmployee } = require("../middleware/auth");
const { getAllUsers } = require("../controllers/user.controller");
const { getEmployeeById } = require("../controllers/employee.controller");

router.post("/login", adminLogin);
router.get("/employees", authMiddleware, adminOnly, getEmployees);
router.get("/employees/:id", authMiddleware, onlyAdminOrEmployee, getEmployeeById);
router.get("/users", authMiddleware, adminOnly, getAllUsers);
router.put("/admin/:id", authMiddleware, adminOnly, updateAdmin);
router.put("/admin/:id/password", authMiddleware, adminOnly, updateAdminPassword);


module.exports = router;