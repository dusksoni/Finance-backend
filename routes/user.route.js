const express = require("express");
const router = express.Router();
const { authMiddleware, onlyAdminOrEmployee, requirePermission } = require("../middleware/auth");
const {
  createUser,
  getAllUsers,
  getUserById,
  deleteUser,
  updateUser,
  patchUser,
  approveUserUpdate,
  getUserUpdateRequestById,
  getPendingUserUpdateRequests,
  rejectUserUpdate,
  getUserActivityLogs,
} = require("../controllers/user.controller");

router.post("/", authMiddleware, onlyAdminOrEmployee, createUser);
router.get("/", authMiddleware, onlyAdminOrEmployee,  getAllUsers);
router.get("/:id/activity", authMiddleware, onlyAdminOrEmployee, requirePermission("USER_ACTIVITY_VIEW"), getUserActivityLogs);
router.get("/:id", authMiddleware, onlyAdminOrEmployee,  getUserById);
router.put("/:id", authMiddleware, onlyAdminOrEmployee, updateUser)
router.patch("/:id", authMiddleware, onlyAdminOrEmployee, patchUser)
router.delete("/:id", authMiddleware, onlyAdminOrEmployee, deleteUser);


// 📌 Admin Approval Routes
router.get("/admin/requests", authMiddleware, onlyAdminOrEmployee, requirePermission("USER_UPDATE_APPROVE"), getPendingUserUpdateRequests);
router.get("/admin/request/:requestId", authMiddleware, onlyAdminOrEmployee, requirePermission("USER_UPDATE_APPROVE"), getUserUpdateRequestById);
router.put("/admin/approve/:requestId", authMiddleware, onlyAdminOrEmployee, requirePermission("USER_UPDATE_APPROVE"), approveUserUpdate);
router.put("/admin/reject/:requestId", authMiddleware, onlyAdminOrEmployee, requirePermission("USER_UPDATE_APPROVE"), rejectUserUpdate);


module.exports = router;
