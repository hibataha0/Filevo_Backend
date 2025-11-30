const mongoose = require('mongoose');

const roomInvitationSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
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
    message: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled"],
      default: "pending",
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Index to ensure one pending invitation per room-user pair
roomInvitationSchema.index({ room: 1, receiver: 1, status: 1 });

const RoomInvitation = mongoose.model('RoomInvitation', roomInvitationSchema);
module.exports = RoomInvitation;
















