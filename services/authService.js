const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const ApiError = require("../utils/apiError");
const createToken = require("../utils/createToken");
const User = require("../models/userModel");
const sendEmail = require("../utils/sendEmail");

// Initialize Google OAuth2 client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// @desc    Register new user
// @route   POST /api/v1/auth/register
// @access  Public

exports.registerUser = asyncHandler(async (req, res, next) => {
  // ✅ التحقق من أن الإيميل غير مستخدم كحساب Google
  const existingUser = await User.findOne({ email: req.body.email.toLowerCase() });
  if (existingUser && existingUser.authProvider === "google") {
    return next(
      new ApiError(
        "هذا البريد الإلكتروني مسجل بالفعل عبر Google. يرجى استخدام تسجيل الدخول عبر Google",
        400
      )
    );
  }

  // ✅ إنشاء المستخدم مع emailVerified = false
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    emailVerified: false, // ✅ الحساب غير مفعّل حتى الآن
    authProvider: "local", // تأكيد أن هذا حساب محلي
  });

  // ✅ توليد كود تحقق من 6 أرقام
  const verificationCode = Math.floor(
    100000 + Math.random() * 900000
  ).toString();
  const hashedVerificationCode = crypto
    .createHash("sha256")
    .update(verificationCode)
    .digest("hex");

  // ✅ حفظ كود التحقق في قاعدة البيانات
  user.emailVerificationCode = hashedVerificationCode;
  // ✅ انتهاء صلاحية الكود بعد 10 دقائق
  user.emailVerificationExpires = Date.now() + 10 * 60 * 1000;

  await user.save();

  // ✅ إرسال كود التحقق عبر البريد الإلكتروني
  const message = `مرحباً ${user.name},\n\nشكراً لك على التسجيل في Filevo!\n\nكود التحقق من البريد الإلكتروني الخاص بك هو:\n${verificationCode}\n\nهذا الكود صالح لمدة 10 دقائق.\n\nإذا لم تطلب هذا الكود، يمكنك تجاهل هذه الرسالة.\n\nشكراً لك،\nفريق Filevo`;

  try {
    await sendEmail({
      email: user.email,
      subject: "كود التحقق من البريد الإلكتروني - Filevo",
      message,
    });
  } catch (err) {
    // ✅ في حالة فشل إرسال البريد، حذف الكود
    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    return next(new ApiError("حدث خطأ في إرسال البريد الإلكتروني", 500));
  }

  // ✅ إرجاع رسالة نجاح بدون token (لأن الحساب غير مفعّل)
  res.status(201).json({
    success: true,
    message:
      "تم إنشاء الحساب بنجاح. يرجى التحقق من بريدك الإلكتروني لإدخال كود التحقق",
    userId: user._id,
    email: user.email,
  });
});

// @desc    Verify email verification code
// @route   POST /api/v1/auth/verifyEmail
// @access  Public
exports.verifyEmailCode = asyncHandler(async (req, res, next) => {
  const { email, verificationCode } = req.body;

  // ✅ التحقق من وجود البيانات المطلوبة
  if (!email || !verificationCode) {
    return next(new ApiError("البريد الإلكتروني وكود التحقق مطلوبان", 400));
  }

  // ✅ تحويل كود التحقق إلى hash
  const hashedVerificationCode = crypto
    .createHash("sha256")
    .update(verificationCode)
    .digest("hex");

  // ✅ البحث عن المستخدم بالبريد الإلكتروني وكود التحقق
  const user = await User.findOne({
    email: email.toLowerCase(),
    emailVerificationCode: hashedVerificationCode,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ApiError("كود التحقق غير صحيح أو منتهي الصلاحية", 400));
  }

  // ✅ تفعيل الحساب
  user.emailVerified = true;
  user.emailVerificationCode = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  // ✅ توليد token بعد تفعيل الحساب
  const token = createToken(user._id);

  // ✅ حذف كلمة المرور من الاستجابة
  delete user._doc.password;
  delete user._doc.emailVerificationCode;

  // ✅ تحويل profileImg إلى URL كامل
  const { transformUserProfileImage } = require("../utils/profileImageHelper");
  const userWithProfileUrl = transformUserProfileImage(user, req);

  res.status(200).json({
    success: true,
    message: "تم تفعيل الحساب بنجاح",
    data: userWithProfileUrl,
    token,
  });
});

