const mongoose = require("mongoose");

const folderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
    path: { type: String, required: true },

    // ✅ الحجم الكلي وعدد الملفات (محسوب داخليًا)
    totalSize: { type: Number, default: 0 },
    totalFiles: { type: Number, default: 0 },
    // ✅ الحجم وعدد الملفات (مخزنة مباشرة - بدون حساب recursive) - للحل السريع
    size: { type: Number, default: 0 },
    filesCount: { type: Number, default: 0 },

    isShared: { type: Boolean, default: false },
    sharedWith: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        permission: {
          type: String,
          enum: ["view", "edit", "delete"],
          default: "view",
        },
        sharedAt: { type: Date, default: Date.now },
      },
    ],

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deleteExpiryDate: { type: Date, default: null },
    isStarred: { type: Boolean, default: false },
    description: { type: String, trim: true, default: "" },
    tags: [{ type: String, trim: true }],

    // 🔒 حماية المجلد
    isProtected: { type: Boolean, default: false },
    passwordHash: { type: String, default: null, select: false },
    protectionType: {
      type: String,
      enum: ["none", "password", "biometric"],
      default: "none",
      validate: {
        validator: function (value) {
          if (this.isProtected && value === "none") return false;
          if (!this.isProtected && value !== "none") return false;
          return true;
        },
        message: "protectionType must match isProtected status",
      },
    },
  },
  { timestamps: true }
);

// ✅ Indexes لتحسين الأداء
folderSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });
folderSchema.index({ parentId: 1, isDeleted: 1 });
folderSchema.index({ userId: 1, isDeleted: 1 });
// ✅ Index محسّن للـ getFolderContents - DB-level pagination
folderSchema.index({ parentId: 1, isDeleted: 1, createdAt: -1 });

// ✅ Pre-save hook للتأكد من الاتساق
folderSchema.pre("save", function (next) {
  if (!this.isProtected) {
    this.protectionType = "none";
    this.passwordHash = null;
  } else if (this.protectionType === "none") {
    this.protectionType = "password";
  }
  next();
});

const Folder = mongoose.model("Folder", folderSchema);
module.exports = Folder;
