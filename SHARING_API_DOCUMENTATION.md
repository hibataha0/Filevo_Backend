# مشاركة الملفات والمجلدات - API Documentation

## نظرة عامة
تم إضافة نظام مشاركة الملفات والمجلدات مع صلاحيات متعددة المستويات.

## الصلاحيات المتاحة
- **view**: المستخدم يمكنه فقط رؤية المحتوى
- **edit**: المستخدم يمكنه تعديل المحتوى
- **delete**: المستخدم يمكنه حذف المحتوى

---

## ملفات (Files)

### 1. مشاركة ملف مع مستخدمين
**POST** `/api/files/:id/share`

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "users": ["user_id_1", "user_id_2"],
  "permission": "view"  // أو "edit" أو "delete"
}
```

**Response (200):**
```json
{
  "message": "✅ File shared successfully",
  "file": {...},
  "newlyShared": 2,
  "alreadyShared": 0
}
```

---

### 2. تعديل صلاحيات المستخدمين
**PUT** `/api/files/:id/share`

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "userPermissions": [
    { "userId": "user_id_1", "permission": "edit" },
    { "userId": "user_id_2", "permission": "view" }
  ]
}
```

**Response (200):**
```json
{
  "message": "✅ Permissions updated for 2 user(s)",
  "file": {...}
}
```

---

### 3. إلغاء المشاركة
**DELETE** `/api/files/:id/share`

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "users": ["user_id_1", "user_id_2"]
}
```

**Response (200):**
```json
{
  "message": "✅ 2 user(s) removed from sharing",
  "file": {...}
}
```

---

### 4. الحصول على الملفات المشتركة معي
**GET** `/api/files/shared-with-me`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional): رقم الصفحة
- `limit` (optional): عدد العناصر في الصفحة

**Response (200):**
```json
{
  "message": "Files shared with me retrieved successfully",
  "files": [
    {
      "_id": "...",
      "name": "example.pdf",
      "myPermission": "edit",
      "owner": {...},
      ...
    }
  ],
  "pagination": {...}
}
```

---

## مجلدات (Folders)

### 1. مشاركة مجلد مع مستخدمين
**POST** `/api/folders/:id/share`

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "users": ["user_id_1", "user_id_2"],
  "permission": "view"
}
```

**Response (200):**
```json
{
  "message": "✅ Folder shared successfully",
  "folder": {...},
  "newlyShared": 2
}
```

---

### 2. تعديل صلاحيات مستخدمي المجلد
**PUT** `/api/folders/:id/share`

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "userPermissions": [
    { "userId": "user_id_1", "permission": "edit" },
    { "userId": "user_id_2", "permission": "delete" }
  ]
}
```

**Response (200):**
```json
{
  "message": "✅ Permissions updated for 2 user(s)",
  "folder": {...}
}
```

---

### 3. إلغاء المشاركة لمجلد
**DELETE** `/api/folders/:id/share`

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "users": ["user_id_1"]
}
```

**Response (200):**
```json
{
  "message": "✅ 1 user(s) removed from sharing",
  "folder": {...}
}
```

---

### 4. الحصول على المجلدات المشتركة معي
**GET** `/api/folders/shared-with-me`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional): رقم الصفحة
- `limit` (optional): عدد العناصر

**Response (200):**
```json
{
  "message": "Folders shared with me retrieved successfully",
  "folders": [
    {
      "_id": "...",
      "name": "My Shared Folder",
      "myPermission": "edit",
      "owner": {...}
    }
  ],
  "pagination": {...}
}
```

---

## أمثلة الاستخدام

### مثال: مشاركة ملف مع صلاحية view
```javascript
const response = await fetch('/api/files/file_id_123/share', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    users: ['user_id_1', 'user_id_2'],
    permission: 'view'
  })
});

const data = await response.json();
console.log(data.message); // "✅ File shared successfully"
```

### مثال: تعديل صلاحيات المستخدمين
```javascript
const response = await fetch('/api/files/file_id_123/share', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userPermissions: [
      { userId: 'user_id_1', permission: 'edit' },
      { userId: 'user_id_2', permission: 'delete' }
    ]
  })
});
```

### مثال: إلغاء المشاركة
```javascript
const response = await fetch('/api/files/file_id_123/share', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    users: ['user_id_1']
  })
});
```

---

## ملاحظات مهمة

1. **الصلاحيات الافتراضية**: كل مشاركة جديدة تحصل على صلاحية "view" افتراضياً
2. **عدم المشاركة مع النفس**: النظام يمنع المستخدم من مشاركة الملفات/المجلدات مع نفسه
3. **منع التكرار**: إذا حاولت مشاركة الملف مع مستخدم مشترك مسبقاً، سيتم تجاهله
4. **سجل النشاط**: جميع عمليات المشاركة يتم تسجيلها في activity log
5. **المالك فقط**: فقط مالك الملف/المجلد يمكنه تعديل أو إلغاء المشاركة

---

## حالات الخطأ

### 400 Bad Request
- عدم وجود مصفوفة المستخدمين
- صلاحية غير صحيحة
- محاولة المشاركة مع النفس

### 404 Not Found
- الملف/المجلد غير موجود
- المستخدمين المحددين غير موجودين

### 403 Forbidden
- محاولة الوصول لملف/مجلد بدون صلاحية
