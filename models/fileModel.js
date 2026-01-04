const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true },
    size: { type: Number, required: true },
    path: { type: String, required: true },
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

    // ✅ حقول البحث الذكي
    extractedText: { type: String, default: null, sparse: true },
    embedding: { type: [Number], default: null, sparse: true },
    summary: { type: String, default: null, sparse: true },
    isProcessed: { type: Boolean, default: false },
    processedAt: { type: Date, default: null },
    textExtractionError: { type: String, default: null },
    embeddingError: { type: String, default: null },

    // ✅ بيانات الصور
    imageDescription: { type: String, default: null, sparse: true },
    imageObjects: { type: [String], default: [] },
    imageScene: { type: String, default: null, sparse: true },
    imageColors: { type: [String], default: [] },
    imageMood: { type: String, default: null, sparse: true },
    imageText: { type: String, default: null, sparse: true },

    // ✅ بيانات الصوت
    audioTranscript: { type: String, default: null, sparse: true },

    // ✅ بيانات الفيديو
    videoTranscript: { type: String, default: null, sparse: true },
    videoScenes: { type: [String], default: [] },
    videoDescription: { type: String, default: null, sparse: true },
  },
  { timestamps: true }
);

// ✅ Indexes لتحسين الأداء
fileSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });
fileSchema.index({ parentFolderId: 1, isDeleted: 1, createdAt: -1 });
fileSchema.index({ category: 1, isDeleted: 1 });

// Text search
fileSchema.index({
  extractedText: "text",
  summary: "text",
  audioTranscript: "text",
  videoTranscript: "text",
  imageDescription: "text",
  imageScene: "text",
  imageMood: "text",
  imageText: "text",
});

const File = mongoose.model("File", fileSchema);
module.exports = File;
