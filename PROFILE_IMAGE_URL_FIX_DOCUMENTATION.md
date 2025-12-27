# 🔧 إصلاح: بناء URL كامل لصورة البروفايل

## 🎯 المشكلة

الباك إند كان يرسل اسم الملف فقط (مثل `user-profile-xxx.jpeg`) وليس URL كامل، مما يسبب خطأ في Flutter:
```
HttpException: Invalid statusCode: 404, uri = http://10.0.2.2:8000/uploads/user-xxx.jpeg
```

## ✅ الحل

تم إنشاء دالة helper لبناء URL كامل من اسم الملف وإضافتها إلى جميع الـ responses التي تحتوي على بيانات المستخدمين.

## 🔧 التعديلات المنفذة

### 1. إنشاء Helper Function (`utils/profileImageHelper.js`)

```javascript
/**
 * Build full URL for profile image
 * @param {string} profileImg - Profile image filename
 * @param {Object} req - Express request object (optional)
 * @returns {string|null} - Full URL or null
 */
function buildProfileImageUrl(profileImg, req = null) {
  if (!profileImg || profileImg.trim() === "") {
    return null;
  }

  // If already a full URL, return as is
  if (profileImg.startsWith("http://") || profileImg.startsWith("https://")) {
    return profileImg;
  }

  // Build base URL from request or environment
  let baseUrl;
  if (req) {
    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost:8000";
    baseUrl = `${protocol}://${host}`;
  } else {
    baseUrl = process.env.BASE_URL || "http://localhost:8000";
  }

  // Profile images are stored in uploads/users/ directory
  let imagePath;
  if (profileImg.includes("/")) {
    imagePath = profileImg;
  } else {
    imagePath = `users/${profileImg}`;
  }

  return `${baseUrl}/uploads/${imagePath}`;
}

/**
 * Transform user object to include full profile image URL
 */
function transformUserProfileImage(user, req = null) {
  if (!user) return user;
  
  const userObj = user.toObject ? user.toObject() : user;
  const profileImgUrl = buildProfileImageUrl(userObj.profileImg, req);
  
  return {
    ...userObj,
    profileImgUrl: profileImgUrl,
  };
}
```

### 2. تطبيق التحويل في جميع الـ Endpoints

تم إضافة `transformUserProfileImage` في:

#### أ. `createRoom` (POST /api/rooms)
```javascript
// بعد populate
if (room.owner) {
  room.owner = transformUserProfileImage(room.owner, req);
}
if (room.members && room.members.length > 0) {
  room.members = room.members.map((member) => ({
    ...member.toObject(),
    user: member.user ? transformUserProfileImage(member.user, req) : member.user,
  }));
}
```

#### ب. `getMyRooms` (GET /api/rooms)
```javascript
const roomsWithProfileImages = roomsWithCounts.map((room) => {
  const transformedRoom = { ...room };
  
  if (room.owner) {
    transformedRoom.owner = transformUserProfileImage(room.owner, req);
  }
  if (room.members && room.members.length > 0) {
    transformedRoom.members = room.members.map((member) => ({
      ...member,
      user: member.user ? transformUserProfileImage(member.user, req) : member.user,
    }));
  }
  
  return transformedRoom;
});
```

#### ج. `getRoomDetails` (GET /api/rooms/:id)
```javascript
// Transform owner and members
if (room.owner) {
  room.owner = transformUserProfileImage(room.owner, req);
}
if (room.members && room.members.length > 0) {
  room.members = room.members.map((member) => ({
    ...member,
    user: member.user ? transformUserProfileImage(member.user, req) : member.user,
  }));
}

// Transform profile images in files
if (room.files && room.files.length > 0) {
  room.files = room.files.map((fileEntry) => {
    if (fileEntry.fileId && fileEntry.fileId.userId) {
      fileEntry.fileId.userId = transformUserProfileImage(fileEntry.fileId.userId, req);
    }
    return fileEntry;
  });
}
```

#### د. `createComment` (POST /api/rooms/:id/comments)
```javascript
await comment.populate("user", "name email profileImg");

