# 👤 إضافة صورة البروفايل في الروم والكومنتات

## 🎯 الهدف
إضافة صورة البروفايل (`profileImg`) إلى جميع الـ responses التي تحتوي على بيانات المستخدمين في الروم والكومنتات، حتى يتمكن الـ frontend من عرضها بجانب اسم المستخدم.

## ✅ التعديلات المنفذة

### 1. في `getMyRooms` (GET /api/rooms)
**قبل:**
```javascript
.populate({
  path: "owner",
  select: "name email",
})
.populate({
  path: "members.user",
  select: "name email",
})
```

**بعد:**
```javascript
.populate({
  path: "owner",
  select: "name email profileImg",
})
.populate({
  path: "members.user",
  select: "name email profileImg",
})
```

### 2. في `getRoomDetails` (GET /api/rooms/:id)
**قبل:**
```javascript
.populate("owner", "name email")
.populate("members.user", "name email")
.populate({
  path: "files.fileId",
  populate: {
    path: "userId",
    select: "name email",
  },
})
```

**بعد:**
```javascript
.populate("owner", "name email profileImg")
.populate("members.user", "name email profileImg")
.populate({
  path: "files.fileId",
  populate: {
    path: "userId",
    select: "name email profileImg",
  },
})
```

### 3. في `createRoom` (POST /api/rooms)
**قبل:**
```javascript
await room.populate("owner", "name email");
await room.populate("members.user", "name email");
```

**بعد:**
```javascript
await room.populate("owner", "name email profileImg");
await room.populate("members.user", "name email profileImg");
```

### 4. في `getComments` (GET /api/rooms/:id/comments)
**قبل:**
```javascript
const comments = await Comment.find(query)
  .populate("user", "name email")
  .sort({ createdAt: 1 });
```

**بعد:**
```javascript
const comments = await Comment.find(query)
  .populate("user", "name email profileImg")
  .sort({ createdAt: 1 });
```

### 5. في `createComment` (POST /api/rooms/:id/comments)
**قبل:**
```javascript
await comment.populate("user", "name email");
```

**بعد:**
```javascript
await comment.populate("user", "name email profileImg");
```

### 6. في `sendInvitation` (POST /api/rooms/:id/invite)
**قبل:**
```javascript
await invitation.populate("receiver", "name email");
await invitation.populate("sender", "name email");
```

**بعد:**
```javascript
await invitation.populate("receiver", "name email profileImg");
await invitation.populate("sender", "name email profileImg");
```

### 7. في `getPendingInvitations` (GET /api/rooms/invitations/pending)
**قبل:**
```javascript
.populate("sender", "name email")
```

**بعد:**
```javascript
.populate("sender", "name email profileImg")
```

### 8. في `acceptInvitation` و `rejectInvitation`
**قبل:**
```javascript
.populate("sender", "name email")
.populate("receiver", "name email")
```

**بعد:**
```javascript
.populate("sender", "name email profileImg")
.populate("receiver", "name email profileImg")
```

## 📋 الـ Endpoints المتأثرة

| Endpoint | Method | التعديل |
|----------|--------|---------|
| `/api/rooms` | GET | ✅ إضافة `profileImg` لـ owner و members |
| `/api/rooms/:id` | GET | ✅ إضافة `profileImg` لـ owner و members و files.userId |
| `/api/rooms` | POST | ✅ إضافة `profileImg` لـ owner و members |
| `/api/rooms/:id/comments` | GET | ✅ إضافة `profileImg` لـ user في الكومنتات |
| `/api/rooms/:id/comments` | POST | ✅ إضافة `profileImg` لـ user في الكومنت الجديد |
| `/api/rooms/:id/invite` | POST | ✅ إضافة `profileImg` لـ sender و receiver |
| `/api/rooms/invitations/pending` | GET | ✅ إضافة `profileImg` لـ sender |
| `/api/rooms/invitations/:id/accept` | PUT | ✅ إضافة `profileImg` لـ sender و receiver |
| `/api/rooms/invitations/:id/reject` | PUT | ✅ إضافة `profileImg` لـ sender و receiver |

