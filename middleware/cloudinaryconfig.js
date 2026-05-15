const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dd2ges8zl',
  api_key:    process.env.CLOUDINARY_API_KEY    || '952998259432382',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'pG5TQ04Enx2oa9S5OXGcRNznT5c',
  timeout: 60000,
});

module.exports = cloudinary;