// Transform profile image to full URL
if (comment.user) {
  comment.user = transformUserProfileImage(comment.user, req);
}
```

#### ه. `getComments` (GET /api/rooms/:id/comments)
```javascript
const transformedComments = comments.map((comment) => {
  const commentObj = comment.toObject ? comment.toObject() : comment;
  if (commentObj.user) {
    commentObj.user = transformUserProfileImage(commentObj.user, req);
  }
  return commentObj;
});
```

#### و. `sendInvitation` (POST /api/rooms/:id/invite)
```javascript
await invitation.populate("receiver", "name email profileImg");
await invitation.populate("sender", "name email profileImg");

// Transform profile images to full URLs
if (invitation.receiver) {
  invitation.receiver = transformUserProfileImage(invitation.receiver, req);
}
if (invitation.sender) {
  invitation.sender = transformUserProfileImage(invitation.sender, req);
}
```

#### ز. `getPendingInvitations` (GET /api/rooms/invitations/pending)
```javascript
const transformedInvitations = invitations.map((invitation) => {
  const invObj = invitation.toObject ? invitation.toObject() : invitation;
  if (invObj.sender) {
    invObj.sender = transformUserProfileImage(invObj.sender, req);
  }
  return invObj;
});
```

#### ح. `acceptInvitation` و `rejectInvitation`
```javascript
// بعد populate
if (invitation.sender) {
  invitation.sender = transformUserProfileImage(invitation.sender, req);
}
if (invitation.receiver) {
  invitation.receiver = transformUserProfileImage(invitation.receiver, req);
}
```

## 📋 مثال على الـ Response

### قبل التعديل:
```json
{
  "room": {
    "owner": {
      "name": "أحمد",
      "email": "ahmed@example.com",
      "profileImg": "user-profile-xxx.jpeg"
    }
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
      "profileImg": "user-profile-xxx.jpeg",
      "profileImgUrl": "http://localhost:8000/uploads/users/user-profile-xxx.jpeg"
    }
  }
}
```

## 🔧 كيفية بناء URL

1. **إذا كان `profileImg` URL كامل** (يبدأ بـ `http://` أو `https://`):
   - يُستخدم مباشرة

2. **إذا كان اسم ملف فقط**:
   - يُبنى URL كامل: `{baseUrl}/uploads/users/{filename}`
   - `baseUrl` يُؤخذ من `req.protocol` و `req.get("host")` أو من environment variable

3. **إذا كان `profileImg` فارغ أو null**:
   - يُرجع `null`

## ✅ الميزات

- ✅ بناء URL كامل تلقائياً من اسم الملف
- ✅ دعم URL كامل موجود مسبقاً
- ✅ استخدام request object لبناء URL ديناميكي
- ✅ Fallback إلى environment variables
- ✅ إضافة `profileImgUrl` مع الحفاظ على `profileImg` الأصلي

## 📄 الملفات المعدلة

1. ✅ `utils/profileImageHelper.js` - دالة helper جديدة
2. ✅ `services/roomService.js` - تطبيق التحويل في جميع الـ endpoints

## 🎉 النتيجة

الآن:
- ✅ جميع الـ responses تحتوي على `profileImgUrl` كامل
- ✅ Flutter يمكنه استخدام `profileImgUrl` مباشرة
- ✅ لا حاجة لبناء URL في Flutter
- ✅ يعمل مع جميع البيئات (localhost, production, etc.)

## 🔍 استخدام في Flutter

### قبل التعديل:
```dart
// كان يجب بناء URL في Flutter
String buildProfileImageUrl(String? profileImg) {
  if (profileImg == null || profileImg.isEmpty) return null;
  return "${ApiConfig.baseUrl}/uploads/users/$profileImg";
}
```

### بعد التعديل:
```dart
// يمكن استخدام profileImgUrl مباشرة
Image.network(
  user.profileImgUrl ?? defaultAvatarUrl,
  // ...
)
```

## ⚠️ ملاحظات مهمة

1. **Backward Compatibility:**
   - `profileImg` الأصلي لا يزال موجوداً
   - `profileImgUrl` هو field جديد
   - يمكن استخدام أي منهما

2. **Static Files:**
   - تأكد من أن `/uploads` static route موجود في `server.js`
   - ✅ موجود: `app.use("/uploads", express.static(path.join(__dirname, "uploads")));`

3. **Environment Variables:**
   - يمكن إضافة `BASE_URL` في `.env` للـ production
   - مثال: `BASE_URL=https://api.example.com`











