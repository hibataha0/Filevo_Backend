const express =require('express');
const {
  signupValidator,
  loginValidator,
} = require('../utils/validators/authValidator');

const { registerUser,
        login, 
        forgotPassword,
        verifyPassResetCode,
        resetPassword,
        verifyEmailCode,
        resendVerificationCode} = require('../services/authService');


const router = express.Router();

// 🔹 Signup route
router.post('/registerUser',signupValidator, registerUser);

// ✅ Email verification routes
router.post('/verifyEmail', verifyEmailCode);
router.post('/resendVerificationCode', resendVerificationCode);

router.post('/login', loginValidator, login);
router.post('/forgotPassword', forgotPassword);
router.post('/verifyResetCode', verifyPassResetCode);
router.put('/resetPassword', resetPassword);

module.exports = router;