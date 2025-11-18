# دليل ربط الفرونت إند مع الباك إند

## 📡 قاعدة URL الأساسية

```
http://localhost:8000
```

أو إذا السيرفر مشغل على سيرفر بعيد:
```
http://YOUR_SERVER_IP:8000
```

---

## 🔗 جميع الـ APIs المتاحة للفرونت إند

### Base URL
```
http://localhost:8000/api/v1
```

---

## 🔐 Authentication APIs

### 1. Register (تسجيل جديد)
```
POST http://localhost:8000/api/v1/auth/signup
Body:
{
  "name": "اسم المستخدم",
  "email": "email@example.com",
  "password": "12345678",
  "passwordConfirm": "12345678"
}
```

### 2. Login (تسجيل دخول)
```
POST http://localhost:8000/api/v1/auth/login
Body:
{
  "email": "email@example.com",
  "password": "12345678"
}

Response: { token, user }
→ احفظ الـ token!
```

### 3. Forgot Password (نسيت كلمة المرور)
```
POST http://localhost:8000/api/v1/auth/forgotPassword
Body:
{
  "email": "email@example.com"
}
```

### 4. Verify Reset Code
```
POST http://localhost:8000/api/v1/auth/verifyResetCode
Body:
{
  "resetCode": "123456"
}
```

### 5. Reset Password
```
POST http://localhost:8000/api/v1/auth/resetPassword
Body:
{
  "email": "email@example.com",
  "newPassword": "newPassword123"
}
```

---

## 👤 User APIs

**Headers:** `Authorization: Bearer TOKEN`

### 1. Get My Profile
```
GET http://localhost:8000/api/v1/users/me
```

### 2. Update My Profile
```
PUT http://localhost:8000/api/v1/users/me
Body:
{
  "name": "اسم جديد",
  "email": "newemail@example.com"
}
```

### 3. Change Password
```
PUT http://localhost:8000/api/v1/users/changeMyPassword
Body:
{
  "currentPassword": "12345678",
  "newPassword": "newPassword123"
}
```

### 4. Get All Users (with search)
```
GET http://localhost:8000/api/v1/users?search=اسم
```

---

## 📁 File APIs

**Headers:** `Authorization: Bearer TOKEN`

### 1. Upload Single File
```
POST http://localhost:8000/api/v1/files/upload
Content-Type: multipart/form-data
Body:
  file: [FILE]
```

### 2. Upload Multiple Files
```
POST http://localhost:8000/api/v1/files/multiple-upload
Content-Type: multipart/form-data
Body:
  files: [FILE1, FILE2, ...]
```

### 3. Get All My Files
```
GET http://localhost:8000/api/v1/files
```

### 4. Get File by ID
```
GET http://localhost:8000/api/v1/files/:fileId
```

### 5. Update File Metadata
```
PUT http://localhost:8000/api/v1/files/:fileId/metadata
Body:
{
  "name": "اسم جديد",
  "description": "وصف جديد"
}
```

### 6. Download File
```
GET http://localhost:8000/api/v1/files/:fileId/download
```

### 7. Delete File
```
DELETE http://localhost:8000/api/v1/files/:fileId
```

### 8. Share File
```
POST http://localhost:8000/api/v1/files/:fileId/share
Body:
{
  "userId": "USER_ID",
  "permission": "view" // أو "edit" أو "delete"
}
```

---

## 📂 Folder APIs

**Headers:** `Authorization: Bearer TOKEN`

### 1. Create Folder
```
POST http://localhost:8000/api/v1/folders
Body:
{
  "name": "اسم المجلد",
  "parentId": "PARENT_FOLDER_ID" // اختياري
}
```

### 2. Get All My Folders
```
GET http://localhost:8000/api/v1/folders
```

### 3. Get Folder by ID
```
GET http://localhost:8000/api/v1/folders/:folderId
```

### 4. Update Folder
```
PUT http://localhost:8000/api/v1/folders/:folderId
Body:
{
  "name": "اسم جديد"
}
```

### 5. Delete Folder
```
DELETE http://localhost:8000/api/v1/folders/:folderId
```

### 6. Share Folder
```
POST http://localhost:8000/api/v1/folders/:folderId/share
Body:
{
  "userId": "USER_ID",
  "permission": "view"
}
```

---

## 👥 Room APIs

**Headers:** `Authorization: Bearer TOKEN`

### 1. Create Room
```
POST http://localhost:8000/api/v1/rooms
Body:
{
  "name": "اسم الروم",
  "description": "وصف الروم"
}
```

### 2. Get My Rooms
```
GET http://localhost:8000/api/v1/rooms
```

### 3. Get Room Details
```
GET http://localhost:8000/api/v1/rooms/:roomId
```

