const asyncHandler = require("express-async-handler");
const Room = require("../models/roomModel");
const RoomInvitation = require("../models/roomInvitationModel");
const User = require("../models/userModel");
const ApiError = require("../utils/apiError");
const { logActivity } = require("./activityLogService");

// Helper function to clean up old invitations
const cleanupOldInvitations = async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const result = await RoomInvitation.deleteMany({
    status: { $in: ['accepted', 'rejected', 'cancelled'] },
    respondedAt: { $lt: thirtyDaysAgo }
  });
  
  return result.deletedCount;
};

// Export the cleanup function for direct use (without asyncHandler wrapper)
exports.cleanupOldInvitationsDirect = cleanupOldInvitations;

// @desc    Create new room
// @route   POST /api/rooms
// @access  Private
exports.createRoom = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { name, description } = req.body;

  if (!name) {
    return next(new ApiError('Room name is required', 400));
  }

  // Create room with owner as first member
  const room = await Room.create({
    name,
    description: description || "",
    owner: userId,
    members: [
      {
        user: userId,
        permission: "delete", // Owner has full access
        role: "owner",
      },
    ],
  });

  await room.populate('owner', 'name email');

  // Log activity
  await logActivity(userId, 'room_created', 'room', room._id, room.name, {
    description: room.description
  }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(201).json({
    message: "✅ Room created successfully",
    room: room
  });
});

// @desc    Send invitation to user
// @route   POST /api/rooms/:id/invite
// @access  Private
exports.sendInvitation = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;
  const { receiverId, permission, message } = req.body;

  if (!receiverId) {
    return next(new ApiError('Receiver ID is required', 400));
  }

  // Find room and check ownership or admin role
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  // Check if user is owner
  const isMember = room.members.find(
    m => m.user.toString() === userId.toString() && (m.role === 'owner')
  );
  
  if (!isMember) {
    return next(new ApiError('Only room owner or admin can send invitations', 403));
  }

  // Don't allow inviting yourself
  if (receiverId === userId.toString()) {
    return next(new ApiError('Cannot invite yourself', 400));
  }

  // Check if user exists
  const receiver = await User.findById(receiverId);
  if (!receiver) {
    return next(new ApiError('User not found', 404));
  }

  // Check if user is already a member
  const alreadyMember = room.members.find(
    m => m.user.toString() === receiverId
  );
  if (alreadyMember) {
    return next(new ApiError('User is already a member', 400));
  }

  // Check if there's already a pending invitation
  const existingInvitation = await RoomInvitation.findOne({
    room: roomId,
    receiver: receiverId,
    status: 'pending'
  });
  if (existingInvitation) {
    return next(new ApiError('Invitation already sent', 400));
  }

  // Create invitation
  const invitation = await RoomInvitation.create({
    room: roomId,
    sender: userId,
    receiver: receiverId,
    permission: permission || "view",
    message: message || "",
    status: 'pending'
  });

  await invitation.populate('receiver', 'name email');
  await invitation.populate('sender', 'name email');

  // Log activity
  await logActivity(userId, 'room_invitation_sent', 'room', roomId, room.name, {
    receiverId: receiverId,
    permission: permission || "view"
  }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(201).json({
    message: "✅ Invitation sent successfully",
    invitation: invitation
  });
});

// @desc    Accept invitation
// @route   PUT /api/rooms/invitations/:invitationId/accept
// @access  Private
exports.acceptInvitation = asyncHandler(async (req, res, next) => {
  const invitationId = req.params.invitationId;
  const userId = req.user._id;

  // Find invitation
  const invitation = await RoomInvitation.findById(invitationId)
    .populate('room')
    .populate('sender', 'name email')
    .populate('receiver', 'name email');

  if (!invitation) {
    return next(new ApiError('Invitation not found', 404));
  }

  // Check if invitation is for current user
  if (invitation.receiver._id.toString() !== userId.toString()) {
    return next(new ApiError('This invitation is not for you', 403));
  }

  // Check if invitation is pending
  if (invitation.status !== 'pending') {
    return next(new ApiError('Invitation already responded', 400));
  }

  // Add user to room members
  const room = await Room.findById(invitation.room._id);
  
  room.members.push({
    user: userId,
    permission: invitation.permission,
    role: 'viewer',
  });

  await room.save();

  // Update invitation status
  invitation.status = 'accepted';
  invitation.respondedAt = new Date();
  await invitation.save();

  await invitation.populate('room');

  // Log activity
  await logActivity(userId, 'room_invitation_accepted', 'room', room._id, room.name, {
    inviterId: invitation.sender._id
  }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: "✅ Invitation accepted successfully",
    room: room,
    invitation: invitation
  });
});

