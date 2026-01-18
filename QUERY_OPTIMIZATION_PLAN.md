# 🚀 خطة تحسين استعلامات قاعدة البيانات - Query Optimization Plan

## 📋 ملخص التحسينات

تم تحديد الاستعلامات التي تحتاج تحسين بتطبيق `.lean()` و `.select()` لتسريع الأداء وتقليل حجم البيانات.

---

## ✅ التحسينات المطلوبة

### 1. **`getAllFiles` في `fileService.js`** (السطر 652)

#### ❌ **قبل:**
```javascript
const files = await File.find(query).skip(skip).limit(limit).sort(sortObj);
```

#### ✅ **بعد:**
```javascript
const files = await File.find(query)
  .select("name type size category path isStarred description tags createdAt updatedAt _id parentFolderId")
  .skip(skip)
  .limit(limit)
  .sort(sortObj)
  .lean();
```

**الفوائد:**
- ✅ `.lean()` → يرجع plain JS object بدل Mongoose document → **أسرع 2-3x**
- ✅ `.select()` → جلب فقط الحقول المطلوبة → **تقليل حجم البيانات**
- ✅ **التحسين المتوقع**: 60-75% ⬇️

---

### 2. **`getFolderContents` في `folderService.js`** (السطر 860, 870)

#### ❌ **قبل:**
```javascript
let allSubfolders = await Folder.find({
  parentId: folderId,
  isDeleted: false,
}).sort({ createdAt: -1 });

const allFiles = await File.find({
  parentFolderId: folderId,
  isDeleted: false,
}).sort({ createdAt: -1 });
```

#### ✅ **بعد:**
```javascript
let allSubfolders = await Folder.find({
  parentId: folderId,
  isDeleted: false,
})
  .select("name size filesCount description tags isShared isStarred isProtected createdAt updatedAt _id parentId")
  .sort({ createdAt: -1 })
  .lean();

const allFiles = await File.find({
  parentFolderId: folderId,
  isDeleted: false,
})
  .select("name size type category isStarred createdAt updatedAt _id parentFolderId")
  .sort({ createdAt: -1 })
  .lean();
```

**ملاحظة:** يجب إزالة `.toObject()` من السطر 880, 881 لأن `.lean()` يرجع plain objects مباشرة.

#### ❌ **قبل:**
```javascript
const allContents = [
  ...allSubfolders.map((f) => ({ ...f.toObject(), type: "folder" })),
  ...allFiles.map((f) => ({ ...f.toObject(), type: "file" })),
];
```

#### ✅ **بعد:**
```javascript
const allContents = [
  ...allSubfolders.map((f) => ({ ...f, type: "folder" })),
  ...allFiles.map((f) => ({ ...f, type: "file" })),
];
```

**الفوائد:**
- ✅ **التحسين المتوقع**: 65-75% ⬇️ (من ~893ms إلى ~200-300ms)

---

### 3. **`getAllFolders` في `folderService.js`** (السطر 961)

#### ❌ **قبل:**
```javascript
const folders = await Folder.find(query)
  .skip(skip)
  .limit(limit)
  .sort({ createdAt: -1 });
```

#### ✅ **بعد:**
```javascript
const folders = await Folder.find(query)
  .select("name size filesCount description tags isShared isStarred isProtected createdAt updatedAt _id parentId")
  .skip(skip)
  .limit(limit)
  .sort({ createdAt: -1 })
  .lean();
```

**ملاحظة:** يجب إزالة `.toObject()` من السطر 973 لأن `.lean()` يرجع plain objects مباشرة.

#### ❌ **قبل:**
```javascript
const folderObj = folder.toObject ? folder.toObject() : { ...folder };
```

#### ✅ **بعد:**
```javascript
const folderObj = { ...folder }; // .lean() يرجع plain object مباشرة
```

---

### 4. **`getAllItems` في `folderService.js`** (السطر 1036, 1041)

#### ❌ **قبل:**
```javascript
const folders = await Folder.find(folderQuery)
  .skip(skip)
  .limit(limit)
  .sort({ createdAt: -1 });

const files = await File.find(fileQuery)
  .skip(skip)
  .limit(limit)
  .sort({ createdAt: -1 });
```

#### ✅ **بعد:**
```javascript
const folders = await Folder.find(folderQuery)
  .select("name size filesCount description tags isShared isStarred isProtected createdAt updatedAt _id parentId")
  .skip(skip)
  .limit(limit)
  .sort({ createdAt: -1 })
  .lean();

const files = await File.find(fileQuery)
  .select("name size type category isStarred createdAt updatedAt _id parentFolderId")
  .skip(skip)
  .limit(limit)
  .sort({ createdAt: -1 })
  .lean();
```

