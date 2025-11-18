const express = require('express');
const {
  updateLoggedUserValidator,
} = require('../utils/validators/userValidator');

const {
  getLoggedUserData,
  updateLoggedUserPassword,
  updateLoggedUserData,
  deleteLoggedUserData,
} = require('../services/userService');

const authService = require('../services/authService');

const router = express.Router();

// حماية كل المسارات، يجب تسجيل الدخول
router.use(authService.protect);

// Routes للمستخدم الحالي فقط
router.get('/getMe', getLoggedUserData, updateLoggedUserData); // يمكن استخدام getUser بدلاً من updateLoggedUserData إذا أردت جلب البيانات فقط
router.put('/changeMyPassword', updateLoggedUserPassword);
router.put('/updateMe', updateLoggedUserValidator, updateLoggedUserData);
router.delete('/deleteMe', deleteLoggedUserData);

module.exports = router;
