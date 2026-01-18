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

// ======================
// ✅ فهارس محسّنة لتحسين الأداء
// ======================

// 1. getAllFolders - جميع المجلدات
folderSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });

// 2. getFolderContents - محتويات المجلد مع pagination (DB-level pagination)
folderSchema.index({ parentId: 1, isDeleted: 1, createdAt: -1 });

// 3. البحث السريع عن المجلدات الفرعية
folderSchema.index({ userId: 1, isDeleted: 1, parentId: 1 });

// 4. getStarredFolders - المجلدات المميزة
folderSchema.index({ userId: 1, isDeleted: 1, isStarred: 1, createdAt: -1 });

// 5. getFoldersSharedWithMe - المجلدات المشتركة
folderSchema.index({ userId: 1, isDeleted: 1, "sharedWith.user": 1, createdAt: -1 });

// 6. المجلدات المحمية
folderSchema.index({ userId: 1, isDeleted: 1, isProtected: 1 });

// 7. البحث بالمسار
folderSchema.index({ userId: 1, path: 1 });

// 8. getTrashFolders - المجلدات المحذوفة
folderSchema.index({ userId: 1, isDeleted: 1, deletedAt: -1 });

// 9. عمليات التنظيف - حذف المجلدات المنتهية الصلاحية
folderSchema.index({ isDeleted: 1, deleteExpiryDate: 1 });

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
