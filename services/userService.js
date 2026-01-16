const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const createToken = require('../utils/createToken');
const User = require('../models/userModel');
const ApiError = require("../utils/apiError");
const { transformUserProfileImage } = require('../utils/profileImageHelper');
const sendEmail = require('../utils/sendEmail');

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
  
  // 📧 التحقق من تغيير الإيميل
  const user = await User.findById(req.user._id);
  if (!user) {
    return next(new ApiError('User not found', 404));
  }

  if (req.body.email !== undefined) {
    const newEmail = req.body.email.toLowerCase();
    
    // إذا كان الإيميل الجديد مختلف عن الإيميل الحالي
    if (newEmail !== user.email) {
      // التحقق من أن الإيميل الجديد غير مستخدم
      const existingUser = await User.findOne({ email: newEmail });
      if (existingUser) {
        return next(new ApiError('الإيميل مستخدم بالفعل', 400));
      }

      // توليد كود تحقق من 6 أرقام
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedCode = crypto
        .createHash("sha256")
        .update(verificationCode)
        .digest("hex");

      // حفظ الإيميل الجديد مؤقتاً مع كود التحقق
      user.pendingEmail = newEmail;
      user.emailChangeCode = hashedCode;
      user.emailChangeExpires = Date.now() + 10 * 60 * 1000; // 10 دقائق

      await user.save();

      // إرسال كود التحقق إلى الإيميل الجديد
      const message = `مرحباً ${user.name},\n\nلقد طلبت تغيير بريدك الإلكتروني.\nكود التحقق الخاص بك هو: ${verificationCode}\n\nهذا الكود صالح لمدة 10 دقائق.\n\nشكراً لك.\nفريق Filevo`;
      
      try {
        await sendEmail({
          email: newEmail,
          subject: "كود التحقق لتغيير البريد الإلكتروني",
          message,
        });
      } catch (err) {
        // إلغاء التغييرات إذا فشل الإرسال
        user.pendingEmail = undefined;
        user.emailChangeCode = undefined;
        user.emailChangeExpires = undefined;
        await user.save();
        return next(new ApiError('فشل إرسال رسالة التحقق. يرجى المحاولة مرة أخرى', 500));
      }

      // إرجاع رسالة تفيد بأن كود التحقق تم إرساله
      return res.status(200).json({
        success: true,
        message: 'تم إرسال كود التحقق إلى بريدك الإلكتروني الجديد. يرجى إدخال الكود للتحقق',
        requiresVerification: true,
        pendingEmail: newEmail,
      });
    }
    // إذا كان الإيميل نفسه، لا حاجة لتغيير
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

// @desc    Verify email change code
// @route   POST /api/v1/users/verifyEmailChange
// @access  Private
exports.verifyEmailChange = asyncHandler(async (req, res, next) => {
  const { verificationCode } = req.body;

  if (!verificationCode) {
    return next(new ApiError('يرجى إدخال كود التحقق', 400));
  }

  // الحصول على المستخدم الحالي
  const user = await User.findById(req.user._id);
  if (!user) {
    return next(new ApiError('المستخدم غير موجود', 404));
  }

  // التحقق من وجود طلب تغيير إيميل
  if (!user.pendingEmail || !user.emailChangeCode) {
    return next(new ApiError('لا يوجد طلب تغيير بريد إلكتروني', 400));
  }

  // التحقق من انتهاء صلاحية الكود
  if (user.emailChangeExpires < Date.now()) {
    // مسح الكود المنتهي
    user.pendingEmail = undefined;
    user.emailChangeCode = undefined;
    user.emailChangeExpires = undefined;
    await user.save();
    return next(new ApiError('انتهت صلاحية كود التحقق. يرجى طلب كود جديد', 400));
  }

  // تشفير الكود المدخل والتحقق منه
  const hashedCode = crypto
    .createHash("sha256")
    .update(verificationCode)
    .digest("hex");

  if (user.emailChangeCode !== hashedCode) {
    return next(new ApiError('كود التحقق غير صحيح', 400));
  }

  // ✅ الكود صحيح، تحديث الإيميل
  user.email = user.pendingEmail;
  user.pendingEmail = undefined;
  user.emailChangeCode = undefined;
  user.emailChangeExpires = undefined;

  await user.save();

  // ✅ تحويل profileImg إلى URL كامل
  let userWithProfileUrl;
  try {
    userWithProfileUrl = transformUserProfileImage(user, req);
    console.log('✅ [userService] verifyEmailChange - User data transformed successfully');
  } catch (transformError) {
    console.error('❌ [userService] verifyEmailChange - Error transforming profile image:', transformError.message);
    // Fallback: return user without transformation
    userWithProfileUrl = user.toObject ? user.toObject() : user;
  }

  res.status(200).json({
    success: true,
    message: 'تم تغيير البريد الإلكتروني بنجاح',
    data: userWithProfileUrl,
  });
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
