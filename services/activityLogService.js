const asyncHandler = require("express-async-handler");
const ActivityLog = require("../models/activityLogModel");

// Helper function to keep only last 100 activity logs per user
const keepLast100Logs = async (userId) => {
  try {
    // Count total logs for this user
    const totalLogs = await ActivityLog.countDocuments({ userId });

    // If more than 100, delete the oldest ones
    if (totalLogs > 100) {
      const logsToDelete = totalLogs - 100;

      // Get the oldest logs (sorted by createdAt ascending)
      const oldestLogs = await ActivityLog.find({ userId })
        .sort({ createdAt: 1 })
        .limit(logsToDelete)
        .select("_id");

      // Delete the oldest logs
      if (oldestLogs.length > 0) {
        const idsToDelete = oldestLogs.map((log) => log._id);
        await ActivityLog.deleteMany({ _id: { $in: idsToDelete } });
        console.log(
          `✅ Deleted ${oldestLogs.length} old activity logs for user ${userId}`
        );
      }
    }
  } catch (error) {
    console.error("Error cleaning old activity logs:", error);
  }
};

// Helper function to log activity
const logActivity = async (
  userId,
  action,
  entityType,
  entityId = null,
  entityName = null,
  details = {},
  metadata = {}
) => {
  try {
    await ActivityLog.create({
      userId,
      action,
      entityType,
      entityId,
      entityName,
      details,
      metadata: {
        ...metadata,
        timestamp: new Date(),
      },
    });

    // Keep only last 100 logs per user
    await keepLast100Logs(userId);
  } catch (error) {
    console.error("Error logging activity:", error);
  }
};

// @desc    Get user activity log (shows only last 100 logs)
// @route   GET /api/activity-log
// @access  Private
exports.getUserActivityLog = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Maximum 100 logs per user
  const maxLogs = 100;

  // Filtering parameters
  const action = req.query.action;
  const entityType = req.query.entityType;
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  // Build query
  const query = { userId };

  if (action) {
    query.action = action;
  }

  if (entityType) {
    query.entityType = entityType;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }

  // Get only the last 100 logs (most recent), then apply pagination
  // First, get all logs sorted, then limit to 100, then paginate
  const allRecentLogs = await ActivityLog.find(query)
    .sort({ createdAt: -1 })
    .limit(maxLogs) // Limit to last 100 logs only
    .populate("userId", "name email")
    .lean();

  // Apply pagination on the limited results
  const totalActivities = allRecentLogs.length;
  const paginatedLogs = allRecentLogs.slice(skip, skip + limit);

  const activities = paginatedLogs;

  // Format activities for response
  const formattedActivities = activities.map((activity) => ({
    _id: activity._id,
    action: activity.action,
    entityType: activity.entityType,
    entityId: activity.entityId,
    entityName: activity.entityName,
    details: activity.details,
    ipAddress: activity.ipAddress,
    userAgent: activity.userAgent,
    createdAt: activity.createdAt,
    metadata: activity.metadata,
  }));

  res.status(200).json({
    message: "Activity log retrieved successfully",
    activities: formattedActivities,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalActivities / limit),
      totalActivities: totalActivities,
      hasNext: page < Math.ceil(totalActivities / limit),
      hasPrev: page > 1,
    },
    filters: {
      action,
      entityType,
      startDate,
      endDate,
    },
  });
});

// @desc    Get activity statistics
// @route   GET /api/activity-log/statistics
// @access  Private
exports.getActivityStatistics = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const days = parseInt(req.query.days) || 30;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get activity counts by action
  const actionStats = await ActivityLog.aggregate([
    {
      $match: {
        userId: userId,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: "$action",
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  // Get activity counts by entity type
  const entityTypeStats = await ActivityLog.aggregate([
    {
      $match: {
        userId: userId,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: "$entityType",
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  // Get daily activity counts
  const dailyStats = await ActivityLog.aggregate([
    {
      $match: {
        userId: userId,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
    },
  ]);

  const totalActivities = await ActivityLog.countDocuments({
    userId: userId,
    createdAt: { $gte: startDate },
  });

  res.status(200).json({
    message: "Activity statistics retrieved successfully",
    statistics: {
      totalActivities,
      period: `${days} days`,
      actionStats,
      entityTypeStats,
      dailyStats,
    },
  });
});

// @desc    Clear old activity logs
// @route   DELETE /api/activity-log/clear-old
// @access  Private
exports.clearOldActivityLogs = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const daysToKeep = parseInt(req.query.days) || 90;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await ActivityLog.deleteMany({
    userId: userId,
    createdAt: { $lt: cutoffDate },
  });

  res.status(200).json({
    message: `✅ ${result.deletedCount} old activity logs cleared successfully`,
    deletedCount: result.deletedCount,
    cutoffDate: cutoffDate,
  });
});

// Export the logActivity function for use in other services
module.exports.logActivity = logActivity;
