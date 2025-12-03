# ملخص API للمطور الفرونت إند 🚀

## 📡 رابط الباك إند الأساسي

### للتطوير المحلي (Local Development):
```
http://localhost:8000
```

### قاعدة URL للجميع APIs:
```
http://localhost:8000/api/v1
```

---

## ✅ ما تم إعداده

1. ✅ **CORS:** تم تفعيل CORS للسماح بالاتصال من أي فرونت إند
2. ✅ **All APIs:** جميع الـ APIs جاهزة للاستخدام
3. ✅ **Documentation:** توثيق كامل في `FRONTEND_CONNECTION_GUIDE.md`

---

## 🎯 أهم APIs للبدء

### 1️⃣ تسجيل الدخول
```http
POST http://localhost:8000/api/v1/auth/login
Content-Type: application/json

{
  "email": "email@example.com",
  "password": "12345678"
}
```
**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```
💾 **احفظ الـ token!**

---

### 2️⃣ الحصول على ملفاتي
```http
GET http://localhost:8000/api/v1/files
Authorization: Bearer YOUR_TOKEN
```

---

### 3️⃣ رفع ملف
```http
POST http://localhost:8000/api/v1/files/upload
Authorization: Bearer YOUR_TOKEN
Content-Type: multipart/form-data

file: [YOUR_FILE]
```

---

### 4️⃣ الحصول على روماتي
```http
GET http://localhost:8000/api/v1/rooms
Authorization: Bearer YOUR_TOKEN
```

---

### 5️⃣ عرض الدعوات المعلقة
```http
GET http://localhost:8000/api/v1/rooms/invitations/pending
Authorization: Bearer YOUR_TOKEN
```

---

## 📚 الملفات المهمة

1. **`FRONTEND_CONNECTION_GUIDE.md`** - دليل شامل لجميع APIs
2. **`POSTMAN_ROOMS_TESTS.md`** - أمثلة اختبار للرومات
3. **`ROOM_SYSTEM_DOCUMENTATION.md`** - توثيق نظام الرومات
4. **`SYSTEM_DOCUMENTATION.md`** - توثيق عام للنظام

---

## 🔧 مثال كود Flutter/Dart

```dart
class ApiService {
  static const String baseUrl = 'http://localhost:8000/api/v1';
  
  // Login
  static Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Login failed');
  }
  
  // Get My Files
  static Future<List<dynamic>> getMyFiles(String token) async {
    final response = await http.get(
      Uri.parse('$baseUrl/files'),
      headers: {
        'Authorization': 'Bearer $token',
      },
    );
    
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['files'] ?? [];
    }
    throw Exception('Failed to load files');
  }
  
  // Upload File
  static Future<String> uploadFile(String token, File file) async {
    var request = http.MultipartRequest(
      'POST',
      Uri.parse('$baseUrl/files/upload'),
    );
    
    request.headers['Authorization'] = 'Bearer $token';
    request.files.add(await http.MultipartFile.fromPath('file', file.path));
    
    var response = await request.send();
    if (response.statusCode == 201) {
      return await response.stream.bytesToString();
    }
    throw Exception('Upload failed');
  }
}
```

---

## ⚙️ Headers المهمة

### للتسجيل الدخول (بدون token):
```dart
headers: {
  'Content-Type': 'application/json',
}
```

### لجميع APIs الأخرى (مع token):
```dart
headers: {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $token',
}
```

### لرفع ملفات:
```dart
// لا تضف Content-Type، Flutter يتعامل معه تلقائياً
headers: {
  'Authorization': 'Bearer $token',
}
```

---

## 🚀 خطوات البدء السريع

1. **شغّل الباك إند:**
   ```bash
   cd E:\Projects Flutter\Filevo_Backend
   npm run start:dev
   ```

2. **تحقق أن الباك إند شغال:**
   ```
   GET http://localhost:8000
   Response: "Our API V2"
   ```

3. **ابدأ بـ Login API** واحصل على token

4. **استخدم الـ token** في كل API call

5. **راجع `FRONTEND_CONNECTION_GUIDE.md`** لجميع التفاصيل

---

## 📞 المجموعات الكاملة للـ APIs

### 🔐 Authentication
- `/api/v1/auth/signup` - التسجيل
- `/api/v1/auth/login` - تسجيل الدخول
- `/api/v1/auth/forgotPassword` - نسيت كلمة المرور
- `/api/v1/auth/verifyResetCode` - التحقق من رمز إعادة التعيين
- `/api/v1/auth/resetPassword` - إعادة تعيين كلمة المرور

### 👤 User
- `/api/v1/users/me` - الملف الشخصي
- `/api/v1/users` - البحث عن مستخدمين

### 📁 Files
- `/api/v1/files` - قائمة ملفاتي
- `/api/v1/files/upload` - رفع ملف
- `/api/v1/files/multiple-upload` - رفع عدة ملفات
- `/api/v1/files/:id` - تفاصيل ملف
- `/api/v1/files/:id/download` - تحميل ملف
- `/api/v1/files/:id/share` - مشاركة ملف

### 📂 Folders
- `/api/v1/folders` - قائمة مجلداتي
- `/api/v1/folders` - إنشاء مجلد
- `/api/v1/folders/:id` - تفاصيل مجلد
- `/api/v1/folders/:id/share` - مشاركة مجلد

### 👥 Rooms
- `/api/v1/rooms` - قائمة روماتي
- `/api/v1/rooms` - إنشاء روم
- `/api/v1/rooms/:id` - تفاصيل روم
- `/api/v1/rooms/:id/invite` - إرسال دعوة
- `/api/v1/rooms/invitations/pending` - الدعوات المعلقة
- `/api/v1/rooms/invitations/:id/accept` - قبول دعوة
- `/api/v1/rooms/invitations/:id/reject` - رفض دعوة

---

## 🎉 جاهز للاستخدام!

جميع الـ APIs جاهزة وتعمل بشكل صحيح مع CORS مفعّل.

**ملاحظات مهمة:**
- 🔒 احفظ الـ token بعد تسجيل الدخول
- 📤 Token ضروري لكل API عدا Auth
- 🗑️ يمكن حذف الدعوات القديمة تلقائياً بعد 30 يوم
- 📊 يوجد API لإحصائيات الدعوات

---

## 📖 مراجع إضافية

- **توثيق كامل:** `FRONTEND_CONNECTION_GUIDE.md`
- **أمثلة اختبار:** `POSTMAN_ROOMS_TESTS.md`
- **نظام الرومات:** `ROOM_SYSTEM_DOCUMENTATION.md`

---

**Backend URL:** `http://localhost:8000` ✅



















