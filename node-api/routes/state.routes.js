const express = require("express");
const router = express.Router();
const { createState, getStates, getStateById, updateState, deleteState } = require("../controllers/statecity.controller");
const { authMiddleware, adminOnly, onlyAdminOrEmployee } = require("../middleware/auth");

router.post("/", authMiddleware, adminOnly, createState);
router.get("/", authMiddleware, onlyAdminOrEmployee, getStates);
router.get("/:id", authMiddleware, onlyAdminOrEmployee, getStateById);
router.put("/:id", authMiddleware, adminOnly, updateState);
router.delete("/:id", authMiddleware, adminOnly, deleteState);


module.exports = router;
