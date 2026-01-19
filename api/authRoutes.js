const express = require("express");
const {
  signupValidator,
  loginValidator,
} = require("../utils/validators/authValidator");

const {
  registerUser,
  login,
  forgotPassword,
  verifyPassResetCode,
  resetPassword,
  logout, // ✅ 1) أضفنا logout
  protect, // ✅ 2) أضفنا protect
} = require("../services/authService");

const router = express.Router();

// 🔹 Signup route
router.post("/registerUser", signupValidator, registerUser);

// 🔹 Login route
router.post("/login", loginValidator, login);

// 🔹 Logout route ✅ (هنا الإضافة)
router.post("/logout", protect, logout);

// 🔹 Password reset routes
router.post("/forgotPassword", forgotPassword);
router.post("/verifyResetCode", verifyPassResetCode);
router.put("/resetPassword", resetPassword);

module.exports = router;