**ملاحظة:** يجب إزالة `.toObject()` من السطر 1052, 1067.

#### ❌ **قبل:**
```javascript
const folderObj = folder.toObject();
const allItems = [
  ...foldersWithDetails,
  ...files.map((file) => ({ ...file.toObject(), type: "file" })),
];
```

#### ✅ **بعد:**
```javascript
const folderObj = { ...folder }; // .lean() يرجع plain object
const allItems = [
  ...foldersWithDetails,
  ...files.map((file) => ({ ...file, type: "file" })),
];
```

---

### 5. **`calculateFolderSizeRecursive` في `fileService.js`** (السطر 806, 813)

#### ❌ **قبل:**
```javascript
const files = await File.find({
  parentFolderId: folderId,
  isDeleted: false,
});
let totalSize = files.reduce((sum, file) => sum + file.size, 0);

const subfolders = await Folder.find({
  parentId: folderId,
  isDeleted: false,
});
```

#### ✅ **بعد:**
```javascript
const files = await File.find({
  parentFolderId: folderId,
  isDeleted: false,
})
  .select("size _id")
  .lean();
let totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

const subfolders = await Folder.find({
  parentId: folderId,
  isDeleted: false,
})
  .select("_id")
  .lean();
```

**الفوائد:**
- ✅ جلب فقط الحقول المطلوبة (`size`, `_id`)
- ✅ **التحسين المتوقع**: 40-60% ⬇️ (خاصة في المجلدات الكبيرة)

---

### 6. **`calculateFolderFilesCountRecursive` في `folderService.js`** (السطر 152, 158)

#### ❌ **قبل:**
```javascript
const files = await File.find({
  parentFolderId: folderId,
  isDeleted: false,
});
let totalFiles = files.length;

const subfolders = await Folder.find({
  parentId: folderId,
  isDeleted: false,
});
```

#### ✅ **بعد:**
```javascript
const files = await File.find({
  parentFolderId: folderId,
  isDeleted: false,
})
  .select("_id")
  .lean();
let totalFiles = files.length;

const subfolders = await Folder.find({
  parentId: folderId,
  isDeleted: false,
})
  .select("_id")
  .lean();
```

**الفوائد:**
- ✅ جلب فقط `_id` (لن نحتاج باقي الحقول)
- ✅ **التحسين المتوقع**: 50-70% ⬇️

---

### 7. **`getFilesByCategory` في `fileService.js`** (السطر 574)

#### ❌ **قبل:**
```javascript
const files = await File.find(query);
```

#### ✅ **بعد:**
```javascript
const files = await File.find(query)
  .select("name type size category path isStarred description tags createdAt updatedAt _id parentFolderId")
  .lean();
```

---

### 8. **`getStarredFiles` في `fileService.js`** (السطر 1213)

#### ❌ **قبل:**
```javascript
const files = await File.find({
  userId: userId,
  isStarred: true,
  isDeleted: false,
})
  .sort({ uploadedAt: -1 })
  .skip(skip)
  .limit(limit)
  .populate("parentFolderId", "name");
```

#### ✅ **بعد:**
```javascript
// ملاحظة: مع populate لا نستخدم .lean() - سنستخدم .select() فقط
const files = await File.find({
  userId: userId,
  isStarred: true,
  isDeleted: false,
})
  .select("name type size category path isStarred description tags createdAt updatedAt _id parentFolderId")
  .sort({ createdAt: -1 }) // ✅ استخدام createdAt بدلاً من uploadedAt
  .skip(skip)
  .limit(limit)
  .populate("parentFolderId", "name");
```

**ملاحظة:** `uploadedAt` غير موجود في Schema - يجب استخدام `createdAt`.

---

### 9. **`getTrashFiles` في `fileService.js`** (السطر 1095)

#### ❌ **قبل:**
```javascript
const files = await File.find(fileQuery)
  .sort({ deletedAt: -1 })
  .skip(skip)
  .limit(limit)
  .populate("parentFolderId", "name");
```

#### ✅ **بعد:**
```javascript
// ملاحظة: مع populate لا نستخدم .lean() - سنستخدم .select() فقط
const files = await File.find(fileQuery)
  .select("name type size category path isStarred description tags deletedAt createdAt updatedAt _id parentFolderId")
  .sort({ deletedAt: -1 })
  .skip(skip)
  .limit(limit)
  .populate("parentFolderId", "name");
```

