const mongoose = require('mongoose');

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
      enum: ["Images", "Videos","Audio", "Documents","Compressed","Applications","Code",  "Others"],
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
    tags: [{
      type: String,
      trim: true,
    }],
  },
  { timestamps: true }
);


const File = mongoose.model('File', fileSchema);
module.exports = File;
