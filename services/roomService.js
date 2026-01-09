const asyncHandler = require("express-async-handler");
const Room = require("../models/roomModel");
const RoomInvitation = require("../models/roomInvitationModel");
const User = require("../models/userModel");
const ApiError = require("../utils/apiError");
const { logActivity } = require("./activityLogService");
const { transformUserProfileImage } = require("../utils/profileImageHelper");

// Helper function to get permissions based on role
const getPermissionsFromRole = (role) => {
  const rolePermissions = {
    owner: ["view", "edit", "delete", "share"],
    editor: ["view", "edit"],
    viewer: ["view"],
    commenter: ["view", "comment"],
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
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState !== 1) {
      console.log("Database not connected yet, skipping cleanup");
      return 0;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await RoomInvitation.deleteMany(
      {
        status: { $in: ["accepted", "rejected", "cancelled"] },
        respondedAt: { $lt: thirtyDaysAgo },
      },
      {
        maxTimeMS: 5000, // Set timeout to 5 seconds
      }
    );

    return result.deletedCount;
  } catch (error) {
    console.error("Error in cleanupOldInvitations:", error.message);
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
    return next(new ApiError("Room name is required", 400));
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

  await room.populate("owner", "name email");

  // Log activity
  await logActivity(
    userId,
    "room_created",
    "room",
    room._id,
    room.name,
    {
      description: room.description,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(201).json({
    message: "✅ Room created successfully",
    room: room,
  });
});

// @desc    Update room details (name and description)
// @route   PUT /api/rooms/:id
// @access  Private (owner or editor only)
exports.updateRoom = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;
  const { name, description } = req.body;

  // Find room
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is the room owner
  const isRoomOwner = room.owner.toString() === userId.toString();

  // Check if user is a member with editor role
  const member = room.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  const isEditor = member && member.role === "editor";

  // Only owner or editor can update room
  if (!isRoomOwner && !isEditor) {
    return next(
      new ApiError(
        "Only room owner or members with editor role can update room details",
        403
      )
    );
  }

  // Update room fields if provided
  if (name !== undefined) {
    if (!name || name.trim() === "") {
      return next(new ApiError("Room name cannot be empty", 400));
    }
    room.name = name.trim();
  }

  if (description !== undefined) {
    room.description = description ? description.trim() : "";
  }

  await room.save();

  // Populate owner and members for response
  await room.populate("owner", "name email profileImg");
  await room.populate("members.user", "name email profileImg");

  // Transform profile images to full URLs
  if (room.owner) {
    room.owner = transformUserProfileImage(room.owner, req);
  }
  if (room.members && room.members.length > 0) {
    room.members = room.members.map((member) => ({
      ...member.toObject(),
      user: member.user
        ? transformUserProfileImage(member.user, req)
        : member.user,
    }));
  }

  // Log activity
  await logActivity(
    userId,
    "room_updated",
    "room",
    room._id,
    room.name,
    {
      updatedFields: {
        name: name !== undefined,
        description: description !== undefined,
      },
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: "✅ Room updated successfully",
    room: room,
  });
});

