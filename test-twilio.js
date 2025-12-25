/**
 * Twilio OTP Test Script
 * Run this to test Twilio Verify integration directly
 *
 * Usage: node test-twilio.js <phone_number>
 * Example: node test-twilio.js 9876543210
 */

require('dotenv').config();
const twilio = require('twilio');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node test-twilio.js <phone_number>');
  console.log('Example: node test-twilio.js 9876543210');
  process.exit(1);
}

// Clean phone number
const cleanPhone = phoneNumber.replace(/\D/g, '');

if (cleanPhone.length !== 10) {
  console.error('❌ Phone number must be 10 digits');
  process.exit(1);
}

console.log('\n🔍 Twilio Configuration Check:');
console.log('=====================================');
console.log('ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? `${process.env.TWILIO_ACCOUNT_SID.substring(0, 10)}...` : '❌ NOT SET');
console.log('AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? `${process.env.TWILIO_AUTH_TOKEN.substring(0, 10)}...` : '❌ NOT SET');
console.log('VERIFY_SERVICE_SID:', process.env.TWILIO_VERIFY_SERVICE_SID || '❌ NOT SET');
console.log('Phone Number:', `+91${cleanPhone}`);
console.log('=====================================\n');

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
  console.error('❌ Twilio credentials not configured in .env file');
  console.log('\nPlease add to your .env file:');
  console.log('TWILIO_ACCOUNT_SID=your_account_sid');
  console.log('TWILIO_AUTH_TOKEN=your_auth_token');
  console.log('TWILIO_VERIFY_SERVICE_SID=your_verify_service_sid');
  process.exit(1);
}

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function testSendOTP() {
  try {
    console.log('📤 Sending OTP via Twilio Verify...\n');

    const verification = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({
        to: `+91${cleanPhone}`,
        channel: 'sms'
      });

    console.log('✅ SUCCESS! OTP sent successfully\n');
    console.log('Verification SID:', verification.sid);
    console.log('Status:', verification.status);
    console.log('To:', verification.to);
    console.log('Channel:', verification.channel);
    console.log('Valid:', verification.valid);
    console.log('\n📱 Check your phone for the OTP!');
    console.log('\n💡 Use the OTP to test verification next');

  } catch (error) {
    console.error('❌ FAILED to send OTP\n');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    console.error('Error Status:', error.status);
    console.error('Error Details:', error.moreInfo);

    // Common error explanations
    if (error.code === 20003) {
      console.log('\n⚠️  Authentication failed.');
      console.log('Possible issues:');
      console.log('1. Invalid Account SID or Auth Token');
      console.log('2. Credentials do not match');
    } else if (error.code === 20404) {
      console.log('\n⚠️  Verify Service not found.');
      console.log('Possible issues:');
      console.log('1. Invalid Verify Service SID');
      console.log('2. Service has been deleted');
    } else if (error.code === 60200) {
      console.log('\n⚠️  Invalid phone number format.');
    }

    console.log('\n📚 Twilio Verify Documentation:');
    console.log('https://www.twilio.com/docs/verify/api');
  }
}

// Run the test
testSendOTP();
