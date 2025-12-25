/**
 * MSG91 OTP Test Script
 * Run this to test MSG91 integration directly
 *
 * Usage: node test-msg91.js <phone_number>
 * Example: node test-msg91.js 9876543210
 */

require('dotenv').config();
const axios = require('axios');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node test-msg91.js <phone_number>');
  console.log('Example: node test-msg91.js 9876543210');
  process.exit(1);
}

// Clean phone number
const cleanPhone = phoneNumber.replace(/\D/g, '');

if (cleanPhone.length !== 10) {
  console.error('❌ Phone number must be 10 digits');
  process.exit(1);
}

console.log('\n🔍 MSG91 Configuration Check:');
console.log('=====================================');
console.log('AUTH_KEY:', process.env.MSG91_AUTH_KEY ? `${process.env.MSG91_AUTH_KEY.substring(0, 10)}...` : '❌ NOT SET');
console.log('TEMPLATE_ID:', process.env.MSG91_TEMPLATE_ID || '❌ NOT SET');
console.log('SENDER_ID:', process.env.MSG91_SENDER_ID || 'KSHFIN');
console.log('Phone Number:', `91${cleanPhone}`);
console.log('=====================================\n');

if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID) {
  console.error('❌ MSG91 credentials not configured in .env file');
  console.log('\nPlease add to your .env file:');
  console.log('MSG91_AUTH_KEY=your_auth_key');
  console.log('MSG91_TEMPLATE_ID=your_template_id');
  console.log('MSG91_SENDER_ID=KSHFIN');
  process.exit(1);
}

async function testSendOTP() {
  try {
    console.log('📤 Sending OTP via MSG91 Standard API...\n');

    const url = 'https://control.msg91.com/api/v5/otp';
    const payload = {
      template_id: process.env.MSG91_TEMPLATE_ID,
      mobile: `91${cleanPhone}`,
      authkey: process.env.MSG91_AUTH_KEY,
    };

    console.log('Request URL:', url);
    console.log('Request Method: POST');
    console.log('Request Headers:', { 'Content-Type': 'application/json' });
    console.log('Request Payload:', {
      template_id: payload.template_id,
      mobile: payload.mobile,
      authkey: `${payload.authkey.substring(0, 10)}...`,
    });
    console.log('\nFull curl command for debugging:');
    console.log(`curl -X POST "${url}" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '${JSON.stringify(payload)}'`);
    console.log('');

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('✅ SUCCESS! OTP sent successfully\n');
    console.log('Response Status:', response.status);
    console.log('Response Headers:', JSON.stringify(response.headers, null, 2));
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    console.log('\n📱 Check your phone for the OTP!');
    console.log('\n💡 If you received the OTP, the integration is working correctly!');

  } catch (error) {
    console.error('❌ FAILED to send OTP\n');

    if (error.response) {
      console.error('Error Status:', error.response.status);
      console.error('Error Status Text:', error.response.statusText);
      console.error('Error Headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Error Data:', JSON.stringify(error.response.data, null, 2));

      // Common error explanations
      if (error.response.status === 401 || error.response.status === 403) {
        console.log('\n⚠️  Authentication failed.');
        console.log('Possible issues:');
        console.log('1. Invalid authkey - verify it matches your MSG91 dashboard');
        console.log('2. Authkey not activated - check MSG91 dashboard');
        console.log('3. IP restriction enabled - whitelist your server IP');
      } else if (error.response.status === 400) {
        console.log('\n⚠️  Bad request.');
        console.log('Possible issues:');
        console.log('1. Template ID not found or inactive');
        console.log('2. Invalid phone number format');
        console.log('3. Missing required fields');
      } else if (error.response.status === 402) {
        console.log('\n⚠️  Insufficient credits in MSG91 account');
      }
    } else if (error.request) {
      console.error('No response received from MSG91');
      console.error('Check your internet connection');
    } else {
      console.error('Error:', error.message);
    }

    console.log('\n📚 MSG91 Documentation:');
    console.log('https://docs.msg91.com/p/tf9GTextN/e/UKwJCuto8/MSG91-API');
  }
}

// Run the test
testSendOTP();
