# دليل اختبار نظام الروم في Postman

## 🔐 المتطلبات الأولية

### 1. احصل على Token
```json
POST http://localhost:8000/api/v1/auth/login
Body: { "email": "test@test.com", "password": "123456" }
→ احفظ TOKEN_1
```

### 2. احصل على User ID
```json
GET http://localhost:8000/api/v1/users/me
Headers: Authorization: Bearer TOKEN_1
→ احفظ USER_ID_1
```

### 3. سجل دخول كمستخدم ثاني واحصل على TOKEN_2 و USER_ID_2

---

## 📝 الخطوات الكاملة

### المستخدم 1 (Owner):

#### 1️⃣ إنشاء روم
```
POST http://localhost:8000/api/v1/rooms
Headers:
  Authorization: Bearer TOKEN_1
  Content-Type: application/json

Body:
{
  "name": "مشروع فريق العمل",
  "description": "روم للتعاون"
}
```
**→ احفظ ROOM_ID من الـ response**

---

#### 2️⃣ إرسال دعوة للمستخدم 2
```
POST http://localhost:8000/api/v1/rooms/ROOM_ID/invite
Headers:
  Authorization: Bearer TOKEN_1
  Content-Type: application/json

Body:
{
  "receiverId": "USER_ID_2",
  "permission": "edit",
  "message": "مرحباً، انضم للروم"
}
```
**→ احفظ INVITATION_ID من الـ response**

---

#### 3️⃣ مشاركة ملف مع الروم
```
POST http://localhost:8000/api/v1/rooms/ROOM_ID/share-file
Headers:
  Authorization: Bearer TOKEN_1
  Content-Type: application/json

Body:
{
  "fileId": "FILE_ID"
}
```

---

### المستخدم 2 (Member):

#### 4️⃣ عرض الدعوات المعلقة
```
GET http://localhost:8000/api/v1/rooms/invitations/pending
Headers:
  Authorization: Bearer TOKEN_2
```
**سيظهر الدعوة من المستخدم 1**

---

#### 5️⃣ قبول الدعوة
```
PUT http://localhost:8000/api/v1/rooms/invitations/INVITATION_ID/accept
Headers:
  Authorization: Bearer TOKEN_2
```

---

#### 6️⃣ عرض الرومات
```
GET http://localhost:8000/api/v1/rooms
Headers:
  Authorization: Bearer TOKEN_2
```

---

#### 7️⃣ عرض تفاصيل الروم
```
GET http://localhost:8000/api/v1/rooms/ROOM_ID
Headers:
  Authorization: Bearer TOKEN_2
```
**سيظهر الملفات والمجلدات المشتركة**

---

### المستخدم 1 (Owner):

#### 8️⃣ تعديل صلاحيات المستخدم 2
```
PUT http://localhost:8000/api/v1/rooms/ROOM_ID/members/MEMBER_ID
Headers:
  Authorization: Bearer TOKEN_1
  Content-Type: application/json

Body:
{
  "permission": "delete",
  "role": "admin"
}
```

---

## 🧪 اختبارات إضافية

### رفض دعوة (بدلاً من قبولها)
```
PUT http://localhost:8000/api/v1/rooms/invitations/INVITATION_ID/reject
Headers:
  Authorization: Bearer TOKEN_2
```

### عرض إحصائيات الدعوات
```
GET http://localhost:8000/api/v1/rooms/invitations/stats
Headers:
  Authorization: Bearer TOKEN_1
```
**سيظهر:**
- إجمالي الدعوات
- الدعوات حسب الحالة (pending, accepted, rejected, cancelled)
- الدعوات المُرسلة من المستخدم
- الدعوات المُستلمة للمستخدم

### تنظيف الدعوات القديمة يدوياً
```
DELETE http://localhost:8000/api/v1/rooms/invitations/cleanup
Headers:
  Authorization: Bearer TOKEN_1
```
**ملاحظة:** هذا يحذف تلقائياً الدعوات المقبولة/المرفوضة/الملغاة الأقدم من 30 يومًا. النظام أيضاً ينظف تلقائياً كل 24 ساعة عند تشغيل السيرفر.

### مشاركة مجلد مع الروم
```
POST http://localhost:8000/api/v1/rooms/ROOM_ID/share-folder
Headers:
  Authorization: Bearer TOKEN_1
  Content-Type: application/json

Body:
{
  "folderId": "FOLDER_ID"
}
```

### إزالة عضو
```
DELETE http://localhost:8000/api/v1/rooms/ROOM_ID/members/MEMBER_ID
Headers:
  Authorization: Bearer TOKEN_1
```

---

## ⚠️ حالات الفشل المتوقعة

### محاولة قبول دعوة ليست لك
```
Response: 403 - This invitation is not for you
```

### محاولة إرسال دعوة لنفسك
```
Response: 400 - Cannot invite yourself
```

### محاولة دعوة عضو موجود بالفعل
```
Response: 400 - User is already a member
```

### محاولة تعديل صلاحيات من غير owner/admin
```
Response: 403 - Only owner or admin can update member permissions
```

### محاولة مشاهدة روم غير عضو فيه
```
Response: 403 - Access denied. You are not a member of this room
```

---

## 📊 ترتيب الـ IDs في الـ Response

عندما تقوم بعمل API call، تظهر الـ IDs في الـ response:

**من createRoom:**
```json
{
  "room": {
    "_id": "ROOM_ID",  ← حفظ هذا
    "members": [
      {
        "_id": "MEMBER_ID"  ← حفظ هذا
      }
    ]
  }
}
```

**من sendInvitation:**
```json
{
  "invitation": {
    "_id": "INVITATION_ID"  ← حفظ هذا
  }
}
```

---

## ✅ Checklist للاختبار الكامل

- [ ] إنشاء روم ✓
- [ ] إرسال دعوة ✓
- [ ] عرض الدعوات المعلقة ✓
- [ ] قبول دعوة ✓
- [ ] رفض دعوة ✓
- [ ] عرض روماتي ✓
- [ ] عرض تفاصيل روم ✓
- [ ] عرض إحصائيات الدعوات ✓
- [ ] تنظيف الدعوات القديمة ✓
- [ ] مشاركة ملف ✓
- [ ] مشاركة مجلد ✓
- [ ] تعديل صلاحيات عضو ✓
- [ ] تغيير دور عضو ✓
- [ ] إزالة عضو ✓