// @desc    Send invitation to user
// @route   POST /api/rooms/:id/invite
// @access  Private
exports.sendInvitation = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;
  const { email, role, canShare, message } = req.body;

  if (!email) {
    return next(new ApiError("Email is required", 400));
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new ApiError("Invalid email format", 400));
  }

  // Find room and check ownership
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is the room owner (only owner can send invitations)
  // Handle both ObjectId and populated owner
  const roomOwnerId = room.owner._id
    ? room.owner._id.toString()
    : room.owner.toString();
  const isRoomOwner = roomOwnerId === userId.toString();

  if (!isRoomOwner) {
    return next(new ApiError("Only room owner can send invitations", 403));
  }

  // Check if user exists by email
  const receiver = await User.findOne({ email: email.toLowerCase().trim() });
  if (!receiver) {
    return next(new ApiError("User not found with this email", 404));
  }

  // Don't allow inviting yourself
  if (receiver._id.toString() === userId.toString()) {
    return next(new ApiError("Cannot invite yourself", 400));
  }

  // Check if user is already a member
  const alreadyMember = room.members.find(
    (m) => m.user.toString() === receiver._id.toString()
  );
  if (alreadyMember) {
    return next(new ApiError("User is already a member", 400));
  }

  // Check if there's already a pending invitation
  const existingInvitation = await RoomInvitation.findOne({
    room: roomId,
    receiver: receiver._id,
    status: "pending",
  });
  if (existingInvitation) {
    return next(new ApiError("Invitation already sent to this user", 400));
  }

  // Validate role if provided
  const validRoles = ["owner", "editor", "viewer", "commenter"];
  const invitationRole = role || "viewer";
  if (!validRoles.includes(invitationRole)) {
    return next(
      new ApiError(
        "Invalid role. Must be one of: owner, editor, viewer, commenter",
        400
      )
    );
  }

  // Don't allow inviting as owner
  if (invitationRole === "owner") {
    return next(new ApiError("Cannot invite user as owner", 400));
  }

  // Validate canShare if provided (default to false)
  const invitationCanShare = canShare === true || canShare === "true";

  // Create invitation
  const invitation = await RoomInvitation.create({
    room: roomId,
    sender: userId,
    receiver: receiver._id,
    role: invitationRole,
    canShare: invitationCanShare,
    message: message || "",
    status: "pending",
  });

  try {
    await invitation.populate("receiver", "name email profileImg");
    await invitation.populate("sender", "name email profileImg");

    // Transform profile images to full URLs
    if (invitation.receiver) {
      invitation.receiver = transformUserProfileImage(invitation.receiver, req);
    }
    if (invitation.sender) {
      invitation.sender = transformUserProfileImage(invitation.sender, req);
    }
  } catch (populateError) {
    console.error("Error populating invitation:", populateError);
    // Continue even if populate fails
  }

  // Log activity (don't block response if logging fails)
  logActivity(
    userId,
    "room_invitation_sent",
    "room",
    roomId,
    room.name,
    {
      receiverEmail: email,
      receiverId: receiver._id,
      role: invitationRole,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  ).catch((logError) => {
    console.error("Error logging invitation activity:", logError);
  });

  res.status(201).json({
    message: "✅ Invitation sent successfully",
    invitation: invitation,
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
    .populate("room")
    .populate("sender", "name email profileImg")
    .populate("receiver", "name email profileImg");

  if (!invitation) {
    return next(new ApiError("Invitation not found", 404));
  }

  // Transform profile images to full URLs
  if (invitation.sender) {
    invitation.sender = transformUserProfileImage(invitation.sender, req);
  }
  if (invitation.receiver) {
    invitation.receiver = transformUserProfileImage(invitation.receiver, req);
  }

  // Check if invitation is for current user
  if (invitation.receiver._id.toString() !== userId.toString()) {
    return next(new ApiError("This invitation is not for you", 403));
  }

  // Check if invitation is pending
  if (invitation.status !== "pending") {
    return next(new ApiError("Invitation already responded", 400));
  }

  // Add user to room members
  const room = await Room.findById(invitation.room._id);

  room.members.push({
    user: userId,
    role: invitation.role,
    canShare: invitation.canShare || false,
  });

  await room.save();

  // Update invitation status
  invitation.status = "accepted";
  invitation.respondedAt = new Date();
  await invitation.save();

  await invitation.populate("room");

  // Log activity
  await logActivity(
    userId,
    "room_invitation_accepted",
    "room",
    room._id,
    room.name,
    {
      inviterId: invitation.sender._id,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: "✅ Invitation accepted successfully",
    room: room,
    invitation: invitation,
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
    .populate("sender", "name email profileImg")
    .populate("receiver", "name email profileImg")
    .populate("room");

  if (!invitation) {
    return next(new ApiError("Invitation not found", 404));
  }

  // Transform profile images to full URLs
  if (invitation.sender) {
    invitation.sender = transformUserProfileImage(invitation.sender, req);
  }
  if (invitation.receiver) {
    invitation.receiver = transformUserProfileImage(invitation.receiver, req);
  }

  // Check if invitation is for current user
  if (invitation.receiver._id.toString() !== userId.toString()) {
    return next(new ApiError("This invitation is not for you", 403));
  }

  // Check if invitation is pending
  if (invitation.status !== "pending") {
    return next(new ApiError("Invitation already responded", 400));
  }

  // Update invitation status
  invitation.status = "rejected";
  invitation.respondedAt = new Date();
  await invitation.save();

  // Log activity
  await logActivity(
    userId,
    "room_invitation_rejected",
    "room",
    invitation.room._id,
    invitation.room.name,
    {},
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: "✅ Invitation rejected",
    invitation: invitation,
  });
});

// @desc    Get user's rooms
// @route   GET /api/rooms
// @access  Private
exports.getMyRooms = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  try {
    const rooms = await Room.find({
      "members.user": userId,
      isActive: true,
    })
      .select(
        "name description owner members files folders createdAt updatedAt isActive"
      ) // ✅ إضافة files و folders للحصول على العدد
      .populate({
        path: "owner",
        select: "name email profileImg",
        options: { maxTimeMS: 10000 },
      })
      .populate({
        path: "members.user",
        select: "name email profileImg",
        options: { maxTimeMS: 10000 },
      })
      .lean()
      .sort({ createdAt: -1 })
      .maxTimeMS(30000);

    // ✅ حساب عدد الملفات والمجلدات لكل غرفة
    const roomsWithCounts = rooms.map((room) => {
      const filesCount = room.files ? room.files.length : 0;
      const foldersCount = room.folders ? room.folders.length : 0;

      // ✅ إزالة files و folders من الـ response لتقليل حجم البيانات
      const { files, folders, ...roomWithoutDetails } = room;

      return {
        ...roomWithoutDetails,
        filesCount: filesCount,
        foldersCount: foldersCount,
      };
    });

    // Transform profile images to full URLs for all rooms
    const roomsWithProfileImages = roomsWithCounts.map((room) => {
      const transformedRoom = { ...room };

      if (room.owner) {
        transformedRoom.owner = transformUserProfileImage(room.owner, req);
      }
      if (room.members && room.members.length > 0) {
        transformedRoom.members = room.members.map((member) => ({
          ...member,
          user: member.user
            ? transformUserProfileImage(member.user, req)
            : member.user,
        }));
      }

      return transformedRoom;
    });

    res.status(200).json({
      message: "Rooms retrieved successfully",
      count: roomsWithProfileImages.length,
      rooms: roomsWithProfileImages,
    });
  } catch (error) {
    console.error("Error in getMyRooms:", error);
    if (
      error.name === "MongoTimeoutError" ||
      error.message.includes("timeout")
    ) {
      return res.status(200).json({
        message: "Rooms retrieved successfully (partial)",
        count: 0,
        rooms: [],
        warning: "Query timeout - please try again",
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
  const roomCheck = await Room.findById(roomId).select("members").lean();

  if (!roomCheck) {
    return next(new ApiError("Room not found", 404));
  }

  const isMember = roomCheck.members.some(
    (m) => m.user.toString() === userId.toString()
  );

  if (!isMember) {
    return next(
      new ApiError("Access denied. You are not a member of this room", 403)
    );
  }

  // Now load full room data with optimized populate
  // Also clean up one-time shared files that have been accessed
  const room = await Room.findById(roomId)
    .populate("owner", "name email profileImg")
    .populate("members.user", "name email profileImg")
    .populate({
      path: "files.fileId",
      select:
        "name type size category userId createdAt updatedAt isStarred path", // ✅ إضافة isStarred و path
      populate: {
        path: "userId",
        select: "name email profileImg",
      },
    })
    .populate({
      path: "folders.folderId",
      select: "name size userId createdAt updatedAt isStarred", // ✅ إضافة isStarred
    })
    .lean(); // Use lean() for better performance

  // No cleanup needed - files stay in room, just hidden from users who accessed them

  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Process files: filter one-time shared files that user already accessed
  const processedFiles = [];

  for (const fileEntry of room.files) {
    const file = fileEntry.fileId;

    // Skip if file is null or undefined
    if (!file) {
      continue;
    }

    // If it's a one-time share, check if user already accessed it
    if (fileEntry.isOneTimeShare) {
      // Check if file has expired
      if (fileEntry.expiresAt && new Date() > new Date(fileEntry.expiresAt)) {
        continue; // Skip expired files
      }

      // Check if current user has already accessed it
      const userAccessed =
        fileEntry.accessedBy &&
        fileEntry.accessedBy.some((access) => {
          const accessUserId =
            (access.user &&
              (access.user._id
                ? access.user._id.toString()
                : access.user.toString())) ||
            access.user;
          return accessUserId === userId.toString();
        });

      // Hide file if user already accessed it (one-time access only)
      if (userAccessed) {
        continue; // Skip this file for this user
      }
    }

    // Show the file (either not one-time share, or one-time share not accessed yet)
    processedFiles.push(fileEntry);
  }

  // Update room files with processed list
  room.files = processedFiles;

  // Transform profile images to full URLs
  if (room.owner) {
    room.owner = transformUserProfileImage(room.owner, req);
  }
  if (room.members && room.members.length > 0) {
    room.members = room.members.map((member) => ({
      ...member,
      user: member.user
        ? transformUserProfileImage(member.user, req)
        : member.user,
    }));
  }
  // Transform profile images in files
  if (room.files && room.files.length > 0) {
    room.files = room.files.map((fileEntry) => {
      if (fileEntry.fileId && fileEntry.fileId.userId) {
        fileEntry.fileId.userId = transformUserProfileImage(
          fileEntry.fileId.userId,
          req
        );
      }
      return fileEntry;
    });
  }

  res.status(200).json({
    message: "Room details retrieved successfully",
    room: room,
  });
});
// @desc    Get pending invitations
// @route   GET /api/rooms/invitations/pending
// @access  Private
exports.getPendingInvitations = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  const invitations = await RoomInvitation.find({
    receiver: userId,
    status: "pending",
  })
    .populate("sender", "name email profileImg")
    .populate("room", "name description")
    .sort({ createdAt: -1 });

  // Transform profile images to full URLs
  const transformedInvitations = invitations.map((invitation) => {
    const invObj = invitation.toObject ? invitation.toObject() : invitation;
    if (invObj.sender) {
      invObj.sender = transformUserProfileImage(invObj.sender, req);
    }
    return invObj;
  });

  res.status(200).json({
    message: "Pending invitations retrieved successfully",
    count: transformedInvitations.length,
    invitations: transformedInvitations,
  });
});

// @desc    Update member role and canShare permission
// @route   PUT /api/rooms/:id/members/:memberId
// @access  Private
exports.updateMemberRole = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const memberId = req.params.memberId;
  const userId = req.user._id;
  const { role, canShare } = req.body;

  if (!role) {
    return next(new ApiError("Role is required", 400));
  }

  // Find room
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if current user is the room owner (only owner can update member roles)
  const isRoomOwner = room.owner.toString() === userId.toString();
  if (!isRoomOwner) {
    return next(new ApiError("Only room owner can update member roles", 403));
  }

  // Check if user is a member (for finding currentMember)
  const currentMember = room.members.find(
    (m) => m.user.toString() === userId.toString()
  );

  // Find target member
  const member = room.members.id(memberId);
  if (!member) {
    return next(new ApiError("Member not found", 404));
  }

  // Cannot change owner role
  if (member.role === "owner") {
    return next(new ApiError("Cannot change owner role", 400));
  }

  // Validate role
  if (!["owner", "editor", "viewer", "commenter"].includes(role)) {
    return next(
      new ApiError(
        "Invalid role. Must be one of: owner, editor, viewer, commenter",
        400
      )
    );
  }

  // Prevent assigning owner role to other members
  if (role === "owner") {
    return next(new ApiError("Cannot assign owner role to other members", 400));
  }

  // Update role
  member.role = role;

  // Update canShare if provided
  if (canShare !== undefined) {
    member.canShare = canShare === true || canShare === "true";
  }

  await room.save();

  // Log activity
  await logActivity(
    userId,
    "member_permissions_updated",
    "room",
    room._id,
    room.name,
    {
      memberId: memberId,
      role: role,
      canShare: member.canShare,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: "✅ Member permissions updated successfully",
    room: room,
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
    return next(new ApiError("Room not found", 404));
  }

  // Check if current user is the room owner (only room owner can remove members)
  const isRoomOwner = room.owner.toString() === userId.toString();
  if (!isRoomOwner) {
    return next(
      new ApiError("Only room owner can remove members from the room", 403)
    );
  }

  // Find target member
  const member = room.members.id(memberId);
  if (!member) {
    return next(new ApiError("Member not found", 404));
  }

  // Cannot remove the room owner (من أنشأ الروم)
  const isTargetMemberRoomOwner =
    room.owner.toString() === member.user.toString();
  if (isTargetMemberRoomOwner) {
    return next(new ApiError("Cannot remove room owner", 400));
  }

  // Cannot remove member with 'owner' role unless you are the room owner
  // (من له role 'owner' لا يمكن حذفه إلا من قبل مالك الروم الأصلي)
  // هذا ينطبق على من له role 'owner' أو 'admin' - فقط مالك الروم يمكنه حذف عضو له role 'owner'
  if (member.role === "owner" && !isRoomOwner) {
    return next(
      new ApiError("Only room owner can remove members with owner role", 403)
    );
  }

  // Remove member from array
  // استخدام filter() لحذف العضو من المصفوفة
  room.members = room.members.filter(
    (m) => m._id.toString() !== memberId.toString()
  );

  // بديل آخر إذا لم يعمل filter() (استخدم أحد الطريقتين):
  // room.members.pull(memberId);

  await room.save();

  res.status(200).json({
    message: "✅ Member removed successfully",
    room: room,
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
    return next(new ApiError("Room not found", 404));
  }

  // Check if current user is the room owner
  if (room.owner.toString() !== userId.toString()) {
    return next(new ApiError("Only room owner can delete the room", 403));
  }

  // Get room with populated files and folders for logging
  const roomWithDetails = await Room.findById(roomId)
    .populate("files.fileId", "name userId")
    .populate("folders.folderId", "name userId");

  // Log activity for each file removed from room
  const File = require("../models/fileModel");
  if (
    roomWithDetails &&
    roomWithDetails.files &&
    roomWithDetails.files.length > 0
  ) {
    for (const fileEntry of roomWithDetails.files) {
      if (fileEntry.fileId) {
        await logActivity(
          userId,
          "file_removed_from_room_on_delete",
          "file",
          fileEntry.fileId._id || fileEntry.fileId,
          fileEntry.fileId.name || "Unknown",
          {
            roomId: roomId,
            roomName: room.name,
            reason: "Room deleted",
          }
        );
      }
    }
  }

  // Log activity for each folder removed from room
  const Folder = require("../models/folderModel");
  if (
    roomWithDetails &&
    roomWithDetails.folders &&
    roomWithDetails.folders.length > 0
  ) {
    for (const folderEntry of roomWithDetails.folders) {
      if (folderEntry.folderId) {
        await logActivity(
          userId,
          "folder_removed_from_room_on_delete",
          "folder",
          folderEntry.folderId._id || folderEntry.folderId,
          folderEntry.folderId.name || "Unknown",
          {
            roomId: roomId,
            roomName: room.name,
            reason: "Room deleted",
          }
        );
      }
    }
  }

  // Delete all invitations related to this room
  await RoomInvitation.deleteMany({ room: roomId });

  // Delete all comments related to this room
  const Comment = require("../models/commentModel");
  await Comment.deleteMany({ room: roomId });

  // Delete the room (this will automatically remove all files and folders from room.files and room.folders)
  await Room.findByIdAndDelete(roomId);

  // Log activity for room deletion
  const filesCount =
    (roomWithDetails &&
      roomWithDetails.files &&
      roomWithDetails.files.length) ||
    0;
  const foldersCount =
    (roomWithDetails &&
      roomWithDetails.folders &&
      roomWithDetails.folders.length) ||
    0;

  await logActivity(
    userId,
    "room_deleted",
    "room",
    roomId,
    room.name,
    {
      filesCount: filesCount,
      foldersCount: foldersCount,
      membersCount: room.members.length,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: "✅ Room deleted successfully",
    details: {
      filesRemoved: filesCount,
      foldersRemoved: foldersCount,
      membersCount: room.members.length,
    },
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
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is a member
  const member = room.members.find(
    (m) => m.user.toString() === userId.toString()
  );

  if (!member) {
    return next(new ApiError("You are not a member of this room", 403));
  }

  // If user is the room owner, delete the room instead of leaving
  if (room.owner.toString() === userId.toString()) {
    // Get room with populated files and folders for logging
    const roomWithDetails = await Room.findById(roomId)
      .populate("files.fileId", "name userId")
      .populate("folders.folderId", "name userId");

    // Log activity for each file removed from room
    const File = require("../models/fileModel");
    if (
      roomWithDetails &&
      roomWithDetails.files &&
      roomWithDetails.files.length > 0
    ) {
      for (const fileEntry of roomWithDetails.files) {
        if (fileEntry.fileId) {
          await logActivity(
            userId,
            "file_removed_from_room_on_delete",
            "file",
            fileEntry.fileId._id || fileEntry.fileId,
            fileEntry.fileId.name || "Unknown",
            {
              roomId: roomId,
              roomName: room.name,
              reason: "Room deleted by owner leaving",
            }
          );
        }
      }
    }

    // Log activity for each folder removed from room
    const Folder = require("../models/folderModel");
    if (
      roomWithDetails &&
      roomWithDetails.folders &&
      roomWithDetails.folders.length > 0
    ) {
      for (const folderEntry of roomWithDetails.folders) {
        if (folderEntry.folderId) {
          await logActivity(
            userId,
            "folder_removed_from_room_on_delete",
            "folder",
            folderEntry.folderId._id || folderEntry.folderId,
            folderEntry.folderId.name || "Unknown",
            {
              roomId: roomId,
              roomName: room.name,
              reason: "Room deleted by owner leaving",
            }
          );
        }
      }
    }

    // Delete all invitations related to this room
    await RoomInvitation.deleteMany({ room: roomId });

    // Delete all comments related to this room
    const Comment = require("../models/commentModel");
    await Comment.deleteMany({ room: roomId });

    // Delete the room
    await Room.findByIdAndDelete(roomId);

    // Log activity for room deletion
    const filesCount =
      (roomWithDetails &&
        roomWithDetails.files &&
        roomWithDetails.files.length) ||
      0;
    const foldersCount =
      (roomWithDetails &&
        roomWithDetails.folders &&
        roomWithDetails.folders.length) ||
      0;

    await logActivity(
      userId,
      "room_deleted",
      "room",
      roomId,
      room.name,
      {
        filesCount: filesCount,
        foldersCount: foldersCount,
        membersCount: room.members.length,
        reason: "Owner left the room",
      },
      {
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      }
    );

    return res.status(200).json({
      message: "✅ Room deleted successfully (owner left the room)",
      details: {
        filesRemoved: filesCount,
        foldersRemoved: foldersCount,
        membersCount: room.members.length,
      },
    });
  }

  // Regular member leaving - remove from members array
  room.members = room.members.filter(
    (m) => m.user.toString() !== userId.toString()
  );

  await room.save();

  // Log activity
  await logActivity(
    userId,
    "room_left",
    "room",
    roomId,
    room.name,
    {},
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: "✅ You have left the room successfully",
    room: room,
  });
});

// @desc    Share file with room
// @route   POST /api/rooms/:id/share-file
// @access  Private
exports.shareFileWithRoom = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;

  // Check if user is authenticated
  if (!req.user || !req.user._id) {
    return next(new ApiError("Cannot identify user. Please re-login", 401));
  }

  const userId = req.user._id;
  const { fileId } = req.body;

  if (!fileId) {
    return next(new ApiError("File ID is required", 400));
  }

  const File = require("../models/fileModel");

  // Find room
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is a member
  const member = room.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  if (!member) {
    return next(new ApiError("You must be a room member to share files", 403));
  }

  // Check if user is the room owner (only owner can share files)
  const isRoomOwner = room.owner.toString() === userId.toString();

  // Check if member has canShare permission
  const memberCanShare = member.canShare === true;

  if (!isRoomOwner && !memberCanShare) {
    return next(
      new ApiError(
        "You don't have permission to share files with this room",
        403
      )
    );
  }

  // Find file
  const file = await File.findById(fileId);
  if (!file) {
    return next(new ApiError("File not found", 404));
  }

  // Check if file is already shared with this room
  const alreadyShared = room.files.find((f) => f.fileId.toString() === fileId);
  if (alreadyShared) {
    return next(new ApiError("File already shared with this room", 400));
  }

  // Add file to room
  room.files.push({ fileId, sharedBy: userId });
  await room.save();

  // Log activity
  await logActivity(
    userId,
    "file_shared_with_room",
    "file",
    file._id,
    file.name,
    {
      roomId: room._id,
      roomName: room.name,
    }
  );

  res.status(200).json({
    message: "✅ File shared with room successfully",
    room: room,
  });
});

// @desc    Share file with room (one-time access)
// @route   POST /api/rooms/:id/share-file-onetime
// @access  Private
exports.shareFileWithRoomOneTime = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const userId = req.user._id;
  const { fileId, expiresInHours } = req.body;

  console.log(
    "📤 [shareFileWithRoomOneTime] Starting - roomId:",
    roomId,
    "fileId:",
    fileId,
    "userId:",
    userId
  );

  if (!fileId) {
    console.log("❌ [shareFileWithRoomOneTime] File ID is required");
    return next(new ApiError("File ID is required", 400));
  }

  const File = require("../models/fileModel");
  const room = await Room.findById(roomId);
  if (!room) {
    console.log("❌ [shareFileWithRoomOneTime] Room not found");
    return next(new ApiError("Room not found", 404));
  }

  const isMember = room.members.some(
    (m) => m.user.toString() === userId.toString()
  );
  if (!isMember) {
    console.log("❌ [shareFileWithRoomOneTime] User is not a member");
    return next(new ApiError("You must be a room member to share files", 403));
  }

  const file = await File.findById(fileId);
  if (!file) {
    console.log("❌ [shareFileWithRoomOneTime] File not found");
    return next(new ApiError("File not found", 404));
  }

  const alreadyShared = room.files.some(
    (f) => f.fileId.toString() === fileId.toString()
  );
  if (alreadyShared) {
    console.log(
      "❌ [shareFileWithRoomOneTime] File already shared with this room"
    );
    return next(new ApiError("File already shared with this room", 400));
  }

  const hours = expiresInHours || 24;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  console.log(
    "✅ [shareFileWithRoomOneTime] Adding file to room with one-time share flag"
  );
  console.log(
    "📋 [shareFileWithRoomOneTime] Files in room before:",
    room.files.length
  );

  room.files.push({
    fileId,
    sharedBy: userId,
    isOneTimeShare: true,
    expiresAt,
    accessedBy: [], // IMPORTANT
    accessCount: 0,
  });

  await room.save();
  console.log(
    "✅ [shareFileWithRoomOneTime] File added successfully. Files in room after:",
    room.files.length
  );

  res.status(200).json({
    message: "File shared (one-time)",
    expiresAt,
    room,
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
    return next(new ApiError("Folder ID is required", 400));
  }

  const Folder = require("../models/folderModel");

  // Find room
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is a member
  const member = room.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  if (!member) {
    return next(
      new ApiError("You must be a room member to share folders", 403)
    );
  }

  // Check if user is the room owner (only owner can share folders)
  const isRoomOwner = room.owner.toString() === userId.toString();

  // Check if member has canShare permission
  const memberCanShare = member.canShare === true;

  if (!isRoomOwner && !memberCanShare) {
    return next(
      new ApiError(
        "You don't have permission to share folders with this room",
        403
      )
    );
  }

  // Find folder
  const folder = await Folder.findById(folderId);
  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  // Check if folder is protected - protected folders cannot be shared with rooms
  if (folder.isProtected) {
    return next(
      new ApiError("Protected folders cannot be shared with rooms", 403)
    );
  }

  // Check if folder is already shared with this room
  const alreadyShared = room.folders.find(
    (f) => f.folderId.toString() === folderId
  );
  if (alreadyShared) {
    return next(new ApiError("Folder already shared with this room", 400));
  }

  // Add folder to room
  room.folders.push({ folderId, sharedBy: userId });
  await room.save();

  // Log activity
  await logActivity(
    userId,
    "folder_shared_with_room",
    "folder",
    folder._id,
    folder.name,
    {
      roomId: room._id,
      roomName: room.name,
    }
  );

  res.status(200).json({
    message: "✅ Folder shared with room successfully",
    room: room,
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
    return next(
      new ApiError(
        'Invalid or missing targetType. Must be "file", "folder", or "room"',
        400
      )
    );
  }

  // targetId is required for file and folder, but not for room
  if (targetType !== "room" && !targetId) {
    return next(
      new ApiError("targetId is required for file and folder comments", 400)
    );
  }

  if (!content || !content.trim()) {
    return next(new ApiError("content is required", 400));
  }

  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  const member = room.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  if (!member) {
    return next(new ApiError("You must be a room member to comment", 403));
  }

  if (!["owner", "editor", "commenter"].includes(member.role)) {
    return next(new ApiError("Your role does not allow adding comments", 403));
  }

  // verify target is shared within room (only for file/folder, not for room)
  if (targetType === "file") {
    const exists = room.files.find((f) => f.fileId.toString() === targetId);
    if (!exists)
      return next(new ApiError("File is not shared with this room", 404));
  } else if (targetType === "folder") {
    const exists = room.folders.find((f) => f.folderId.toString() === targetId);
    if (!exists)
      return next(new ApiError("Folder is not shared with this room", 404));
  }
  // For targetType === 'room', no validation needed

  const Comment = require("../models/commentModel");
  const comment = await Comment.create({
    room: roomId,
    targetType,
    targetId: targetType === "room" ? null : targetId, // null for room comments
    user: userId,
    content: content.trim(),
  });

  try {
    await comment.populate("user", "name email profileImg");

    // Transform profile image to full URL
    if (comment.user) {
      comment.user = transformUserProfileImage(comment.user, req);
    }
  } catch (populateError) {
    console.error("Error populating comment:", populateError);
    // Continue even if populate fails
  }

  // Log activity (don't block response if logging fails)
  logActivity(
    userId,
    "comment_added",
    targetType,
    targetId || roomId,
    undefined,
    { roomId },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  ).catch((logError) => {
    console.error("Error logging comment activity:", logError);
  });

  // Emit new comment to all room members via Socket.IO
  try {
    // eslint-disable-next-line global-require
    const { emitNewComment } = require("../socket");
    const io = global.io;
    if (io) {
      emitNewComment(io, roomId, comment);
    }
  } catch (socketError) {
    console.error("Error emitting comment via Socket.IO:", socketError);
    // Continue even if Socket.IO fails
  }

  res.status(201).json({
    message: "✅ Comment added",
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
    return next(
      new ApiError(
        'Invalid or missing targetType. Must be "file", "folder", or "room"',
        400
      )
    );
  }

  // targetId is required for file and folder, but not for room
  if (targetType !== "room" && !targetId) {
    return next(
      new ApiError("targetId is required for file and folder comments", 400)
    );
  }

  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  const member = room.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  if (!member) {
    return next(
      new ApiError("You must be a room member to view comments", 403)
    );
  }

  // verify target is shared within room (only for file/folder, not for room)
  if (targetType === "file") {
    const exists = room.files.find((f) => f.fileId.toString() === targetId);
    if (!exists)
      return next(new ApiError("File is not shared with this room", 404));
  } else if (targetType === "folder") {
    const exists = room.folders.find((f) => f.folderId.toString() === targetId);
    if (!exists)
      return next(new ApiError("Folder is not shared with this room", 404));
  }
  // For targetType === 'room', no validation needed

  const Comment = require("../models/commentModel");
  const query = {
    room: roomId,
    targetType,
    ...(targetType === "room" ? { targetId: null } : { targetId }),
  };

  const comments = await Comment.find(query)
    .populate("user", "name email profileImg")
    .sort({ createdAt: 1 });

  // Transform profile images to full URLs
  const transformedComments = comments.map((comment) => {
    const commentObj = comment.toObject ? comment.toObject() : comment;
    if (commentObj.user) {
      commentObj.user = transformUserProfileImage(commentObj.user, req);
    }
    return commentObj;
  });

  res.status(200).json({
    message: "Comments retrieved successfully",
    count: transformedComments.length,
    comments: transformedComments,
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
    return next(new ApiError("Room not found", 404));
  }

  const member = room.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  if (!member) {
    return next(
      new ApiError("You must be a room member to delete comments", 403)
    );
  }

  const Comment = require("../models/commentModel");
  const comment = await Comment.findById(commentId);
  if (!comment || comment.room.toString() !== roomId.toString()) {
    return next(new ApiError("Comment not found", 404));
  }

  // Check if user is room owner
  const isRoomOwner = room.owner.toString() === userId.toString();

  // Check if user is editor or owner role
  const isEditor = member.role === "editor";
  const isOwnerRole = member.role === "owner";

  // Check if user is the comment author
  const isAuthor = comment.user.toString() === userId.toString();

  // Only room owner, editor, owner role, or comment author can delete comments
  if (!isRoomOwner && !isEditor && !isOwnerRole && !isAuthor) {
    return next(new ApiError("Not allowed to delete this comment", 403));
  }

  await comment.remove();

  await logActivity(
    userId,
    "comment_deleted",
    comment.targetType,
    comment.targetId,
    undefined,
    { roomId },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: "✅ Comment deleted",
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
  await logActivity(
    userId,
    "room_invitations_cleaned",
    "system",
    null,
    null,
    {
      deletedCount: deletedCount,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: `✅ Cleaned up ${deletedCount} old invitations`,
    deletedCount: deletedCount,
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
              count: { $sum: 1 },
            },
          },
        ],
        sentByMe: [{ $match: { sender: userId } }, { $count: "count" }],
        receivedByMe: [{ $match: { receiver: userId } }, { $count: "count" }],
      },
    },
  ]);

  res.status(200).json({
    message: "Invitation statistics retrieved successfully",
    stats: stats[0],
  });
});

