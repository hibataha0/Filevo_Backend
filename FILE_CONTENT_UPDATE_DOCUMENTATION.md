# 📝 توثيق تحديث محتوى الملف (File Content Update)

## 🎯 الهدف
إضافة إمكانية تحديث محتوى الملف (استبدال الملف القديم بملف جديد) مع الحفاظ على نفس معرف الملف في قاعدة البيانات.

## 📊 الوضع الحالي

### ✅ ما هو موجود حالياً:
- `updateFile` في `fileService.js` - تحديث metadata فقط (name, description, tags, parentFolderId)
- `PUT /api/files/:id` - Route لتحديث metadata فقط
- `uploadSingleFile` - رفع ملف جديد
- `uploadSingleFileMiddleware` - Middleware لرفع ملف واحد

### ❌ ما هو مفقود:
- دالة لتحديث محتوى الملف الفعلي (استبدال الملف القديم بملف جديد)
- Route لتحديث محتوى الملف

## 🔧 التعديلات المطلوبة

### 1️⃣ إضافة دالة `updateFileContent` في `fileService.js`

**الموقع:** بعد دالة `updateFile` (بعد السطر 964)

**الوظيفة:**
- استقبال ملف جديد من `req.file`
- البحث عن الملف القديم في قاعدة البيانات
- حذف الملف القديم من النظام
- تحديث معلومات الملف في قاعدة البيانات (path, size, type, name)
- تحديث حجم المجلد إذا كان الملف داخل مجلد
- معالجة الملف الجديد في الخلفية (استخراج نص، توليد embedding)
- تسجيل النشاط (logActivity)

**المعاملات:**
- `req.params.id` - معرف الملف
- `req.user._id` - معرف المستخدم (من middleware protect)
- `req.file` - الملف الجديد (من multer middleware)

**الاستجابة:**
- 200: نجح التحديث
- 404: الملف غير موجود
- 400: لم يتم رفع ملف جديد
- 500: خطأ في التحديث

### 2️⃣ إضافة Route في `fileRoutes.js`

**الموقع:** قبل `router.put("/:id", protect, updateFile);` (قبل السطر 119)

**الكود:**
```javascript
// Update file content (replace old file with new file)
router.put("/:id/content", protect, uploadSingleFileMiddleware, updateFileContent);
```

**السبب:** يجب أن يكون قبل route `/:id` العام لتجنب التعارض

### 3️⃣ تصدير الدالة في `fileService.js`

**الموقع:** في قائمة exports في بداية الملف (في `fileRoutes.js`)

**الكود:**
```javascript
updateFileContent,
```

## 📋 تفاصيل التنفيذ

### خطوات العملية:

1. **التحقق من وجود الملف:**
   ```javascript
   const file = await File.findOne({ _id: fileId, userId: userId });
   ```

2. **التحقق من وجود ملف جديد:**
   ```javascript
   if (!req.file) {
     return res.status(400).json({ message: "No file uploaded" });
   }
   ```

3. **حذف الملف القديم:**
   ```javascript
   if (fs.existsSync(file.path)) {
     fs.unlinkSync(file.path);
   }
   ```

4. **تحديث معلومات الملف:**
   ```javascript
   file.path = req.file.path;
   file.size = req.file.size;
   file.type = req.file.mimetype;
   file.name = req.file.originalname || file.name;
   file.updatedAt = new Date();
   ```

5. **تحديث category إذا تغير نوع الملف:**
   ```javascript
   const newCategory = getCategoryByExtension(req.file.originalname, req.file.mimetype);
   file.category = newCategory;
   ```

6. **حفظ التغييرات:**
   ```javascript
   await file.save();
   ```

7. **تحديث حجم المجلد:**
   ```javascript
   if (file.parentFolderId) {
     await updateFolderSize(file.parentFolderId);
   }
   ```

8. **معالجة الملف الجديد في الخلفية:**
   ```javascript
   processFile(file._id)
     .then(() => console.log("✅ Background processing completed"))
     .catch((err) => console.error("❌ Background processing error:", err));
   ```

9. **تسجيل النشاط:**
   ```javascript
   await logActivity(
     userId,
     "file_content_updated",
     "file",
     file._id,
     file.name,
     {
       oldSize: oldSize,
       newSize: req.file.size,
       oldType: oldType,
       newType: req.file.mimetype,
     },
     {
       ipAddress: req.ip,
       userAgent: req.get("User-Agent"),
     }
   );
   ```

## ⚠️ ملاحظات مهمة

1. **ترتيب Routes:** يجب أن يكون route `/:id/content` قبل route `/:id` العام
2. **معالجة الأخطاء:** في حالة فشل التحديث، يجب حذف الملف الجديد إذا تم رفعه
3. **تحديث Folder Size:** يجب تحديث حجم المجلد بعد التحديث
4. **معالجة الخلفية:** يجب إعادة معالجة الملف الجديد (استخراج نص، توليد embedding)
5. **تسجيل النشاط:** يجب تسجيل جميع التغييرات في activity log

## 🧪 الاختبار

### Request:
```http
PUT /api/files/:id/content
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: <new_file>
```

### Response (Success):
```json
{
  "success": true,
  "message": "File content updated successfully",
  "file": {
    "_id": "...",
    "name": "new_file.txt",
    "size": 12345,
    "type": "text/plain",
    "path": "my_files/1234567890-new_file.txt",
    ...
  }
}
```

### Response (Error):
```json
{
  "success": false,
  "message": "File not found"
}
```

## 📝 ملخص التعديلات

1. ✅ إضافة `updateFileContent` في `fileService.js`
2. ✅ إضافة route `PUT /api/files/:id/content` في `fileRoutes.js`
3. ✅ تصدير `updateFileContent` في `fileRoutes.js`
4. ✅ التأكد من ترتيب routes بشكل صحيح
5. ✅ إضافة معالجة الأخطاء والتنظيف

## 🔗 الملفات المتأثرة

- `services/fileService.js` - إضافة دالة جديدة
- `api/fileRoutes.js` - إضافة route جديد





