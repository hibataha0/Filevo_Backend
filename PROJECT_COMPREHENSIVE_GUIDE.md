# 📚 دليل شامل لمشروع Filevo Backend

## 🎯 نظرة عامة على المشروع

**Filevo Backend** هو نظام إدارة ملفات ومجلدات متكامل مبني على **Node.js** و **Express.js** و **MongoDB**. يوفر النظام إدارة كاملة للملفات مع ميزات متقدمة مثل:
- رفع وإدارة الملفات والمجلدات
- نظام مشاركة متقدم (Rooms/Workspaces)
- بحث ذكي باستخدام الذكاء الاصطناعي
- تتبع النشاطات (Activity Logging)
- إدارة المستخدمين والمصادقة
- حماية الملفات والمجلدات

---

## 🛠️ التقنيات المستخدمة (Technology Stack)

### Backend Framework
- **Express.js 5.1.0** - إطار عمل Node.js
- **Node.js** - بيئة تشغيل JavaScript

### قاعدة البيانات
- **MongoDB** - قاعدة بيانات NoSQL
- **Mongoose 8.19.1** - ODM لـ MongoDB

### الأمان
- **JWT (jsonwebtoken)** - للمصادقة
- **bcryptjs** - لتشفير كلمات المرور
- **helmet** - حماية HTTP headers
- **express-rate-limit** - حماية من الهجمات
- **express-mongo-sanitize** - حماية من NoSQL Injection
- **xss-clean** - حماية من XSS attacks

### معالجة الملفات
- **multer** - رفع الملفات
- **sharp** - معالجة الصور
- **archiver** - ضغط الملفات
- **pdf-parse** - استخراج النص من PDF
- **mammoth** - استخراج النص من DOCX
- **xlsx** - معالجة ملفات Excel

### الذكاء الاصطناعي
- **openai** - OpenAI API للبحث الذكي
- **axios** - للاتصال بـ APIs خارجية

### التواصل
- **Socket.IO** - للتواصل الفوري (Real-time)
- **nodemailer** - إرسال الإيميلات

### أخرى
- **dotenv** - إدارة متغيرات البيئة
- **morgan** - تسجيل الطلبات (Logging)
- **express-validator** - التحقق من البيانات
- **passport** - المصادقة (Google OAuth)
- **uuid** - توليد معرفات فريدة
- **slugify** - تحويل النصوص إلى slugs

---

## 📁 هيكل المشروع (Project Structure)

```
Filevo_Backend/
├── api/                    # Routes (نقاط النهاية)
│   ├── authRoutes.js       # مصادقة (تسجيل، دخول، إعادة تعيين)
│   ├── userRoute.js        # إدارة المستخدمين
│   ├── fileRoutes.js       # إدارة الملفات
│   ├── folderRoutes.js     # إدارة المجلدات
│   ├── roomRoutes.js       # إدارة الرومات (Workspaces)
│   ├── searchRoutes.js     # البحث الذكي
│   └── activityLogRoutes.js # سجل النشاطات
│
├── config/                 # الإعدادات
│   └── database.js         # اتصال MongoDB
│
├── middlewares/            # Middlewares
│   ├── verifyToken.js      # التحقق من JWT
│   ├── validatorMiddleware.js # التحقق من البيانات
│   ├── uploadFilesMiddleware.js # رفع الملفات
│   ├── uploadFolderMiddleware.js # رفع المجلدات
│   ├── uploadImageMiddleware.js # رفع الصور
│   ├── userImageMiddleware.js # صور المستخدم
│   ├── errMiddlewarel.js   # معالجة الأخطاء
│   ├── mongoSanitize.js    # حماية NoSQL Injection
│   └── performanceMiddleware.js # مراقبة الأداء
│
├── models/                 # نماذج قاعدة البيانات
│   ├── userModel.js        # نموذج المستخدم
│   ├── fileModel.js        # نموذج الملف
│   ├── folderModel.js      # نموذج المجلد
│   ├── roomModel.js        # نموذج الروم
│   ├── roomInvitationModel.js # نموذج دعوات الروم
│   ├── activityLogModel.js # نموذج سجل النشاطات
│   └── commentModel.js     # نموذج التعليقات
│
├── services/               # منطق العمل (Business Logic)
│   ├── authService.js      # خدمات المصادقة
│   ├── userService.js      # خدمات المستخدم
│   ├── fileService.js      # خدمات الملفات
│   ├── folderService.js    # خدمات المجلدات
│   ├── roomService.js      # خدمات الرومات
│   ├── aiSearchService.js  # خدمات البحث الذكي
│   ├── aiService.js        # خدمات AI عامة
│   ├── fileProcessingService.js # معالجة الملفات
│   ├── textExtractionService.js # استخراج النص
│   ├── mediaExtractionService.js # استخراج بيانات الوسائط
│   └── activityLogService.js # خدمات سجل النشاطات
│
├── utils/                  # أدوات مساعدة
│   ├── apiError.js         # معالجة الأخطاء
│   ├── createToken.js      # إنشاء JWT tokens
│   ├── sendEmail.js        # إرسال الإيميلات
│   ├── cache.js            # نظام التخزين المؤقت
│   ├── fileUtils.js        # أدوات الملفات
│   ├── profileImageHelper.js # معالجة صور الملف الشخصي
│   ├── ollamaManager.js    # إدارة Ollama
│   └── queryExplainer.js   # شرح الاستعلامات
│
├── uploads/                # الملفات المرفوعة
│   └── users/              # صور المستخدمين
│
├── my_files/               # الملفات المخزنة
│
├── server.js               # نقطة البداية الرئيسية
├── socket.js               # إعداد Socket.IO
├── config.env              # متغيرات البيئة
└── package.json            # معلومات المشروع
```

