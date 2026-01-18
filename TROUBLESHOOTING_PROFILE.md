# 🔧 حل مشكلة عرض بيانات مستخدم خاطئ في البروفايل

## المشكلة
عند تسجيل دخول مستخدم ثاني، يتم عرض بيانات أول مستخدم بدلاً من المستخدم الحالي.

## الأسباب المحتملة

### 1️⃣ مشكلة في الـ Frontend/Emulator (الأكثر احتمالاً)

#### ✅ الحل: تأكد من مسح التخزين عند تسجيل الخروج

في كود React Native/Frontend:

```javascript
// عند تسجيل الخروج
const logout = async () => {
  // 1. احذف الـ Token
  await AsyncStorage.removeItem('token');
  await AsyncStorage.removeItem('user');
  
  // 2. امسح الـ state
  setUser(null);
  setToken(null);
  
  // 3. إعادة تعيين أي cache
  queryClient.clear(); // إذا تستخدم React Query
};

// عند تسجيل الدخول
const login = async (email, password) => {
  // 1. امسح البيانات القديمة أولاً
  await AsyncStorage.clear();
  
  // 2. سجل الدخول واحصل على token جديد
  const response = await api.post('/auth/login', { email, password });
  
  // 3. احفظ البيانات الجديدة
  await AsyncStorage.setItem('token', response.data.token);
  await AsyncStorage.setItem('user', JSON.stringify(response.data.data));
};
```

### 2️⃣ مشكلة في الـ Token

#### ✅ تأكد أن الـ Token يتغير مع كل تسجيل دخول

في كود Frontend، تأكد أن الـ Token يتم تحديثه في الـ headers:

```javascript
// في axios interceptor
axios.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  console.log('📤 Request Token:', token); // للتأكد من الـ Token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### 3️⃣ مشكلة في الـ Cache (Backend)

#### ✅ قلل مدة الـ Cache للتجربة

إذا كانت المشكلة في Backend، قلل مدة الكاش:

```javascript
// في userService.js، السطر 66
// من:
userCache.set(cacheKey, userWithProfileUrl, 60 * 1000); // 60 ثانية

// إلى:
userCache.set(cacheKey, userWithProfileUrl, 5 * 1000); // 5 ثواني فقط للتجربة
```

### 4️⃣ مشكلة في الـ Emulator نفسه

#### ✅ أعد تشغيل الـ Emulator

أحياناً الـ Emulator يخزن بيانات في الذاكرة:

```bash
# Android
adb shell pm clear com.your.app.package

# iOS - من Xcode
Device > Erase All Content and Settings
```

## 🧪 كيف تتأكد من المشكلة؟

### 1. تحقق من الـ Backend Logs

عند تسجيل دخول مستخدم ثاني، شوف الـ logs:

```
🔍 Request for userId: 12345...  ← هذا ID المستخدم اللي طالب البيانات
✅ Response user ID: 12345...   ← هذا ID المستخدم اللي راح يرجع
✅ Response user name: أحمد      ← هذا اسم المستخدم اللي راح يرجع
```

**إذا الـ IDs مختلفة** → المشكلة في Backend
**إذا الـ IDs نفسها** → المشكلة في Frontend/Token

### 2. استخدم Postman للتجربة

1. سجل دخول للمستخدم الأول واحصل على Token
2. استخدم Token في Header:
   ```
   Authorization: Bearer <token>
   ```
3. اطلب `/api/v1/users/getMe`
4. كرر نفس الشي للمستخدم الثاني بـ Token مختلف

إذا Postman يعطيك البيانات الصحيحة، المشكلة في Frontend.

## 🎯 الحل الأكيد

### مسح كامل الكاش في الـ Emulator

```javascript
// في React Native
import AsyncStorage from '@react-native-async-storage/async-storage';

// أضف هذا الكود في شاشة تسجيل الدخول
const clearAllData = async () => {
  await AsyncStorage.clear();
  console.log('✅ All data cleared');
};

// استدعيه قبل تسجيل الدخول
await clearAllData();
```

## 📝 ملاحظات مهمة

1. **الكاش في Backend يعمل بشكل صحيح** - كل مستخدم له cache key مختلف
2. **المشكلة غالباً في Frontend** - التخزين المحلي لا يتم مسحه
3. **استخدم Postman للتأكد** - إذا Postman يشتغل صح، المشكلة مش في Backend

## 🆘 إذا المشكلة ما انحلت

1. شغل Backend في development mode
2. راقب الـ logs عند كل طلب
3. تأكد أن userId في الـ request مختلف للمستخدمين
4. تأكد أن Token مختلف لكل مستخدم
5. امسح الكاش بالكامل في Backend:
   ```javascript
   userCache.clear();
   ```