## 📄 مثال على الـ Response

### قبل التعديل:
```json
{
  "room": {
    "owner": {
      "name": "أحمد",
      "email": "ahmed@example.com"
    },
    "members": [
      {
        "user": {
          "name": "محمد",
          "email": "mohammed@example.com"
        }
      }
    ]
  }
}
```

### بعد التعديل:
```json
{
  "room": {
    "owner": {
      "name": "أحمد",
      "email": "ahmed@example.com",
      "profileImg": "https://api.example.com/uploads/profile-123.jpg"
    },
    "members": [
      {
        "user": {
          "name": "محمد",
          "email": "mohammed@example.com",
          "profileImg": "https://api.example.com/uploads/profile-456.jpg"
        }
      }
    ]
  }
}
```

### مثال على الكومنتات:
```json
{
  "comments": [
    {
      "_id": "comment123",
      "content": "هذا كومنت رائع",
      "user": {
        "name": "سارة",
        "email": "sara@example.com",
        "profileImg": "https://api.example.com/uploads/profile-789.jpg"
      },
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

## 🔧 استخدام في Flutter

### مثال على عرض صورة البروفايل:

```dart
// في RoomMemberWidget
Widget buildMemberAvatar(UserModel user) {
  if (user.profileImg != null && user.profileImg!.isNotEmpty) {
    return CircleAvatar(
      backgroundImage: NetworkImage(user.profileImg!),
      radius: 20,
    );
  } else {
    // صورة افتراضية إذا لم تكن موجودة
    return CircleAvatar(
      backgroundColor: Colors.grey[300],
      child: Text(
        user.name[0].toUpperCase(),
        style: TextStyle(color: Colors.grey[700]),
      ),
      radius: 20,
    );
  }
}

// في CommentWidget
Widget buildCommentHeader(CommentModel comment) {
  return Row(
    children: [
      // صورة البروفايل
      if (comment.user.profileImg != null && comment.user.profileImg!.isNotEmpty)
        CircleAvatar(
          backgroundImage: NetworkImage(comment.user.profileImg!),
          radius: 16,
        )
      else
        CircleAvatar(
          backgroundColor: Colors.grey[300],
          child: Text(
            comment.user.name[0].toUpperCase(),
            style: TextStyle(color: Colors.grey[700]),
          ),
          radius: 16,
        ),
      SizedBox(width: 8),
      // اسم المستخدم
      Text(
        comment.user.name,
        style: TextStyle(fontWeight: FontWeight.bold),
      ),
    ],
  );
}
```

## ✅ الميزات

- ✅ إضافة `profileImg` لجميع المستخدمين في الروم
- ✅ إضافة `profileImg` لجميع المستخدمين في الكومنتات
- ✅ إضافة `profileImg` في الـ invitations
- ✅ إضافة `profileImg` في ملفات الروم (userId)
- ✅ لا يوجد تأثير على الأداء (فقط إضافة field واحد)

## 📄 الملفات المعدلة

1. ✅ `services/roomService.js` - تحديث جميع الـ populate statements

## 🎉 النتيجة

الآن:
- ✅ جميع الـ responses تحتوي على `profileImg` للمستخدمين
- ✅ الـ frontend يمكنه عرض صورة البروفايل بجانب اسم المستخدم
- ✅ نفس البنية في جميع الـ endpoints
- ✅ لا يوجد breaking changes (فقط إضافة field جديد)

## ⚠️ ملاحظات مهمة

1. **صورة البروفايل اختيارية:**
   - إذا لم يكن للمستخدم صورة بروفايل، `profileImg` سيكون `null` أو `undefined`
   - يجب على الـ frontend التعامل مع هذه الحالة وعرض صورة افتراضية

2. **URL الصورة:**
   - `profileImg` يحتوي على URL كامل للصورة
   - يجب التأكد من أن الـ URL صحيح ويمكن الوصول إليه

3. **الأداء:**
   - إضافة `profileImg` لا يؤثر على الأداء بشكل كبير
   - فقط إضافة field واحد في الـ select




















