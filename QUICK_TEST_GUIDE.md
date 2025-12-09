# دليل اختبار سريع - نظام المشاركة

## خطوات سريعة للاختبار في Postman

### 1️⃣ احصل على Token
```json
POST http://localhost:8000/api/auth/login
Body: { "email": "test@test.com", "password": "123456" }
→ احفظ الـ token من الـ response
```

### 2️⃣ احصل على User ID
```json
GET http://localhost:8000/api/users/me
Headers: Authorization: Bearer TOKEN
→ احفظ الـ _id
```

### 3️⃣ احصل على File ID
```json
GET http://localhost:8000/api/files
Headers: Authorization: Bearer TOKEN
→ اختر أي ملف واحفظ الـ _id
```

### 4️⃣ شارك الملف 📤
```json
POST http://localhost:8000/api/files/FILE_ID/share
Headers: 
  Authorization: Bearer TOKEN
  Content-Type: application/json
Body: {
  "users": ["USER_ID_2"],
  "permission": "view"
}
```

### 5️⃣ شاهد الملفات المشتركة معك 👀
```json
GET http://localhost:8000/api/files/shared-with-me
Headers: Authorization: Bearer TOKEN_2
```

### 6️⃣ عدّل الصلاحيات ✏️
```json
PUT http://localhost:8000/api/files/FILE_ID/share
Headers: 
  Authorization: Bearer TOKEN_1
  Content-Type: application/json
Body: {
  "userPermissions": [
    { "userId": "USER_ID_2", "permission": "edit" }
  ]
}
```

### 7️⃣ ألغِ المشاركة ❌
```json
DELETE http://localhost:8000/api/files/FILE_ID/share
Headers: 
  Authorization: Bearer TOKEN_1
  Content-Type: application/json
Body: {
  "users": ["USER_ID_2"]
}
```

---

## الصلاحيات المتاحة:
- `"view"` - مشاهدة فقط
- `"edit"` - تعديل
- `"delete"` - حذف

---

## ملاحظة:
نفس الخطوات للمجلدات (Folders):
- استبدل `/api/files` ب `/api/folders`
- استبدل `FILE_ID` ب `FOLDER_ID`





