---

## 🗄️ نماذج قاعدة البيانات (Database Models)

### 1. User Model (المستخدم)

```javascript
{
  name: String,              // الاسم
  email: String,             // البريد الإلكتروني (فريد)
  password: String,           // كلمة المرور (مشفرة)
  profileImg: String,         // صورة الملف الشخصي
  storageLimit: Number,      // الحد الأقصى للمساحة (افتراضي: 10 GB)
  usedStorage: Number,       // المساحة المستخدمة
  passwordResetCode: String, // كود إعادة تعيين كلمة المرور
  passwordResetExpires: Date, // انتهاء صلاحية الكود
  emailChangeCode: String,    // كود تغيير الإيميل
  pendingEmail: String,      // الإيميل الجديد المؤقت
  // ... timestamps
}
```

**الفهارس (Indexes):**
- `email` (unique)
- `passwordResetCode`, `passwordResetExpires`
- `emailChangeCode`, `emailChangeExpires`
- `usedStorage`

---

### 2. File Model (الملف)

```javascript
{
  name: String,              // اسم الملف
  type: String,              // نوع الملف (MIME type)
  size: Number,              // الحجم بالبايت
  path: String,              // مسار الملف (فريد)
  userId: ObjectId,          // مالك الملف
  parentFolderId: ObjectId,  // المجلد الأب (null للجذر)
  category: String,          // التصنيف (Images, Videos, Audio, Documents, etc.)
  
  // المشاركة
  isShared: Boolean,          // هل الملف مشترك؟
  sharedWith: [{
    user: ObjectId,           // المستخدم المشترك معه
    permission: String,       // الصلاحية (view, edit, delete)
    sharedAt: Date
  }],
  
  // الحذف
  isDeleted: Boolean,        // هل محذوف؟
  deletedAt: Date,           // تاريخ الحذف
  deleteExpiryDate: Date,    // تاريخ انتهاء الحذف (30 يوم)
  
  // التنظيم
  isStarred: Boolean,        // مميز؟
  description: String,       // الوصف
  tags: [String],            // العلامات
  
  // البحث الذكي
  extractedText: String,     // النص المستخرج
  embedding: [Number],      // Vector embedding للبحث
  summary: String,           // ملخص الملف
  isProcessed: Boolean,     // هل تمت معالجته؟
  processedAt: Date,         // تاريخ المعالجة
  
  // بيانات الصور
  imageDescription: String,  // وصف الصورة
  imageObjects: [String],    // Objects في الصورة
  imageScene: String,        // Scene (beach, mountain, etc.)
  imageColors: [String],     // الألوان
  
  // بيانات الصوت
  audioTranscript: String,   // Transcript من Whisper
  
  // بيانات الفيديو
  videoTranscript: String,   // Transcript من الفيديو
  videoScenes: [String],     // وصف المشاهد
}
```

