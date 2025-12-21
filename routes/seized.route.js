const express = require("express");
const router = express.Router();
const {
  createSeized,
  completeSeized,
  releaseSeizedAsset,
  getLoanSeizedHistory,
  getSeizedById,
  getAllSeizedHistories,
  addSeizedContactAttempt,
  updateSeized,
  deleteSeized,
  closeSeized,
} = require("../controllers/seized.controller");
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");

// Get all seized histories
router.get("/", authMiddleware, onlyAdminOrEmployee, getAllSeizedHistories);

// Get all seized histories for a specific loan
router.get("/loan/:loanId", authMiddleware, onlyAdminOrEmployee, getLoanSeizedHistory);

// Get one seized record with all details
router.get("/:id", authMiddleware, onlyAdminOrEmployee, getSeizedById);

// Create seized request (assign asset seizure)
router.post("/:loanId", authMiddleware, onlyAdminOrEmployee, createSeized);

// Update seized (only PENDING status)
router.put("/:id", authMiddleware, onlyAdminOrEmployee, updateSeized);

// Delete seized (only PENDING status)
router.delete("/:id", authMiddleware, onlyAdminOrEmployee, deleteSeized);

// Mark seized as completed by assigned employee
router.post("/:id/complete", authMiddleware, onlyAdminOrEmployee, completeSeized);

// Close seized (can be done before RELEASED)
router.post("/:id/close", authMiddleware, onlyAdminOrEmployee, closeSeized);

// Release seized asset
router.post("/:id/release", authMiddleware, onlyAdminOrEmployee, releaseSeizedAsset);

// Add contact attempt for seized asset
router.post("/:id/contact-attempt", authMiddleware, onlyAdminOrEmployee, addSeizedContactAttempt);

module.exports = router;
