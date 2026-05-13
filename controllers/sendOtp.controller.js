const msg91 = require('../utils/msg91');

exports.sendOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  const result = await msg91.sendOTP(phone);
  if (!result.success) {
    console.error('Send OTP error:', result.message);
    return res.status(500).json({ error: 'Failed to send OTP' });
  }

  res.json({ message: 'OTP sent successfully' });
};
  