const asyncHandler = require("express-async-handler");
const Room = require("../models/roomModel");
const RoomInvitation = require("../models/roomInvitationModel");
const User = require("../models/userModel");
const ApiError = require("../utils/apiError");
const { logActivity } = require("./activityLogService");

// Helper function to get permissions based on role
const getPermissionsFromRole = (role) => {
  const rolePermissions = {
    owner: ['view', 'edit', 'delete', 'share'],
    editor: ['view', 'edit'],
    viewer: ['view'],
    commenter: ['view', 'comment']
  };
  return rolePermissions[role] || [];
};

// Helper function to check if role has specific permission
const hasPermission = (role, permission) => {
  const permissions = getPermissionsFromRole(role);
  return permissions.includes(permission);
};

// Export helper functions for use in other modules
exports.getPermissionsFromRole = getPermissionsFromRole;
exports.hasPermission = hasPermission;

// Helper function to clean up old invitations
const cleanupOldInvitations = async () => {
  try {
    // Check if mongoose is connected
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      console.log('Database not connected yet, skipping cleanup');
      return 0;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await RoomInvitation.deleteMany({
      status: { $in: ['accepted', 'rejected', 'cancelled'] },
      respondedAt: { $lt: thirtyDaysAgo }
    }, {
      maxTimeMS: 5000 // Set timeout to 5 seconds
    });
    
    return result.deletedCount;
  } catch (error) {
    console.error('Error in cleanupOldInvitations:', error.message);
    return 0; // Return 0 instead of throwing error
  }
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
  const { email, role, message } = req.body;

  if (!email) {
    return next(new ApiError('Email is required', 400));
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new ApiError('Invalid email format', 400));
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

  // Check if user exists by email
  const receiver = await User.findOne({ email: email.toLowerCase().trim() });
  if (!receiver) {
    return next(new ApiError('User not found with this email', 404));
  }

  // Don't allow inviting yourself
  if (receiver._id.toString() === userId.toString()) {
    return next(new ApiError('Cannot invite yourself', 400));
  }

  // Check if user is already a member
  const alreadyMember = room.members.find(
    m => m.user.toString() === receiver._id.toString()
  );
  if (alreadyMember) {
    return next(new ApiError('User is already a member', 400));
  }

  // Check if there's already a pending invitation
  const existingInvitation = await RoomInvitation.findOne({
    room: roomId,
    receiver: receiver._id,
    status: 'pending'
  });
  if (existingInvitation) {
    return next(new ApiError('Invitation already sent to this user', 400));
  }

  // Validate role if provided
  const validRoles = ["owner", "editor", "viewer", "commenter"];
  const invitationRole = role || "viewer";
  if (!validRoles.includes(invitationRole)) {
    return next(new ApiError('Invalid role. Must be one of: owner, editor, viewer, commenter', 400));
  }

  // Don't allow inviting as owner
  if (invitationRole === "owner") {
    return next(new ApiError('Cannot invite user as owner', 400));
  }

  // Create invitation
  const invitation = await RoomInvitation.create({
    room: roomId,
    sender: userId,
    receiver: receiver._id,
    role: invitationRole,
    message: message || "",
    status: 'pending'
  });

  await invitation.populate('receiver', 'name email');
  await invitation.populate('sender', 'name email');

  // Log activity
  await logActivity(userId, 'room_invitation_sent', 'room', roomId, room.name, {
    receiverEmail: email,
    receiverId: receiver._id,
    role: invitationRole
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
    role: invitation.role,
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

  try {
    const rooms = await Room.find({
      'members.user': userId,
      isActive: true
    })
      .select('-files -folders') // Exclude files and folders to reduce data size
      .populate({
        path: 'owner',
        select: 'name email',
        options: { maxTimeMS: 10000 } // Timeout after 10 seconds
      })
      .populate({
        path: 'members.user',
        select: 'name email',
        options: { maxTimeMS: 10000 } // Timeout after 10 seconds
      })
      .lean() // Use lean() for better performance
      .sort({ createdAt: -1 })
      .maxTimeMS(30000); // Overall timeout 30 seconds

    res.status(200).json({
      message: "Rooms retrieved successfully",
      count: rooms.length,
      rooms: rooms
    });
  } catch (error) {
    console.error('Error in getMyRooms:', error);
    // If timeout or query error, return empty array instead of crashing
    if (error.name === 'MongoTimeoutError' || error.message.includes('timeout')) {
      return res.status(200).json({
        message: "Rooms retrieved successfully (partial)",
        count: 0,
        rooms: [],
        warning: "Query timeout - please try again"
      });
    }
    throw error;
  }
});

// @desc    Get room details
// @route   GET /api/rooms/:id
// @access  Private
exports.getRoomDetails = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;

  // First check if user is a member (without loading all data)
  const roomCheck = await Room.findById(roomId)
    .select('members')
    .lean();
  
  if (!roomCheck) {
    return next(new ApiError('Room not found', 404));
  }

  const isMember = roomCheck.members.some(
    m => m.user.toString() === userId.toString()
  );
  
  if (!isMember) {
    return next(new ApiError('Access denied. You are not a member of this room', 403));
  }

  // Now load full room data with optimized populate
  // Also clean up one-time shared files that have been accessed
  const room = await Room.findById(roomId)
    .populate('owner', 'name email')
    .populate('members.user', 'name email')
    .populate({
      path: 'files.fileId',
      select: 'name type size category userId createdAt updatedAt', // Only select needed fields
      populate: {
        path: 'userId',
        select: 'name email'
      }
    })
    .populate({
      path: 'folders.folderId',
      select: 'name size userId createdAt updatedAt' // Only select needed fields
    })
    .lean(); // Use lean() for better performance
  
  // No cleanup needed - files stay in room, just hidden from users who accessed them

  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  // Process files: filter for regular users, but show all for file owners (until all members view it)
  const File = require('../models/fileModel');
  const processedFiles = [];
  
  console.log('🔍 [getRoomDetails] Processing files. Total files in room:', room.files.length);
  
  for (const fileEntry of room.files) {
    // Get file details to check ownership
    const file = fileEntry.fileId;
    // Handle both populated and lean() objects
    const fileUserId = file?.userId?._id?.toString() || file?.userId?.toString() || file?.userId;
    const isFileOwner = fileUserId === userId.toString();
    
    console.log('📄 [getRoomDetails] Processing file:', file?.name || 'unknown', 'isOneTimeShare:', fileEntry.isOneTimeShare, 'isFileOwner:', isFileOwner);
    
    // If it's a one-time share
    if (fileEntry.isOneTimeShare) {
      // Check if current user has already accessed it
      if (fileEntry.accessedBy && fileEntry.accessedBy.length > 0) {
        const userAccessed = fileEntry.accessedBy.some(
          access => {
            const accessUserId = access.user?._id?.toString() || access.user?.toString() || access.user;
            return accessUserId === userId.toString();
          }
        );
        // Hide file if user already accessed it
        if (userAccessed) {
          console.log('🚫 [getRoomDetails] User already accessed this one-time file, hiding it');
          continue; // Skip this file for this user
        }
      }
      
      // If user hasn't accessed it yet, show it
      console.log('✅ [getRoomDetails] One-time file not accessed by this user yet, showing it');
    }
    
    // Show the file
    console.log('✅ [getRoomDetails] Showing file to user');
    processedFiles.push(fileEntry);
  }
  
  console.log('📊 [getRoomDetails] Processed files count:', processedFiles.length, 'out of', room.files.length);

  // Update room files with processed list
  room.files = processedFiles;

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

// @desc    Update member role
// @route   PUT /api/rooms/:id/members/:memberId
// @access  Private
exports.updateMemberRole = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const memberId = req.params.memberId;
  const userId = req.user._id;
  const { role } = req.body;

  if (!role) {
    return next(new ApiError('Role is required', 400));
  }

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
    return next(new ApiError('Only owner can update member roles', 403));
  }

  // Find target member
  const member = room.members.id(memberId);
  if (!member) {
    return next(new ApiError('Member not found', 404));
  }

  // Cannot change owner role
  if (member.role === 'owner') {
    return next(new ApiError('Cannot change owner role', 400));
  }

  // Validate role
  if (!["owner", "editor", "viewer", "commenter"].includes(role)) {
    return next(new ApiError('Invalid role. Must be one of: owner, editor, viewer, commenter', 400));
  }

  // Prevent assigning owner role to other members
  if (role === 'owner') {
    return next(new ApiError('Cannot assign owner role to other members', 400));
  }

  // Update role
  member.role = role;
  await room.save();

  res.status(200).json({
    message: "✅ Member role updated successfully",
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

  // Check if current user is the room owner (من أنشأ الروم)
  const isRoomOwner = room.owner.toString() === userId.toString();

  // Check if current user has 'owner' or 'admin' role in members
  const currentMember = room.members.find(
    m => m.user.toString() === userId.toString()
  );
  const hasOwnerRole = currentMember && currentMember.role === 'owner';
  const hasAdminRole = currentMember && currentMember.role === 'admin';

  // السماح لمالك الروم (من أنشأ الروم) أو من له role 'owner' أو 'admin' في الـ members بحذف الأعضاء
  if (!isRoomOwner && !hasOwnerRole && !hasAdminRole) {
    return next(new ApiError('Only room owner, member with owner role, or admin can remove members', 403));
  }

  // Find target member
  const member = room.members.id(memberId);
  if (!member) {
    return next(new ApiError('Member not found', 404));
  }

  // Cannot remove the room owner (من أنشأ الروم)
  const isTargetMemberRoomOwner = room.owner.toString() === member.user.toString();
  if (isTargetMemberRoomOwner) {
    return next(new ApiError('Cannot remove room owner', 400));
  }

  // Cannot remove member with 'owner' role unless you are the room owner
  // (من له role 'owner' لا يمكن حذفه إلا من قبل مالك الروم الأصلي)
  // هذا ينطبق على من له role 'owner' أو 'admin' - فقط مالك الروم يمكنه حذف عضو له role 'owner'
  if (member.role === 'owner' && !isRoomOwner) {
    return next(new ApiError('Only room owner can remove members with owner role', 403));
  }

  // Remove member from array
  // استخدام filter() لحذف العضو من المصفوفة
  room.members = room.members.filter(
    m => m._id.toString() !== memberId.toString()
  );
  
  // بديل آخر إذا لم يعمل filter() (استخدم أحد الطريقتين):
  // room.members.pull(memberId);
  
  await room.save();

  res.status(200).json({
    message: "✅ Member removed successfully",
    room: room
  });
});

