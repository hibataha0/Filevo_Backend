const express = require('express');
const {
  updateLoggedUserValidator,
  changeLoggedUserPasswordValidator,
  verifyEmailChangeValidator,
} = require('../utils/validators/userValidator');

const {
  getLoggedUserData,
  updateLoggedUserPassword,
  updateLoggedUserData,
  verifyEmailChange,
  deleteLoggedUserData,
} = require('../services/userService');

const {
  uploadUserImage,
  resizeProfileImage,
} = require('../middlewares/userImageMiddleware');

const authService = require('../services/authService');

const router = express.Router();

// حماية كل المسارات، يجب تسجيل الدخول
router.use(authService.protect);

// Routes للمستخدم الحالي فقط
router.get('/getMe', getLoggedUserData, updateLoggedUserData); // يمكن استخدام getUser بدلاً من updateLoggedUserData إذا أردت جلب البيانات فقط
router.put('/changeMyPassword', changeLoggedUserPasswordValidator, updateLoggedUserPassword);
router.put(
  '/updateMe',
  updateLoggedUserValidator,
  uploadUserImage,      // ✅ يجب أن يكون هذا أولاً لرفع الصورة
  resizeProfileImage,         // ✅ ثم هذا لمعالجة الصورة
  updateLoggedUserData // ✅ ثم هذا لتحديث البيانات
);
router.put(
  '/updateMe/uploadProfileImage',
  uploadUserImage,
  resizeProfileImage,
  updateLoggedUserData
);
router.post('/verifyEmailChange', verifyEmailChangeValidator, verifyEmailChange);
router.delete('/deleteMe', deleteLoggedUserData);

// ✅ Endpoint لمسح الكاش (للتجربة فقط - احذفه في Production!)
router.post('/clearCache', (req, res) => {
  const userId = req.user._id.toString();
  const NodeCache = require('node-cache');
  const userCache = new NodeCache();
  
  const cacheKey = `user:${userId}`;
  const deleted = userCache.del(cacheKey);
  
  console.log('🧹 [userRoute] Cache clear requested');
  console.log('   User ID:', userId);
  console.log('   Cache key:', cacheKey);
  console.log('   Deleted:', deleted);
  
  res.status(200).json({
    message: 'Cache cleared successfully',
    userId,
    cacheKey,
    deleted
  });
});

module.exports = router;
