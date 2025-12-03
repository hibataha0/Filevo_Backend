const asyncHandler = require('express-async-handler');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { uploadSingleImage } = require('./uploadImageMiddleware');

// Upload single image for profile
exports.uploadUserImage = uploadSingleImage('profileImg');

// Image processing for profile image
exports.resizeProfileImage = asyncHandler(async (req, res, next) => {
  const filename = `user-profile-${uuidv4()}-${Date.now()}.jpeg`;

  if (req.file) {
    // إنشاء مجلد uploads/users إذا لم يكن موجوداً
    const uploadDir = path.join(__dirname, '..', 'uploads', 'users');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    await sharp(req.file.buffer)
      .resize(600, 600)
      .toFormat('jpeg')
      .jpeg({ quality: 95 })
      .toFile(path.join(uploadDir, filename));

    // Save image into our db
    req.body.profileImg = filename;
  }
  next();
});

