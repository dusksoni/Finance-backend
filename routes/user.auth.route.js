const express = require("express");
const router = express.Router();
const { sendOtp } = require("../controllers/sendOtp.controller");
const { authMiddleware } = require("../middleware/auth");

router.post("/send-otp", authMiddleware, sendOtp);


module.exports = router;
