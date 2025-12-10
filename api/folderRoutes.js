const express = require("express");
const {
  createFolder,
  uploadFolder,
  getFolderContents,
  getAllFolders,
  getAllItems,
  getFolderDetails,
  getRecentFolders,
  deleteFolder,
  restoreFolder,
  deleteFolderPermanent,
  getTrashFolders,
  cleanExpiredFolders,
  toggleStarFolder,
  getStarredFolders,
  updateFolder,
  shareFolder,
  updateFolderPermissions,
  unshareFolder,
  getFoldersSharedWithMe,
  getSharedFolderDetailsInRoom,
  moveFolder,
} = require("../services/folderService");
const { downloadFolder } = require("../services/fileService");
const { protect } = require("../services/authService");
const {
  uploadFolder: uploadFolderMiddleware,
} = require("../middlewares/uploadFolderMiddleware");

const router = express.Router();

// ===== FOLDER ROUTES =====

// Create new empty folder
router.post("/create", protect, createFolder);

// Upload folder with nested structure
router.post("/upload", protect, uploadFolderMiddleware, uploadFolder);

// Get all folders for user
router.get("/", protect, getAllFolders);

// Get recent folders
router.get("/recent", protect, getRecentFolders);

// Get all items (files + folders) for user
router.get("/all-items", protect, getAllItems);

// Get trash folders
router.get("/trash", protect, getTrashFolders);

// Get starred folders
router.get("/starred", protect, getStarredFolders);

// Get folders shared with me
router.get("/shared-with-me", protect, getFoldersSharedWithMe);

// Get shared folder details in room (must be before /:id)
router.get("/shared-in-room/:id", protect, getSharedFolderDetailsInRoom);

// Clean expired folders
router.delete("/clean-expired", protect, cleanExpiredFolders);

// Restore folder (must be before /:id)
router.put("/:id/restore", protect, restoreFolder);

// Delete folder permanently (must be before /:id)
router.delete("/:id/permanent", protect, deleteFolderPermanent);

// Toggle star folder (must be before /:id)
router.put("/:id/star", protect, toggleStarFolder);

// Folder sharing routes (must be before /:id)
router.post("/:id/share", protect, shareFolder);
router.put("/:id/share", protect, updateFolderPermissions);
router.delete("/:id/share", protect, unshareFolder);

// Update folder metadata (must be before delete and get routes)
router.put("/:id", protect, updateFolder);

// Delete folder (move to trash)
router.delete("/:id", protect, deleteFolder);

// Get folder contents (must be before /:id)
router.get("/:id/contents", protect, getFolderContents);

// Download folder as zip (must be before /:id)
router.get("/:id/download", protect, downloadFolder);

// Get folder details
router.get("/:id", protect, getFolderDetails);

module.exports = router;
