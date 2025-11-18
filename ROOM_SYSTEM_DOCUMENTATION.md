# نظام الروم (Rooms/Workspaces) - التوثيق الكامل

## نظرة عامة

النظام الجديد يعتمد على إنشاء **غرف عمل (Rooms)** حيث يمكن:
1. إنشاء روم وإعطاؤه اسم
2. إرسال دعوات لمستخدمين
3. قبول أو رفض الدعوات
4. مشاركة ملفات/مجلدات مع الروم
5. تحديد صلاحيات لكل عضو

---

## هيكل النموذج

### Room (الروم)
- `name`: اسم الروم
- `description`: وصف (اختياري)
- `owner`: مالك الروم
- `members[]`: الأعضاء (user, permission, role)
- `files[]`: الملفات المشتركة
- `folders[]`: المجلدات المشتركة

### RoomInvitation (دعوة الروم)
- `room`: الروم
- `sender`: المرسل
- `receiver`: المستقبل
- `permission`: الصلاحية المطلوبة
- `status`: pending/accepted/rejected/cancelled
- `message`: رسالة (اختياري)

---

## الصلاحيات (Permissions)

### للملفات والمجلدات:
- `view`: مشاهدة فقط
- `edit`: تعديل
- `delete`: حذف

### للدور (Role) في الروم:
- `owner`: المالك (صلاحيات كاملة)
- `admin`: مدير (يمكن إدارة الأعضاء)
- `member`: عضو عادي

---

## الـ APIs المتاحة

### 1️⃣ إنشاء روم جديد
```
POST /api/v1/rooms
Headers:
  Authorization: Bearer TOKEN
  Content-Type: application/json

Body:
{
  "name": "اسم الروم",
  "description": "وصف الروم (اختياري)"
}

Response:
{
  "message": "✅ Room created successfully",
  "room": {...}
}
```

---

### 2️⃣ إرسال دعوة لمستخدم
```
POST /api/v1/rooms/:roomId/invite
Headers:
  Authorization: Bearer TOKEN
  Content-Type: application/json

Body:
{
  "receiverId": "USER_ID",
  "permission": "view",  // أو "edit" أو "delete"
  "message": "مرحباً، انضم للروم"  // اختياري
}

Response:
{
  "message": "✅ Invitation sent successfully",
  "invitation": {...}
}
```

---

### 3️⃣ عرض الدعوات المعلقة
```
GET /api/v1/rooms/invitations/pending
Headers:
  Authorization: Bearer TOKEN

Response:
{
  "message": "Pending invitations retrieved successfully",
  "count": 2,
  "invitations": [...]
}
```

---

### 4️⃣ قبول دعوة
```
PUT /api/v1/rooms/invitations/:invitationId/accept
Headers:
  Authorization: Bearer TOKEN

Response:
{
  "message": "✅ Invitation accepted successfully",
  "room": {...}
}
```

---

### 5️⃣ رفض دعوة
```
PUT /api/v1/rooms/invitations/:invitationId/reject
Headers:
  Authorization: Bearer TOKEN

Response:
{
  "message": "✅ Invitation rejected",
  "invitation": {...}
}
```

---

### 6️⃣ عرض روماتي
```
GET /api/v1/rooms
Headers:
  Authorization: Bearer TOKEN

Response:
{
  "message": "Rooms retrieved successfully",
  "count": 3,
  "rooms": [...]
}
```

---

### 7️⃣ تفاصيل روم
```
GET /api/v1/rooms/:roomId
Headers:
  Authorization: Bearer TOKEN

Response:
{
  "message": "Room details retrieved successfully",
  "room": {
    "name": "اسم الروم",
    "members": [...],
    "files": [...],
    "folders": [...]
  }
}
```

---

### 8️⃣ مشاركة ملف مع الروم
```
POST /api/v1/rooms/:roomId/share-file
Headers:
  Authorization: Bearer TOKEN
  Content-Type: application/json

Body:
{
  "fileId": "FILE_ID"
}

Response:
{
  "message": "✅ File shared with room successfully",
  "room": {...}
}
```

---

### 9️⃣ مشاركة مجلد مع الروم
```
POST /api/v1/rooms/:roomId/share-folder
Headers:
  Authorization: Bearer TOKEN
  Content-Type: application/json

Body:
{
  "folderId": "FOLDER_ID"
}

Response:
{
  "message": "✅ Folder shared with room successfully",
  "room": {...}
}
```

---

