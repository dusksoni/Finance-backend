const express = require('express');
const router = express.Router();
const {
  createCease,
  completeCease,
  releaseCeasedAsset,
  getLoanCeaseHistory,
  getCeaseById,
  getAllCeaseHistories
} = require('../controllers/cease.controller');
const { authMiddleware, onlyAdminOrEmployee } = require('../middleware/auth');

// Create cease request (assign asset cease)
router.post('/loan/:loanId/cease', authMiddleware, onlyAdminOrEmployee, createCease);

// Mark cease as completed by assigned employee
router.post('/cease/:id/complete', authMiddleware, onlyAdminOrEmployee, completeCease);

// Release ceased asset
router.post('/cease/:id/release', authMiddleware, onlyAdminOrEmployee, releaseCeasedAsset);

// Get all cease histories for a loan
router.get('/loan/:loanId/cease', authMiddleware, onlyAdminOrEmployee, getLoanCeaseHistory);

// Get one cease record with all details
router.get('/cease/:id', authMiddleware, onlyAdminOrEmployee, getCeaseById);

// In your ceaseHistory router:
router.get("/all", authMiddleware, onlyAdminOrEmployee, getAllCeaseHistories);

module.exports = router;
