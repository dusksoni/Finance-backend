const express = require("express");
const router = express.Router();
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const { createUser, getAllUsers, getUserById, deleteUser, updateUser, approveUserUpdate, getUserUpdateRequestById, getPendingUserUpdateRequests, rejectUserUpdate } = require("../controllers/user.controller");

router.post("/", authMiddleware, onlyAdminOrEmployee, createUser);
router.get("/", authMiddleware, onlyAdminOrEmployee,  getAllUsers);
router.get("/:id", authMiddleware, onlyAdminOrEmployee,  getUserById);
router.put("/:id", authMiddleware, onlyAdminOrEmployee, updateUser)
router.delete("/:id", authMiddleware, onlyAdminOrEmployee, deleteUser);


// 📌 Admin Approval Routes
router.get("/admin/requests", authMiddleware, onlyAdminOrEmployee, getPendingUserUpdateRequests);
router.get("/admin/request/:requestId", authMiddleware, onlyAdminOrEmployee, getUserUpdateRequestById);
router.put("/admin/approve/:requestId", authMiddleware, onlyAdminOrEmployee, approveUserUpdate);
router.put("/admin/reject/:requestId", authMiddleware, onlyAdminOrEmployee, rejectUserUpdate);


module.exports = router;