**الفهارس (Indexes):**
- `userId, isDeleted, parentFolderId, createdAt`
- `userId, isDeleted, category, createdAt`
- `userId, isDeleted, isStarred, createdAt`
- `userId, isDeleted, "sharedWith.user", createdAt`
- `path` (unique, sparse)
- Text index على: `name, description, tags, extractedText`
- `isProcessed, createdAt` (للمعالجة)

---

### 3. Folder Model (المجلد)

```javascript
{
  name: String,              // اسم المجلد
  userId: ObjectId,          // مالك المجلد
  parentId: ObjectId,        // المجلد الأب (null للجذر)
  path: String,              // مسار المجلد
  
  // الحجم والعدد
  totalSize: Number,         // الحجم الكلي (recursive)
  totalFiles: Number,         // عدد الملفات الكلي
  size: Number,               // الحجم المباشر (بدون recursive)
  filesCount: Number,         // عدد الملفات المباشرة
  
  // المشاركة
  isShared: Boolean,
  sharedWith: [{
    user: ObjectId,
    permission: String,
    sharedAt: Date
  }],
  
  // الحذف
  isDeleted: Boolean,
  deletedAt: Date,
  deleteExpiryDate: Date,
  
  // التنظيم
  isStarred: Boolean,
  description: String,
  tags: [String],
  
  // الحماية
  isProtected: Boolean,      // هل المجلد محمي؟
  passwordHash: String,       // كلمة مرور المجلد (مشفرة)
  protectionType: String,     // نوع الحماية (none, password, biometric)
}
```

**الفهارس (Indexes):**
- `userId, isDeleted, createdAt`
- `parentId, isDeleted, createdAt`
- `userId, isDeleted, parentId`
- `userId, isDeleted, isStarred, createdAt`
- `userId, isDeleted, isProtected`
- `userId, path`

---

### 4. Room Model (الروم/Workspace)

```javascript
{
  name: String,              // اسم الروم
  description: String,       // الوصف
  owner: ObjectId,           // مالك الروم
  isActive: Boolean,         // هل الروم نشط؟
  
  // الأعضاء
  members: [{
    user: ObjectId,           // المستخدم
    role: String,             // الدور (owner, editor, viewer, commenter)
    canShare: Boolean,        // هل يمكنه المشاركة؟
    joinedAt: Date
  }],
  
  // الملفات المشتركة
  files: [{
    fileId: ObjectId,         // الملف
    sharedBy: ObjectId,       // من شاركه
    sharedAt: Date,           // تاريخ المشاركة
    isOneTimeShare: Boolean,  // مشاركة لمرة واحدة؟
    expiresAt: Date,          // تاريخ انتهاء الصلاحية
    visibleForOwner: Boolean, // مرئي للمالك؟
    accessedBy: [{            // من وصل إليه
      user: ObjectId,
      accessedAt: Date
    }],
    allMembersViewed: Boolean // هل شاهدها الجميع؟
  }],
  
  // المجلدات المشتركة
  folders: [{
    folderId: ObjectId,
    sharedBy: ObjectId,
    sharedAt: Date
  }]
}
```

**الفهارس (Indexes):**
- `"members.user", isActive, createdAt`
- `owner, isActive`
- `"files.fileId", isActive`
- `"folders.folderId", "members.user", isActive`
- Text index على: `name, description`

---

### 5. RoomInvitation Model (دعوة الروم)

```javascript
{
  room: ObjectId,             // الروم
  sender: ObjectId,          // المرسل
  receiver: ObjectId,         // المستقبل
  permission: String,         // الصلاحية المطلوبة
  status: String,             // الحالة (pending, accepted, rejected, cancelled)
  message: String,           // رسالة (اختياري)
  expiresAt: Date,           // تاريخ انتهاء الصلاحية (30 يوم)
}
```

---

### 6. ActivityLog Model (سجل النشاطات)