// @desc    Resend email verification code
// @route   POST /api/v1/auth/resendVerificationCode
// @access  Public
exports.resendVerificationCode = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new ApiError("البريد الإلكتروني مطلوب", 400));
  }

  // ✅ البحث عن المستخدم
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    return next(new ApiError("المستخدم غير موجود", 404));
  }

  // ✅ التحقق من أن الحساب غير مفعّل بالفعل
  if (user.emailVerified) {
    return next(new ApiError("الحساب مفعّل بالفعل", 400));
  }

  // ✅ توليد كود تحقق جديد
  const verificationCode = Math.floor(
    100000 + Math.random() * 900000
  ).toString();
  const hashedVerificationCode = crypto
    .createHash("sha256")
    .update(verificationCode)
    .digest("hex");

  // ✅ حفظ كود التحقق الجديد
  user.emailVerificationCode = hashedVerificationCode;
  user.emailVerificationExpires = Date.now() + 10 * 60 * 1000; // 10 دقائق
  await user.save();

  // ✅ إرسال كود التحقق عبر البريد الإلكتروني
  const message = `مرحباً ${user.name},\n\nكود التحقق من البريد الإلكتروني الخاص بك هو:\n${verificationCode}\n\nهذا الكود صالح لمدة 10 دقائق.\n\nإذا لم تطلب هذا الكود، يمكنك تجاهل هذه الرسالة.\n\nشكراً لك،\nفريق Filevo`;

  try {
    await sendEmail({
      email: user.email,
      subject: "كود التحقق من البريد الإلكتروني - Filevo",
      message,
    });
  } catch (err) {
    // ✅ في حالة فشل إرسال البريد، حذف الكود
    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    return next(new ApiError("حدث خطأ في إرسال البريد الإلكتروني", 500));
  }

  res.status(200).json({
    success: true,
    message: "تم إرسال كود التحقق إلى بريدك الإلكتروني",
  });
});

// @desc    Google Login/Signup
// @route   POST /api/v1/auth/google
// @access  Public
exports.googleLogin = asyncHandler(async (req, res, next) => {
  const { token } = req.body;

  if (!token) {
    return next(new ApiError("Google token is required", 400));
  }

  try {
    // Verify the Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // 🔍 البحث عن المستخدم
    let user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // إنشاء مستخدم جديد
      user = await User.create({
        name,
        email: email.toLowerCase(),
        googleId,
        profileImg: picture,
        authProvider: "google",
        emailVerified: true, // Google accounts are automatically verified
      });
    } else {
      // المستخدم موجود - تحديث معلومات Google إذا لزم الأمر
      if (user.authProvider !== "google") {
        return next(
          new ApiError(
            "هذا الحساب مسجل باستخدام البريد الإلكتروني وكلمة المرور. يرجى استخدام تسجيل الدخول العادي",
            400
          )
        );
      }

      // تحديث معلومات Google
      user.googleId = googleId;
      if (picture && !user.profileImg) {
        user.profileImg = picture;
      }
      user.emailVerified = true;
      await user.save();
    }

    // 🔐 إنشاء JWT
    const jwtToken = createToken(user._id);

    // ✅ حذف كلمة المرور من الاستجابة
    delete user._doc.password;

    // ✅ تحويل profileImg إلى URL كامل
    const { transformUserProfileImage } = require("../utils/profileImageHelper");
    const userWithProfileUrl = transformUserProfileImage(user, req);

    res.status(200).json({
      success: true,
      message: "تم تسجيل الدخول بنجاح",
      data: userWithProfileUrl,
      token: jwtToken,
    });
  } catch (error) {
    console.error("Google login error:", error);
    return next(new ApiError("فشل التحقق من Google token", 401));
  }
});