// @desc    Reject invitation
// @route   PUT /api/rooms/invitations/:invitationId/reject
// @access  Private
exports.rejectInvitation = asyncHandler(async (req, res, next) => {
  const invitationId = req.params.invitationId;
  const userId = req.user._id;

  // Find invitation
  const invitation = await RoomInvitation.findById(invitationId)
    .populate('sender', 'name email')
    .populate('receiver', 'name email')
    .populate('room');

  if (!invitation) {
    return next(new ApiError('Invitation not found', 404));
  }

  // Check if invitation is for current user
  if (invitation.receiver._id.toString() !== userId.toString()) {
    return next(new ApiError('This invitation is not for you', 403));
  }

  // Check if invitation is pending
  if (invitation.status !== 'pending') {
    return next(new ApiError('Invitation already responded', 400));
  }

  // Update invitation status
  invitation.status = 'rejected';
  invitation.respondedAt = new Date();
  await invitation.save();

  // Log activity
  await logActivity(userId, 'room_invitation_rejected', 'room', invitation.room._id, invitation.room.name, {}, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: "✅ Invitation rejected",
    invitation: invitation
  });
});

// @desc    Get user's rooms
// @route   GET /api/rooms
// @access  Private
exports.getMyRooms = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  const rooms = await Room.find({
    'members.user': userId,
    isActive: true
  })
    .populate('owner', 'name email')
    .populate('members.user', 'name email')
    .sort({ createdAt: -1 });

  res.status(200).json({
    message: "Rooms retrieved successfully",
    count: rooms.length,
    rooms: rooms
  });
});

// @desc    Get room details
// @route   GET /api/rooms/:id
// @access  Private
exports.getRoomDetails = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;

  const room = await Room.findById(roomId)
    .populate('owner', 'name email')
    .populate('members.user', 'name email')
    .populate('files.fileId')
    .populate('folders.folderId');

  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  // Check if user is a member
  const isMember = room.members.find(
    m => m.user._id.toString() === userId.toString()
  );
  
  if (!isMember) {
    return next(new ApiError('Access denied. You are not a member of this room', 403));
  }

  res.status(200).json({
    message: "Room details retrieved successfully",
    room: room
  });
});

// @desc    Get pending invitations
// @route   GET /api/rooms/invitations/pending
// @access  Private
exports.getPendingInvitations = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  const invitations = await RoomInvitation.find({
    receiver: userId,
    status: 'pending'
  })
    .populate('sender', 'name email')
    .populate('room', 'name description')
    .sort({ createdAt: -1 });

  res.status(200).json({
    message: "Pending invitations retrieved successfully",
    count: invitations.length,
    invitations: invitations
  });
});

// @desc    Update member permission
// @route   PUT /api/rooms/:id/members/:memberId
// @access  Private
exports.updateMemberPermission = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const memberId = req.params.memberId;
  const userId = req.user._id;
  const { permission, role } = req.body;

  // Find room
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  // Check if current user is owner
  const currentMember = room.members.find(
    m => m.user.toString() === userId.toString()
  );
  
  if (!currentMember || (currentMember.role !== 'owner')) {
    return next(new ApiError('Only owner can update member permissions', 403));
  }

  // Find target member
  const member = room.members.id(memberId);
  if (!member) {
    return next(new ApiError('Member not found', 404));
  }

  // Cannot change owner role/permission
  if (member.role === 'owner') {
    return next(new ApiError('Cannot change owner permissions', 400));
  }

  // Update permission
  if (permission) {
    if (!["view", "edit", "delete"].includes(permission)) {
      return next(new ApiError('Invalid permission', 400));
    }
    member.permission = permission;
  }

  // Update role
  if (role) {
    if (!["owner", "editor", "viewer", "commenter"].includes(role)) {
      return next(new ApiError('Invalid role', 400));
    }
    // Prevent assigning multiple owners: only owner can assign and not to self demote/upgrade silently here
    member.role = role;
  }

  await room.save();

  res.status(200).json({
    message: "✅ Member permissions updated successfully",
    room: room
  });
});

