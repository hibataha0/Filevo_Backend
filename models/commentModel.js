const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    targetType: {
      type: String,
      enum: ['file', 'folder'],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      trim: true,
      required: true,
    },
  },
  { timestamps: true }
);

commentSchema.index({ room: 1, targetType: 1, targetId: 1, createdAt: -1 });

const Comment = mongoose.model('Comment', commentSchema);
module.exports = Comment;