// @desc    Delete room
// @route   DELETE /api/rooms/:id
// @access  Private (owner only)
exports.deleteRoom = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;

  // Find room
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  // Check if current user is the room owner
  if (room.owner.toString() !== userId.toString()) {
    return next(new ApiError('Only room owner can delete the room', 403));
  }

  // Delete all invitations related to this room
  await RoomInvitation.deleteMany({ room: roomId });

  // Delete all comments related to this room
  const Comment = require('../models/commentModel');
  await Comment.deleteMany({ room: roomId });

  // Delete the room
  await Room.findByIdAndDelete(roomId);

  // Log activity
  await logActivity(userId, 'room_deleted', 'room', roomId, room.name, {}, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: "✅ Room deleted successfully"
  });
});

// @desc    Leave room (user removes themselves from room)
// @route   DELETE /api/rooms/:id/leave
// @access  Private
exports.leaveRoom = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;

  // Find room
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  // Check if user is a member
  const member = room.members.find(
    m => m.user.toString() === userId.toString()
  );
  
  if (!member) {
    return next(new ApiError('You are not a member of this room', 403));
  }

  // Cannot leave if you are the room owner
  if (room.owner.toString() === userId.toString()) {
    return next(new ApiError('Room owner cannot leave. Please delete the room instead or transfer ownership', 400));
  }

  // Remove member from array
  room.members = room.members.filter(
    m => m.user.toString() !== userId.toString()
  );
  
  await room.save();

  // Log activity
  await logActivity(userId, 'room_left', 'room', roomId, room.name, {}, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: "✅ You have left the room successfully",
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
  room.files.push({ fileId, sharedBy: userId });
  await room.save();

  res.status(200).json({
    message: "✅ File shared with room successfully",
    room: room
  });
});

