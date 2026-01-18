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
        'file_viewed',
        'file_accessed_onetime',
        'file_viewed_by_all_members',
        'file_downloaded_from_room',
        
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
      enum: ['file', 'folder', 'user', 'system', 'room'],
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

// ======================
// ✅ فهارس محسّنة لتحسين الأداء
// ======================

// 1. سجل نشاط المستخدم
activityLogSchema.index({ userId: 1, createdAt: -1 });

// 2. الاستعلامات حسب نوع الإجراء
activityLogSchema.index({ action: 1, createdAt: -1 });

// 3. البحث عن سجل نشاط كائن محدد
activityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

// 4. عمليات التنظيف (حذف السجلات القديمة)
activityLogSchema.index({ createdAt: 1 });

// 5. الاستعلامات المعقدة (مستخدم + إجراء)
activityLogSchema.index({ userId: 1, action: 1, createdAt: -1 });

// 6. تتبع نشاط الكائن (بدون ترتيب)
activityLogSchema.index({ entityType: 1, entityId: 1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
module.exports = ActivityLog;





















