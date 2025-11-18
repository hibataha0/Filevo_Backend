const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        // File operations
        'file_uploaded',
        'file_downloaded',
        'file_deleted',
        'file_restored',
        'file_permanently_deleted',
        'file_updated',
        'file_moved',
        'file_starred',
        'file_unstarred',
        'file_shared',
        'file_unshared',
        
        // Folder operations
        'folder_created',
        'folder_uploaded',
        'folder_deleted',
        'folder_restored',
        'folder_permanently_deleted',
        'folder_updated',
        'folder_moved',
        'folder_starred',
        'folder_unstarred',
        'folder_shared',
        'folder_unshared',
        
        // User operations
        'profile_updated',
        'password_changed',
        'email_changed',
        'account_deleted',
        
        // System operations
        'login',
        'logout',
        'password_reset_requested',
        'password_reset_completed'
      ]
    },
    entityType: {
      type: String,
      enum: ['file', 'folder', 'user', 'system'],
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    entityName: {
      type: String,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Index for better query performance
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
module.exports = ActivityLog;