// @desc    Remove file from room
// @route   DELETE /api/rooms/:id/files/:fileId
// @access  Private
exports.removeFileFromRoom = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const fileId = req.params.fileId;

  // Check if user is authenticated
  if (!req.user || !req.user._id) {
    return next(new ApiError("Cannot identify user. Please re-login", 401));
  }

  const userId = req.user._id;

  // Find room
  const room = await Room.findById(roomId).populate("files.fileId");
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is a member
  const isMember = room.members.some(
    (m) => m.user.toString() === userId.toString()
  );
  if (!isMember) {
    return next(new ApiError("You must be a room member to remove files", 403));
  }

  // Check if current user is the room owner
  const isRoomOwner = room.owner.toString() === userId.toString();

  // Check if current user has 'owner' or 'editor' role in members
  const currentMember = room.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  const hasOwnerRole = currentMember && currentMember.role === "owner";
  const hasEditorRole = currentMember && currentMember.role === "editor";

  // Find target file in room
  const fileEntry = room.files.find(
    (f) =>
      f.fileId &&
      (f.fileId._id ? f.fileId._id.toString() : f.fileId.toString()) === fileId
  );

  if (!fileEntry) {
    return next(new ApiError("File not found in room", 404));
  }

  const file = fileEntry.fileId;
  if (!file) {
    return next(new ApiError("File not found", 404));
  }

  // Check if current user is the one who shared the file (sharedBy)
  const sharedByUserId =
    fileEntry.sharedBy &&
    (fileEntry.sharedBy._id
      ? fileEntry.sharedBy._id.toString()
      : fileEntry.sharedBy.toString());
  const isFileSharer = sharedByUserId === userId.toString();

  // Check if user is file owner
  const fileUserId =
    file.userId &&
    (file.userId._id ? file.userId._id.toString() : file.userId.toString());
  const isFileOwner = fileUserId === userId.toString();

  // Allow room owner, file owner, file sharer, or members with owner/editor role to remove files
  if (
    !isRoomOwner &&
    !isFileOwner &&
    !isFileSharer &&
    !hasOwnerRole &&
    !hasEditorRole
  ) {
    return next(
      new ApiError(
        "Only room owner, file owner, file sharer, or members with owner/editor role can remove files",
        403
      )
    );
  }

  // Remove file from array
  room.files = room.files.filter((f) => {
    const fId =
      f.fileId &&
      (f.fileId._id ? f.fileId._id.toString() : f.fileId.toString());
    return fId !== fileId;
  });

  await room.save();

  // Log activity
  await logActivity(
    userId,
    "file_removed_from_room",
    "file",
    file._id || fileId,
    file.name || "Unknown",
    {
      roomId: room._id,
      roomName: room.name,
      removedBy: userId,
    }
  );

  res.status(200).json({
    message: "✅ File removed from room successfully",
    file: {
      _id: file._id || fileId,
      name: file.name || "Unknown",
    },
    room: {
      _id: room._id,
      name: room.name,
    },
  });
});