// @desc    Share file with room (one-time access)
// @route   POST /api/rooms/:id/share-file-onetime
// @access  Private
exports.shareFileWithRoomOneTime = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;
  const { fileId, expiresInHours } = req.body;

  console.log('📤 [shareFileWithRoomOneTime] Starting - roomId:', roomId, 'fileId:', fileId, 'userId:', userId);

  if (!fileId) {
    console.log('❌ [shareFileWithRoomOneTime] File ID is required');
    return next(new ApiError("File ID is required", 400));
  }

  const File = require("../models/fileModel");
  const room = await Room.findById(roomId);
  if (!room) {
    console.log('❌ [shareFileWithRoomOneTime] Room not found');
    return next(new ApiError("Room not found", 404));
  }

  const isMember = room.members.some(
    m => m.user.toString() === userId.toString()
  );
  if (!isMember) {
    console.log('❌ [shareFileWithRoomOneTime] User is not a member');
    return next(new ApiError("You must be a room member to share files", 403));
  }

  const file = await File.findById(fileId);
  if (!file) {
    console.log('❌ [shareFileWithRoomOneTime] File not found');
    return next(new ApiError("File not found", 404));
  }

  const alreadyShared = room.files.some(
    f => f.fileId.toString() === fileId.toString()
  );
  if (alreadyShared) {
    console.log('❌ [shareFileWithRoomOneTime] File already shared with this room');
    return next(new ApiError("File already shared with this room", 400));
  }

  const hours = expiresInHours || 24;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  console.log('✅ [shareFileWithRoomOneTime] Adding file to room with one-time share flag');
  console.log('📋 [shareFileWithRoomOneTime] Files in room before:', room.files.length);
  
  room.files.push({
    fileId,
    sharedBy: userId,
    isOneTimeShare: true,
    expiresAt,
    accessedBy: [],  // IMPORTANT
    accessCount: 0
  });

  await room.save();
  console.log('✅ [shareFileWithRoomOneTime] File added successfully. Files in room after:', room.files.length);

  res.status(200).json({
    message: "File shared (one-time)",
    expiresAt,
    room
  });
});
;

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
  room.folders.push({ folderId, sharedBy: userId });
  await room.save();

  res.status(200).json({
    message: "✅ Folder shared with room successfully",
    room: room
  });
});