---

### 10. **`getFilesSharedWithMe` في `fileService.js`** (السطر 1802)

#### ❌ **قبل:**
```javascript
const files = await File.find({
  "sharedWith.user": userId,
  isDeleted: false,
})
  .populate("userId", "name email")
  .populate("parentFolderId", "name")
  .skip(skip)
  .limit(limit)
  .sort({ createdAt: -1 });
```

#### ✅ **بعد:**
```javascript
// ملاحظة: مع populate لا نستخدم .lean() - سنستخدم .select() فقط
const files = await File.find({
  "sharedWith.user": userId,
  isDeleted: false,
})
  .select("name type size category path isStarred description tags createdAt updatedAt _id parentFolderId userId sharedWith")
  .populate("userId", "name email")
  .populate("parentFolderId", "name")
  .skip(skip)
  .limit(limit)
  .sort({ createdAt: -1 });
```

**ملاحظة:** يجب إزالة `.toObject()` من السطر 1823.

#### ❌ **قبل:**
```javascript
const formattedFiles = files.map((file) => {
  const sharedEntry = file.sharedWith.find(...);
  return {
    ...file.toObject(),
    myPermission: sharedEntry ? sharedEntry.permission : null,
  };
});
```

#### ✅ **بعد:**
```javascript
// Mongoose documents مع populate - لا نحتاج .toObject()
const formattedFiles = files.map((file) => {
  const fileObj = file.toObject(); // نحتاج .toObject() هنا لأن populate يرجع Mongoose document
  const sharedEntry = file.sharedWith.find(...);
  return {
    ...fileObj,
    myPermission: sharedEntry ? sharedEntry.permission : null,
  };
});
```

---

### 11. **`searchByFileName` في `aiSearchService.js`** (السطر 308)

#### ❌ **قبل:**
```javascript
const files = await File.find({
  userId,
  isDeleted: false,
  name: textSearchRegex,
})
  .limit(limit)
  .lean();
```

#### ✅ **بعد:**
```javascript
const files = await File.find({
  userId,
  isDeleted: false,
  name: textSearchRegex,
})
  .select("name type size category path isStarred description tags createdAt updatedAt _id parentFolderId")
  .limit(limit)
  .lean();
```

---

### 12. **`searchByTags` في `aiSearchService.js`** (السطر 346, 355)

#### ❌ **قبل:**
```javascript
const files = await File.find({
  userId,
  isDeleted: false,
  tags: tagSearchRegex,
})
  .limit(limit)
  .lean();

const folders = await Folder.find({
  userId,
  isDeleted: false,
  tags: tagSearchRegex,
})
  .limit(limit)
  .lean();
```

#### ✅ **بعد:**
```javascript
const files = await File.find({
  userId,
  isDeleted: false,
  tags: tagSearchRegex,
})
  .select("name type size category path isStarred description tags createdAt updatedAt _id parentFolderId")
  .limit(limit)
  .lean();

const folders = await Folder.find({
  userId,
  isDeleted: false,
  tags: tagSearchRegex,
})
  .select("name size filesCount description tags isShared isStarred isProtected createdAt updatedAt _id parentId")
  .limit(limit)
  .lean();
```

---

### 13. **`searchInFileContent` في `aiSearchService.js`** (السطر 275)

#### ❌ **قبل:**
```javascript
const files = await File.find({
  userId,
  isDeleted: false,
  extractedText: textSearchRegex,
  isProcessed: true,
})
  .limit(limit)
  .lean();
```

#### ✅ **بعد:**
```javascript
const files = await File.find({
  userId,
  isDeleted: false,
  extractedText: textSearchRegex,
  isProcessed: true,
})
  .select("name type size category path isStarred description tags extractedText summary createdAt updatedAt _id parentFolderId")
  .limit(limit)
  .lean();
```

---

### 14. **`updateFolderSize` في `fileService.js`** (السطر 787)

#### ❌ **قبل:**
```javascript
const subfolders = await Folder.find({
  parentId: folderId,
  isDeleted: false,
});
```

#### ✅ **بعد:**
```javascript
const subfolders = await Folder.find({
  parentId: folderId,
  isDeleted: false,
})
  .select("_id")
  .lean();
```

---

### 15. **`getAllFilesInFolder` في `fileService.js`** (السطر 2299, 2305)