### 4. Send Invitation
```
POST http://localhost:8000/api/v1/rooms/:roomId/invite
Body:
{
  "receiverId": "USER_ID",
  "permission": "view",
  "message": "رسالة"
}
```

### 5. Get Pending Invitations
```
GET http://localhost:8000/api/v1/rooms/invitations/pending
```

### 6. Accept Invitation
```
PUT http://localhost:8000/api/v1/rooms/invitations/:invitationId/accept
```

### 7. Reject Invitation
```
PUT http://localhost:8000/api/v1/rooms/invitations/:invitationId/reject
```

### 8. Invitation Statistics
```
GET http://localhost:8000/api/v1/rooms/invitations/stats
```

### 9. Cleanup Old Invitations
```
DELETE http://localhost:8000/api/v1/rooms/invitations/cleanup
```

### 10. Share File with Room
```
POST http://localhost:8000/api/v1/rooms/:roomId/share-file
Body:
{
  "fileId": "FILE_ID"
}
```

### 11. Share Folder with Room
```
POST http://localhost:8000/api/v1/rooms/:roomId/share-folder
Body:
{
  "folderId": "FOLDER_ID"
}
```

### 12. Update Member Permission
```
PUT http://localhost:8000/api/v1/rooms/:roomId/members/:memberId
Body:
{
  "permission": "edit",
  "role": "admin"
}
```

### 13. Remove Member
```
DELETE http://localhost:8000/api/v1/rooms/:roomId/members/:memberId
```

---

## 📊 Activity Log APIs

**Headers:** `Authorization: Bearer TOKEN`

### 1. Get My Activity Log
```
GET http://localhost:8000/api/v1/activity-log
```

### 2. Get Activity Log by Type
```
GET http://localhost:8000/api/v1/activity-log?type=file_upload
```

---

## ⚙️ Important Notes for Flutter

### 1. Base URL Setup
```dart
class ApiConstants {
  static const String baseUrl = 'http://localhost:8000/api/v1';
  // أو للسيرفر البعيد:
  // static const String baseUrl = 'http://YOUR_SERVER_IP:8000/api/v1';
}
```

### 2. Headers Setup
```dart
Map<String, String> getHeaders(String? token) {
  Map<String, String> headers = {
    'Content-Type': 'application/json',
  };
  
  if (token != null) {
    headers['Authorization'] = 'Bearer $token';
  }
  
  return headers;
}
```

### 3. Error Handling
```dart
// عند كل API call، تأكد من معالجة الأخطاء:
// - 401: Unauthorized → احذف الـ token وأعيد تسجيل الدخول
// - 403: Forbidden → ليس لديك الصلاحية
// - 404: Not Found → العنصر غير موجود
// - 400: Bad Request → تحقق من البيانات المُرسلة
// - 500: Server Error → خطأ في السيرفر
```

### 4. File Upload
```dart
// لرفع ملف، استخدم multipart/form-data
// لا تضع Content-Type في الـ header، المتصفح/Flutter يضيفه تلقائياً
```

---

## 🔒 CORS Configuration

**مهم جداً:** تأكد من إضافة CORS في الباك إند لتسمح للفرونت بالاتصال!

إذا كنت تستخدم Flutter/Dart، تأكد أن السيرفر يسمح بالطلبات القادمة من التطبيق.

---

## 📝 Testing

### Test Base URL
```dart
// GET http://localhost:8000
// Response: "Our API V2"
```

إذا جابت النتيجة "Our API V2"، الباك إند شغال! ✅

---

## 🚀 Quick Start Example (Flutter)

```dart
// 1. Login
final response = await http.post(
  Uri.parse('http://localhost:8000/api/v1/auth/login'),
  headers: {'Content-Type': 'application/json'},
  body: jsonEncode({
    'email': 'email@example.com',
    'password': '12345678',
  }),
);

final data = jsonDecode(response.body);
final token = data['token'];

// 2. Get My Profile
final profileResponse = await http.get(
  Uri.parse('http://localhost:8000/api/v1/users/me'),
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $token',
  },
);

final profile = jsonDecode(profileResponse.body);
print(profile);
```

---

## 📌 Useful Links

- **Base URL:** `http://localhost:8000`
- **API Base:** `http://localhost:8000/api/v1`
- **Health Check:** `http://localhost:8000` (يجب يرجع "Our API V2")

---

## ⚠️ Important Reminders

1. **Token:** احفظ الـ token بعد تسجيل الدخول
2. **Headers:** ضع الـ token في الـ Authorization header
3. **File Upload:** استخدم multipart/form-data
4. **CORS:** تأكد من إضافة CORS في الباك إند
5. **Error Handling:** دائماً عالج الأخطاء بشكل مناسب

