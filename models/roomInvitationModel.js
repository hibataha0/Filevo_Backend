const mongoose = require("mongoose");

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
    canShare: {
      type: Boolean,
      default: false,
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

// ======================
// ✅ فهارس محسّنة لتحسين الأداء
// ======================

// 1. منع الدعوات المكررة - دعوة واحدة معلقة لكل غرفة-مستخدم (unique)
roomInvitationSchema.index({ room: 1, receiver: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });

// 2. دعوات المستخدم
roomInvitationSchema.index({ receiver: 1, status: 1, createdAt: -1 });

// 3. دعوات الغرفة
roomInvitationSchema.index({ room: 1, status: 1, createdAt: -1 });

// 4. الدعوات المرسلة
roomInvitationSchema.index({ sender: 1, status: 1, createdAt: -1 });

// 5. عمليات التنظيف (حذف الدعوات القديمة)
roomInvitationSchema.index({ status: 1, createdAt: 1 });

const RoomInvitation = mongoose.model("RoomInvitation", roomInvitationSchema);
module.exports = RoomInvitation;