```javascript
{
  userId: ObjectId,           // المستخدم
  action: String,             // نوع النشاط (file_uploaded, file_deleted, etc.)
  entityType: String,         // نوع الكيان (file, folder, user, system)
  entityId: ObjectId,         // معرف الكيان
  entityName: String,         // اسم الكيان
  details: Object,            // تفاصيل إضافية
  ipAddress: String,          // عنوان IP
  userAgent: String,          // User Agent
  metadata: Object            // بيانات إضافية
}
```

---

## 🔌 نقاط النهاية (API Endpoints)

### 🔐 Authentication (`/api/v1/auth`)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/signup` | تسجيل مستخدم جديد |
| POST | `/login` | تسجيل الدخول |
| POST | `/forgotPassword` | طلب إعادة تعيين كلمة المرور |
| POST | `/verifyResetCode` | التحقق من كود إعادة التعيين |
| PUT | `/resetPassword` | إعادة تعيين كلمة المرور |
| POST | `/google` | تسجيل الدخول بـ Google OAuth |

---

### 👤 User (`/api/v1/users`)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/me` | الحصول على الملف الشخصي |
| PUT | `/me` | تحديث الملف الشخصي |
| PUT | `/changePassword` | تغيير كلمة المرور |
| PUT | `/changeEmail` | تغيير البريد الإلكتروني |
| POST | `/uploadProfileImage` | رفع صورة الملف الشخصي |
| DELETE | `/deleteProfileImage` | حذف صورة الملف الشخصي |
| GET | `/search` | البحث عن مستخدمين |
| GET | `/storage` | معلومات المساحة التخزينية |

---

### 📁 Files (`/api/v1/files`)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/` | جلب جميع الملفات (مع pagination) |
| POST | `/upload-single` | رفع ملف واحد |
| POST | `/upload-multiple` | رفع ملفات متعددة (حتى 50) |
| GET | `/category/:category` | جلب الملفات حسب التصنيف |
| GET | `/starred` | جلب الملفات المميزة |
| GET | `/shared` | جلب الملفات المشتركة |
| GET | `/recent` | جلب الملفات الحديثة |
| GET | `/trash` | جلب الملفات المحذوفة |
| GET | `/:id` | تفاصيل ملف |
| GET | `/:id/download` | تحميل ملف |
| GET | `/:id/view` | عرض ملف (للصور والفيديو) |
| PUT | `/:id` | تحديث معلومات الملف |
| PUT | `/:id/move` | نقل ملف إلى مجلد آخر |
| PUT | `/:id/star` | تمييز ملف |
| PUT | `/:id/unstar` | إلغاء تمييز ملف |
| POST | `/:id/share` | مشاركة ملف مع مستخدم |
| DELETE | `/:id/share/:userId` | إلغاء مشاركة ملف |
| DELETE | `/:id` | حذف ملف (نقل للسلة) |
| DELETE | `/:id/permanent` | حذف ملف نهائياً |
| PUT | `/:id/restore` | استعادة ملف من السلة |
| POST | `/:id/replace` | استبدال محتوى ملف |
| GET | `/search` | بحث نصي في الملفات |

**Query Parameters:**
- `parentFolderId` - تصفية حسب المجلد
- `page` - رقم الصفحة
- `limit` - عدد العناصر
- `sort` - الترتيب (name, size, date)
- `order` - الاتجاه (asc, desc)

---

### 📂 Folders (`/api/v1/folders`)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/` | جلب جميع المجلدات |
| POST | `/create` | إنشاء مجلد فارغ |
| POST | `/upload` | رفع مجلد كامل مع محتوياته |
| GET | `/:id` | تفاصيل مجلد |
| GET | `/:id/contents` | محتويات مجلد (ملفات + مجلدات فرعية) |
| PUT | `/:id` | تحديث معلومات المجلد |
| PUT | `/:id/move` | نقل مجلد |
| PUT | `/:id/star` | تمييز مجلد |
| PUT | `/:id/unstar` | إلغاء تمييز مجلد |
| POST | `/:id/share` | مشاركة مجلد |
| DELETE | `/:id/share/:userId` | إلغاء مشاركة مجلد |
| PUT | `/:id/protect` | حماية مجلد بكلمة مرور |
| PUT | `/:id/unprotect` | إلغاء حماية مجلد |
| POST | `/:id/verify-password` | التحقق من كلمة مرور المجلد |
| DELETE | `/:id` | حذف مجلد |
| DELETE | `/:id/permanent` | حذف مجلد نهائياً |
| PUT | `/:id/restore` | استعادة مجلد |