// @desc    Remove member from room
// @route   DELETE /api/rooms/:id/members/:memberId
// @access  Private
exports.removeMember = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const memberId = req.params.memberId;
  const userId = req.user._id;

  // Find room
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  // Check if current user is owner
  const currentMember = room.members.find(
    m => m.user.toString() === userId.toString()
  );
  
  if (!currentMember || (currentMember.role !== 'owner')) {
    return next(new ApiError('Only owner can remove members', 403));
  }

  // Find target member
  const member = room.members.id(memberId);
  if (!member) {
    return next(new ApiError('Member not found', 404));
  }

  // Cannot remove owner
  if (member.role === 'owner') {
    return next(new ApiError('Cannot remove room owner', 400));
  }

  // Remove member
  member.remove();
  await room.save();

  res.status(200).json({
    message: "✅ Member removed successfully",
    room: room
  });
});

// @desc    Share file with room
// @route   POST /api/rooms/:id/share-file
// @access  Private
exports.shareFileWithRoom = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;
  const { fileId } = req.body;

  if (!fileId) {
    return next(new ApiError('File ID is required', 400));
  }

  const File = require('../models/fileModel');
  
  // Find room
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  // Check if user is a member
  const isMember = room.members.find(
    m => m.user.toString() === userId.toString()
  );
  if (!isMember) {
    return next(new ApiError('You must be a room member to share files', 403));
  }

  // Find file
  const file = await File.findById(fileId);
  if (!file) {
    return next(new ApiError('File not found', 404));
  }

  // Check if file is already shared with this room
  const alreadyShared = room.files.find(
    f => f.fileId.toString() === fileId
  );
  if (alreadyShared) {
    return next(new ApiError('File already shared with this room', 400));
  }

  // Add file to room
  room.files.push({ fileId });
  await room.save();

  res.status(200).json({
    message: "✅ File shared with room successfully",
    room: room
  });
});

// @desc    Share folder with room
// @route   POST /api/rooms/:id/share-folder
// @access  Private
exports.shareFolderWithRoom = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;
  const { folderId } = req.body;

  if (!folderId) {
    return next(new ApiError('Folder ID is required', 400));
  }

  const Folder = require('../models/folderModel');
  
  // Find room
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  // Check if user is a member
  const isMember = room.members.find(
    m => m.user.toString() === userId.toString()
  );
  if (!isMember) {
    return next(new ApiError('You must be a room member to share folders', 403));
  }

  // Find folder
  const folder = await Folder.findById(folderId);
  if (!folder) {
    return next(new ApiError('Folder not found', 404));
  }

  // Check if folder is already shared with this room
  const alreadyShared = room.folders.find(
    f => f.folderId.toString() === folderId
  );
  if (alreadyShared) {
    return next(new ApiError('Folder already shared with this room', 400));
  }

  // Add folder to room
  room.folders.push({ folderId });
  await room.save();

  res.status(200).json({
    message: "✅ Folder shared with room successfully",
    room: room
  });
});

// ==========================
// Comments on files/folders
// ==========================

// @desc    Add comment to a file/folder in a room
// @route   POST /api/rooms/:id/comments
// @access  Private (room member: owner/editor/commenter)
exports.addComment = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;
  const { targetType, targetId, content } = req.body;

  if (!targetType || !["file", "folder"].includes(targetType)) {
    return next(new ApiError('Invalid or missing targetType', 400));
  }
  if (!targetId) {
    return next(new ApiError('targetId is required', 400));
  }
  if (!content || !content.trim()) {
    return next(new ApiError('content is required', 400));
  }

  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  const member = room.members.find(m => m.user.toString() === userId.toString());
  if (!member) {
    return next(new ApiError('You must be a room member to comment', 403));
  }

  if (!['owner', 'editor', 'commenter'].includes(member.role)) {
    return next(new ApiError('Your role does not allow adding comments', 403));
  }

  // verify target is shared within room
  if (targetType === 'file') {
    const exists = room.files.find(f => f.fileId.toString() === targetId);
    if (!exists) return next(new ApiError('File is not shared with this room', 404));
  } else {
    const exists = room.folders.find(f => f.folderId.toString() === targetId);
    if (!exists) return next(new ApiError('Folder is not shared with this room', 404));
  }

  const Comment = require('../models/commentModel');
  const comment = await Comment.create({
    room: roomId,
    targetType,
    targetId,
    user: userId,
    content: content.trim(),
  });

  await comment.populate('user', 'name email');

  await logActivity(userId, 'comment_added', targetType, targetId, undefined, { roomId }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(201).json({
    message: '✅ Comment added',
    comment,
  });
});

