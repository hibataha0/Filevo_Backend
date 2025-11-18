# دليل الفرز / Sorting Guide

## نظرة عامة / Overview
تم إضافة إمكانيات الفرز للملفات والمجلدات في النظام.

## نقاط النهاية المدعومة / Supported Endpoints

### 1. الملفات - `GET /api/files`

#### معاملات الفرز (Sorting Parameters)
- `sortBy`: نوع الفرز
  - `name` - حسب الاسم
  - `size` - حسب الحجم
  - `type` - حسب نوع الملف
  - `category` - حسب الفئة
  - `createdAt` - حسب تاريخ الإنشاء (افتراضي)
  - `updatedAt` - حسب تاريخ آخر تعديل

- `sortOrder`: اتجاه الفرز
  - `asc` - تصاعدي (أ إلى ي، صغير إلى كبير)
  - `desc` - تنازلي (ي إلى أ، كبير إلى صغير) (افتراضي)

#### معاملات أخرى
- `parentFolderId`: معرف المجلد الأب
- `page`: رقم الصفحة (افتراضي: 1)
- `limit`: عدد العناصر في الصفحة (افتراضي: 10)

### 2. المجلدات - `GET /api/folders`

#### معاملات الفرز (Sorting Parameters)
- `sortBy`: نوع الفرز
  - `name` - حسب الاسم
  - `size` - حسب الحجم
  - `createdAt` - حسب تاريخ الإنشاء (افتراضي)
  - `updatedAt` - حسب تاريخ آخر تعديل

- `sortOrder`: اتجاه الفرز
  - `asc` - تصاعدي
  - `desc` - تنازلي (افتراضي)

#### معاملات أخرى
- `parentId`: معرف المجلد الأب
- `page`: رقم الصفحة (افتراضي: 1)
- `limit`: عدد العناصر في الصفحة (افتراضي: 10)

### 3. جميع العناصر - `GET /api/folders/all-items`

#### معاملات الفرز (Sorting Parameters)
- `sortBy`: نوع الفرز
  - `name` - حسب الاسم
  - `size` - حسب الحجم
  - `type` - حسب النوع (ملف/مجلد)
  - `createdAt` - حسب تاريخ الإنشاء (افتراضي)
  - `updatedAt` - حسب تاريخ آخر تعديل

- `sortOrder`: اتجاه الفرز
  - `asc` - تصاعدي
  - `desc` - تنازلي (افتراضي)

#### معاملات أخرى
- `parentId`: معرف المجلد الأب
- `page`: رقم الصفحة (افتراضي: 1)
- `limit`: عدد العناصر في الصفحة (افتراضي: 20)

## أمثلة الاستخدام / Usage Examples

### 1. الفرز حسب الاسم (تصاعدي)
```http
GET /api/files?sortBy=name&sortOrder=asc
```

### 2. الفرز حسب الحجم (تنازلي)
```http
GET /api/files?sortBy=size&sortOrder=desc
```

### 3. الفرز حسب تاريخ الإنشاء (تنازلي)
```http
GET /api/files?sortBy=createdAt&sortOrder=desc
```

### 4. الفرز حسب تاريخ آخر تعديل (تصاعدي)
```http
GET /api/files?sortBy=updatedAt&sortOrder=asc
```

### 5. الفرز حسب نوع الملف
```http
GET /api/files?sortBy=type&sortOrder=asc
```

### 6. الفرز حسب الفئة
```http
GET /api/files?sortBy=category&sortOrder=asc
```

### 7. الفرز حسب النوع (ملفات ومجلدات)
```http
GET /api/folders/all-items?sortBy=type&sortOrder=asc
```

### 8. تركيبة معقدة (فرز + صفحة)
```http
GET /api/files?sortBy=size&sortOrder=desc&page=2&limit=20
```

## أمثلة Postman

### 1. جلب الملفات مرتبة حسب الاسم
```http
Method: GET
URL: http://localhost:3000/api/files?sortBy=name&sortOrder=asc
Headers:
  Authorization: Bearer YOUR_TOKEN
```

