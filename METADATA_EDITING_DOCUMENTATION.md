# Documentation: تعديل بيانات الملفات والمجلدات / Metadata Editing Documentation

## Overview / نظرة عامة
تم إضافة ميزة تعديل البيانات الوصفية للملفات والمجلدات بدون تغيير الاسم. This feature allows users to edit metadata of files and folders without changing their names.

## ما تم إضافته / What Was Added

### 1. النماذج (Models)

#### ملف النموذج (File Model) - `models/fileModel.js`
- ✅ إضافة حقل `description` - وصف الملف
- ✅ إضافة حقل `tags` - الوسوم (array)
- ✅ تفعيل `updatedAt` - تتبع تاريخ آخر تعديل
- ✅ تم تغيير timestamps من `{ createdAt: "uploadedAt", updatedAt: false }` إلى `{ timestamps: true }`

#### نموذج المجلد (Folder Model) - `models/folderModel.js`
- ✅ إضافة حقل `description` - وصف المجلد
- ✅ إضافة حقل `tags` - الوسوم (array)
- ✅ تتبع `updatedAt` - موجود بالفعل في النموذج

### 2. نقاط النهاية الجديدة (New Endpoints)

#### تحديث الملف
```http
PUT /api/files/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "new-filename.pdf",
  "description": "This is a description of the file",
  "tags": ["important", "work"],
  "parentFolderId": "FOLDER_ID_TO_MOVE_TO"
}
```

**المعاملات (Parameters):**
- `name` (string, optional): اسم الملف الجديد
- `description` (string, optional): وصف الملف
- `tags` (array, optional): مصفوفة الوسوم
- `parentFolderId` (string, optional): معرف المجلد الهدف للنقل (null للجذر)

**ملاحظة**: فئة الملف (`category`) يتم تحديدها تلقائياً بناءً على امتداد الملف، ولا يمكن تعديلها

#### تحديث المجلد
```http
PUT /api/folders/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Folder Name",
  "description": "This folder contains important documents",
  "tags": ["project", "urgent"],
  "parentId": "PARENT_FOLDER_ID_TO_MOVE_TO"
}
```

**المعاملات (Parameters):**
- `name` (string, optional): اسم المجلد الجديد
- `description` (string, optional): وصف المجلد
- `tags` (array, optional): مصفوفة الوسوم
- `parentId` (string, optional): معرف المجلد الأب للنقل (null للجذر)

### 3. معلومات التفاصيل (Details Information)

#### عرض تفاصيل الملف - `GET /api/files/:id`
تم تحديث الاستجابة لتضمين:
- ✅ `description` - الوصف
- ✅ `tags` - الوسوم
- ✅ `updatedAt` - تاريخ آخر تعديل
- ✅ `lastModified` - آخر تعديل (نفس `updatedAt`)
- ✅ `isStarred` - حالة التمييز
- ✅ `createdAt` - تاريخ الإنشاء

#### عرض تفاصيل المجلد - `GET /api/folders/:id`
تم تحديث الاستجابة لتضمين:
- ✅ `description` - الوصف
- ✅ `tags` - الوسوم
- ✅ `updatedAt` - تاريخ آخر تعديل
- ✅ `lastModified` - آخر تعديل (نفس `updatedAt`)
- ✅ `isStarred` - حالة التمييز

### 4. الأمثلة (Examples)

#### مثال 1: تحديث اسم الملف
```javascript
// JavaScript example
const response = await fetch('http://localhost:3000/api/files/FILE_ID', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    name: 'تقرير-المبيعات-2024.pdf',  // اسم جديد
    description: 'ملف مهم يحتوي على تقرير المبيعات',
    tags: ['مبيعات', 'تقرير', 'مهم'],
    parentFolderId: 'FOLDER_ID',  // لنقل الملف إلى مجلد آخر
    // ملاحظة: category لا يمكن تعديلها - يتم تحديدها تلقائياً من الامتداد
  })
});

const data = await response.json();
console.log(data.message); // ✅ File metadata updated successfully
```

