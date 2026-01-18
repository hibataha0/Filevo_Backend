const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// 1 - Create schema
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: [true, "Name is required"],
    },
    slug: {
      type: String,
      lowercase: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Too short password"],
    },
    passwordChangedAt: Date, // 🔹 لإدارة التحقق من التوكن لاحقًا
    passwordResetCode: String,
    passwordResetExpires: Date,
    passwordResetVerified: Boolean,
    lastPasswordResetEmail: String, // 🔹 نخزن فيه الإيميل مؤقتًا
    // 📧 حقول التحقق من تغيير الإيميل
    emailChangeCode: String, // كود التحقق من تغيير الإيميل
    emailChangeExpires: Date, // تاريخ انتهاء كود التحقق
    pendingEmail: String, // الإيميل الجديد المؤقت (قبل التحقق)
    profileImg: String, // صورة الملف الشخصي
    // 📦 إدارة المساحة التخزينية
    storageLimit: {
      type: Number,
      default: 10 * 1024 * 1024 * 1024, // 10 GB بالبايت (10 * 1024^3)
    },
    usedStorage: {
      type: Number,
      default: 0, // المساحة المستخدمة بالبايت
    },
  },
  { timestamps: true }
);

// 2 - Encrypt password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ======================
// ✅ فهارس محسّنة لتحسين الأداء
// ======================

// 1. البحث عن المستخدم بالإيميل (موجود بالفعل كـ unique في Schema)
// email field already has unique: true

// 2. إعادة تعيين كلمة المرور
userSchema.index({ passwordResetCode: 1, passwordResetExpires: 1 });

// 3. تغيير الإيميل
userSchema.index({ emailChangeCode: 1, emailChangeExpires: 1 });

// 4. استعلامات المساحة التخزينية
userSchema.index({ usedStorage: 1 });

// 3 - Create model
const User = mongoose.model("User", userSchema);

// 4 - Export model
module.exports = User;
