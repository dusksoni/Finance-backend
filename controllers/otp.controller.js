const prisma = require('../lib/prisma');
const jwt = require('jsonwebtoken');
const msg91 = require('../utils/msg91');

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

    const result = await msg91.sendOTP(userPhone);

    if (!result.success) {
      return res.status(500).json({
        status: 500,
        error: 'Failed to send OTP',
        message: result.message,
      });
    }

    res.status(200).json({
      status: 200,
      message: 'OTP sent successfully',
      data: {
        phone: userPhone.replace(/\d(?=\d{4})/g, '*'),
      },
    });
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

    const result = await msg91.verifyOTP(userPhone, otp);

    if (!result.success) {
      return res.status(401).json({
        status: 401,
        error: 'Invalid or expired OTP',
        message: result.message,
      });
    }

    const token = jwt.sign(
      {
        userId: loan.user.id,
        loanId: loan.id,
        phone: userPhone,
        type: 'mobile_user',
      },
      process.env.SECRET_KEY,
      { expiresIn: '30d' }
    );

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

    const result = await msg91.resendOTP(userPhone);

    if (!result.success) {
      return res.status(500).json({
        status: 500,
        error: 'Failed to resend OTP',
        message: result.message,
      });
    }

    res.status(200).json({
      status: 200,
      message: 'OTP resent successfully',
    });
  } catch (error) {
    console.error('Resend OTP Error:', error);
    res.status(500).json({
      status: 500,
      error: 'Internal server error',
      message: error.message,
    });
  }
};
