# 🔒 دليل حماية المجلدات / Folder Protection Guide

## نظرة عامة / Overview

تم إضافة ميزة حماية المجلدات بكلمة سر أو بصمة. يمكنك الآن قفل أي مجلد لمنع الوصول غير المصرح به.

## أنواع الحماية / Protection Types

### 1. 🔑 حماية بكلمة سر (Password Protection)
- المستخدم يحدد كلمة سر للمجلد
- يتم تشفير كلمة السر باستخدام bcrypt
- يجب إدخال كلمة السر الصحيحة للوصول للمجلد

### 2. 👆 حماية بالبصمة (Biometric Protection)
- للاستخدام على الأجهزة المحمولة
- البصمة تُعالج في الفرونت إند (الجهاز)
- الباك إند يتحقق من token بعد نجاح البصمة
- **ملاحظة:** البصمة لا تُعالج في الباك إند

## 📡 API Endpoints

### 1. تعيين حماية للمجلد
```http
PUT /api/v1/folders/:id/protect
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "password": "mySecretPassword",  // مطلوب للـ password protection
  "protectionType": "password"      // أو "biometric"
}
```

**Response:**
```json
{
  "message": "✅ Folder protection enabled successfully",
  "folder": {
    "_id": "folder_id",
    "name": "My Folder",
    "isProtected": true,
    "protectionType": "password"
  }
}
```

### 2. التحقق من الوصول للمجلد
```http
POST /api/v1/folders/:id/verify-access
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "password": "mySecretPassword"  // للـ password protection
  // أو
  "biometricToken": "token_from_frontend"  // للـ biometric protection
}
```

**Response (Success):**
```json
{
  "message": "✅ Access granted",
  "hasAccess": true,
  "folder": {
    "_id": "folder_id",
    "name": "My Folder"
  }
}
```

**Response (Error):**
```json
{
  "status": "fail",
  "message": "Access denied. Invalid password or biometric verification failed"
}
```

### 3. إزالة حماية المجلد
```http
DELETE /api/v1/folders/:id/protect
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "password": "mySecretPassword"  // مطلوب للتحقق قبل الإزالة
}
```

**Response:**
```json
{
  "message": "✅ Folder protection removed successfully",
  "folder": {
    "_id": "folder_id",
    "name": "My Folder",
    "isProtected": false,
    "protectionType": "none"
  }
}
```

## 🔐 Routes المحمية تلقائياً

الـ routes التالية تتطلب التحقق من كلمة السر قبل الوصول:

- `GET /api/v1/folders/:id` - عرض تفاصيل المجلد
- `GET /api/v1/folders/:id/contents` - عرض محتويات المجلد
- `GET /api/v1/folders/:id/download` - تحميل المجلد
- `PUT /api/v1/folders/:id` - تحديث المجلد
- `PUT /api/v1/folders/:id/move` - نقل المجلد
- `DELETE /api/v1/folders/:id` - حذف المجلد

إذا كان المجلد محمياً، ستحصل على:
```json
{
  "status": "fail",
  "message": "Folder is protected. Please verify access first"
}
```

## 📋 معلومات الحماية في Response

عند جلب تفاصيل المجلد، ستحصل على معلومات الحماية:

```json
{
  "folder": {
    "_id": "folder_id",
    "name": "My Folder",
    "isProtected": true,
    "protectionType": "password",
    // ... باقي المعلومات
  }
}
```

**ملاحظة:** `passwordHash` لا يتم إرجاعه أبداً في الـ responses (marked as `select: false`).

## 🔧 التطبيق في الفرونت إند

### 1. تعيين حماية بكلمة سر
```javascript
// React/Flutter Example
const setPassword = async (folderId, password) => {
  const response = await fetch(`/api/v1/folders/${folderId}/protect`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      password: password,
      protectionType: 'password'
    })
  });
  
  return await response.json();
};
```

### 2. التحقق من كلمة السر قبل الوصول
```javascript
const verifyAccess = async (folderId, password) => {
  const response = await fetch(`/api/v1/folders/${folderId}/verify-access`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password })
  });
  
  if (response.ok) {
    // حفظ token في session/localStorage للوصول اللاحق
    const data = await response.json();
    // يمكنك حفظ token في session للوصول اللاحق
    sessionStorage.setItem(`folder_access_${folderId}`, 'granted');
    return data;
  }
  
  throw new Error('Access denied');
};
```

### 3. حماية بالبصمة (Flutter Example)
```dart
// في Flutter، استخدم local_auth package
import 'package:local_auth/local_auth.dart';

Future<bool> verifyBiometric() async {
  final localAuth = LocalAuth();
  try {
    bool didAuthenticate = await localAuth.authenticate(
      localizedReason: 'Please authenticate to access this folder',
      options: AuthenticationOptions(
        biometricOnly: true,
      ),
    );
    
    if (didAuthenticate) {
      // بعد نجاح البصمة، أرسل token للباك إند
      String token = generateBiometricToken(); // توليد token في الفرونت
      await verifyFolderAccess(folderId, biometricToken: token);
    }
    
    return didAuthenticate;
  } catch (e) {
    return false;
  }
}
```

## 🔒 الأمان / Security

1. **تشفير كلمة السر:**
   - كلمات السر مشفرة باستخدام bcrypt مع 10 rounds
   - `passwordHash` لا يتم إرجاعه في أي response

2. **التحقق قبل العمليات:**
   - جميع العمليات على المجلد المحمي تتطلب التحقق أولاً
   - لا يمكن الوصول للمجلد بدون كلمة السر الصحيحة

3. **البصمة:**
   - البصمة تُعالج محلياً في الجهاز
   - الباك إند يتحقق من token فقط
   - لا يتم إرسال بيانات البصمة للباك إند

## ⚠️ ملاحظات مهمة

1. **للمستخدمين المشتركين:**
   - المستخدمون المشتركون معهم المجلد يجب أن يعرفوا كلمة السر أيضاً
   - يمكن للمالك فقط تعيين/إزالة الحماية

2. **نسيان كلمة السر:**
   - حالياً لا يوجد طريقة لاستعادة كلمة السر
   - يجب على المستخدم تذكر كلمة السر أو إزالة الحماية (إذا كان المالك)

3. **الأداء:**
   - التحقق من كلمة السر سريع (bcrypt optimized)
   - لا يؤثر على أداء النظام

## 📝 أمثلة الاستخدام

### سيناريو 1: قفل مجلد بكلمة سر
```javascript
// 1. تعيين كلمة السر
await setPassword(folderId, "mySecret123");

// 2. محاولة الوصول للمجلد (سيفشل بدون التحقق)
const folder = await getFolderDetails(folderId);
// Error: "Folder is protected. Please verify access first"

// 3. التحقق من كلمة السر
await verifyAccess(folderId, "mySecret123");

// 4. الآن يمكن الوصول للمجلد
const folder = await getFolderDetails(folderId);
```

### سيناريو 2: إزالة الحماية
```javascript
// يجب التحقق من كلمة السر أولاً
await verifyAccess(folderId, "mySecret123");

// ثم إزالة الحماية
await removeProtection(folderId, "mySecret123");
```

## 🎯 الخطوات التالية (Future Enhancements)

- [ ] إضافة session-based access tokens للوصول المؤقت
- [ ] إضافة خيار "نسيت كلمة السر" مع email recovery
- [ ] إضافة إحصائيات عن محاولات الوصول الفاشلة
- [ ] إضافة خيار lockout بعد عدة محاولات فاشلة

---

**تم التطوير بواسطة:** Filevo Team
**التاريخ:** 2024










