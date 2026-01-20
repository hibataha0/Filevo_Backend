const express = require("express");
const multer = require("multer");
const fs = require("fs");
const {
  uploadSingleFile,
  uploadMultipleFiles,
  getFilesByCategory,
  getFileDetails,
  getAllFiles,
  getRecentFiles,
  deleteFile,
  restoreFile,
  deleteFilePermanent,
  getTrashFiles,
  cleanExpiredFiles,
  cleanOrphanedFiles,
  toggleStarFile,
  getStarredFiles,
  updateFile,
  updateAllFolderSizes,
  shareFile,
  updateFilePermissions,
  unshareFile,
  getFilesSharedWithMe,
  getSharedFileDetailsInRoom,
  getCategoriesStats,
  moveFile,
  getRootCategoriesStats,
  downloadFile,
  downloadFolder,
  getStorageInfo,
} = require("../services/fileService");
const { protect } = require("../services/authService");
const {
  uploadSingleFile: uploadSingleFileMiddleware,
  uploadMultipleFiles: uploadMultipleFilesMiddleware,
} = require("../middlewares/uploadFilesMiddleware");

const router = express.Router();
const path = "my_files/";

// إنشاء المجلد إذا مش موجود
if (!fs.existsSync(path)) {
  fs.mkdirSync(path, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage });

// ===== FILE ROUTES =====

// Upload single file
router.post(
  "/upload-single",
  protect,
  uploadSingleFileMiddleware,
  uploadSingleFile,
);

// Upload multiple files
router.post(
  "/upload-multiple",
  protect,
  uploadMultipleFilesMiddleware,
  uploadMultipleFiles,
);

// Get all files for user
router.get("/", protect, getAllFiles);

// Get recent files
router.get("/recent", protect, getRecentFiles);

// Get files by category
router.get("/category/:category", protect, getFilesByCategory);

// Get categories statistics
router.get("/categories/stats", protect, getCategoriesStats);

// Get root categories statistics (must be before /:id)
router.get("/categories/stats/root", protect, getRootCategoriesStats);

// Get trash files
router.get("/trash", protect, getTrashFiles);

// Get starred files
router.get("/starred", protect, getStarredFiles);

// Get files shared with me
router.get("/shared-with-me", protect, getFilesSharedWithMe);

// Get storage info (must be before /:id)
router.get("/storage", protect, getStorageInfo);

// Get shared file details in room (must be before /:id)
router.get("/shared-in-room/:id", protect, getSharedFileDetailsInRoom);

// Clean expired files
router.delete("/clean-expired", protect, cleanExpiredFiles);

// Clean orphaned files (files on disk without DB record)
router.delete("/clean-orphaned", protect, cleanOrphanedFiles);

// Update all folder sizes
router.put("/update-folder-sizes", protect, updateAllFolderSizes);

// Restore file (must be before /:id)
router.put("/:id/restore", protect, restoreFile);

// Delete file permanently (must be before /:id)
router.delete("/:id/permanent", protect, deleteFilePermanent);

// Toggle star file (must be before /:id)
router.put("/:id/star", protect, toggleStarFile);

// Move file to another folder (must be before /:id)
router.put("/:id/move", protect, moveFile);

// File sharing routes (must be before /:id)
router.post("/:id/share", protect, shareFile);
router.put("/:id/share", protect, updateFilePermissions);
router.delete("/:id/share", protect, unshareFile);

// Update file metadata (must be before delete and get routes)
router.put("/:id", protect, updateFile);

// Delete file (move to trash)
router.delete("/:id", protect, deleteFile);

// Download file (must be before /:id)
router.get("/:id/download", protect, downloadFile);

// Get file details
router.get("/:id", protect, getFileDetails);

module.exports = router;
