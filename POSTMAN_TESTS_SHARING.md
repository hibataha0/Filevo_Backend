# دليل اختبار نظام المشاركة في Postman

## 🔐 الحصول على Token

### 1. تسجيل الدخول
```
Method: POST
URL: http://localhost:8000/api/auth/login
Headers:
  Content-Type: application/json
Body (raw JSON):
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```
**احفظ الـ token من Response**

---

## 📄 ملفات (Files)

### 1️⃣ مشاركة ملف
```
Method: POST
URL: http://localhost:8000/api/files/FILE_ID_HERE/share
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
Body (raw JSON):
{
  "users": ["USER_ID_1", "USER_ID_2"],
  "permission": "view"
}
```

**مثال:**
```json
{
  "users": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
  "permission": "edit"
}
```

**Response المتوقع:**
```json
{
  "message": "✅ File shared successfully",
  "file": {
    "sharedWith": [...]
  },
  "newlyShared": 2,
  "alreadyShared": 0
}
```

---

### 2️⃣ تعديل صلاحيات
```
Method: PUT
URL: http://localhost:8000/api/files/FILE_ID_HERE/share
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
Body (raw JSON):
{
  "userPermissions": [
    { "userId": "507f1f77bcf86cd799439011", "permission": "edit" },
    { "userId": "507f1f77bcf86cd799439012", "permission": "delete" }
  ]
}
```

---

### 3️⃣ إلغاء المشاركة
**ملاحظة مهمة:** هذه الدالة تقوم بإزالة مستخدم (أو عدة مستخدمين) من قائمة المشاركين، وليس إلغاء المشاركة بالكامل.

```
Method: DELETE
URL: http://localhost:8000/api/files/FILE_ID_HERE/share
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
Body (raw JSON):
{
  "users": ["507f1f77bcf86cd799439011"]
}
```

**السلوك:**
- إذا كان الملف مشترك مع [User1, User2, User3]
- وتقوم بحذف User2 فقط
- سيبقى [User1, User3] مشاركين
- User2 لن يرى الملف بعد الآن

**لإلغاء المشاركة مع جميع المستخدمين:**
- أرسل جميع الـ user IDs في المصفوفة `users`

---

### 4️⃣ عرض الملفات المشتركة معي
```
Method: GET
URL: http://localhost:8000/api/files/shared-with-me?page=1&limit=10
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
```

**Query Parameters:**
- `page` (اختياري): 1, 2, 3...
- `limit` (اختياري): عدد الملفات في الصفحة

---

## 📁 مجلدات (Folders)

### 1️⃣ مشاركة مجلد
```
Method: POST
URL: http://localhost:8000/api/folders/FOLDER_ID_HERE/share
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
Body (raw JSON):
{
  "users": ["507f1f77bcf86cd799439011"],
  "permission": "view"
}
```

---

### 2️⃣ تعديل صلاحيات المجلد
```
Method: PUT
URL: http://localhost:8000/api/folders/FOLDER_ID_HERE/share
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
Body (raw JSON):
{
  "userPermissions": [
    { "userId": "507f1f77bcf86cd799439011", "permission": "edit" }
  ]
}
```

---

### 3️⃣ إلغاء مشاركة مجلد
**ملاحظة مهمة:** نفس السلوك - تقوم بإزالة مستخدم (أو عدة مستخدمين) من قائمة المشاركين.

```
Method: DELETE
URL: http://localhost:8000/api/folders/FOLDER_ID_HERE/share
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
Body (raw JSON):
{
  "users": ["507f1f77bcf86cd799439011"]
}
```

---

### 4️⃣ عرض المجلدات المشتركة
```
Method: GET
URL: http://localhost:8000/api/folders/shared-with-me?page=1&limit=10
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
```

---

## 📝 خطوات الاختبار الكاملة

### السيناريو الكامل:

1. **سجل دخول كـ User 1** واحصل على Token 1
2. **سجل دخول كـ User 2** واحصل على Token 2
3. احصل على User ID للـ User 2
4. باستخدام Token 1، شارك ملف مع User 2 بصلاحية "view"
5. باستخدام Token 2، شاهد الملفات المشتركة
6. باستخدام Token 1، غيّر الصلاحية إلى "edit"
7. باستخدام Token 1، ألغِ المشاركة

---

## 🔍 الحصول على IDs

### User ID:
```
Method: GET
URL: http://localhost:8000/api/users/me
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
```
**سيظهر الـ _id في الـ response**

### File ID:
```
Method: GET
URL: http://localhost:8000/api/files
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
```
**اختر أي file من القائمة واحفظ الـ _id**

### Folder ID:
```
Method: GET
URL: http://localhost:8000/api/folders
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
```
**اختر أي folder من القائمة واحفظ الـ _id**

---

## ⚠️ ملاحظات مهمة

1. استبدل `YOUR_TOKEN_HERE` بالـ token الفعلي
2. استبدل `FILE_ID_HERE` و `FOLDER_ID_HERE` بالـ IDs الصحيحة
3. استبدل `USER_ID_1` و `USER_ID_2` بIDs المستخدمين
4. تأكد أن الخادم يعمل على `http://localhost:8000`
5. صلاحيات المدعومة: `"view"`, `"edit"`, `"delete"`

---

## ❌ حالات الخطأ الشائعة

### 401 Unauthorized
- تحقق من الـ token
- تأكد من إرسال Header صحيح

### 404 Not Found
- تحقق من الـ ID
- تأكد أن الملف/المجلد موجود

### 400 Bad Request
- تحقق من البنية JSON
- تأكد من الصلاحيات: view/edit/delete

### 403 Forbidden
- تأكد أنك مالك الملف/المجلد
- للعمليات على المشاركة