### 2. جلب الملفات مرتبة حسب الحجم
```http
Method: GET
URL: http://localhost:3000/api/files?sortBy=size&sortOrder=desc
Headers:
  Authorization: Bearer YOUR_TOKEN
```

### 3. جلب الملفات مرتبة حسب تاريخ آخر تعديل
```http
Method: GET
URL: http://localhost:3000/api/files?sortBy=updatedAt&sortOrder=desc
Headers:
  Authorization: Bearer YOUR_TOKEN
```

### 4. جلب الملفات مرتبة حسب الفئة
```http
Method: GET
URL: http://localhost:3000/api/files?sortBy=category&sortOrder=asc
Headers:
  Authorization: Bearer YOUR_TOKEN
```

### 5. جلب جميع العناصر مرتبة حسب النوع
```http
Method: GET
URL: http://localhost:3000/api/folders/all-items?sortBy=type&sortOrder=asc
Headers:
  Authorization: Bearer YOUR_TOKEN
```

### 6. جلب الملفات مع صفحة محددة
```http
Method: GET
URL: http://localhost:3000/api/files?sortBy=size&sortOrder=desc&page=2&limit=10
Headers:
  Authorization: Bearer YOUR_TOKEN
```

## استجابة API / API Response

### مثال الاستجابة
```json
{
  "message": "Files retrieved successfully",
  "files": [
    {
      "_id": "FILE_ID",
      "name": "document.pdf",
      "size": 1024000,
      "type": "application/pdf",
      "category": "Documents",
      "description": "ملف مهم",
      "tags": ["مهم", "عمل"],
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalFiles": 50,
    "hasNext": true,
    "hasPrev": false
  },
  "sorting": {
    "sortBy": "name",
    "sortOrder": "asc"
  }
}
```

## نصائح للاستخدام / Usage Tips

### 1. الأداء
- استخدم `limit` لتحديد عدد العناصر في الصفحة
- استخدم `page` للتنقل بين الصفحات
- تجنب استخدام `search` مع نصوص قصيرة جداً

### 2. التصفية
- يمكن دمج عدة فلاتر معاً
- `minSize` و `maxSize` يمكن استخدامهما معاً أو منفصلين
- `search` يبحث في الاسم، الوصف، والوسوم

### 3. الفرز
- `sortBy=type` متاح فقط في `/api/folders/all-items`
- `sortBy=category` متاح فقط للملفات
- الفرز الافتراضي هو `createdAt` تنازلي

### 4. أمثلة متقدمة

#### جلب الملفات الكبيرة من فئة معينة
```http
GET /api/files?category=Images&minSize=5242880&sortBy=size&sortOrder=desc&limit=10
```

#### البحث في المجلدات
```http
GET /api/folders?search=مشروع&sortBy=updatedAt&sortOrder=desc
```

#### جلب الملفات المحدثة مؤخراً
```http
GET /api/files?sortBy=updatedAt&sortOrder=desc&limit=20
```

#### تصفية الملفات حسب النوع
```http
GET /api/files?type=application/pdf&sortBy=name&sortOrder=asc
```

## قيم الحجم / Size Values

### أمثلة على الأحجام بالبايت
- 1 KB = 1,024 bytes
- 1 MB = 1,048,576 bytes
- 10 MB = 10,485,760 bytes
- 100 MB = 104,857,600 bytes
- 1 GB = 1,073,741,824 bytes

### أمثلة على التصفية حسب الحجم
```http
# ملفات أكبر من 1 MB
GET /api/files?minSize=1048576

# ملفات أصغر من 10 MB
GET /api/files?maxSize=10485760

# ملفات بين 1 MB و 10 MB
GET /api/files?minSize=1048576&maxSize=10485760
```

---

**تاريخ الإنشاء (Created Date)**: 2024  
**آخر تحديث (Last Updated)**: 2024