#### مثال 2: تحديث اسم المجلد
```javascript
const response = await fetch('http://localhost:3000/api/folders/FOLDER_ID', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    name: 'مشروع-التطوير-2024',  // اسم جديد
    description: 'مجلد يحتوي على جميع ملفات المشروع',
    tags: ['مشروع', 'عمل'],
    parentId: 'PARENT_FOLDER_ID'  // لنقل المجلد إلى مجلد آخر
  })
});

const data = await response.json();
console.log(data.message); // ✅ Folder metadata updated successfully
```

#### مثال 3: عرض تفاصيل الملف
```javascript
const response = await fetch('http://localhost:3000/api/files/FILE_ID', {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
});

const data = await response.json();
console.log(data.file);
/*
{
  _id: "...",
  name: "document.pdf",
  description: "ملف مهم يحتوي على تقرير المبيعات",
  tags: ["مبيعات", "تقرير", "مهم"],
  size: 1024,
  sizeFormatted: "1.00 KB",
  updatedAt: "2024-01-15T10:30:00.000Z",
  lastModified: "2024-01-15T10:30:00.000Z",
  createdAt: "2024-01-10T08:00:00.000Z",
  // ... other fields
}
*/
```

## الاستخدام (Usage)

### 1. تعديل بيانات الملف
```http
PUT /api/files/:fileId
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "اسم-جديد.pdf",
  "description": "ملف جديد",
  "tags": ["tag1", "tag2"],
  "parentFolderId": "FOLDER_ID"  // لنقل الملف إلى مجلد آخر
}
```

### 2. تعديل بيانات المجلد
```http
PUT /api/folders/:folderId
Content-Type: application/json
Authorization: Bearer <token>

{
  "description": "مجلد جديد",
  "tags": ["tag1", "tag2"]
}
```

### 3. الحصول على التفاصيل
```http
GET /api/files/:fileId
Authorization: Bearer <token>
```

```http
GET /api/folders/:folderId
Authorization: Bearer <token>
```

## ملاحظات مهمة (Important Notes)

⚠️ **تحذير**: لا يمكن تعديل الحقول التالية:
- `type` - نوع الملف
- `size` - الحجم
- `path` - المسار
- `userId` - المستخدم
- `createdAt` - تاريخ الإنشاء
- `category` - فئة الملف (يتم تحديدها تلقائياً بناءً على الامتداد ولا يمكن تعديلها)

✅ **يمكن تعديل الحقول التالية**:
- `name` - اسم الملف/المجلد (سيتم توليد اسم فريد تلقائياً إذا كان الاسم موجوداً)
- `description` - الوصف
- `tags` - الوسوم
- `parentFolderId` - المجلد الأب للملف (لنقل الملف بين المجلدات)
- `parentId` - المجلد الأب للمجلد (لنقل المجلد بين المجلدات)

## الملفات المعدلة (Modified Files)

1. ✅ `models/fileModel.js` - تم إضافة description, tags، وتفعيل updatedAt
2. ✅ `models/folderModel.js` - تم إضافة description, tags
3. ✅ `api/fileRoutes.js` - تم إضافة PUT /:id route
4. ✅ `api/folderRoutes.js` - تم إضافة PUT /:id route
5. ✅ `services/fileService.js` - تم إضافة updateFile function
6. ✅ `services/folderService.js` - تم إضافة updateFolder function

## الحقول الجديدة في التفاصيل

### للملفات (Files):
```json
{
  "description": "string",
  "tags": ["string"],
  "updatedAt": "Date",
  "lastModified": "Date",
  "isStarred": "boolean",
  "createdAt": "Date"
}
```

### للمجلدات (Folders):
```json
{
  "description": "string",
  "tags": ["string"],
  "updatedAt": "Date",
  "lastModified": "Date",
  "isStarred": "boolean",
  "createdAt": "Date"
}
```

## الاختبار (Testing)

### Test Move File
```bash
curl -X PUT http://localhost:3000/api/files/FILE_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "parentFolderId": "TARGET_FOLDER_ID"
  }'
```

### Test Move Folder
```bash
curl -X PUT http://localhost:3000/api/folders/FOLDER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "parentId": "TARGET_PARENT_FOLDER_ID"
  }'
```

### Test Get Details
```bash
curl -X GET http://localhost:3000/api/files/FILE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```bash
curl -X GET http://localhost:3000/api/folders/FOLDER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

**تاريخ الإنشاء (Created Date)**: 2024  
**آخر تحديث (Last Updated)**: 2024