// ==========================
// Comments on files/folders
// ==========================

// @desc    Add comment to a file/folder/room in a room
// @route   POST /api/rooms/:id/comments
// @access  Private (room member: owner/editor/commenter)
exports.addComment = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;
  const { targetType, targetId, content } = req.body;

  if (!targetType || !["file", "folder", "room"].includes(targetType)) {
    return next(new ApiError('Invalid or missing targetType. Must be "file", "folder", or "room"', 400));
  }
  
  // targetId is required for file and folder, but not for room
  if (targetType !== 'room' && !targetId) {
    return next(new ApiError('targetId is required for file and folder comments', 400));
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

  // verify target is shared within room (only for file/folder, not for room)
  if (targetType === 'file') {
    const exists = room.files.find(f => f.fileId.toString() === targetId);
    if (!exists) return next(new ApiError('File is not shared with this room', 404));
  } else if (targetType === 'folder') {
    const exists = room.folders.find(f => f.folderId.toString() === targetId);
    if (!exists) return next(new ApiError('Folder is not shared with this room', 404));
  }
  // For targetType === 'room', no validation needed

  const Comment = require('../models/commentModel');
  const comment = await Comment.create({
    room: roomId,
    targetType,
    targetId: targetType === 'room' ? null : targetId, // null for room comments
    user: userId,
    content: content.trim(),
  });

  await comment.populate('user', 'name email');

  await logActivity(userId, 'comment_added', targetType, targetId || roomId, undefined, { roomId }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(201).json({
    message: '✅ Comment added',
    comment,
  });
});

// @desc    List comments for a specific file/folder/room in a room
// @route   GET /api/rooms/:id/comments
// @access  Private (room members)
exports.listComments = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;
  const { targetType, targetId } = req.query;

  if (!targetType || !["file", "folder", "room"].includes(targetType)) {
    return next(new ApiError('Invalid or missing targetType. Must be "file", "folder", or "room"', 400));
  }
  
  // targetId is required for file and folder, but not for room
  if (targetType !== 'room' && !targetId) {
    return next(new ApiError('targetId is required for file and folder comments', 400));
  }

  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  const member = room.members.find(m => m.user.toString() === userId.toString());
  if (!member) {
    return next(new ApiError('You must be a room member to view comments', 403));
  }

  // verify target is shared within room (only for file/folder, not for room)
  if (targetType === 'file') {
    const exists = room.files.find(f => f.fileId.toString() === targetId);
    if (!exists) return next(new ApiError('File is not shared with this room', 404));
  } else if (targetType === 'folder') {
    const exists = room.folders.find(f => f.folderId.toString() === targetId);
    if (!exists) return next(new ApiError('Folder is not shared with this room', 404));
  }
  // For targetType === 'room', no validation needed

  const Comment = require('../models/commentModel');
  const query = { 
    room: roomId, 
    targetType,
    ...(targetType === 'room' ? { targetId: null } : { targetId })
  };
  
  const comments = await Comment.find(query)
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
})

