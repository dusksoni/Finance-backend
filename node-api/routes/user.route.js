const express = require("express");
const router = express.Router();
const { createUser, createUserDetails, getUserDetailsByUserId, updateUserDetails, deleteUserDetails } = require("../controllers/user.controller");
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const { listUsers } = require("../controllers/list.controller");

router.post("/", authMiddleware, onlyAdminOrEmployee, createUser);
router.get("/", authMiddleware, onlyAdminOrEmployee,  listUsers);
router.post("/:userId/details", authMiddleware, onlyAdminOrEmployee, createUserDetails);
router.get("/:userId/details", authMiddleware, onlyAdminOrEmployee, getUserDetailsByUserId);
router.put("/:userId/details", authMiddleware, onlyAdminOrEmployee, updateUserDetails);
router.delete("/:userId/details", authMiddleware, onlyAdminOrEmployee, deleteUserDetails);

module.exports = router;