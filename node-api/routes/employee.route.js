const express = require("express");
const router = express.Router();
const { createEmployee, employeeLogin, putEmployee, deleteEmployee, blockedEmployee } = require("../controllers/employee.controller");
const { authMiddleware, adminOnly } = require("../middleware/auth");

router.post("/create", authMiddleware, adminOnly, createEmployee);
router.put("/:id", authMiddleware, adminOnly, putEmployee);
router.delete("/:id", authMiddleware, adminOnly, deleteEmployee);
router.put("/block/:id", authMiddleware, adminOnly, blockedEmployee);
router.post("/login", employeeLogin);


module.exports = router;