#### ❌ **قبل:**
```javascript
const files = await File.find({
  parentFolderId: folderIdParam,
  userId: userId,
  isDeleted: false,
});

const subfolders = await Folder.find({
  parentId: folderIdParam,
  userId: userId,
  isDeleted: false,
});
```

#### ✅ **بعد:**
```javascript
const files = await File.find({
  parentFolderId: folderIdParam,
  userId: userId,
  isDeleted: false,
})
  .select("name path size _id parentFolderId")
  .lean();

const subfolders = await Folder.find({
  parentId: folderIdParam,
  userId: userId,
  isDeleted: false,
})
  .select("name path _id parentId")
  .lean();
```

---

## 📊 النتائج المتوقعة

### ⚡ **تحسين الأداء:**

| الاستعلام | قبل | بعد | التحسين |
|-----------|-----|-----|---------|
| `getAllFiles` | ~200ms | ~50-80ms | **60-75%** ⬇️ |
| `getFolderContents` | ~893ms | ~200-300ms | **65-75%** ⬇️ |
| `getAllFolders` | ~785ms | ~200-250ms | **65-75%** ⬇️ |
| `getRecentFiles` | ~344ms | ~100-150ms | **55-70%** ⬇️ |
| `calculateFolderSizeRecursive` | متغير | 40-60% أسرع | **40-60%** ⬇️ |
| `searchByFileName` | ~50ms | ~20-30ms | **40-60%** ⬇️ |
| `searchByTags` | ~80ms | ~30-40ms | **50-60%** ⬇️ |

---

## 🔧 خطوات التطبيق

### المرحلة 1: الاستعلامات الأساسية (أولوية عالية)
1. ✅ `getAllFiles` - السطر 652
2. ✅ `getFolderContents` - السطر 860, 870
3. ✅ `getAllFolders` - السطر 961
4. ✅ `getAllItems` - السطر 1036, 1041

### المرحلة 2: Helper Functions (أولوية متوسطة)
5. ✅ `calculateFolderSizeRecursive` - السطر 806, 813
6. ✅ `calculateFolderFilesCountRecursive` - السطر 152, 158
7. ✅ `updateFolderSize` - السطر 787

### المرحلة 3: Search Functions (أولوية متوسطة)
8. ✅ `getFilesByCategory` - السطر 574
9. ✅ `searchByFileName` - السطر 308
10. ✅ `searchByTags` - السطر 346, 355
11. ✅ `searchInFileContent` - السطر 275

### المرحلة 4: استعلامات أخرى (أولوية منخفضة)
12. ✅ `getStarredFiles` - السطر 1213 (مع populate)
13. ✅ `getTrashFiles` - السطر 1095 (مع populate)
14. ✅ `getFilesSharedWithMe` - السطر 1802 (مع populate)
15. ✅ `getAllFilesInFolder` - السطر 2299, 2305

---

## 📝 ملاحظات مهمة

### ⚠️ **`.lean()` مع `.populate()`:**

**لا يمكن استخدام `.lean()` مع `.populate()`!**

- ❌ **خطأ**: `File.find().lean().populate("userId")` - لا يعمل
- ✅ **صحيح**: 
  - بدون populate: `File.find().select().lean()`
  - مع populate: `File.find().select().populate()` (بدون `.lean()`)

### ✅ **الحقول المهمة لكل نموذج:**

**File Model:**
- الحقول الأساسية: `name`, `type`, `size`, `category`, `path`, `isStarred`, `_id`, `parentFolderId`
- الحقول الاختيارية: `description`, `tags`, `createdAt`, `updatedAt`

**Folder Model:**
- الحقول الأساسية: `name`, `size`, `filesCount`, `_id`, `parentId`
- الحقول الاختيارية: `description`, `tags`, `isShared`, `isStarred`, `isProtected`, `createdAt`, `updatedAt`

---

## 🎯 الخلاصة

تم تحديد **15 استعلام** تحتاج تحسين. تطبيق هذه التحسينات سيوفر:

- ⚡ **سرعة أكبر**: 40-75% تحسين في الأداء
- 💰 **استخدام أقل للذاكرة**: تقليل حجم البيانات المجلوبة
- 📈 **Scalability أفضل**: أداء أفضل مع زيادة البيانات
- 🚀 **تجربة مستخدم أفضل**: استجابة أسرع للواجهة

---

**تاريخ الإنشاء:** ${new Date().toLocaleDateString('ar-SA')}  
**الإصدار:** 1.0.0