// @desc    Remove folder from room
// @route   DELETE /api/rooms/:id/folders/:folderId
// @access  Private
exports.removeFolderFromRoom = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const folderId = req.params.folderId;

  // Check if user is authenticated
  if (!req.user || !req.user._id) {
    return next(new ApiError("Cannot identify user. Please re-login", 401));
  }

  const userId = req.user._id;

  // Find room
  const room = await Room.findById(roomId).populate("folders.folderId");
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is a member
  const isMember = room.members.some(
    (m) => m.user.toString() === userId.toString()
  );
  if (!isMember) {
    return next(
      new ApiError("You must be a room member to remove folders", 403)
    );
  }

  // Check if current user is the room owner
  const isRoomOwner = room.owner.toString() === userId.toString();

  // Check if current user has 'owner' or 'editor' role in members
  const currentMember = room.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  const hasOwnerRole = currentMember && currentMember.role === "owner";
  const hasEditorRole = currentMember && currentMember.role === "editor";

  // Find target folder in room
  const folderEntry = room.folders.find(
    (f) =>
      f.folderId &&
      (f.folderId._id ? f.folderId._id.toString() : f.folderId.toString()) ===
        folderId
  );

  if (!folderEntry) {
    return next(new ApiError("Folder not found in room", 404));
  }

  const folder = folderEntry.folderId;
  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  // Check if current user is the one who shared the folder (sharedBy)
  const sharedByUserId =
    folderEntry.sharedBy &&
    (folderEntry.sharedBy._id
      ? folderEntry.sharedBy._id.toString()
      : folderEntry.sharedBy.toString());
  const isFolderSharer = sharedByUserId === userId.toString();

  // Check if user is folder owner
  const folderUserId =
    folder.userId &&
    (folder.userId._id
      ? folder.userId._id.toString()
      : folder.userId.toString());
  const isFolderOwner = folderUserId === userId.toString();

  // Allow room owner, folder owner, folder sharer, or members with owner/editor role to remove folders
  if (
    !isRoomOwner &&
    !isFolderOwner &&
    !isFolderSharer &&
    !hasOwnerRole &&
    !hasEditorRole
  ) {
    return next(
      new ApiError(
        "Only room owner, folder owner, folder sharer, or members with owner/editor role can remove folders",
        403
      )
    );
  }

  // Remove folder from array
  room.folders = room.folders.filter((f) => {
    const fId =
      f.folderId &&
      (f.folderId._id ? f.folderId._id.toString() : f.folderId.toString());
    return fId !== folderId;
  });

  await room.save();

  // Log activity
  await logActivity(
    userId,
    "folder_removed_from_room",
    "folder",
    folder._id || folderId,
    folder.name || "Unknown",
    {
      roomId: room._id,
      roomName: room.name,
      removedBy: userId,
    }
  );

  res.status(200).json({
    message: "✅ Folder removed from room successfully",
    folder: {
      _id: folder._id || folderId,
      name: folder.name || "Unknown",
    },
    room: {
      _id: room._id,
      name: room.name,
    },
  });
});