---

### 👥 Rooms (`/api/v1/rooms`)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/` | جلب جميع روماتي |
| POST | `/` | إنشاء روم جديد |
| GET | `/:id` | تفاصيل روم |
| PUT | `/:id` | تحديث معلومات الروم |
| DELETE | `/:id` | حذف روم |
| POST | `/:id/invite` | إرسال دعوة لمستخدم |
| GET | `/invitations/pending` | الدعوات المعلقة |
| PUT | `/invitations/:id/accept` | قبول دعوة |
| PUT | `/invitations/:id/reject` | رفض دعوة |
| GET | `/invitations/stats` | إحصائيات الدعوات |
| DELETE | `/invitations/cleanup` | تنظيف الدعوات القديمة |
| POST | `/:id/share-file` | مشاركة ملف مع الروم |
| POST | `/:id/share-folder` | مشاركة مجلد مع الروم |
| DELETE | `/:id/files/:fileId` | إزالة ملف من الروم |
| DELETE | `/:id/folders/:folderId` | إزالة مجلد من الروم |
| PUT | `/:id/members/:memberId` | تحديث صلاحيات عضو |
| DELETE | `/:id/members/:memberId` | إزالة عضو من الروم |

---

### 🔍 Search (`/api/v1/search`)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/smart` | بحث ذكي باستخدام AI |
| GET | `/text` | بحث نصي |
| POST | `/process/:fileId` | معالجة ملف للبحث الذكي |
| POST | `/reprocess/:fileId` | إعادة معالجة ملف |

**Smart Search Body:**
```json
{
  "query": "صور فيها بحر",
  "limit": 20,
  "minScore": 0.2,
  "category": "Images"
}
```

---