// @desc    Login
// @route   GET /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  // 1) check if password and email in the body (validation)
  // 2) check if user exist & check if password is correct
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(
      new ApiError("البريد الإلكتروني أو كلمة المرور غير صحيحة", 401)
    );
  }

  // ✅ منع المستخدمين الذين سجلوا عبر Google من الدخول بالبريد/الباسورد
  if (user.authProvider === "google") {
    return next(
      new ApiError(
        "هذا الحساب مسجل عبر Google. يرجى استخدام تسجيل الدخول عبر Google",
        400
      )
    );
  }

  // ✅ التحقق من وجود كلمة المرور
  if (!user.password) {
    return next(
      new ApiError("البريد الإلكتروني أو كلمة المرور غير صحيحة", 401)
    );
  }

  if (!(await bcrypt.compare(req.body.password, user.password))) {
    return next(
      new ApiError("البريد الإلكتروني أو كلمة المرور غير صحيحة", 401)
    );
  }

  // ✅ التحقق من أن البريد الإلكتروني مفعّل
  if (!user.emailVerified) {
    // ✅ إذا كان الحساب غير مفعّل، إرسال كود التحقق تلقائياً
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    const hashedVerificationCode = crypto
      .createHash("sha256")
      .update(verificationCode)
      .digest("hex");

    // ✅ حفظ كود التحقق في قاعدة البيانات
    user.emailVerificationCode = hashedVerificationCode;
    user.emailVerificationExpires = Date.now() + 10 * 60 * 1000; // 10 دقائق
    await user.save();

    // ✅ إرسال كود التحقق عبر البريد الإلكتروني
    const message = `مرحباً ${user.name},\n\nتم محاولة تسجيل الدخول إلى حسابك في Filevo.\n\nكود التحقق من البريد الإلكتروني الخاص بك هو:\n${verificationCode}\n\nهذا الكود صالح لمدة 10 دقائق.\n\nيرجى إدخال هذا الكود لتفعيل حسابك وتسجيل الدخول.\n\nإذا لم تطلب هذا الكود، يمكنك تجاهل هذه الرسالة.\n\nشكراً لك،\nفريق Filevo`;

    try {
      await sendEmail({
        email: user.email,
        subject: "كود التحقق من البريد الإلكتروني - Filevo",
        message,
      });
    } catch (err) {
      // ✅ في حالة فشل إرسال البريد، حذف الكود
      user.emailVerificationCode = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();
      return next(new ApiError("حدث خطأ في إرسال البريد الإلكتروني", 500));
    }

    // ✅ إرجاع رسالة تخبر المستخدم أنه تم إرسال الكود
    return res.status(403).json({
      success: false,
      message:
        "يرجى تفعيل حسابك أولاً. تم إرسال كود التحقق إلى بريدك الإلكتروني",
      email: user.email,
      requiresVerification: true,
    });
  }

  // 3) generate token
  const token = createToken(user._id);

  // Delete password from response
  delete user._doc.password;

  // ✅ تحويل profileImg إلى URL كامل
  const { transformUserProfileImage } = require("../utils/profileImageHelper");
  const userWithProfileUrl = transformUserProfileImage(user, req);

  // 4) send response to client side
  res.status(200).json({ data: userWithProfileUrl, token });
});

