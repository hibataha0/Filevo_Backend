const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const createToken = require('../utils/createToken');
const User = require('../models/userModel');
const ApiError = require("../utils/apiError");
// @desc    Get Logged user data
// @route   GET /api/v1/users/getMe
// @access  Private
exports.getLoggedUserData = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.status(200).json({ data: user });
});

// @desc    Update logged user password
// @route   PUT /api/v1/users/changeMyPassword
// @access  Private
exports.updateLoggedUserPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  // تحقق من كلمة المرور القديمة إذا أردت
  user.password = await bcrypt.hash(req.body.password, 12);
  user.passwordChangedAt = Date.now();
  await user.save();

  const token = createToken(user._id);
  res.status(200).json({ data: user, token });
});

// @desc    Update logged user data
// @route   PUT /api/v1/users/updateMe
// @access  Private
exports.updateLoggedUserData = asyncHandler(async (req, res, next) => {
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
    },
    { new: true }
  );

  res.status(200).json({ data: updatedUser });
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