// @desc    Download room file (marks as accessed for one-time shares)
// @route   GET /api/rooms/:id/files/:fileId/download
// @access  Private
exports.downloadRoomFile = asyncHandler(async (req, res, next) => {
  const { id: roomId, fileId } = req.params;
  const userId = req.user._id;
  const fs = require("fs");
  const path = require("path");

  // Find room with file populated
  const room = await Room.findById(roomId).populate("files.fileId");
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is a member
  const isMember = room.members.some(
    (m) => m.user.toString() === userId.toString()
  );
  if (!isMember) {
    return next(new ApiError("You must be a room member to view files", 403));
  }

  // Find file entry - check both direct files and files in shared folders
  let fileEntry = room.files.find(
    (f) =>
      f.fileId &&
      (f.fileId._id ? f.fileId._id.toString() : f.fileId.toString()) === fileId
  );

  let file = fileEntry ? fileEntry.fileId : null;

  // ✅ إذا لم يكن الملف مباشرة في room.files، ابحث عنه في المجلدات المشتركة
  if (!file) {
    // Populate folders if not already populated
    if (room.folders && room.folders.length > 0) {
      if (!room.folders[0].folderId || !room.folders[0].folderId._id) {
        await room.populate("folders.folderId");
      }
    }

    // Get all shared folder IDs (including nested subfolders)
    const getAllFolderIds = async (folderIds) => {
      const allIds = [...folderIds];
      const Folder = require("../models/folderModel");
      
      for (const folderId of folderIds) {
        const subfolders = await Folder.find({
          parentId: folderId,
          isDeleted: false,
        }).select("_id").lean();
        
        const subfolderIds = subfolders.map((sf) => sf._id.toString());
        if (subfolderIds.length > 0) {
          const nestedIds = await getAllFolderIds(subfolderIds);
          allIds.push(...nestedIds);
        }
      }
      
      return [...new Set(allIds)]; // Remove duplicates
    };

    const sharedFolderIds = room.folders
      .map((f) => {
        const folderId = f.folderId && f.folderId._id 
          ? f.folderId._id.toString() 
          : f.folderId ? f.folderId.toString() : f.folderId;
        return folderId;
      })
      .filter(Boolean);

    if (sharedFolderIds.length > 0) {
      const allFolderIds = await getAllFolderIds(sharedFolderIds);
      const File = require("../models/fileModel");
      
      // Find file in any shared folder (including subfolders)
      file = await File.findOne({
        _id: fileId,
        parentFolderId: { $in: allFolderIds },
        isDeleted: false,
      });

      if (file) {
        // Create a virtual fileEntry for folder-shared files
        fileEntry = {
          fileId: file,
          sharedBy: null,
          sharedAt: null,
          isOneTimeShare: false,
          accessedBy: [],
        };
      }
    }
  }

  if (!file || !fileEntry) {
    return next(new ApiError("File not shared in this room", 404));
  }

  // Check if file exists on disk
  const filePath = file.path;
  if (!fs.existsSync(filePath)) {
    return next(new ApiError("File not found on server", 404));
  }

  // Check if user is file owner or the one who shared it
  const fileUserId =
    file.userId &&
    (file.userId._id ? file.userId._id.toString() : file.userId.toString());
  const sharedByUserId =
    fileEntry.sharedBy &&
    (fileEntry.sharedBy._id
      ? fileEntry.sharedBy._id.toString()
      : fileEntry.sharedBy.toString());

  const isFileOwner = fileUserId === userId.toString();
  const isSharedBy = sharedByUserId === userId.toString();

  // If it's a one-time share, check if user already accessed it
  // BUT: allow file owner and sharer to access unlimited times
  if (fileEntry.isOneTimeShare && !isFileOwner && !isSharedBy) {
    const userAccessed =
      fileEntry.accessedBy &&
      fileEntry.accessedBy.some((a) => {
        const accessUserId =
          (a.user &&
            (a.user._id ? a.user._id.toString() : a.user.toString())) ||
          a.user;
        return accessUserId === userId.toString();
      });

    if (userAccessed) {
      return next(
        new ApiError(
          "You have already viewed this file. One-time access only.",
          403
        )
      );
    }

    // Add user to accessedBy list (only for non-owners/non-sharers)
    if (!fileEntry.accessedBy) {
      fileEntry.accessedBy = [];
    }
    fileEntry.accessedBy.push({
      user: userId,
      accessedAt: new Date(),
    });

    // Check if all members have viewed the file
    // Count only non-owner/non-sharer members
    const membersToCount = room.members.filter((m) => {
      const memberId =
        (m.user && (m.user._id ? m.user._id.toString() : m.user.toString())) ||
        m.user;
      return memberId !== fileUserId && memberId !== sharedByUserId;
    });

    if (fileEntry.accessedBy.length >= membersToCount.length) {
      fileEntry.allMembersViewed = true;
      fileEntry.viewedByAllAt = new Date();

      // Remove file from room when all members have viewed it
      room.files = room.files.filter(
        (f) =>
          f.fileId &&
          (f.fileId._id ? f.fileId._id.toString() : f.fileId.toString()) !==
            fileId
      );

      // Log activity for file removal
      await logActivity(
        userId,
        "file_removed_after_all_viewed",
        "file",
        file._id,
        file.name,
        {
          roomId: room._id,
          roomName: room.name,
          reason: "All members viewed the one-time shared file",
        }
      );
    }

    await room.save();

    // Log activity
    await logActivity(
      userId,
      "file_viewed_onetime",
      "file",
      file._id,
      file.name,
      {
        roomId: room._id,
        roomName: room.name,
        isOneTimeShare: true,
      }
    );
  }

  // Log activity for download
  await logActivity(
    userId,
    "file_downloaded_from_room",
    "file",
    file._id,
    file.name,
    {
      roomId: room._id,
      roomName: room.name,
      isOneTimeShare: fileEntry.isOneTimeShare || false,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  // Send file
  res.download(filePath, file.name, (err) => {
    if (err) {
      console.error("Error sending file:", err);
      if (!res.headersSent) {
        return next(new ApiError("Error downloading file", 500));
      }
    }
  });
});

// @desc    View room file in browser (serve file for viewing)
// @route   GET /api/rooms/:id/files/:fileId/view
// @access  Private
exports.viewRoomFile = asyncHandler(async (req, res, next) => {
  const { id: roomId, fileId } = req.params;
  const userId = req.user._id;
  const fs = require("fs");
  const path = require("path");

  // Find room with file populated
  const room = await Room.findById(roomId).populate("files.fileId");
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is a member
  const isMember = room.members.some(
    (m) => m.user.toString() === userId.toString()
  );
  if (!isMember) {
    return next(new ApiError("You must be a room member to view files", 403));
  }

  // Find file entry - check both direct files and files in shared folders
  let fileEntry = room.files.find(
    (f) =>
      f.fileId &&
      (f.fileId._id ? f.fileId._id.toString() : f.fileId.toString()) === fileId
  );

  let file = fileEntry ? fileEntry.fileId : null;

  // ✅ إذا لم يكن الملف مباشرة في room.files، ابحث عنه في المجلدات المشتركة
  if (!file) {
    // Populate folders if not already populated
    if (room.folders && room.folders.length > 0 && !room.folders[0].folderId._id) {
      await room.populate("folders.folderId");
    }

    // Get all shared folder IDs (including nested subfolders)
    const getAllFolderIds = async (folderIds) => {
      const allIds = [...folderIds];
      const Folder = require("../models/folderModel");
      
      for (const folderId of folderIds) {
        const subfolders = await Folder.find({
          parentId: folderId,
          isDeleted: false,
        }).select("_id").lean();
        
        const subfolderIds = subfolders.map((sf) => sf._id.toString());
        if (subfolderIds.length > 0) {
          const nestedIds = await getAllFolderIds(subfolderIds);
          allIds.push(...nestedIds);
        }
      }
      
      return [...new Set(allIds)]; // Remove duplicates
    };

    const sharedFolderIds = room.folders
      .map((f) => {
        const folderId = f.folderId && f.folderId._id 
          ? f.folderId._id.toString() 
          : f.folderId ? f.folderId.toString() : f.folderId;
        return folderId;
      })
      .filter(Boolean);

    if (sharedFolderIds.length > 0) {
      const allFolderIds = await getAllFolderIds(sharedFolderIds);
      const File = require("../models/fileModel");
      
      // Find file in any shared folder (including subfolders)
      file = await File.findOne({
        _id: fileId,
        parentFolderId: { $in: allFolderIds },
        isDeleted: false,
      });

      if (file) {
        // Create a virtual fileEntry for folder-shared files
        fileEntry = {
          fileId: file,
          sharedBy: null,
          sharedAt: null,
          isOneTimeShare: false,
          accessedBy: [],
        };
      }
    }
  }

  if (!file || !fileEntry) {
    return next(new ApiError("File not shared in this room", 404));
  }

  // Check if file is deleted
  if (file.isDeleted) {
    return next(new ApiError("File not found (deleted)", 404));
  }

  // Check if file exists on disk
  const filePath = file.path;
  if (!fs.existsSync(filePath)) {
    return next(new ApiError("File not found on server", 404));
  }

  // Check if user is file owner or the one who shared it
  const fileUserId =
    file.userId &&
    (file.userId._id ? file.userId._id.toString() : file.userId.toString());
  const sharedByUserId =
    fileEntry.sharedBy &&
    (fileEntry.sharedBy._id
      ? fileEntry.sharedBy._id.toString()
      : fileEntry.sharedBy.toString());

  const isFileOwner = fileUserId === userId.toString();
  const isSharedBy = sharedByUserId === userId.toString();

  // If it's a one-time share, check if user already accessed it
  // BUT: allow file owner and sharer to access unlimited times
  // ✅ Skip one-time check for files in shared folders (they're always accessible)
  if (fileEntry.isOneTimeShare && !isFileOwner && !isSharedBy && fileEntry.sharedBy !== null) {
    const userAccessed =
      fileEntry.accessedBy &&
      fileEntry.accessedBy.some((a) => {
        const accessUserId =
          (a.user &&
            (a.user._id ? a.user._id.toString() : a.user.toString())) ||
          a.user;
        return accessUserId === userId.toString();
      });

    if (userAccessed) {
      return next(
        new ApiError(
          "You have already viewed this file. One-time access only.",
          403
        )
      );
    }

    // Add user to accessedBy list (only for non-owners/non-sharers)
    if (!fileEntry.accessedBy) {
      fileEntry.accessedBy = [];
    }
    fileEntry.accessedBy.push({
      user: userId,
      accessedAt: new Date(),
    });

    // Check if all members have viewed the file
    // Count only non-owner/non-sharer members
    const membersToCount = room.members.filter((m) => {
      const memberId =
        (m.user && (m.user._id ? m.user._id.toString() : m.user.toString())) ||
        m.user;
      return memberId !== fileUserId && memberId !== sharedByUserId;
    });

    if (fileEntry.accessedBy.length >= membersToCount.length) {
      fileEntry.allMembersViewed = true;
      fileEntry.viewedByAllAt = new Date();

      // Remove file from room when all members have viewed it
      room.files = room.files.filter(
        (f) =>
          f.fileId &&
          (f.fileId._id ? f.fileId._id.toString() : f.fileId.toString()) !==
            fileId
      );

      // Log activity for file removal
      await logActivity(
        userId,
        "file_removed_after_all_viewed",
        "file",
        file._id,
        file.name,
        {
          roomId: room._id,
          roomName: room.name,
          reason: "All members viewed the one-time shared file",
        }
      );
    }

    await room.save();

    // Log activity
    await logActivity(
      userId,
      "file_viewed_onetime",
      "file",
      file._id,
      file.name,
      {
        roomId: room._id,
        roomName: room.name,
        isOneTimeShare: true,
      }
    );
  }

  // Log activity for viewing
  logActivity(
    userId,
    "file_viewed_from_room",
    "file",
    file._id,
    file.name,
    {
      roomId: room._id,
      roomName: room.name,
      isOneTimeShare: fileEntry.isOneTimeShare || false,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  ).catch((error) => {
    console.error("Error logging file view activity:", error);
  });

  // Set appropriate headers for viewing (inline, not download)
  res.setHeader("Content-Type", file.type || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${file.name}"`);

  // Send file for viewing
  res.sendFile(path.resolve(filePath), (err) => {
    if (err) {
      console.error("Error viewing file:", err);
      if (!res.headersSent) {
        return next(new ApiError("Error viewing file", 500));
      }
    }
  });
});

const deleteFileIfAllViewed = async (room, fileEntry) => {
  if (fileEntry.allMembersViewed) {
    const filePath = fileEntry.fileId.path;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    // إزالة الملف من الروم
    room.files = room.files.filter(
      (f) => f.fileId._id.toString() !== fileEntry.fileId._id.toString()
    );
    await room.save();
  }
};

// @desc    Download folder from room as zip
// @route   GET /api/rooms/:id/folders/:folderId/download
// @access  Private
exports.downloadRoomFolder = asyncHandler(async (req, res, next) => {
  const { id: roomId, folderId } = req.params;
  const userId = req.user._id;
  const fs = require("fs");
  const path = require("path");
  const archiver = require("archiver");

  // Find room with folder populated
  const room = await Room.findById(roomId).populate("folders.folderId");
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is a member
  const isMember = room.members.some(
    (m) => m.user.toString() === userId.toString()
  );
  if (!isMember) {
    return next(
      new ApiError("You must be a room member to download folders", 403)
    );
  }

  // Find folder entry
  const folderEntry = room.folders.find(
    (f) =>
      f.folderId &&
      (f.folderId._id ? f.folderId._id.toString() : f.folderId.toString()) ===
        folderId
  );
  if (!folderEntry) {
    return next(new ApiError("Folder not shared in this room", 404));
  }

  const folder = folderEntry.folderId;
  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  // Check if folder is deleted
  if (folder.isDeleted) {
    return next(new ApiError("Folder not found (deleted)", 404));
  }

  // Recursively get all files in folder
  const File = require("../models/fileModel");
  const Folder = require("../models/folderModel");

  const getAllFilesInFolder = async (targetFolderId) => {
    const files = await File.find({
      parentFolderId: targetFolderId,
      userId: folder.userId,
      isDeleted: false,
    });

    const subfolders = await Folder.find({
      parentId: targetFolderId,
      userId: folder.userId,
      isDeleted: false,
    });

    const allFiles = [...files];

    for (const subfolder of subfolders) {
      const subfolderFiles = await getAllFilesInFolder(subfolder._id);
      allFiles.push(...subfolderFiles);
    }

    return allFiles;
  };

  const allFiles = await getAllFilesInFolder(folderId);

  if (allFiles.length === 0) {
    return next(new ApiError("Folder is empty", 400));
  }

  // Create zip archive
  const archive = archiver("zip", {
    zlib: { level: 9 }, // Maximum compression
  });

  // Set response headers
  res.attachment(`${folder.name}.zip`);
  res.type("zip");

  // Pipe archive data to response
  archive.pipe(res);

  // Add files to archive
  for (const file of allFiles) {
    if (fs.existsSync(file.path)) {
      // Get relative path from folder
      const relativePath = file.name; // Simplified - you might want to preserve folder structure
      archive.file(file.path, { name: relativePath });
    }
  }

  // Finalize archive
  await archive.finalize();

  // Log activity
  await logActivity(
    userId,
    "folder_downloaded_from_room",
    "folder",
    folder._id,
    folder.name,
    {
      roomId: room._id,
      roomName: room.name,
      filesCount: allFiles.length,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );
});

// @desc    Save file from room to user's account
// @route   POST /api/rooms/:id/files/:fileId/save
// @access  Private
exports.saveFileFromRoom = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const fileId = req.params.fileId;
  const userId = req.user._id;
  const fs = require("fs");
  const path = require("path");
  const { parentFolderId } = req.body; // Optional: save to specific folder

  // Find room with file populated
  const room = await Room.findById(roomId).populate("files.fileId");
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is a member
  const isMember = room.members.some(
    (m) => m.user.toString() === userId.toString()
  );
  if (!isMember) {
    return next(new ApiError("You must be a room member to save files", 403));
  }

  // Find file entry
  const fileEntry = room.files.find(
    (f) =>
      f.fileId &&
      (f.fileId._id ? f.fileId._id.toString() : f.fileId.toString()) === fileId
  );
  if (!fileEntry) {
    return next(new ApiError("File not shared in this room", 404));
  }

  const originalFile = fileEntry.fileId;
  if (!originalFile) {
    return next(new ApiError("File not found", 404));
  }

  // Check if file exists on disk
  const originalFilePath = originalFile.path;
  if (!fs.existsSync(originalFilePath)) {
    return next(new ApiError("File not found on server", 404));
  }

  // Check if user already has this file (optional check)
  const File = require("../models/fileModel");
  const existingFile = await File.findOne({
    userId: userId,
    name: originalFile.name,
    parentFolderId: parentFolderId || null,
    isDeleted: false,
  });

  if (existingFile) {
    return next(
      new ApiError(
        "You already have a file with this name in this location",
        400
      )
    );
  }

  // Generate unique file name
  const pathUtil = require("path");
  const fileExt = pathUtil.extname(originalFile.name);
  const fileBaseName = pathUtil.basename(originalFile.name, fileExt);

  let finalName = originalFile.name;
  let counter = 1;

  while (true) {
    const existingFileCheck = await File.findOne({
      name: finalName,
      parentFolderId: parentFolderId || null,
      userId: userId,
      isDeleted: false,
    });

    if (!existingFileCheck) {
      break;
    }

    const baseNameWithoutNumber = fileBaseName.replace(/\(\d+\)$/, "");
    finalName = `${baseNameWithoutNumber} (${counter})${fileExt}`;
    counter += 1;
  }

  const uniqueFileName = finalName;

  // Create new file path
  const uploadsDir = "my_files";
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const timestamp = Date.now();
  const ext = path.extname(originalFile.name);
  const baseName = path.basename(uniqueFileName, ext);
  const newFileName = `${timestamp}-${baseName}${ext}`;
  const newFilePath = path.join(uploadsDir, newFileName);

  // ✅ التحقق من المساحة التخزينية قبل حفظ الملف
  const { checkStorageLimit } = require("./fileService");
  await checkStorageLimit(userId, originalFile.size);

  // Copy file from original location to new location
  const fileContent = fs.readFileSync(originalFilePath);
  fs.writeFileSync(newFilePath, fileContent);

  // Create new file record for user
  const newFile = await File.create({
    name: uniqueFileName,
    type: originalFile.type,
    size: originalFile.size,
    path: newFilePath,
    userId: userId,
    parentFolderId: parentFolderId || null,
    category: originalFile.category,
    isShared: false,
    sharedWith: [],
    description: originalFile.description || "",
    tags: originalFile.tags || [],
  });

  // Update parent folder size if saving to a specific folder
  if (parentFolderId) {
    const Folder = require("../models/folderModel");
    const { updateFolderStats } = require("../services/folderService");
    if (updateFolderStats) {
      await updateFolderStats(parentFolderId, originalFile.size, 1);
    }
  }

  // ✅ تحديث المساحة المستخدمة للمستخدم
  const User = require("../models/userModel");
  await User.findByIdAndUpdate(userId, {
    $inc: { storageUsed: originalFile.size },
  });

  // Log activity
  await logActivity(
    userId,
    "file_saved_from_room",
    "file",
    newFile._id,
    newFile.name,
    {
      roomId: room._id,
      roomName: room.name,
      originalFileId: originalFile._id || fileId,
      parentFolderId: parentFolderId || null,
    }
  );

  res.status(200).json({
    message: "✅ File saved to your account successfully",
    file: newFile,
  });
});

// @desc    Save folder from room to user's account
// @route   POST /api/rooms/:id/folders/:folderId/save
// @access  Private
exports.saveFolderFromRoom = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const folderId = req.params.folderId;
  const userId = req.user._id;
  const fs = require("fs");
  const path = require("path");
  const { parentFolderId } = req.body; // Optional: save to specific parent folder

  // Find room with folder populated
  const room = await Room.findById(roomId).populate("folders.folderId");
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is a member
  const isMember = room.members.some(
    (m) => m.user.toString() === userId.toString()
  );
  if (!isMember) {
    return next(new ApiError("You must be a room member to save folders", 403));
  }

  // Find folder entry
  const folderEntry = room.folders.find(
    (f) =>
      f.folderId &&
      (f.folderId._id ? f.folderId._id.toString() : f.folderId.toString()) ===
        folderId
  );
  if (!folderEntry) {
    return next(new ApiError("Folder not shared in this room", 404));
  }

  const originalFolder = folderEntry.folderId;
  if (!originalFolder) {
    return next(new ApiError("Folder not found", 404));
  }

  // Check if user already has a folder with this name
  const Folder = require("../models/folderModel");
  const File = require("../models/fileModel");

  // Generate unique folder name
  let finalFolderName = originalFolder.name;
  let counter = 1;

  while (true) {
    const existingFolderCheck = await Folder.findOne({
      name: finalFolderName,
      parentId: parentFolderId || null,
      userId: userId,
      isDeleted: false,
    });

    if (!existingFolderCheck) {
      break;
    }

    const baseNameWithoutNumber = originalFolder.name.replace(/\(\d+\)$/, "");
    finalFolderName = `${baseNameWithoutNumber} (${counter})`;
    counter += 1;
  }

  const uniqueFolderName = finalFolderName;

  // Create new folder
  const newFolder = await Folder.create({
    name: uniqueFolderName,
    userId: userId,
    parentId: parentFolderId || null,
    size: 0, // Will be calculated
    path: originalFolder.path, // Will be updated if needed
    isShared: false,
    sharedWith: [],
    description: originalFolder.description || "",
    tags: originalFolder.tags || [],
  });

  // Recursively copy all files and subfolders
  const copyFolderContents = async (
    sourceFolderIdParam,
    targetFolderIdParam
  ) => {
    // Copy files
    const files = await File.find({
      parentFolderId: sourceFolderIdParam,
      isDeleted: false,
    });

    const uploadsDir = "my_files";
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    for (const file of files) {
      if (fs.existsSync(file.path)) {
        const timestamp = Date.now();
        const fileExt = path.extname(file.name);
        const fileBaseName = path.basename(file.name, fileExt);
        const newFileName = `${timestamp}-${fileBaseName}${fileExt}`;
        const newFilePath = path.join(uploadsDir, newFileName);

        // Copy file
        const fileContent = fs.readFileSync(file.path);
        fs.writeFileSync(newFilePath, fileContent);

        // Create new file record
        await File.create({
          name: file.name,
          type: file.type,
          size: file.size,
          path: newFilePath,
          userId: userId,
          parentFolderId: targetFolderIdParam,
          category: file.category,
          isShared: false,
          sharedWith: [],
          description: file.description || "",
          tags: file.tags || [],
        });
      }
    }

    // Copy subfolders recursively
    const subfolders = await Folder.find({
      parentId: sourceFolderIdParam,
      isDeleted: false,
    });

    for (const subfolder of subfolders) {
      const newSubfolder = await Folder.create({
        name: subfolder.name,
        userId: userId,
        parentId: targetFolderIdParam,
        size: 0,
        path: subfolder.path,
        isShared: false,
        sharedWith: [],
        description: subfolder.description || "",
        tags: subfolder.tags || [],
      });

      await copyFolderContents(subfolder._id, newSubfolder._id);
    }
  };

  // Copy folder contents
  await copyFolderContents(originalFolder._id, newFolder._id);

  // Calculate folder size recursively
  const calculateFolderSize = async (targetFolderId) => {
    try {
      const files = await File.find({
        parentFolderId: targetFolderId,
        isDeleted: false,
      });
      let totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

      const subfolders = await Folder.find({
        parentId: targetFolderId,
        isDeleted: false,
      });
      for (const subfolder of subfolders) {
        totalSize += await calculateFolderSize(subfolder._id);
      }

      return totalSize;
    } catch (error) {
      console.error("Error calculating folder size:", error);
      return 0;
    }
  };

  const folderSize = await calculateFolderSize(newFolder._id);
  newFolder.size = folderSize;
  await newFolder.save();

  // Update parent folder size if saving to a specific folder
  if (parentFolderId) {
    const parentFolder = await Folder.findById(parentFolderId);
    if (parentFolder) {
      parentFolder.size = await calculateFolderSize(parentFolderId);
      await parentFolder.save();
    }
  }

  // Log activity
  await logActivity(
    userId,
    "folder_saved_from_room",
    "folder",
    newFolder._id,
    newFolder.name,
    {
      roomId: room._id,
      roomName: room.name,
      originalFolderId: originalFolder._id || folderId,
      parentFolderId: parentFolderId || null,
    }
  );

  res.status(200).json({
    message: "✅ Folder saved to your account successfully",
    folder: newFolder,
  });
});

// @desc    Share file with room (one-time access)
// @route   POST /api/rooms/:id/share-file-onetime
// @access  Private
exports.shareFileWithRoomOneTime = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;

  // Check if user is authenticated
  if (!req.user || !req.user._id) {
    return next(new ApiError("Cannot identify user. Please re-login", 401));
  }

  const userId = req.user._id;
  const { fileId, expiresInHours } = req.body;

  console.log(
    "📤 [shareFileWithRoomOneTime] Starting - roomId:",
    roomId,
    "fileId:",
    fileId,
    "userId:",
    userId
  );

  if (!fileId) {
    return next(new ApiError("File ID is required", 400));
  }

  const File = require("../models/fileModel");
  const room = await Room.findById(roomId);
  if (!room) {
    return next(new ApiError("Room not found", 404));
  }

  // Check if user is a member
  const member = room.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  if (!member) {
    return next(new ApiError("You must be a room member to share files", 403));
  }

  // Check if user is the room owner (only owner can share files)
  const isRoomOwner = room.owner.toString() === userId.toString();

  // Check if member has canShare permission
  const memberCanShare = member.canShare === true;

  if (!isRoomOwner && !memberCanShare) {
    return next(
      new ApiError(
        "You don't have permission to share files with this room",
        403
      )
    );
  }

  const file = await File.findById(fileId);
  if (!file) {
    return next(new ApiError("File not found", 404));
  }

  const alreadyShared = room.files.some(
    (f) => f.fileId.toString() === fileId.toString()
  );
  if (alreadyShared) {
    return next(new ApiError("File already shared with this room", 400));
  }

  const hours = expiresInHours || 24;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  // Add file to room with one-time share flag
  room.files.push({
    fileId,
    sharedBy: userId,
    isOneTimeShare: true,
    expiresAt,
    accessedBy: [],
    allMembersViewed: false,
    visibleForOwner: true,
  });

  await room.save();

  // Log activity
  await logActivity(
    userId,
    "file_shared_onetime",
    "file",
    file._id,
    file.name,
    {
      roomId: room._id,
      roomName: room.name,
      expiresAt: expiresAt,
      expiresInHours: hours,
    }
  );

  res.status(200).json({
    message: "✅ File shared with room (one-time access)",
    file: {
      _id: file._id,
      name: file.name,
    },
    expiresAt,
    room: {
      _id: room._id,
      name: room.name,
    },
  });
});

