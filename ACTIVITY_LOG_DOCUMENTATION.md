# دليل سجل النشاطات / Activity Log Guide

## نظرة عامة / Overview
تم إضافة نظام سجل النشاطات لتتبع جميع العمليات التي يقوم بها المستخدم في النظام.

## النشاطات المتتبعة / Tracked Activities

### عمليات الملفات / File Operations
- `file_uploaded` - رفع ملف جديد
- `file_downloaded` - تحميل ملف
- `file_deleted` - حذف ملف (نقل للسلة)
- `file_restored` - استعادة ملف من السلة
- `file_permanently_deleted` - حذف ملف نهائياً
- `file_updated` - تحديث معلومات الملف
- `file_moved` - نقل ملف بين المجلدات
- `file_starred` - تمييز ملف
- `file_unstarred` - إلغاء تمييز ملف
- `file_shared` - مشاركة ملف
- `file_unshared` - إلغاء مشاركة ملف

### عمليات المجلدات / Folder Operations
- `folder_created` - إنشاء مجلد جديد
- `folder_uploaded` - رفع مجلد مع محتوياته
- `folder_deleted` - حذف مجلد (نقل للسلة)
- `folder_restored` - استعادة مجلد من السلة
- `folder_permanently_deleted` - حذف مجلد نهائياً
- `folder_updated` - تحديث معلومات المجلد
- `folder_moved` - نقل مجلد بين المجلدات
- `folder_starred` - تمييز مجلد
- `folder_unstarred` - إلغاء تمييز مجلد
- `folder_shared` - مشاركة مجلد
- `folder_unshared` - إلغاء مشاركة مجلد

### عمليات المستخدم / User Operations
- `profile_updated` - تحديث الملف الشخصي
- `password_changed` - تغيير كلمة المرور
- `email_changed` - تغيير البريد الإلكتروني
- `account_deleted` - حذف الحساب

### عمليات النظام / System Operations
- `login` - تسجيل الدخول
- `logout` - تسجيل الخروج
- `password_reset_requested` - طلب إعادة تعيين كلمة المرور
- `password_reset_completed` - إكمال إعادة تعيين كلمة المرور

## نقاط النهاية / Endpoints

### 1. جلب سجل النشاطات
```http
GET /api/v1/activity-log
Authorization: Bearer <token>
```

#### معاملات الاستعلام (Query Parameters)
- `page` - رقم الصفحة (افتراضي: 1)
- `limit` - عدد العناصر في الصفحة (افتراضي: 20)
- `action` - نوع النشاط المحدد
- `entityType` - نوع الكيان (file, folder, user, system)
- `startDate` - تاريخ البداية (YYYY-MM-DD)
- `endDate` - تاريخ النهاية (YYYY-MM-DD)

### 2. إحصائيات النشاطات
```http
GET /api/v1/activity-log/statistics
Authorization: Bearer <token>
```

#### معاملات الاستعلام
- `days` - عدد الأيام للإحصائيات (افتراضي: 30)

### 3. مسح النشاطات القديمة
```http
DELETE /api/v1/activity-log/clear-old
Authorization: Bearer <token>
```

#### معاملات الاستعلام
- `days` - عدد الأيام للمحافظة على النشاطات (افتراضي: 90)

## أمثلة الاستخدام / Usage Examples

### 1. جلب جميع النشاطات
```http
Method: GET
URL: http://localhost:3000/api/v1/activity-log
Headers:
  Authorization: Bearer YOUR_TOKEN
```

### 2. جلب نشاطات الملفات فقط
```http
Method: GET
URL: http://localhost:3000/api/v1/activity-log?entityType=file
Headers:
  Authorization: Bearer YOUR_TOKEN
```

### 3. جلب نشاطات محددة
```http
Method: GET
URL: http://localhost:3000/api/v1/activity-log?action=file_uploaded
Headers:
  Authorization: Bearer YOUR_TOKEN
```

### 4. جلب نشاطات فترة محددة
```http
Method: GET
URL: http://localhost:3000/api/v1/activity-log?startDate=2024-01-01&endDate=2024-01-31
Headers:
  Authorization: Bearer YOUR_TOKEN
```

### 5. جلب إحصائيات آخر 7 أيام
```http
Method: GET
URL: http://localhost:3000/api/v1/activity-log/statistics?days=7
Headers:
  Authorization: Bearer YOUR_TOKEN
```