exports.removeFileFromRoom = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const fileId = req.params.fileId;
  const userId = req.user._id;

  // Find room
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError('Room not found', 404));
  }

  // Check if current user is the room owner (من أنشأ الروم)
  const isRoomOwner = room.owner.toString() === userId.toString();

  // Check if current user has 'owner' or 'admin' role in members
  const currentMember = room.members.find(
    m => m.user.toString() === userId.toString()
  );
  const hasOwnerRole = currentMember && currentMember.role === 'owner';
  const hasAdminRole = currentMember && currentMember.role === 'admin';

  // Find target file in room
  const fileIndex = room.files.findIndex(
    f => f.fileId.toString() === fileId.toString()
  );
  
  if (fileIndex === -1) {
    return next(new ApiError('File not found in room', 404));
  }

  const file = room.files[fileIndex];

  // Check if current user is the one who shared the file (sharedBy)
  const isFileSharer = file.sharedBy && file.sharedBy.toString() === userId.toString();

  // السماح لمالك الروم أو من شارك الملف أو من له role 'owner' أو 'admin' بإزالة الملف
  if (!isRoomOwner && !isFileSharer && !hasOwnerRole && !hasAdminRole) {
    return next(new ApiError('Only room owner, file sharer, member with owner role, or admin can remove files', 403));
  }

  // Remove file from array
  room.files = room.files.filter(
    f => f.fileId.toString() !== fileId.toString()
  );
  
  await room.save();

  res.status(200).json({
    message: "✅ File removed from room successfully",
    room: room
  });
});

// @desc    Access one-time shared file (each user can access once)
// @route   GET /api/rooms/:id/files/:fileId/access
// @access  Private

exports.accessOneTimeFile = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const fileId = req.params.fileId;
  const userId = req.user._id;

  console.log('🔍 [accessOneTimeFile] Starting - roomId:', roomId, 'fileId:', fileId, 'userId:', userId);

  const room = await Room.findById(roomId);
  if (!room) {
    console.log('❌ [accessOneTimeFile] Room not found');
    return next(new ApiError("Room not found", 404));
  }

  const isMember = room.members.some(m => m.user.toString() === userId.toString());
  if (!isMember) {
    console.log('❌ [accessOneTimeFile] User is not a member');
    return next(new ApiError("You must be a room member", 403));
  }

  const fileEntry = room.files.find(f => f.fileId.toString() === fileId.toString());
  if (!fileEntry) {
    console.log('❌ [accessOneTimeFile] File not found in room. Files count:', room.files.length);
    return next(new ApiError("File not found in this room", 404));
  }

  console.log('✅ [accessOneTimeFile] File entry found, isOneTimeShare:', fileEntry.isOneTimeShare);

  // Check expiration
  if (fileEntry.expiresAt && new Date() > fileEntry.expiresAt) {
    console.log('⚠️ [accessOneTimeFile] File expired, removing...');
    room.files = room.files.filter(f => f.fileId.toString() !== fileId);
    await room.save();
    return next(new ApiError("File access expired", 410));
  }

  // One-time file?
  if (fileEntry.isOneTimeShare) {
    console.log('📋 [accessOneTimeFile] Processing one-time share file');

    if (!fileEntry.accessedBy) fileEntry.accessedBy = [];

    // Check if user already viewed
    const alreadyViewed = fileEntry.accessedBy.some(
      a => a.user.toString() === userId.toString()
    );
    if (alreadyViewed) {
      console.log('❌ [accessOneTimeFile] User already accessed this file');
      return next(new ApiError("You already accessed this file (one-time)", 403));
    }

    console.log('✅ [accessOneTimeFile] User can access, adding to accessedBy...');
    // Add user to accessed list
    fileEntry.accessedBy.push({ user: userId, accessedAt: new Date() });
    
    // Update access count
    fileEntry.accessCount = (fileEntry.accessCount || 0) + 1;
    fileEntry.accessedAt = new Date();

    console.log('📊 [accessOneTimeFile] Access count:', fileEntry.accessCount, 'accessedBy length:', fileEntry.accessedBy.length);

    // Fetch the actual file
    const File = require("../models/fileModel");
    const file = await File.findById(fileId);
    if (!file) {
      console.log('❌ [accessOneTimeFile] File not found in DB');
      return next(new ApiError("File not found in DB", 404));
    }

    console.log('💾 [accessOneTimeFile] Saving room with updated accessedBy...');
    // Save room with updated accessedBy (file stays in room, just marked as accessed)
    await room.save();
    console.log('✅ [accessOneTimeFile] Room saved successfully. File remains in room but hidden from this user.');

    // Log activity for current user
    await logActivity(userId, 'file_accessed_onetime', 'room', roomId, room.name, {
      fileId: fileId,
      fileName: file.name
    }, {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }).catch(err => {
      // Don't fail the request if logging fails
      console.error('Error logging activity:', err);
    });

    return res.status(200).json({
      message: "✅ File accessed (one-time share - you can only access this file once)",
      oneTime: true,
      hideFromThisUser: true,
      fileRemovedFromRoom: false, // File stays in room
      accessCount: fileEntry.accessCount,
      file
    });
  }

  // NORMAL FILE
  const File = require("../models/fileModel");
  const file = await File.findById(fileId);

  return res.status(200).json({
    message: "File accessed",
    oneTime: false,
    file
  });
});


