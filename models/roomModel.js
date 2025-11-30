const mongoose = require('mongoose');

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
          required: false, // Not required for old shared files
        },
        sharedAt: {
          type: Date,
          default: Date.now,
        },
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

const Room = mongoose.model('Room', roomSchema);
module.exports = Room;