// @desc    Access one-time shared file (each user can access once)
// @route   GET /api/rooms/:id/files/:fileId/access
// @access  Private

exports.accessOneTimeFile = asyncHandler(async (req, res, next) => {
  const roomId = req.params.id;
  const fileId = req.params.fileId;
  const userId = req.user._id;

  console.log(
    "🔍 [accessOneTimeFile] Starting - roomId:",
    roomId,
    "fileId:",
    fileId,
    "userId:",
    userId
  );

  const room = await Room.findById(roomId);
  if (!room) {
    console.log("❌ [accessOneTimeFile] Room not found");
    return next(new ApiError("Room not found", 404));
  }

  const isMember = room.members.some(
    (m) => m.user.toString() === userId.toString()
  );
  if (!isMember) {
    console.log("❌ [accessOneTimeFile] User is not a member");
    return next(new ApiError("You must be a room member", 403));
  }

  const fileEntry = room.files.find(
    (f) => f.fileId.toString() === fileId.toString()
  );
  if (!fileEntry) {
    console.log(
      "❌ [accessOneTimeFile] File not found in room. Files count:",
      room.files.length
    );
    return next(new ApiError("File not found in this room", 404));
  }

  console.log(
    "✅ [accessOneTimeFile] File entry found, isOneTimeShare:",
    fileEntry.isOneTimeShare
  );

  // Check expiration
  if (fileEntry.expiresAt && new Date() > fileEntry.expiresAt) {
    console.log("⚠️ [accessOneTimeFile] File expired, removing...");
    room.files = room.files.filter((f) => f.fileId.toString() !== fileId);
    await room.save();
    return next(new ApiError("File access expired", 410));
  }

  // One-time file?
  if (fileEntry.isOneTimeShare) {
    console.log("📋 [accessOneTimeFile] Processing one-time share file");

    if (!fileEntry.accessedBy) fileEntry.accessedBy = [];

    // Check if user already viewed
    const alreadyViewed = fileEntry.accessedBy.some(
      (a) => a.user.toString() === userId.toString()
    );
    if (alreadyViewed) {
      console.log("❌ [accessOneTimeFile] User already accessed this file");
      return next(
        new ApiError("You already accessed this file (one-time)", 403)
      );
    }

    console.log(
      "✅ [accessOneTimeFile] User can access, adding to accessedBy..."
    );
    // Add user to accessed list
    fileEntry.accessedBy.push({ user: userId, accessedAt: new Date() });

    // Update access count
    fileEntry.accessCount = (fileEntry.accessCount || 0) + 1;
    fileEntry.accessedAt = new Date();

    console.log(
      "📊 [accessOneTimeFile] Access count:",
      fileEntry.accessCount,
      "accessedBy length:",
      fileEntry.accessedBy.length
    );

    // Fetch the actual file
    const File = require("../models/fileModel");
    const file = await File.findById(fileId);
    if (!file) {
      console.log("❌ [accessOneTimeFile] File not found in DB");
      return next(new ApiError("File not found in DB", 404));
    }

    console.log(
      "💾 [accessOneTimeFile] Saving room with updated accessedBy..."
    );
    // Save room with updated accessedBy (file stays in room, just marked as accessed)
    await room.save();
    console.log(
      "✅ [accessOneTimeFile] Room saved successfully. File remains in room but hidden from this user."
    );

    // Log activity for current user
    await logActivity(
      userId,
      "file_accessed_onetime",
      "room",
      roomId,
      room.name,
      {
        fileId: fileId,
        fileName: file.name,
      },
      {
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      }
    ).catch((err) => {
      // Don't fail the request if logging fails
      console.error("Error logging activity:", err);
    });

    return res.status(200).json({
      message:
        "✅ File accessed (one-time share - you can only access this file once)",
      oneTime: true,
      hideFromThisUser: true,
      fileRemovedFromRoom: false, // File stays in room
      accessCount: fileEntry.accessCount,
      file,
    });
  }

  // NORMAL FILE
  const File = require("../models/fileModel");
  const file = await File.findById(fileId);

  return res.status(200).json({
    message: "File accessed",
    oneTime: false,
    file,
  });
});