// @desc    List comments for a specific file/folder in a room
// @route   GET /api/rooms/:id/comments
// @access  Private (room members)
exports.listComments = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;
  const { targetType, targetId } = req.query;

  if (!targetType || !["file", "folder"].includes(targetType)) {
    return next(new ApiError('Invalid or missing targetType', 400));
  }
  if (!targetId) {
    return next(new ApiError('targetId is required', 400));
  }

  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  const member = room.members.find(m => m.user.toString() === userId.toString());
  if (!member) {
    return next(new ApiError('You must be a room member to view comments', 403));
  }

  // verify target is shared within room
  if (targetType === 'file') {
    const exists = room.files.find(f => f.fileId.toString() === targetId);
    if (!exists) return next(new ApiError('File is not shared with this room', 404));
  } else {
    const exists = room.folders.find(f => f.folderId.toString() === targetId);
    if (!exists) return next(new ApiError('Folder is not shared with this room', 404));
  }

  const Comment = require('../models/commentModel');
  const comments = await Comment.find({ room: roomId, targetType, targetId })
    .populate('user', 'name email')
    .sort({ createdAt: 1 });

  res.status(200).json({
    message: 'Comments retrieved successfully',
    count: comments.length,
    comments,
  });
});

// @desc    Delete a comment
// @route   DELETE /api/rooms/:id/comments/:commentId
// @access  Private (comment owner or room owner/editor)
exports.deleteComment = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;
  const { commentId } = req.params;

  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  const member = room.members.find(m => m.user.toString() === userId.toString());
  if (!member) {
    return next(new ApiError('You must be a room member to delete comments', 403));
  }

  const Comment = require('../models/commentModel');
  const comment = await Comment.findById(commentId);
  if (!comment || comment.room.toString() !== roomId.toString()) {
    return next(new ApiError('Comment not found', 404));
  }

  const isOwner = member.role === 'owner' || member.role === 'editor';
  const isAuthor = comment.user.toString() === userId.toString();
  if (!isOwner && !isAuthor) {
    return next(new ApiError('Not allowed to delete this comment', 403));
  }

  await comment.remove();

  await logActivity(userId, 'comment_deleted', comment.targetType, comment.targetId, undefined, { roomId }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: '✅ Comment deleted',
  });
});

// @desc    Cleanup old invitations (accepted/rejected/cancelled older than 30 days)
// @route   DELETE /api/rooms/invitations/cleanup
// @access  Private (Owner only)
exports.cleanupOldInvitations = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  // Check if user is admin (you might want to add an admin check here)
  // For now, allowing any authenticated user to cleanup
  const deletedCount = await cleanupOldInvitations();

  // Log activity
  await logActivity(userId, 'room_invitations_cleaned', 'system', null, null, {
    deletedCount: deletedCount
  }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: `✅ Cleaned up ${deletedCount} old invitations`,
    deletedCount: deletedCount
  });
});

// @desc    Get invitation statistics
// @route   GET /api/rooms/invitations/stats
// @access  Private
exports.getInvitationStats = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  const stats = await RoomInvitation.aggregate([
    {
      $facet: {
        total: [{ $count: "count" }],
        byStatus: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 }
            }
          }
        ],
        sentByMe: [
          { $match: { sender: userId } },
          { $count: "count" }
        ],
        receivedByMe: [
          { $match: { receiver: userId } },
          { $count: "count" }
        ]
      }
    }
  ]);

  res.status(200).json({
    message: "Invitation statistics retrieved successfully",
    stats: stats[0]
  });
});

