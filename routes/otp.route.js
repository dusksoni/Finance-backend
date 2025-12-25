const express = require('express');
const router = express.Router();
const otpController = require('../controllers/otp.controller');

/**
 * OTP Authentication Routes for Mobile User App
 * These routes allow users to login using OTP verification
 */

// Send OTP to user's registered phone number
router.post('/send', otpController.sendLoginOTP);

// Verify OTP and get authentication token
router.post('/verify', otpController.verifyLoginOTP);

// Resend OTP
router.post('/resend', otpController.resendLoginOTP);

module.exports = router;
