const twilio = require("twilio");
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

exports.sendOtp = async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone is required" });
  
    try {
      await client.verify.v2
        .services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verifications.create({ to: `+91${phone}`, channel: "sms" });
  
      res.json({ message: "OTP sent successfully" });
    } catch (err) {
      console.error("Send OTP error:", err.message);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  };
  