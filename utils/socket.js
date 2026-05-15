// Real-time notification delivery via Socket.io
// Each logged-in user joins a room keyed by their identity: "ADMIN:uuid" or "EMPLOYEE:uuid"
// When a notification is created, emit to that room — no polling needed.

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL
        ? process.env.FRONTEND_URL.split(",").map((s) => s.trim())
        : ["http://localhost:5173", "http://localhost:3000"],
      methods: ["GET", "POST"],
      credentials: true,
    },
    path: "/socket.io",
  });

  // Authenticate every socket connection via JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");
    if (!token) return next(new Error("Authentication required"));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    const roomId = user.adminId
      ? `ADMIN:${user.adminId}`
      : user.employeeId
      ? `EMPLOYEE:${user.employeeId}`
      : user.userId
      ? `USER:${user.userId}`
      : null;

    if (!roomId) {
      socket.disconnect();
      return;
    }

    socket.join(roomId);

    socket.on("disconnect", () => {});
  });

  console.log("✅ Socket.io initialized");
  return io;
}

// Call this from anywhere in the backend to push a notification to a user instantly
function emitNotification(targetType, targetId, notification) {
  if (!io) return;
  const roomId = `${targetType}:${targetId}`;
  io.to(roomId).emit("notification", notification);
}

// Emit unread count update (lighter than full notification object)
function emitUnreadCount(targetType, targetId, count) {
  if (!io) return;
  const roomId = `${targetType}:${targetId}`;
  io.to(roomId).emit("unread_count", { count });
}

function getIO() {
  return io;
}

module.exports = { initSocket, emitNotification, emitUnreadCount, getIO };
