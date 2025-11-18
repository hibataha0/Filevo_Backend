# 📁 نظام إدارة الملفات والمجلدات - دليل الاستخدام

## 🎯 نظرة عامة
تم فصل نظام الملفات عن نظام المجلدات ليكون كل واحد مستقل ومتخصص في وظيفته.

## 📂 نظام الملفات (Files)

### 1. رفع ملف واحد
**POST** `/api/v1/files/upload-single`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data
```

**Body:**
- `file`: الملف المطلوب رفعه
- `parentFolderId`: (اختياري) ID المجلد المراد رفع الملف بداخله

**مثال Postman:**
```
Method: POST
URL: http://localhost:8000/api/v1/files/upload-single
Headers: Authorization: Bearer YOUR_TOKEN
Body: form-data
  - file: [اختر ملف]
  - parentFolderId: 507f1f77bcf86cd799439011 (اختياري)
```

### 2. رفع ملفات متعددة
**POST** `/api/v1/files/upload-multiple`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data
```

**Body:**
- `files`: الملفات المطلوب رفعها (حتى 50 ملف)
- `parentFolderId`: (اختياري) ID المجلد المراد رفع الملفات بداخله

**مثال Postman:**
```
Method: POST
URL: http://localhost:8000/api/v1/files/upload-multiple
Headers: Authorization: Bearer YOUR_TOKEN
Body: form-data
  - files: [اختر ملف 1]
  - files: [اختر ملف 2]
  - files: [اختر ملف 3]
  - parentFolderId: 507f1f77bcf86cd799439011 (اختياري)
```

### 3. عرض جميع الملفات
**GET** `/api/v1/files`

**Query Parameters:**
- `parentFolderId`: (اختياري) عرض ملفات مجلد محدد
- `page`: رقم الصفحة (افتراضي: 1)
- `limit`: عدد الملفات في الصفحة (افتراضي: 10)

**مثال:**
```
GET /api/v1/files?parentFolderId=507f1f77bcf86cd799439011&page=1&limit=20
```

### 4. عرض الملفات حسب النوع
**GET** `/api/v1/files/category/:category`

**Categories المتاحة:**
- Images
- Videos
- Audio
- Documents
- Compressed
- Applications
- Code
- Others

**مثال:**
```
GET /api/v1/files/category/Images
```

## 📁 نظام المجلدات (Folders)

### 1. إنشاء مجلد فارغ
**POST** `/api/v1/folders/create`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "اسم المجلد",
  "parentId": "507f1f77bcf86cd799439011" // اختياري - ID المجلد الأب
}
```

**مثال Postman:**
```
Method: POST
URL: http://localhost:8000/api/v1/folders/create
Headers: 
  - Authorization: Bearer YOUR_TOKEN
  - Content-Type: application/json
Body: raw JSON
{
  "name": "مجلد جديد",
  "parentId": "507f1f77bcf86cd799439011"
}
```

### 2. رفع مجلد كامل
**POST** `/api/v1/folders/upload`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data
```

**Body:**
- `folderName`: اسم المجلد الجذر
- `parentFolderId`: (اختياري) ID المجلد المراد رفع المجلد بداخله
- ملفات مع مساراتها (fieldname = مسار الملف داخل المجلد)

**مثال Postman:**
```
Method: POST
URL: http://localhost:8000/api/v1/folders/upload
Headers: Authorization: Bearer YOUR_TOKEN
Body: form-data
  - folderName: "مشروع جديد"
  - parentFolderId: 507f1f77bcf86cd799439011 (اختياري)
  - index.html: [اختر ملف]
  - style.css: [اختر ملف]
  - images/logo.png: [اختر ملف]
  - images/banner.jpg: [اختر ملف]
  - js/script.js: [اختر ملف]
```

### 3. عرض جميع المجلدات
**GET** `/api/v1/folders`

**Query Parameters:**
- `parentId`: (اختياري) عرض مجلدات فرعية لمجلد محدد
- `page`: رقم الصفحة (افتراضي: 1)
- `limit`: عدد المجلدات في الصفحة (افتراضي: 10)

**مثال:**
```
GET /api/v1/folders?parentId=507f1f77bcf86cd799439011
```

### 4. عرض محتويات مجلد
**GET** `/api/v1/folders/:id/contents`

**مثال:**
```
GET /api/v1/folders/507f1f77bcf86cd799439011/contents
```

**الاستجابة:**
```json
{
  "message": "Folder contents retrieved successfully",
  "folder": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "مجلد المشروع",
    "size": 1024000
  },
  "subfolders": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "images",
      "size": 512000
    }
  ],
  "files": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "name": "index.html",
      "type": "text/html",
      "size": 1024
    }
  ],
  "totalItems": 2
}
```

### 5. حذف مجلد
**DELETE** `/api/v1/folders/:id`

**ملاحظة:** لا يمكن حذف مجلد يحتوي على ملفات أو مجلدات فرعية

## 🔄 سيناريوهات الاستخدام

### السيناريو 1: رفع ملفات متعددة في مجلد محدد
```
1. POST /api/v1/files/upload-multiple
   Body: files + parentFolderId
```

### السيناريو 2: إنشاء مجلد فارغ ثم إضافة ملفات إليه
```
1. POST /api/v1/folders/create
   Body: { "name": "مجلد جديد" }
   
2. POST /api/v1/files/upload-multiple
   Body: files + parentFolderId (من الخطوة 1)
```

### السيناريو 3: رفع مجلد كامل مع هيكله
```
1. POST /api/v1/folders/upload
   Body: folderName + ملفات مع مساراتها
```

### السيناريو 4: استعراض محتويات مجلد
```
1. GET /api/v1/folders/:id/contents
   للحصول على الملفات والمجلدات الفرعية
```

## 📊 أمثلة على الاستجابات

### رفع ملفات متعددة ناجح:
```json
{
  "message": "✅ 5 files uploaded successfully",
  "files": [...],
  "errors": [],
  "totalFiles": 5,
  "totalSize": 1024000
}
```

### رفع مجلد ناجح:
```json
{
  "message": "✅ Folder uploaded successfully",
  "folder": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "مشروع جديد",
    "size": 2048000
  },
  "filesCount": 10,
  "foldersCount": 3,
  "totalSize": 2048000
}
```

## ⚠️ ملاحظات مهمة

1. **المصادقة مطلوبة:** جميع الـ endpoints تحتاج JWT token
2. **حدود الحجم:** كل ملف لا يزيد عن 100MB
3. **حدود العدد:** رفع ملفات متعددة حتى 50 ملف، رفع مجلد حتى 1000 ملف
4. **الأمان:** كل مستخدم يرى ملفاته ومجلداته فقط
5. **التصنيف التلقائي:** الملفات تصنف تلقائياً حسب الامتداد

## 🚀 البدء السريع

1. **احصل على JWT token** من تسجيل الدخول
2. **اختبر رفع ملف واحد** باستخدام `/api/v1/files/upload-single`
3. **اختبر رفع ملفات متعددة** باستخدام `/api/v1/files/upload-multiple`
4. **اختبر إنشاء مجلد** باستخدام `/api/v1/folders/create`
5. **اختبر رفع مجلد كامل** باستخدام `/api/v1/folders/upload`

النظام الآن منظم ومفصل، كل جزء له وظيفته المحددة! 🎉











