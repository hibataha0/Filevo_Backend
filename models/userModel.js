const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
      required: function() {
        return this.authProvider === 'local';
      },
      minlength: [6, "Too short password"],
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true, // يسمح بقيم null متعددة
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local"
    },
    passwordChangedAt: Date, // 🔹 لإدارة التحقق من التوكن لاحقًا
    passwordResetCode: String,
    passwordResetExpires: Date,
    passwordResetVerified: Boolean,
    lastPasswordResetEmail: String, // 🔹 نخزن فيه الإيميل مؤقتًا
    // ✅ حقول التحقق من البريد الإلكتروني
    emailVerificationCode: String,
    emailVerificationExpires: Date,
    emailVerified: {
      type: Boolean,
      default: false,
    },
    profileImg: String, // صورة الملف الشخصي
  },
  { timestamps: true }
);

// 2 - Encrypt password before saving (only for local auth)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  // فقط تشفير الباسورد إذا كان authProvider = local
  if (this.authProvider === 'local' && this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

// 3 - Create model
const User = mongoose.model('User', userSchema);

// 4 - Export model
module.exports = User;
