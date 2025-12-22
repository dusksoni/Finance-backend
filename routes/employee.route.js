const express = require("express");
const router = express.Router();
const {
  createEmployee,
  employeeLogin,
  putEmployee,
  deleteEmployee,
  blockedEmployee,
  updatePassword,
  getActivityLogs,
  getLoginHistory,
  getUsers,
  getLoans,
  getSelfProfile,
  updateSelfProfile,
  updateSelfPassword,
  getEmployeesByPermission,
} = require("../controllers/employee.controller");
const { getPermissions } = require("../controllers/auth.controller");
const { authMiddleware, adminOnly, onlyAdminOrEmployee } = require("../middleware/auth");

router.post("/create", authMiddleware, onlyAdminOrEmployee, createEmployee);
router.get("/me", authMiddleware, onlyAdminOrEmployee, getSelfProfile);
router.put("/me", authMiddleware, onlyAdminOrEmployee, updateSelfProfile);
router.put("/me/password", authMiddleware, onlyAdminOrEmployee, updateSelfPassword);
router.get("/getActivityLogs", authMiddleware, onlyAdminOrEmployee, getActivityLogs);
router.get("/getLoginHistory", authMiddleware, onlyAdminOrEmployee, getLoginHistory);
router.get("/getUsers", authMiddleware, onlyAdminOrEmployee, getUsers);
router.get("/getLoans", authMiddleware, onlyAdminOrEmployee, getLoans);
router.get("/byPermission", authMiddleware, onlyAdminOrEmployee, getEmployeesByPermission);
router.put("/:id", authMiddleware, onlyAdminOrEmployee, putEmployee);
router.put("/:id/password", authMiddleware, onlyAdminOrEmployee, updatePassword);
router.delete("/:id", authMiddleware, onlyAdminOrEmployee, deleteEmployee);
router.put("/block/:id", authMiddleware, onlyAdminOrEmployee, blockedEmployee);
router.post("/login", employeeLogin);
router.get("/permission/:userId", authMiddleware, getPermissions);


module.exports = router;