### 🔟 تعديل صلاحيات عضو
```
PUT /api/v1/rooms/:roomId/members/:memberId
Headers:
  Authorization: Bearer TOKEN
  Content-Type: application/json

Body:
{
  "permission": "edit",  // أو "view" أو "delete"
  "role": "admin"  // أو "member"
}

Response:
{
  "message": "✅ Member permissions updated successfully",
  "room": {...}
}
```

---

### 1️⃣1️⃣ إزالة عضو من الروم
```
DELETE /api/v1/rooms/:roomId/members/:memberId
Headers:
  Authorization: Bearer TOKEN

Response:
{
  "message": "✅ Member removed successfully",
  "room": {...}
}
```

---

### 1️⃣2️⃣ عرض إحصائيات الدعوات
```
GET /api/v1/rooms/invitations/stats
Headers:
  Authorization: Bearer TOKEN

Response:
{
  "message": "Invitation statistics retrieved successfully",
  "stats": {
    "total": [{ "count": 50 }],
    "byStatus": [
      { "_id": "pending", "count": 5 },
      { "_id": "accepted", "count": 30 },
      { "_id": "rejected", "count": 10 },
      { "_id": "cancelled", "count": 5 }
    ],
    "sentByMe": [{ "count": 20 }],
    "receivedByMe": [{ "count": 30 }]
  }
}
```

---

### 1️⃣3️⃣ تنظيف الدعوات القديمة
```
DELETE /api/v1/rooms/invitations/cleanup
Headers:
  Authorization: Bearer TOKEN

Response:
{
  "message": "✅ Cleaned up 15 old invitations",
  "deletedCount": 15
}
```

**ملاحظات مهمة:**
- هذه العملية تحذف الدعوات المقبولة/المرفوضة/الملغاة الأقدم من 30 يومًا فقط
- النظام يقوم بالتنظيف التلقائي كل 24 ساعة عند تشغيل السيرفر
- الدعوات المعلقة (pending) لا يتم حذفها تلقائياً
- يمكن للأدمن تنفيذ التنظيف يدوياً في أي وقت

---

## سيناريو استخدام كامل

### المستخدم A:
1. **ينشئ روم:** `POST /api/v1/rooms`
   ```json
   {
     "name": "مشروع فريق العمل",
     "description": "روم للتعاون في المشروع"
   }
   ```

2. **يرسل دعوة لـ B و C:**
   ```json
   POST /api/v1/rooms/ROOM_ID/invite
   {
     "receiverId": "USER_B_ID",
     "permission": "edit",
     "message": "انضم للفريق"
   }
   ```

3. **بعد قبول الدعوات، يشارك ملفات:**
   ```
   POST /api/v1/rooms/ROOM_ID/share-file
   {
     "fileId": "FILE_ID"
   }
   ```

### المستخدم B:
4. **يشاهد دعواته:**
   ```
   GET /api/v1/rooms/invitations/pending
   ```

5. **يقبل الدعوة:**
   ```
   PUT /api/v1/rooms/invitations/INVITATION_ID/accept
   ```

6. **يرى الملفات المشتركة:**
   ```
   GET /api/v1/rooms/ROOM_ID
   ```

---

## قواعد مهمة

✅ **يستطيع العميل:**
- إنشاء روم
- إرسال دعوات
- مشاركة ملفات/مجلدات (إذا كان عضو)
- تعديل صلاحيات الأعضاء (إذا كان owner أو admin)
- إزالة أعضاء (إذا كان owner أو admin)

✅ **يستطيع العضو:**
- قبول/رفض الدعوات
- مشاهدة الرومات التي هو عضو فيها
- مشاهدة الملفات والمجلدات المشتركة

❌ **لا يستطيع:**
- تعديل صلاحيات owner
- إزالة owner
- دعوة نفسه
- دعوة عضو موجود بالفعل
- مشاركة بدون أن يكون عضو

---

## حالات الخطأ

### 400 Bad Request
- اسم الروم مطلوب
- User ID مفقود
- صلاحية غير صحيحة
- دعوة نفسك
- عضو موجود بالفعل
- ملف/مجلد مشارك مسبقاً

### 403 Forbidden
- لست عضو في الروم
- لست owner أو admin
- الدعوة ليست لك

### 404 Not Found
- الروم غير موجود
- المستخدم غير موجود
- الملف/المجلد غير موجود

---

## الفرق عن النظام السابق

| الميزة | النظام القديم | النظام الجديد |
|--------|--------------|---------------|
| طريقة المشاركة | مباشرة مع مستخدم | عبر Room |
| الدعوات | غير موجودة | موجودة (قبول/رفض) |
| الصلاحيات | على المستوى فقط | Role + Permission |
| إدارة الأعضاء | لا توجد | موجودة (admin) |
| تجميع الملفات | مشتت | كلها في روم واحد |