### 📊 Activity Log (`/api/v1/activity-log`)

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/` | جلب سجل النشاطات |
| GET | `/statistics` | إحصائيات النشاطات |
| DELETE | `/clear-old` | مسح النشاطات القديمة |

**Query Parameters:**
- `page`, `limit` - Pagination
- `action` - نوع النشاط
- `entityType` - نوع الكيان (file, folder, user, system)
- `startDate`, `endDate` - فترة زمنية

---

## 🎯 الميزات الرئيسية (Key Features)

### 1. إدارة الملفات والمجلدات
- ✅ رفع ملف واحد أو متعدد
- ✅ رفع مجلد كامل مع هيكله
- ✅ تنظيم هرمي (مجلدات داخل مجلدات)
- ✅ تصنيف تلقائي (Images, Videos, Audio, Documents, etc.)
- ✅ تمييز الملفات والمجلدات (Starred)
- ✅ وصف وعلامات (Tags)
- ✅ نقل بين المجلدات
- ✅ سلة المهملات (Trash) مع استعادة
- ✅ حذف نهائي بعد 30 يوم

### 2. نظام المشاركة
- ✅ مشاركة ملفات/مجلدات مع مستخدمين محددين
- ✅ صلاحيات مختلفة (view, edit, delete)
- ✅ نظام الرومات (Rooms/Workspaces)
- ✅ دعوات للمشاركة (قبول/رفض)
- ✅ مشاركة لمرة واحدة مع انتهاء صلاحية
- ✅ تتبع من شاهد الملفات

### 3. البحث الذكي (AI Search)
- ✅ بحث دلالي (Semantic Search) باستخدام Embeddings
- ✅ استخراج نص من PDF, DOCX, Excel, Text
- ✅ وصف الصور باستخدام Vision API
- ✅ استخراج Transcript من الصوت (Whisper)
- ✅ استخراج بيانات الفيديو
- ✅ بحث متعدد اللغات
- ✅ نتائج مرتبة حسب الصلة (Relevance Score)

### 4. الحماية والأمان
- ✅ تشفير كلمات المرور (bcrypt)
- ✅ JWT للمصادقة
- ✅ حماية من NoSQL Injection
- ✅ حماية من XSS
- ✅ Rate Limiting
- ✅ Helmet للـ HTTP headers
- ✅ حماية المجلدات بكلمة مرور
- ✅ CORS محدود

### 5. إدارة المستخدمين
- ✅ تسجيل دخول/خروج
- ✅ إعادة تعيين كلمة المرور عبر الإيميل
- ✅ تغيير البريد الإلكتروني
- ✅ رفع صورة الملف الشخصي
- ✅ إدارة المساحة التخزينية (10 GB افتراضي)
- ✅ Google OAuth

### 6. سجل النشاطات
- ✅ تتبع جميع العمليات
- ✅ تصفية حسب النوع والفترة
- ✅ إحصائيات مفصلة
- ✅ تنظيف تلقائي للنشاطات القديمة

### 7. الأداء والتحسينات
- ✅ فهارس محسّنة في MongoDB
- ✅ `.lean()` للاستعلامات السريعة
- ✅ `.select()` لتقليل حجم البيانات
- ✅ Pagination لجميع القوائم
- ✅ Caching للبيانات الشائعة
- ✅ معالجة في الخلفية للملفات

### 8. Real-time Communication
- ✅ Socket.IO للتواصل الفوري
- ✅ إشعارات فورية للتحديثات

---

## 🔒 الأمان (Security)

### 1. المصادقة (Authentication)
- **JWT Tokens**: جميع الطلبات (عدا Auth) تحتاج token
- **Token Expiry**: Tokens تنتهي بعد فترة محددة
- **Password Hashing**: bcrypt مع salt rounds = 12

### 2. الحماية من الهجمات
- **NoSQL Injection**: `express-mongo-sanitize`
- **XSS**: `xss-clean`
- **Rate Limiting**: 100 طلب كل 15 دقيقة لكل IP
- **Helmet**: حماية HTTP headers
- **CORS**: محدود لـ frontend domain فقط

### 3. التحقق من البيانات
- **express-validator**: التحقق من جميع المدخلات
- **Mongoose Validation**: التحقق على مستوى قاعدة البيانات

### 4. حماية الملفات
- كل مستخدم يرى ملفاته فقط
- التحقق من الصلاحيات قبل أي عملية
- حماية المجلدات بكلمة مرور

---

## ⚡ تحسينات الأداء (Performance Optimizations)

### 1. فهارس قاعدة البيانات
- فهارس مركبة على الاستعلامات الشائعة
- Text indexes للبحث النصي
- Sparse indexes للحقول الاختيارية

### 2. استعلامات محسّنة
- استخدام `.lean()` للـ plain objects
- استخدام `.select()` لجلب الحقول المطلوبة فقط
- Pagination لجميع القوائم

### 3. معالجة في الخلفية
- معالجة الملفات للبحث الذكي بشكل async
- تنظيف الملفات المحذوفة تلقائياً
- تنظيف الدعوات القديمة كل 24 ساعة

### 4. Caching
- تخزين مؤقت للبيانات الشائعة
- تخزين Embeddings في قاعدة البيانات

---

## 🔄 سير العمل (Workflows)

### 1. رفع ملف جديد
```
1. المستخدم يرفع ملف → uploadFilesMiddleware
2. التحقق من الحجم والنوع
3. حفظ الملف في my_files/
4. إنشاء سجل في قاعدة البيانات
5. تحديث usedStorage للمستخدم
6. معالجة في الخلفية (استخراج نص، embeddings)
7. تسجيل في Activity Log
8. إرسال إشعار عبر Socket.IO
```

### 2. مشاركة ملف مع روم
```
1. التحقق من أن المستخدم عضو في الروم
2. إضافة الملف إلى room.files[]
3. إرسال إشعار لجميع الأعضاء
4. تسجيل في Activity Log
```

### 3. البحث الذكي
```
1. المستخدم يبحث: "صور فيها بحر"
2. تحويل Query إلى Embedding
3. البحث في embeddings الملفات (Cosine Similarity)
4. ترتيب النتائج حسب Score
5. إرجاع النتائج مع Relevance Score
```

---

## 📧 الإيميلات (Email System)

### أنواع الإيميلات
1. **إعادة تعيين كلمة المرور**
   - كود التحقق (6 أرقام)
   - رابط إعادة التعيين

2. **تغيير البريد الإلكتروني**
   - كود التحقق للإيميل الجديد

3. **دعوات الروم**
   - إشعار عند استلام دعوة

---

## 🗂️ التصنيفات (File Categories)

| التصنيف | الأنواع المدعومة |
|---------|------------------|
| **Images** | jpg, jpeg, png, gif, webp, svg |
| **Videos** | mp4, avi, mov, wmv, flv, webm |
| **Audio** | mp3, wav, m4a, ogg, flac |
| **Documents** | pdf, doc, docx, txt, rtf |
| **Compressed** | zip, rar, 7z, tar, gz |
| **Applications** | exe, msi, dmg, apk, deb |
| **Code** | js, ts, py, java, cpp, html, css |
| **Others** | أي نوع آخر |

---

## 🔧 الإعدادات (Configuration)

### متغيرات البيئة (config.env)

```env
# Server
PORT=8000
NODE_ENV=development

