const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const User = require("../models/userModel");

// @desc   Protect routes (make sure the user is logged in)
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1) Get token from header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(
      new ApiError("You are not logged in, please login to get access", 401)
    );
  }

  // 2) Verify token
  const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.userId);
  if (!currentUser) {
    return next(new ApiError("The user belonging to this token no longer exists", 401));
  }

  // 4) Check if password was changed after token issued
  if (currentUser.passwordChangedAt) {
    const passChangedTimestamp = parseInt(
      currentUser.passwordChangedAt.getTime() / 1000,
      10
    );
    if (passChangedTimestamp > decoded.iat) {
      return next(new ApiError("User recently changed password. Please log in again.", 401));
    }
  }

  req.user = currentUser;
  next();
});
