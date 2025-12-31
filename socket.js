const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("./models/userModel");
const Room = require("./models/roomModel");

// Store user socket connections: userId -> socketId
const userSockets = new Map();
// Store room members: roomId -> Set of userIds
const roomMembers = new Map();

/**
 * Initialize Socket.IO server
 * @param {http.Server} server - HTTP server instance
 * @returns {Server} Socket.IO server instance
 */
function initializeSocketIO(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(" ")[1];

      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

      // Check if user exists
      const user = await User.findById(decoded.userId);
      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      // Check if password was changed after token issued
      if (user.passwordChangedAt) {
        const passChangedTimestamp = parseInt(
          user.passwordChangedAt.getTime() / 1000,
          10
        );
        if (passChangedTimestamp > decoded.iat) {
          return next(new Error("Authentication error: Token expired"));
        }
      }

      // Attach user info to socket
      socket.userId = user._id.toString();
      socket.user = {
        _id: user._id,
        name: user.name,
        email: user.email,
        profileImg: user.profileImg,
      };

      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return next(new Error("Authentication error: Token expired"));
      } else if (error.name === "JsonWebTokenError") {
        return next(new Error("Authentication error: Invalid token"));
      }
      return next(new Error("Authentication error: " + error.message));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    console.log(`✅ User connected: ${socket.user.name} (${userId})`);

    // Store user socket connection
    userSockets.set(userId, socket.id);

    // Handle joining a room
    socket.on("join_room", async (roomId) => {
      try {
        // Verify user is a member of the room
        const room = await Room.findById(roomId);
        if (!room) {
          socket.emit("error", { message: "Room not found" });
          return;
        }

        const member = room.members.find(
          (m) => m.user.toString() === userId
        );
        if (!member) {
          socket.emit("error", { message: "You are not a member of this room" });
          return;
        }

        // Join socket room
        socket.join(`room:${roomId}`);

        // Track room membership
        if (!roomMembers.has(roomId)) {
          roomMembers.set(roomId, new Set());
        }
        roomMembers.get(roomId).add(userId);

        console.log(`✅ User ${socket.user.name} joined room: ${roomId}`);
        socket.emit("joined_room", { roomId, message: "Successfully joined room" });
      } catch (error) {
        console.error("Error joining room:", error);
        socket.emit("error", { message: "Error joining room" });
      }
    });

    // Handle leaving a room
    socket.on("leave_room", (roomId) => {
      socket.leave(`room:${roomId}`);
      
      if (roomMembers.has(roomId)) {
        roomMembers.get(roomId).delete(userId);
        if (roomMembers.get(roomId).size === 0) {
          roomMembers.delete(roomId);
        }
      }

      console.log(`👋 User ${socket.user.name} left room: ${roomId}`);
      socket.emit("left_room", { roomId, message: "Successfully left room" });
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${socket.user.name} (${userId})`);
      
      // Remove user socket
      userSockets.delete(userId);

      // Remove user from all rooms
      roomMembers.forEach((members, roomId) => {
        if (members.has(userId)) {
          members.delete(userId);
          if (members.size === 0) {
            roomMembers.delete(roomId);
          }
        }
      });
    });
  });

  return io;
}

/**
 * Emit new comment to all members of a room
 * @param {Server} io - Socket.IO server instance
 * @param {string} roomId - Room ID
 * @param {Object} comment - Comment object
 */
function emitNewComment(io, roomId, comment) {
  if (!io) {
    console.warn("Socket.IO not initialized, cannot emit comment");
    return;
  }

  io.to(`room:${roomId}`).emit("new_comment", {
    comment,
    roomId,
    timestamp: new Date(),
  });

  console.log(`📢 New comment emitted to room: ${roomId}`);
}

module.exports = {
  initializeSocketIO,
  emitNewComment,
};