# Database
DB_URI=mongodb://localhost:27017/filevo

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRE=90d

# Frontend
FRONTEND_URL=http://localhost:3000

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# OpenAI (للبحث الذكي)
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_EMBEDDING_MODEL=text-embedding-3-small

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## 🚀 البدء السريع (Quick Start)

### 1. تثبيت المتطلبات
```bash
npm install
```

### 2. إعداد config.env
```bash
cp config.env.example config.env
# ثم عدّل المتغيرات
```

### 3. تشغيل السيرفر
```bash
# Development
npm run start:dev

# Production
npm run start:prod
```

### 4. اختبار الاتصال
```bash
GET http://localhost:8000
# Response: "Our API V2"
```

---

## 📊 الإحصائيات والمراقبة

### 1. Activity Log Statistics
- عدد النشاطات حسب النوع
- توزيع النشاطات حسب الكيان
- إحصائيات يومية

### 2. Storage Statistics
- المساحة المستخدمة
- المساحة المتبقية
- عدد الملفات والمجلدات

### 3. Room Statistics
- عدد الرومات
- عدد الدعوات (معلقة، مقبولة، مرفوضة)
- عدد الملفات المشتركة

---

## 🐛 معالجة الأخطاء

### أنواع الأخطاء
1. **Validation Errors** (400) - بيانات غير صحيحة
2. **Authentication Errors** (401) - غير مصرح
3. **Authorization Errors** (403) - لا توجد صلاحية
4. **Not Found** (404) - المورد غير موجود
5. **Server Errors** (500) - خطأ في السيرفر

### معالجة الأخطاء
- Global error handler في `errMiddlewarel.js`
- Custom error class في `apiError.js`
- Logging للأخطاء في console

---

## 🔮 الميزات المستقبلية (Future Features)

- [ ] دعم المزيد من أنواع الملفات
- [ ] تحسين استخراج الفيديو (FFmpeg)
- [ ] بحث بالصوت (Voice Search)
- [ ] تصنيف تلقائي ذكي للملفات
- [ ] اقتراح مجلدات ذكية
- [ ] دعم متعدد اللغات بشكل أفضل
- [ ] إشعارات Push
- [ ] تطبيق موبايل

---

## 📝 ملاحظات مهمة

1. **المساحة التخزينية**: كل مستخدم لديه 10 GB افتراضي
2. **حدود الرفع**: 
   - ملف واحد: 100 MB
   - ملفات متعددة: 50 ملف
   - مجلد: 1000 ملف
3. **انتهاء الصلاحية**: الملفات المحذوفة تُحذف نهائياً بعد 30 يوم
4. **التكاليف**: البحث الذكي يستخدم OpenAI API (مدفوع)
5. **التنظيف التلقائي**: 
   - الدعوات القديمة: كل 24 ساعة
   - الملفات المحذوفة: كل 6 ساعات

---

## 📞 الدعم والمساعدة

للحصول على مساعدة:
1. راجع ملفات التوثيق في المشروع
2. تحقق من logs في console
3. راجع `QUERY_OPTIMIZATION_PLAN.md` لتحسينات الأداء
4. راجع `FRONTEND_CONNECTION_GUIDE.md` للاتصال من Frontend

---

**تم التطوير بواسطة:** Filevo Backend Team  
**التاريخ:** 2024  
**الإصدار:** 1.0.0
