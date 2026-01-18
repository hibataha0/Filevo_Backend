const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["owner", "editor", "viewer", "commenter"],
          default: "viewer",
          required: true,
        },
        canShare: {
          type: Boolean,
          default: false,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    files: [
      {
        fileId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "File",
          required: true,
        },
        sharedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        sharedAt: {
          type: Date,
          default: Date.now,
        },
        isOneTimeShare: {
          type: Boolean,
          default: false,
        },
        expiresAt: Date,

        accessedBy: [
          {
            user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            accessedAt: { type: Date, default: Date.now },
          },
        ],

        visibleForOwner: {
          // ⬅⬅ أهم إضافة
          type: Boolean,
          default: true,
        },

        allMembersViewed: {
          type: Boolean,
          default: false,
        },
        viewedByAllAt: Date,
      },
    ],
    folders: [
      {
        folderId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Folder",
          required: true,
        },
        sharedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: false, // Not required for old shared folders
        },
        sharedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ======================
// ✅ فهارس محسّنة لتحسين الأداء
// ======================

// 1. غرف المستخدم - الغرف التي ينتمي إليها المستخدم
roomSchema.index({ "members.user": 1, isActive: 1, createdAt: -1 });

// 2. غرف المستخدم كمالك
roomSchema.index({ owner: 1, isActive: 1 });

// 3. البحث عن الملفات في الغرف
roomSchema.index({ "files.fileId": 1, isActive: 1 });

// 4. البحث عن المجلدات في الغرف
roomSchema.index({ "folders.folderId": 1, "members.user": 1, isActive: 1 });

// 5. الغرف النشطة
roomSchema.index({ isActive: 1, createdAt: -1 });

// 6. Text Index للبحث في أسماء ووصف الغرف
roomSchema.index({ name: "text", description: "text" });

// 7. تتبع الوصول للملفات
roomSchema.index({ "files.fileId": 1, "files.accessedBy.user": 1 });

// 8. انتهاء صلاحية المشاركة لمرة واحدة
roomSchema.index({ "files.expiresAt": 1, "files.isOneTimeShare": 1 });

const Room = mongoose.model("Room", roomSchema);
module.exports = Room;
