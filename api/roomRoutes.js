const express = require("express");
const {
  createRoom,
  sendInvitation,
  acceptInvitation,
  rejectInvitation,
  getMyRooms,
  getRoomDetails,
  getPendingInvitations,
  updateMemberPermission,
  removeMember,
  shareFileWithRoom,
  shareFolderWithRoom,
  addComment,
  listComments,
  deleteComment,
  cleanupOldInvitations,
  getInvitationStats
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

// Share folder with room
router.post("/:id/share-folder", protect, shareFolderWithRoom);

// Update member permission
router.put("/:id/members/:memberId", protect, updateMemberPermission);

// Remove member
router.delete("/:id/members/:memberId", protect, removeMember);

// Comments
router.post("/:id/comments", protect, addComment);
router.get("/:id/comments", protect, listComments);
router.delete("/:id/comments/:commentId", protect, deleteComment);

// Get room details (must be last)
router.get("/:id", protect, getRoomDetails);

module.exports = router;


