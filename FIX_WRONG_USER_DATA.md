# 🔧 حل مشكلة عرض بيانات مستخدم خاطئ

## 🔍 المشكلة

عند تسجيل الدخول بمستخدم ثاني، Backend يرجع بيانات **المستخدم الأول** بدلاً من المستخدم الحالي.

---

## ✅ السبب الحقيقي

المشكلة في **Backend Cache**!

```javascript
// في userService.js
const cacheKey = `user:${userId}`;
const cachedUser = userCache.get(cacheKey);  // ← هنا المشكلة!
```

### ما يحدث:

1. **User 1** يسجل دخول → Backend يخزن بياناته في الكاش
2. **User 1** يسجل خروج → Frontend يمسح التوكن ✅
3. **User 2** يسجل دخول → Frontend يحفظ توكن جديد ✅
4. **User 2** يفتح Profile → Backend يشيك على الكاش → **يلقى بيانات User 1 لسه موجودة!** ❌

---

## 🔎 الحل 1: مسح الكاش يدوياً (للتجربة)

### خطوة 1: استخدم Endpoint الجديد

أضفت endpoint جديد: `POST /api/v1/users/clearCache`

في Terminal:

```bash
curl -X POST http://localhost:8000/api/v1/users/clearCache \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

أو من Postman:
```
POST http://localhost:8000/api/v1/users/clearCache
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
```

---

## 🔎 الحل 2: مسح الكاش عند Logout (الحل الدائم)

### المشكلة:

```javascript
// في authService.js - دالة logout
exports.logout = async (req, res) => {
  // ❌ لا يمسح الكاش!
  res.status(200).json({ message: 'Logged out successfully' });
};
```

### الحل:

```javascript
// في authService.js
const NodeCache = require('node-cache');
const userCache = new NodeCache();

exports.logout = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const cacheKey = `user:${userId}`;
    
    // ✅ مسح الكاش عند تسجيل الخروج
    const deleted = userCache.del(cacheKey);
    console.log('🧹 [authService.logout] Cache cleared for user:', userId);
    console.log('   Deleted:', deleted);
    
    res.status(200).json({ 
      message: 'Logged out successfully',
      cachecleared: deleted 
    });
  } catch (error) {
    console.error('❌ [authService.logout] Error:', error);
    res.status(500).json({ message: 'Logout failed' });
  }
};
```

---

## 🔎 الحل 3: تقليل مدة الكاش

### المشكلة:

```javascript
// في userService.js
const userCache = new NodeCache({ stdTTL: 60 });  // 60 ثانية
```

### الحل:

```javascript
// في userService.js
const userCache = new NodeCache({ 
  stdTTL: 5,  // ← 5 ثواني فقط (للتجربة)
  checkperiod: 10  // تحقق كل 10 ثواني
});
```

---

## 🧪 خطوات الاختبار

### 1️⃣ شغل Backend مع Logs

```bash
node server.js
```

### 2️⃣ سجل دخول User 1

**راقب الـ Logs:**

```
🔐 [authService.protect] Decoded token userId: 693d973a4ef625acf0c899c5
✅ [authService.protect] Found user: 693d973a4ef625acf0c899c5
   User name: user1
   User email: user1@example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 [userService] getLoggedUserData - NEW REQUEST
🔍 Request userId from token: 693d973a4ef625acf0c899c5
🔍 Request user name from token: user1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 [userService] getLoggedUserData - Fetching user from DB: 693d973a4ef625acf0c899c5
✅ [userService] getLoggedUserData - User data transformed successfully
   Response user ID: 693d973a4ef625acf0c899c5
   Response user name: user1
```

✅ **النتيجة**: بيانات User 1 صحيحة!

---

### 3️⃣ سجل خروج User 1

**راقب الـ Logs:**

```
🧹 [authService.logout] Cache cleared for user: 693d973a4ef625acf0c899c5
   Deleted: true  ← يجب أن يكون true!
```

✅ **النتيجة**: الكاش تم مسحه!

---

### 4️⃣ سجل دخول User 2

**راقب الـ Logs:**

```
🔐 [authService.protect] Decoded token userId: 6a1b2c3d4e5f6a7b8c9d0e1f
✅ [authService.protect] Found user: 6a1b2c3d4e5f6a7b8c9d0e1f
   User name: user2  ← يجب أن يكون user2!
   User email: user2@example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 [userService] getLoggedUserData - NEW REQUEST
🔍 Request userId from token: 6a1b2c3d4e5f6a7b8c9d0e1f  ← ID المستخدم الثاني!
🔍 Request user name from token: user2  ← اسم المستخدم الثاني!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 [userService] getLoggedUserData - Fetching user from DB: 6a1b2c3d4e5f6a7b8c9d0e1f
✅ [userService] getLoggedUserData - User data transformed successfully
   Response user ID: 6a1b2c3d4e5f6a7b8c9d0e1f
   Response user name: user2
```

✅ **النتيجة**: بيانات User 2 صحيحة!

---

### ❌ المشكلة إذا الكاش ما انمسح:

```
🔐 [authService.protect] Decoded token userId: 6a1b2c3d4e5f6a7b8c9d0e1f
✅ [authService.protect] Found user: 6a1b2c3d4e5f6a7b8c9d0e1f
   User name: user2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 [userService] getLoggedUserData - NEW REQUEST
🔍 Request userId from token: 6a1b2c3d4e5f6a7b8c9d0e1f
⚡ [userService] getLoggedUserData - Returned from cache  ← من الكاش!
⚡ [userService] getLoggedUserData - Cached user ID: 693d973a4ef625acf0c899c5  ← ID المستخدم الأول! ❌
⚡ [userService] getLoggedUserData - Cached user name: user1  ← اسم المستخدم الأول! ❌
```

❌ **المشكلة**: الكاش يرجع بيانات User 1 بدلاً من User 2!

---

## 📊 الحل النهائي

### عدّل `authService.js` - دالة `logout`:

```javascript
const NodeCache = require('node-cache');
const userCache = new NodeCache();

exports.logout = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const cacheKey = `user:${userId}`;
    
    // ✅ مسح الكاش عند تسجيل الخروج
    const deleted = userCache.del(cacheKey);
    console.log('🧹 [authService.logout] Cache cleared for user:', userId);
    console.log('   Cache key:', cacheKey);
    console.log('   Deleted:', deleted);
    
    res.status(200).json({ 
      status: 'success',
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('❌ [authService.logout] Error:', error);
    return next(new ApiError('Logout failed', 500));
  }
});
```

---

## ⚠️ ملاحظة مهمة

### مشكلة NodeCache Instance:

في `userService.js`:
```javascript
const userCache = new NodeCache();  // ← instance 1
```

في `authService.js`:
```javascript
const userCache = new NodeCache();  // ← instance 2 (مختلف!)
```

**المشكلة**: كل ملف عنده instance مختلف من الكاش!

**الحل**: استخدم **نفس الـ instance**!

### إنشاء ملف `utils/cache.js`:

```javascript
const NodeCache = require('node-cache');

// ✅ نسخة واحدة مشتركة
const userCache = new NodeCache({ 
  stdTTL: 300,  // 5 دقائق
  checkperiod: 60  // تحقق كل دقيقة
});

module.exports = { userCache };
```

### استخدمه في كل الملفات:

```javascript
// في userService.js
const { userCache } = require('../utils/cache');

// في authService.js
const { userCache } = require('../utils/cache');
```

---

**آخر تحديث**: 2026-01-18
