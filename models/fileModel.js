const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    path: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    parentFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
    category: {
      type: String,
      enum: [
        "Images",
        "Videos",
        "Audio",
        "Documents",
        "Compressed",
        "Applications",
        "Code",
        "Others",
      ],
      required: true,
    },
    isShared: {
      type: Boolean,
      default: false,
    },
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
          required: true,
        },
        sharedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deleteExpiryDate: {
      type: Date,
      default: null,
    },
    isStarred: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    // ✅ حقول البحث الذكي
    extractedText: {
      type: String,
      default: null,
      sparse: true,
    },
    embedding: {
      type: [Number],
      default: null,
      sparse: true,
    },
    summary: {
      type: String,
      default: null,
      sparse: true,
    },
    isProcessed: {
      type: Boolean,
      default: false,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    textExtractionError: {
      type: String,
      default: null,
    },
    embeddingError: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// ======================
// ✅ فهارس محسّنة لتحسين الأداء
// ======================

// 1. getAllFiles - جلب الملفات بدون parentFolder
fileSchema.index({ userId: 1, isDeleted: 1, parentFolderId: 1, createdAt: -1 });

// 2. getFilesByCategory - البحث حسب التصنيف
fileSchema.index({ userId: 1, isDeleted: 1, category: 1, createdAt: -1 });

// 3. البحث في مجلد محدد حسب التصنيف
fileSchema.index({ userId: 1, isDeleted: 1, parentFolderId: 1, category: 1, createdAt: -1 });

// 4. getStarredFiles - الملفات المميزة
fileSchema.index({ userId: 1, isDeleted: 1, isStarred: 1, createdAt: -1 });

// 5. getFilesSharedWithMe - الملفات المشتركة
fileSchema.index({ userId: 1, isDeleted: 1, "sharedWith.user": 1, createdAt: -1 });

// 6. getRecentFiles - الملفات الحديثة
fileSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });

// 7. getTrashFiles - الملفات المحذوفة
fileSchema.index({ userId: 1, isDeleted: 1, deletedAt: -1 });

// 8. حساب المساحة التخزينية (Storage Calculation)
fileSchema.index({ userId: 1, isDeleted: 1 });

// 9. البحث عن الملف بالمسار (unique, sparse)
fileSchema.index({ path: 1 }, { unique: true, sparse: true });

// 10. Text Index للبحث النصي الكامل
fileSchema.index({ name: "text", description: "text", tags: "text", extractedText: "text" });

// 11. البحث الذكي - الملفات المعالجة
fileSchema.index({ userId: 1, isDeleted: 1, isProcessed: 1 });

// 12. معالجة الملفات - الملفات التي تحتاج معالجة
fileSchema.index({ isProcessed: 1, createdAt: 1 });

// 13. محتويات المجلد - الملفات داخل مجلد
fileSchema.index({ parentFolderId: 1, userId: 1, isDeleted: 1, createdAt: -1 });

// 14. العمليات الشائعة على الملفات
fileSchema.index({ userId: 1, isDeleted: 1, updatedAt: -1 });

// 15. عمليات التنظيف - حذف الملفات المنتهية الصلاحية
fileSchema.index({ isDeleted: 1, deleteExpiryDate: 1 });

const File = mongoose.model("File", fileSchema);
module.exports = File;
