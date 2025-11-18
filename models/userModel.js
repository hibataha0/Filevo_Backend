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
      required: [true, "Password is required"],
      minlength: [6, "Too short password"],
     
    },
    passwordChangedAt: Date, // 🔹 لإدارة التحقق من التوكن لاحقًا
    passwordResetCode: String,
    passwordResetExpires: Date,
    passwordResetVerified: Boolean,
    lastPasswordResetEmail: String, // 🔹 نخزن فيه الإيميل مؤقتًا
  },
  { timestamps: true }
);

// 2 - Encrypt password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// 3 - Create model
const User = mongoose.model('User', userSchema);

// 4 - Export model
module.exports = User;
