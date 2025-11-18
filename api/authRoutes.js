const express =require('express');
const {
  signupValidator,
  loginValidator,
} = require('../utils/validators/authValidator');

const { registerUser,
        login, 
        forgotPassword,
        verifyPassResetCode,
        resetPassword} = require('../services/authService');


const router = express.Router();

// 🔹 Signup route
router.post('/registerUser',signupValidator, registerUser);
router.post('/login', loginValidator, login);
router.post('/forgotPassword', forgotPassword);
router.post('/verifyResetCode', verifyPassResetCode);
router.put('/resetPassword', resetPassword);

module.exports = router;