const mongoose = require("mongoose");

const folderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
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
    size: {
      type: Number,
      required: true,
    },
    path: {
      type: String,
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
    // 🔒 Folder Protection Fields
    isProtected: {
      type: Boolean,
      default: false,
    },
    passwordHash: {
      type: String,
      default: null,
      select: false, // لا يتم إرجاعها تلقائياً في الاستعلامات
    },
    protectionType: {
      type: String,
      enum: ["none", "password", "biometric"],
      default: "none",
      validate: {
        validator: function (value) {
          // إذا كان محمياً، يجب أن يكون protectionType إما 'password' أو 'biometric'
          if (this.isProtected && value === "none") {
            return false;
          }
          // إذا كان غير محمي، يجب أن يكون protectionType = 'none'
          if (!this.isProtected && value !== "none") {
            return false;
          }
          return true;
        },
        message: "protectionType must match isProtected status",
      },
    },
  },
  { timestamps: true }
);

// ✅ Pre-save hook للتأكد من الاتساق
folderSchema.pre("save", function (next) {
  // إذا كان غير محمي، تأكد من تنظيف الحقول
  if (!this.isProtected) {
    this.protectionType = "none";
    this.passwordHash = null;
  } else {
    // إذا كان محمياً، تأكد من أن protectionType ليس 'none'
    if (this.protectionType === "none") {
      this.protectionType = "password"; // افتراضي
    }

    // إذا كان protectionType = 'password'، يجب أن يكون هناك passwordHash
    if (this.protectionType === "password" && !this.passwordHash) {
      // سنسمح بذلك في حالة التحديث (سيتم تعيينه لاحقاً)
      // لكن سنتحقق في setFolderPassword
    }
  }
  next();
});

const Folder = mongoose.model("Folder", folderSchema);
module.exports = Folder;
