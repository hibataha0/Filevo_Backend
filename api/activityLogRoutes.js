const express = require("express");
const { 
  getUserActivityLog,
  getActivityStatistics,
  clearOldActivityLogs
} = require("../services/activityLogService");
const { protect } = require("../services/authService");

const router = express.Router();

// ===== ACTIVITY LOG ROUTES =====

// Get user activity log
router.get("/", protect, getUserActivityLog);

// Get activity statistics
router.get("/statistics", protect, getActivityStatistics);

// Clear old activity logs
router.delete("/clear-old", protect, clearOldActivityLogs);

module.exports = router;





















