const prisma = require('../lib/prisma');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * OTP Authentication Controller for Mobile User App
 * Supports login by registration number or phone number
 * Uses Twilio Verify for OTP
 */

/**
 * Send OTP for authentication
 * User can provide either registration number (fileNo) or phone number
 */
exports.sendLoginOTP = async (req, res) => {
  try {
    const { identifier } = req.body; // Can be fileNo or phone number

    if (!identifier) {
      return res.status(400).json({
        status: 400,
        error: 'Identifier (registration number or phone number) is required',
      });
    }

    // Try to find loan by file number or user phone
    let loan = null;
    let userPhone = null;

    // Check if identifier looks like a phone number (10 digits)
    const phoneRegex = /^\d{10}$/;
    const isPhone = phoneRegex.test(identifier.replace(/\D/g, ''));

    if (isPhone) {
      // Search by phone number
      const cleanPhone = identifier.replace(/\D/g, '');
      loan = await prisma.loan.findFirst({
        where: {
          user: {
            phone: cleanPhone,
          },
          NOT: {
            fileStatus: 'CLOSED',
          },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
        },
      });
      userPhone = cleanPhone;
    } else {
      // Search by file number
      loan = await prisma.loan.findFirst({
        where: {
          fileNo: identifier.toUpperCase(),
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
        },
      });
      userPhone = loan?.user?.phone;
    }

    if (!loan || !userPhone) {
      console.log('Loan not found for identifier:', identifier);
      return res.status(404).json({
        status: 404,
        error: 'No active loan found for this identifier',
      });
    }

    console.log('Loan found:', {
      loanId: loan.id,
      fileNo: loan.fileNo,
      userPhone: userPhone,
    });

    // Send OTP using Twilio Verify
    console.log('Attempting to send OTP via Twilio to:', userPhone);

    try {
      await twilioClient.verify.v2
        .services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verifications.create({
          to: `+91${userPhone}`,
          channel: 'sms'
        });

      console.log('OTP sent successfully via Twilio');

      res.status(200).json({
        status: 200,
        message: 'OTP sent successfully',
        data: {
          phone: userPhone.replace(/\d(?=\d{4})/g, '*'), // Mask phone number
        },
      });
    } catch (twilioError) {
      console.error('Twilio OTP Error:', twilioError);
      return res.status(500).json({
        status: 500,
        error: 'Failed to send OTP',
        message: twilioError.message,
      });
    }
  } catch (error) {
    console.error('Send Login OTP Error:', error);
    res.status(500).json({
      status: 500,
      error: 'Internal server error',
      message: error.message,
    });
  }
};

/**
 * Verify OTP and login
 * Returns JWT token and user loan details
 */
exports.verifyLoginOTP = async (req, res) => {
  try {
    const { identifier, otp } = req.body;

    if (!identifier || !otp) {
      return res.status(400).json({
        status: 400,
        error: 'Identifier and OTP are required',
      });
    }

    // Find loan again
    let loan = null;
    let userPhone = null;

    const phoneRegex = /^\d{10}$/;
    const isPhone = phoneRegex.test(identifier.replace(/\D/g, ''));

    if (isPhone) {
      const cleanPhone = identifier.replace(/\D/g, '');
      loan = await prisma.loan.findFirst({
        where: {
          user: {
            phone: cleanPhone,
          },
          NOT: {
            fileStatus: 'CLOSED',
          },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
          loanType: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      userPhone = cleanPhone;
    } else {
      loan = await prisma.loan.findFirst({
        where: {
          fileNo: identifier.toUpperCase(),
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
          loanType: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      userPhone = loan?.user?.phone;
    }

    if (!loan || !userPhone) {
      return res.status(404).json({
        status: 404,
        error: 'No active loan found',
      });
    }

    // Verify OTP using Twilio Verify
    try {
      const verificationCheck = await twilioClient.verify.v2
        .services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks.create({
          to: `+91${userPhone}`,
          code: otp
        });

      console.log('Twilio verification result:', verificationCheck.status);

      if (verificationCheck.status !== 'approved') {
        return res.status(401).json({
          status: 401,
          error: 'Invalid or expired OTP',
        });
      }
    } catch (twilioError) {
      console.error('Twilio Verify Error:', twilioError);
      return res.status(401).json({
        status: 401,
        error: 'Invalid OTP',
        message: twilioError.message,
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: loan.user.id,
        loanId: loan.id,
        phone: userPhone,
        type: 'mobile_user',
      },
      process.env.SECRET_KEY,
      { expiresIn: '30d' } // Token valid for 30 days
    );

    // Construct full name from firstName, middleName, lastName
    const fullName = [
      loan.user.firstName,
      loan.user.middleName,
      loan.user.lastName,
    ]
      .filter(Boolean)
      .join(' ');

    res.status(200).json({
      status: 200,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: loan.user.id,
          name: fullName,
          phone: loan.user.phone,
          email: loan.user.email,
        },
        loan: {
          id: loan.id,
          fileNo: loan.fileNo,
          fileStatus: loan.fileStatus,
          loanType: loan.loanType,
          totalAmount: loan.totalAmount,
          pendingAmount: loan.pendingAmount,
          principalLoanAmount: loan.principalLoanAmount,
          interestRate: loan.interestRate,
          tenureMonths: loan.tenureMonths,
          monthlyPayableAmount: loan.monthlyPayableAmount,
        },
      },
    });
  } catch (error) {
    console.error('Verify Login OTP Error:', error);
    res.status(500).json({
      status: 500,
      error: 'Internal server error',
      message: error.message,
    });
  }
};

/**
 * Resend OTP
 */
exports.resendLoginOTP = async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({
        status: 400,
        error: 'Identifier is required',
      });
    }

    // Find user phone
    let userPhone = null;
    const phoneRegex = /^\d{10}$/;
    const isPhone = phoneRegex.test(identifier.replace(/\D/g, ''));

    if (isPhone) {
      userPhone = identifier.replace(/\D/g, '');
    } else {
      const loan = await prisma.loan.findFirst({
        where: {
          fileNo: identifier.toUpperCase(),
        },
        include: {
          user: {
            select: {
              phone: true,
            },
          },
        },
      });
      userPhone = loan?.user?.phone;
    }

    if (!userPhone) {
      return res.status(404).json({
        status: 404,
        error: 'User not found',
      });
    }

    // Resend OTP using Twilio
    try {
      await twilioClient.verify.v2
        .services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verifications.create({
          to: `+91${userPhone}`,
          channel: 'sms'
        });

      res.status(200).json({
        status: 200,
        message: 'OTP resent successfully',
      });
    } catch (twilioError) {
      console.error('Twilio Resend OTP Error:', twilioError);
      return res.status(500).json({
        status: 500,
        error: 'Failed to resend OTP',
        message: twilioError.message,
      });
    }
  } catch (error) {
    console.error('Resend OTP Error:', error);
    res.status(500).json({
      status: 500,
      error: 'Internal server error',
      message: error.message,
    });
  }
};
