const axios = require('axios');

/**
 * MSG91 OTP Service
 * Replaces Twilio for OTP verification
 */
class MSG91Service {
  constructor() {
    this.authKey = process.env.MSG91_AUTH_KEY;
    this.templateId = process.env.MSG91_TEMPLATE_ID;
    this.senderId = process.env.MSG91_SENDER_ID || 'KSHFIN';
    this.baseUrl = 'https://control.msg91.com/api/v5';

    if (!this.authKey) {
      console.warn('MSG91_AUTH_KEY not configured in environment variables');
    }
  }

  /**
   * Send OTP to mobile number
   * @param {string} mobile - 10 digit mobile number (without country code)
   * @param {string} otp - Optional: custom OTP, if not provided MSG91 will generate
   * @returns {Promise<Object>}
   */
  async sendOTP(mobile, otp = null) {
    try {
      // Remove any spaces or special characters from mobile
      const cleanMobile = mobile.replace(/\D/g, '');

      // Validate mobile number (should be 10 digits)
      if (cleanMobile.length !== 10) {
        throw new Error('Invalid mobile number. Must be 10 digits.');
      }

      console.log('MSG91 Config Check:', {
        authKey: this.authKey ? `${this.authKey.substring(0, 10)}...` : 'NOT SET',
        templateId: this.templateId || 'NOT SET',
        senderId: this.senderId,
        baseUrl: this.baseUrl,
      });

      const url = `${this.baseUrl}/otp`;
      const payload = {
        template_id: this.templateId,
        mobile: `91${cleanMobile}`, // Add country code
        authkey: this.authKey,
      };

      // If custom OTP is provided, include it
      if (otp) {
        payload.otp = otp;
      }

      console.log('MSG91 Request:', {
        url,
        mobile: `91${cleanMobile}`,
        template_id: this.templateId,
      });

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('MSG91 Send OTP Success Response:', JSON.stringify(response.data, null, 2));

      return {
        success: true,
        message: 'OTP sent successfully',
        type: response.data.type,
        requestId: response.data.request_id,
      };
    } catch (error) {
      console.error('MSG91 Send OTP Error Details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
      });
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to send OTP',
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Verify OTP
   * @param {string} mobile - 10 digit mobile number (without country code)
   * @param {string} otp - OTP to verify
   * @returns {Promise<Object>}
   */
  async verifyOTP(mobile, otp) {
    try {
      // Remove any spaces or special characters
      const cleanMobile = mobile.replace(/\D/g, '');
      const cleanOTP = otp.replace(/\D/g, '');

      if (cleanMobile.length !== 10) {
        throw new Error('Invalid mobile number. Must be 10 digits.');
      }

      if (cleanOTP.length < 4 || cleanOTP.length > 6) {
        throw new Error('Invalid OTP format.');
      }

      const url = `${this.baseUrl}/otp/verify`;
      const payload = {
        authkey: this.authKey,
        mobile: `91${cleanMobile}`,
        otp: cleanOTP,
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('MSG91 Verify OTP Response:', response.data);

      return {
        success: true,
        message: 'OTP verified successfully',
        type: response.data.type,
      };
    } catch (error) {
      console.error('MSG91 Verify OTP Error:', error.response?.data || error.message);

      // Check if it's a verification failure
      if (error.response?.data?.type === 'error') {
        return {
          success: false,
          message: 'Invalid OTP',
          error: error.response?.data?.message || 'OTP verification failed',
        };
      }

      return {
        success: false,
        message: 'OTP verification failed',
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Resend OTP
   * @param {string} mobile - 10 digit mobile number (without country code)
   * @param {string} retryType - 'voice' or 'text' (default: 'text')
   * @returns {Promise<Object>}
   */
  async resendOTP(mobile, retryType = 'text') {
    try {
      const cleanMobile = mobile.replace(/\D/g, '');

      if (cleanMobile.length !== 10) {
        throw new Error('Invalid mobile number. Must be 10 digits.');
      }

      const url = `${this.baseUrl}/otp/retry`;
      const payload = {
        authkey: this.authKey,
        mobile: `91${cleanMobile}`,
        retrytype: retryType,
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('MSG91 Resend OTP Response:', response.data);

      return {
        success: true,
        message: 'OTP resent successfully',
        type: response.data.type,
      };
    } catch (error) {
      console.error('MSG91 Resend OTP Error:', error.response?.data || error.message);
      return {
        success: false,
        message: 'Failed to resend OTP',
        error: error.response?.data || error.message,
      };
    }
  }
}

// Export singleton instance
module.exports = new MSG91Service();