### 6. مسح النشاطات الأقدم من 30 يوم
```http
Method: DELETE
URL: http://localhost:3000/api/v1/activity-log/clear-old?days=30
Headers:
  Authorization: Bearer YOUR_TOKEN
```

## أمثلة الاستجابة / Response Examples

### 1. سجل النشاطات
```json
{
  "message": "Activity log retrieved successfully",
  "activities": [
    {
      "_id": "ACTIVITY_ID",
      "action": "file_uploaded",
      "entityType": "file",
      "entityId": "FILE_ID",
      "entityName": "document.pdf",
      "details": {
        "originalName": "document.pdf",
        "size": 1048576,
        "type": "application/pdf",
        "category": "Documents",
        "parentFolderId": "FOLDER_ID"
      },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "metadata": {
        "timestamp": "2024-01-15T10:30:00.000Z"
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalActivities": 100,
    "hasNext": true,
    "hasPrev": false
  },
  "filters": {
    "action": null,
    "entityType": null,
    "startDate": null,
    "endDate": null
  }
}
```

### 2. إحصائيات النشاطات
```json
{
  "message": "Activity statistics retrieved successfully",
  "statistics": {
    "totalActivities": 150,
    "period": "30 days",
    "actionStats": [
      {
        "_id": "file_uploaded",
        "count": 45
      },
      {
        "_id": "file_deleted",
        "count": 20
      },
      {
        "_id": "folder_created",
        "count": 15
      }
    ],
    "entityTypeStats": [
      {
        "_id": "file",
        "count": 100
      },
      {
        "_id": "folder",
        "count": 30
      },
      {
        "_id": "user",
        "count": 20
      }
    ],
    "dailyStats": [
      {
        "_id": {
          "year": 2024,
          "month": 1,
          "day": 15
        },
        "count": 8
      }
    ]
  }
}
```

### 3. مسح النشاطات القديمة
```json
{
  "message": "✅ 25 old activity logs cleared successfully",
  "deletedCount": 25,
  "cutoffDate": "2023-10-15T00:00:00.000Z"
}
```

## تفاصيل النشاطات / Activity Details

### رفع ملف
```json
{
  "action": "file_uploaded",
  "entityType": "file",
  "entityName": "document.pdf",
  "details": {
    "originalName": "document.pdf",
    "size": 1048576,
    "type": "application/pdf",
    "category": "Documents",
    "parentFolderId": "FOLDER_ID"
  }
}
```

### حذف ملف
```json
{
  "action": "file_deleted",
  "entityType": "file",
  "entityName": "document.pdf",
  "details": {
    "originalSize": 1048576,
    "type": "application/pdf",
    "category": "Documents",
    "deleteExpiryDate": "2024-02-14T10:30:00.000Z"
  }
}
```

### تحديث ملف
```json
{
  "action": "file_updated",
  "entityType": "file",
  "entityName": "document.pdf",
  "details": {
    "changes": {
      "nameChanged": true,
      "descriptionChanged": true,
      "tagsChanged": false,
      "parentFolderChanged": false
    },
    "originalSize": 1048576,
    "type": "application/pdf",
    "category": "Documents"
  }
}
```

## نصائح للاستخدام / Usage Tips

### 1. الأداء
- استخدم `limit` لتحديد عدد النشاطات في الصفحة
- استخدم `page` للتنقل بين الصفحات
- استخدم الفلاتر لتقليل البيانات المرجعة

### 2. التصفية
- `action` - للبحث عن نوع نشاط محدد
- `entityType` - للبحث عن نوع كيان محدد
- `startDate` و `endDate` - للبحث في فترة محددة

### 3. الإحصائيات
- `days` - لتحديد فترة الإحصائيات
- الإحصائيات تشمل عدد النشاطات حسب النوع والكيان والتوزيع اليومي

### 4. الصيانة
- استخدم `clear-old` لمسح النشاطات القديمة
- احتفظ بالنشاطات المهمة فقط لتوفير المساحة

## الأمان / Security

### 1. الوصول
- جميع النقاط محمية بـ JWT token
- المستخدم يرى نشاطاته فقط

### 2. البيانات المحفوظة
- عنوان IP
- User Agent
- تفاصيل العملية
- الطابع الزمني

### 3. الخصوصية
- لا يتم حفظ محتوى الملفات
- يتم حفظ معلومات وصفية فقط

---

**تاريخ الإنشاء (Created Date)**: 2024  
**آخر تحديث (Last Updated)**: 2024


















