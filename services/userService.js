const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const createToken = require('../utils/createToken');
const User = require('../models/userModel');
const ApiError = require("../utils/apiError");
const { transformUserProfileImage } = require('../utils/profileImageHelper');

// @desc    Get Logged user data
// @route   GET /api/v1/users/getMe
// @access  Private
exports.getLoggedUserData = asyncHandler(async (req, res, next) => {
  try {
    console.log('📥 [userService] getLoggedUserData - Fetching user:', req.user._id);
    
    const user = await User.findById(req.user._id);
    if (!user) {
      console.warn('⚠️ [userService] getLoggedUserData - User not found:', req.user._id);
      return res.status(404).json({ message: 'User not found' });
    }
    
    // ✅ تحويل profileImg إلى URL كامل
    let userWithProfileUrl;
    try {
      userWithProfileUrl = transformUserProfileImage(user, req);
      console.log('✅ [userService] getLoggedUserData - User data transformed successfully');
    } catch (transformError) {
      console.error('❌ [userService] getLoggedUserData - Error transforming profile image:', transformError.message);
      console.error('Stack trace:', transformError.stack);
      // Fallback: return user without transformation
      userWithProfileUrl = user.toObject ? user.toObject() : user;
    }
    
    res.status(200).json({ data: userWithProfileUrl });
  } catch (error) {
    console.error('❌ [userService] getLoggedUserData - Unexpected error:', error.message);
    console.error('Stack trace:', error.stack);
    return next(new ApiError('Failed to fetch user data', 500));
  }
});

// @desc    Update logged user password
// @route   PUT /api/v1/users/changeMyPassword
// @access  Private
exports.updateLoggedUserPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  // ✅ منع تغيير كلمة المرور للمستخدمين الذين سجلوا عبر Google
  if (user.authProvider === "google") {
    return next(
      new ApiError(
        "لا يمكن تغيير كلمة المرور لحساب مسجل عبر Google",
        400
      )
    );
  }

  // تحقق من كلمة المرور القديمة إذا أردت
  user.password = await bcrypt.hash(req.body.password, 12);
  user.passwordChangedAt = Date.now();
  await user.save();

  // ✅ تحويل profileImg إلى URL كامل
  let userWithProfileUrl;
  try {
    userWithProfileUrl = transformUserProfileImage(user, req);
    console.log('✅ [userService] updateLoggedUserPassword - User data transformed successfully');
  } catch (transformError) {
    console.error('❌ [userService] updateLoggedUserPassword - Error transforming profile image:', transformError.message);
    // Fallback: return user without transformation
    userWithProfileUrl = user.toObject ? user.toObject() : user;
  }

  const token = createToken(user._id);
  res.status(200).json({ data: userWithProfileUrl, token });
});

// @desc    Update logged user data
// @route   PUT /api/v1/users/updateMe
// @access  Private
exports.updateLoggedUserData = asyncHandler(async (req, res, next) => {
  // ✅ بناء update object مع جميع الحقول المتاحة
  const updateData = {};
  
  if (req.body.name !== undefined) {
    updateData.name = req.body.name;
  }
  if (req.body.email !== undefined) {
    updateData.email = req.body.email;
  }
  if (req.body.phone !== undefined) {
    updateData.phone = req.body.phone;
  }
  // ✅ إضافة profileImg إذا كان موجوداً في req.body (بعد معالجة الصورة)
  if (req.body.profileImg !== undefined) {
    updateData.profileImg = req.body.profileImg;
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    updateData,
    { new: true, runValidators: true }
  );

  if (!updatedUser) {
    return next(new ApiError('User not found', 404));
  }

  // ✅ تحويل profileImg إلى URL كامل
  let userWithProfileUrl;
  try {
    userWithProfileUrl = transformUserProfileImage(updatedUser, req);
    console.log('✅ [userService] updateLoggedUserData - User data transformed successfully');
  } catch (transformError) {
    console.error('❌ [userService] updateLoggedUserData - Error transforming profile image:', transformError.message);
    // Fallback: return user without transformation
    userWithProfileUrl = updatedUser.toObject ? updatedUser.toObject() : updatedUser;
  }

  res.status(200).json({ data: userWithProfileUrl });
});

// @desc    Delete logged user permanently
// @route   DELETE /api/v1/users/deleteMe
// @access  Private/Protect
exports.deleteLoggedUserData = asyncHandler(async (req, res, next) => {
  const deletedUser = await User.findByIdAndDelete(req.user._id);

  if (!deletedUser) {
    return next(new ApiError('User not found', 404));
  }

  res.status(200).json({
    status: 'Success',
    message: 'User deleted successfully',
  });
});
