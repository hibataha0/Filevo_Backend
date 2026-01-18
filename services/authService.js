const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const ApiError = require("../utils/apiError");
const createToken = require("../utils/createToken");
const User = require("../models/userModel");
const sendEmail = require("../utils/sendEmail");

// @desc    Register new user
// @route   POST /api/v1/auth/register
// @access  Public

exports.registerUser = asyncHandler(async (req, res, next) => {
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
  });

  // 2- Generate token
  const token = createToken(user._id);

  res.status(201).json({ data: user, token });
});

// @desc    Login
// @route   GET /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  // 1) check if password and email in the body (validation)
  // 2) check if user exist & check if password is correct
  const user = await User.findOne({ email: req.body.email });

  if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
    return next(new ApiError("Incorrect email or password", 401));
  }
  // 3) generate token
  const token = createToken(user._id);

  // Delete password from response
  delete user._doc.password;

  // ✅ 4) إرسال إيميل تنبيه أمني بعد نجاح تسجيل الدخول
  try {
    const loginTime = new Date().toLocaleString('ar-EG', { 
      timeZone: 'Asia/Riyadh',
      dateStyle: 'full',
      timeStyle: 'short'
    });
    
    const ipAddress = req.ip || req.connection.remoteAddress || 'غير معروف';
    const userAgent = req.headers['user-agent'] || 'غير معروف';
    
    // تحديد نوع الجهاز والمتصفح
    let deviceType = 'غير معروف';
    let browser = 'غير معروف';
    
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      deviceType = 'هاتف محمول';
    } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
      deviceType = 'تابلت';
    } else {
      deviceType = 'كمبيوتر';
    }
    
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';
    
    const message = `مرحباً ${user.name}،

تم تسجيل الدخول إلى حسابك على Filevo بنجاح.

📅 التاريخ والوقت: ${loginTime}
🌐 عنوان IP: ${ipAddress}
💻 الجهاز: ${deviceType}
🔍 المتصفح: ${browser}

إذا لم تكن أنت من قام بهذا الإجراء، يرجى تغيير كلمة المرور فوراً وتأمين حسابك.

مع تحيات فريق Filevo`;

    await sendEmail({
      email: user.email,
      subject: "🔔 تنبيه أمني: تم تسجيل الدخول إلى حسابك",
      message,
    });
    
    console.log(`✅ [authService] Login notification email sent to ${user.email}`);
  } catch (emailError) {
    // لا نوقف تسجيل الدخول إذا فشل إرسال الإيميل
    console.error(`⚠️ [authService] Failed to send login notification email: ${emailError.message}`);
  }

  // 5) send response to client side
  res.status(200).json({ data: user, token });
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
    } else if (err.name === "JsonWebTokenError") {
      return next(new ApiError("Invalid token. Please login again", 401));
    } else {
      return next(new ApiError("Cannot identify user. Please re-login", 401));
    }
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
