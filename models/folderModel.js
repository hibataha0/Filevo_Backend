const mongoose = require('mongoose');

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
    tags: [{
      type: String,
      trim: true,
    }],
  },
  { timestamps: true }
);

const Folder = mongoose.model('Folder', folderSchema);
module.exports = Folder;
