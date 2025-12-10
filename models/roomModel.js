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
<<<<<<< HEAD
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

=======
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        accessedAt: { type: Date, default: Date.now },
      },
    ],

    visibleForOwner: {   // ⬅⬅ أهم إضافة
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

>>>>>>> 860a30c53b40f831c172f90d8f1e93a908165e64
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

// Add indexes for better performance
<<<<<<< HEAD
roomSchema.index({ "members.user": 1, isActive: 1 });
roomSchema.index({ owner: 1 });
roomSchema.index({ createdAt: -1 });

const Room = mongoose.model("Room", roomSchema);
=======
roomSchema.index({ 'members.user': 1, isActive: 1 });
roomSchema.index({ owner: 1 });
roomSchema.index({ createdAt: -1 });

const Room = mongoose.model('Room', roomSchema);
>>>>>>> 860a30c53b40f831c172f90d8f1e93a908165e64
module.exports = Room;
