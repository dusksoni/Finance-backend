// cloudinaryConfig.js

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dd2ges8zl',
  api_key: '952998259432382',
  api_secret: 'pG5TQ04Enx2oa9S5OXGcRNznT5c',
  timeout: 60000 // 60 seconds

});

module.exports = cloudinary;