// @desc   make sure the user is logged in
exports.protect = asyncHandler(async (req, res, next) => {
  // 1) Check if token exist, if exist get
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    return next(
      new ApiError(
        "You are not login, Please login to get access this route",
        401
      )
    );
  }

  // 2) Verify token (no change happens, expired token)
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(new ApiError("Token expired. Please login again", 401));
    }
    if (err.name === "JsonWebTokenError") {
      return next(new ApiError("Invalid token. Please login again", 401));
    }
    return next(new ApiError("Cannot identify user. Please re-login", 401));
  }

  // 3) Check if user exists
  const currentUser = await User.findById(decoded.userId);
  if (!currentUser) {
    return next(
      new ApiError(
        "The user that belong to this token does no longer exist",
        401
      )
    );
  }

  // 4) Check if user change his password after token created
  if (currentUser.passwordChangedAt) {
    const passChangedTimestamp = parseInt(
      currentUser.passwordChangedAt.getTime() / 1000,
      10
    );
    // Password changed after token created (Error)
    if (passChangedTimestamp > decoded.iat) {
      return next(
        new ApiError(
          "User recently changed his password. please login again..",
          401
        )
      );
    }
  }

  req.user = currentUser;
  next();
});

// @desc    Forgot password
// @route   POST /api/v1/auth/forgotPassword
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  // 1) Get user by email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(
      new ApiError(`There is no user with that email ${req.body.email}`, 404)
    );
  }
  // 2) If user exist, Generate hash reset random 6 digits and save it in db
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedResetCode = crypto
    .createHash("sha256")
    .update(resetCode)
    .digest("hex");

  // Save hashed password reset code into db
  user.passwordResetCode = hashedResetCode;
  // Add expiration time for password reset code (10 min)
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000;
  user.passwordResetVerified = false;

  await user.save();

  // 3) Send the reset code via email
  const message = `Hi ${user.name},\n We received a request to reset the password on your Filevo Account. \n ${resetCode} \n Enter this code to complete the reset. \n Thanks for helping us keep your account secure.\n The Filevo Team`;
  try {
    await sendEmail({
      email: user.email,
      subject: "Your password reset code (valid for 10 min)",
      message,
    });
  } catch (err) {
    user.passwordResetCode = undefined;
    user.passwordResetExpires = undefined;
    user.passwordResetVerified = undefined;

    await user.save();
    return next(new ApiError("There is an error in sending email", 500));
  }

  res
    .status(200)
    .json({ status: "Success", message: "Reset code sent to email" });
});

// @desc    Verify password reset code
// @route   POST /api/v1/auth/verifyResetCode
// @access  Public
exports.verifyPassResetCode = asyncHandler(async (req, res, next) => {
  // 1) Get user based on reset code
  const hashedResetCode = crypto
    .createHash("sha256")
    .update(req.body.resetCode)
    .digest("hex");

  const user = await User.findOne({
    passwordResetCode: hashedResetCode,
    passwordResetExpires: { $gt: Date.now() },
  });
  if (!user) {
    return next(new ApiError("Reset code invalid or expired"));
  }

  // 2) Reset code valid
  user.passwordResetVerified = true;
  await user.save();

  res.status(200).json({
    status: "Success",
  });
});

// @desc    Reset password
// @route   POST /api/v1/auth/resetPassword
// @access  Public

// @desc    Reset password
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { newPassword, confirmPassword } = req.body;

  // 1) Get user based on email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(
      new ApiError(`There is no user with email ${req.body.email}`, 404)
    );
  }

  // 2) Check if reset code verified
  if (!user.passwordResetVerified) {
    return next(new ApiError("Reset code not verified", 400));
  }

  // 3) Check if newPassword and confirmPassword match
  if (!newPassword || !confirmPassword || newPassword !== confirmPassword) {
    return next(
      new ApiError("New password and confirm password do not match", 400)
    );
  }

  // ✅ 4) Save the new password (the hook will hash it automatically)
  user.password = newPassword;

  user.passwordResetCode = undefined;
  user.passwordResetExpires = undefined;
  user.passwordResetVerified = undefined;

  await user.save();

  // 5) Generate token and send response
  const token = createToken(user._id);
  res.status(200).json({ token });
});
