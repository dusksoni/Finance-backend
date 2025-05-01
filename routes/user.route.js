const express = require("express");
const router = express.Router();
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const { createUser, getAllUsers, getUserById, deleteUser, updateUser } = require("../controllers/user.controller");

router.post("/", authMiddleware, onlyAdminOrEmployee, createUser);
router.get("/", authMiddleware, onlyAdminOrEmployee,  getAllUsers);
router.get("/:id", authMiddleware, onlyAdminOrEmployee,  getUserById);
router.put("/:id", authMiddleware, onlyAdminOrEmployee, updateUser)
router.delete("/:id", authMiddleware, onlyAdminOrEmployee, deleteUser);

module.exports = router;