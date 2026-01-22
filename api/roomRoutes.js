const express = require("express");
const {
  createRoom,
  sendInvitation,
  acceptInvitation,
  rejectInvitation,
  getMyRooms,
  getRoomDetails,
  getPendingInvitations,
  updateMemberRole,
  removeMember,
  deleteRoom,
  leaveRoom,
  shareFileWithRoom,
  shareFileWithRoomOneTime,
  shareFolderWithRoom,
  addComment,
  listComments,
  deleteComment,
  cleanupOldInvitations,
  getInvitationStats,
  viewRoomFile,
  removeFileFromRoom,
  removeFolderFromRoom,
  saveFileFromRoom,
  saveFolderFromRoom,
  updateRoom,
  downloadRoomFile,
  downloadRoomFolder,
  excludeFileFromRoom,
  excludeFolderFromRoom,
} = require("../services/roomService");
const { protect } = require("../services/authService");

const router = express.Router();

// ===== ROOM ROUTES =====

// Create new room
router.post("/", protect, createRoom);

// Get my rooms
router.get("/", protect, getMyRooms);

// Get pending invitations
router.get("/invitations/pending", protect, getPendingInvitations);

// Get invitation statistics
router.get("/invitations/stats", protect, getInvitationStats);

// Cleanup old invitations
router.delete("/invitations/cleanup", protect, cleanupOldInvitations);

// Accept invitation
router.put("/invitations/:invitationId/accept", protect, acceptInvitation);

// Reject invitation
router.put("/invitations/:invitationId/reject", protect, rejectInvitation);

// Send invitation
router.post("/:id/invite", protect, sendInvitation);

// Share file with room
router.post("/:id/share-file", protect, shareFileWithRoom);

// Share file with room (one-time access)
router.post("/:id/share-file-onetime", protect, shareFileWithRoomOneTime);

// Download room file (marks as accessed for one-time shares)
router.get("/:id/files/:fileId/download", protect, downloadRoomFile);

// View/Download room file (legacy endpoint - redirects to download)
router.get("/:id/files/:fileId/view", protect, viewRoomFile);

// Save file from room to user's account
router.post("/:id/files/:fileId/save", protect, saveFileFromRoom);

// Remove file from room
router.delete("/:id/files/:fileId", protect, removeFileFromRoom);

// Exclude file from room (hide inherited)
router.post("/:id/files/:fileId/exclude", protect, excludeFileFromRoom);

// Share folder with room
router.post("/:id/share-folder", protect, shareFolderWithRoom);

// Download folder from room as zip
router.get("/:id/folders/:folderId/download", protect, downloadRoomFolder);

// Save folder from room to user's account
router.post("/:id/folders/:folderId/save", protect, saveFolderFromRoom);

// Remove folder from room
router.delete("/:id/folders/:folderId", protect, removeFolderFromRoom);

// Exclude folder from room (hide inherited)
router.post("/:id/folders/:folderId/exclude", protect, excludeFolderFromRoom);

// Update member role
router.put("/:id/members/:memberId", protect, updateMemberRole);

// Remove member
router.delete("/:id/members/:memberId", protect, removeMember);

// Leave room (user removes themselves)
router.delete("/:id/leave", protect, leaveRoom);

// Comments
router.post("/:id/comments", protect, addComment);
router.get("/:id/comments", protect, listComments);
router.delete("/:id/comments/:commentId", protect, deleteComment);

// Update room (owner or editor only) - must be before DELETE and GET
router.put("/:id", protect, updateRoom);

// Delete room (owner only) - must be before GET /:id
router.delete("/:id", protect, deleteRoom);

// Get room details (must be last)
router.get("/:id", protect, getRoomDetails);

module.exports = router;
