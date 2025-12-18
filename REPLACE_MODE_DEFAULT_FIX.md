# 🔧 إصلاح: جعل replace mode افتراضياً للصور

## 🎯 المشكلة
عند تحديث صورة بدون تحديد `replaceMode` صراحة، كان يتم إنشاء نسخة جديدة بدلاً من استبدال الملف الموجود.

## ✅ الحل
تم تعديل الكود لجعل `replaceMode` افتراضياً `true` للصور، ما لم يحدد المستخدم `false` صراحة.

## 🔧 التعديل المنفذ

### قبل التعديل:
```javascript
const replaceMode =
  isTextFile || isShared
    ? true
    : req.body.replaceMode === "true" || req.body.replaceMode === true;
```

**المشكلة:**
- إذا لم يتم إرسال `replaceMode`، كان يتم إنشاء نسخة جديدة
- الصور كانت تحتاج إلى تحديد `replaceMode = true` صراحة

### بعد التعديل:
```javascript
// ✅ قراءة replaceMode من body (قد يكون string "true"/"false" أو boolean)
const requestedReplaceMode = req.body.replaceMode;
let replaceModeValue = null;

if (requestedReplaceMode !== undefined && requestedReplaceMode !== null) {
  if (requestedReplaceMode === "true" || requestedReplaceMode === true) {
    replaceModeValue = true;
  } else if (requestedReplaceMode === "false" || requestedReplaceMode === false) {
    replaceModeValue = false;
  }
}

// ✅ تحديد replaceMode:
// 1. الملفات النصية: دائماً replace
// 2. الملفات المشتركة: دائماً replace
// 3. الصور: افتراضياً replace (ما لم يحدد المستخدم false صراحة)
// 4. الملفات الأخرى: حسب replaceMode في body
let replaceMode;
if (isTextFile || isShared) {
  replaceMode = true;
} else if (isImage) {
  // للصور: replace افتراضياً ما لم يحدد false صراحة
  replaceMode = replaceModeValue !== false;
} else {
  // للملفات الأخرى: فقط إذا حدد true صراحة
  replaceMode = replaceModeValue === true;
}
```

## 🔄 سير العمل الجديد

### 1. الملفات النصية
- ✅ دائماً replace (تلقائياً)

### 2. الملفات المشتركة
- ✅ دائماً replace (تلقائياً)

### 3. الصور (غير مشتركة)
- ✅ **افتراضياً replace** (ما لم يحدد المستخدم `replaceMode = false`)
- إذا لم يتم إرسال `replaceMode`: replace
- إذا تم إرسال `replaceMode = true`: replace
- إذا تم إرسال `replaceMode = false`: نسخة جديدة

### 4. الملفات الأخرى
- ✅ حسب `replaceMode` في body
- إذا لم يتم إرسال `replaceMode`: نسخة جديدة
- إذا تم إرسال `replaceMode = true`: replace
- إذا تم إرسال `replaceMode = false`: نسخة جديدة

## 📋 أمثلة الاستخدام

### مثال 1: تحديث صورة (بدون replaceMode)
```http
PUT /api/files/:id/content
Content-Type: multipart/form-data

file: <new_image.jpg>
```

**النتيجة:**
- ✅ replace mode تلقائياً (افتراضي للصور)
- ✅ تحديث الملف الموجود بنفس الاسم والمسار

### مثال 2: تحديث صورة (مع replaceMode = true)
```http
PUT /api/files/:id/content
Content-Type: multipart/form-data

file: <new_image.jpg>
replaceMode: true
```

**النتيجة:**
- ✅ replace mode
- ✅ تحديث الملف الموجود بنفس الاسم والمسار

### مثال 3: تحديث صورة (مع replaceMode = false)
```http
PUT /api/files/:id/content
Content-Type: multipart/form-data

file: <new_image.jpg>
replaceMode: false
```

**النتيجة:**
- ✅ نسخة جديدة
- ✅ ملف جديد بمسار جديد

## ⚙️ المنطق

```javascript
// تحديد نوع الملف
const isTextFile = ...;
const isShared = ...;
const isImage = file.category === "Images" || file.type.startsWith("image/");

// قراءة replaceMode من body
const requestedReplaceMode = req.body.replaceMode;
let replaceModeValue = null;

// تحويل string إلى boolean
if (requestedReplaceMode === "true" || requestedReplaceMode === true) {
  replaceModeValue = true;
} else if (requestedReplaceMode === "false" || requestedReplaceMode === false) {
  replaceModeValue = false;
}

// تحديد replaceMode النهائي
if (isTextFile || isShared) {
  replaceMode = true; // دائماً replace
} else if (isImage) {
  replaceMode = replaceModeValue !== false; // افتراضياً replace
} else {
  replaceMode = replaceModeValue === true; // فقط إذا حدد true
}
```

## ✅ الميزات

- ✅ replace mode افتراضياً للصور
- ✅ قراءة صحيحة لـ `replaceMode` من multipart/form-data
- ✅ دعم string ("true"/"false") و boolean
- ✅ logging مفصل للتتبع
- ✅ استخدام `findByIdAndUpdate` لضمان التحديث

## 📋 الحالات المختلفة

| نوع الملف | replaceMode | النتيجة |
|-----------|-------------|---------|
| نصي | - | ✅ replace |
| مشترك | - | ✅ replace |
| صورة | غير موجود | ✅ replace (افتراضي) |
| صورة | true | ✅ replace |
| صورة | false | ✅ نسخة جديدة |
| آخر | غير موجود | ✅ نسخة جديدة |
| آخر | true | ✅ replace |
| آخر | false | ✅ نسخة جديدة |

## 🔍 Logging

تم إضافة logging مفصل:
```javascript
console.log("🔍 Replace mode decision:", {
  isTextFile,
  isShared,
  isImage,
  requestedReplaceMode,
  replaceModeValue,
  finalReplaceMode: replaceMode,
});
```

## ✅ التحقق من التعديلات

- ✅ جعل replace mode افتراضياً للصور
- ✅ قراءة صحيحة لـ `replaceMode` من body
- ✅ استخدام `findByIdAndUpdate` لضمان التحديث
- ✅ logging مفصل
- ✅ لا توجد أخطاء جديدة في linter

## 📄 الملفات المعدلة

1. ✅ `services/fileService.js` - تعديل دالة `updateFileContent`

## 🎉 النتيجة

الآن:
- ✅ الصور يتم استبدالها افتراضياً (بدون الحاجة لتحديد replaceMode)
- ✅ الملفات النصية يتم استبدالها تلقائياً
- ✅ الملفات المشتركة يتم استبدالها تلقائياً
- ✅ لا يتم إنشاء ملفات جديدة في قاعدة البيانات عند اختيار replace




