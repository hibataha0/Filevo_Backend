// ✅ تحميل dotenv أولاً قبل أي require آخر
const dotenv = require("dotenv");

dotenv.config({ path: "config.env" });

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet"); // حماية الـ headers
const rateLimit = require("express-rate-limit"); // حماية من الهجمات
const path = require("path");
const mongoSanitize = require("./middlewares/mongoSanitize"); // NoSQL Injection (Express 5 compatible)

const ApiError = require("./utils/apiError");
const authRoutes = require("./api/authRoutes");
const userRoute = require("./api/userRoute");
const fileRoutes = require("./api/fileRoutes");
const folderRoutes = require("./api/folderRoutes");
const activityLogRoutes = require("./api/activityLogRoutes");
const roomRoutes = require("./api/roomRoutes");
const searchRoutes = require("./api/searchRoutes");
const dbConnection = require("./config/database");
const globalError = require("./middlewares/errMiddlewarel");
const roomService = require("./services/roomService");
const fileService = require("./services/fileService");
const { checkHFConnection } = require("./services/aiService");
const { initializeSocketIO } = require("./socket");

// connect with db
dbConnection();

//express app
const app = express();

// ======================
// 🔐 SECURITY MIDDLEWARES
// ======================

// Body parser - يجب أن يكون أول middleware
app.use(express.json({ limit: "10kb" })); // limit payload to 10kb
app.use(express.urlencoded({ extended: true })); // للـ form data

// CORS: only allow frontend domain(s)
app.use(
  cors({
    origin: [process.env.FRONTEND_URL || "http://localhost:3000"],
    credentials: true,
  })
);

// Helmet for basic security headers
app.use(helmet());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per IP
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api", limiter);

// Data sanitization against NoSQL query injection
// يجب أن يكون بعد body parser
app.use(mongoSanitize());

// Logging only in development
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
  console.log(`Mode: ${process.env.NODE_ENV}`);
}

// ======================
// 🔗 STATIC FILES
// ======================
app.use("/my_files", express.static(path.join(__dirname, "my_files")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ======================
// 🔗 ROUTES
// ======================
app.get("/", (req, res) => res.send("Our API V2"));

app.use("/api/v1/users", userRoute);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/files", fileRoutes);
app.use("/api/v1/folders", folderRoutes);
app.use("/api/v1/activity-log", activityLogRoutes);
app.use("/api/v1/rooms", roomRoutes);
app.use("/api/v1/search", searchRoutes);

// 404 handler
app.use((req, res, next) => {
  next(new ApiError(`Can't find this route: ${req.originalUrl}`, 404));
});

// Global error handler
app.use(globalError);

// ======================
// 🔄 STARTUP TASKS
// ======================
const checkHFOnStartup = () => {
  setTimeout(async () => {
    const result = await checkHFConnection();
    if (result.connected) {
      console.log(`✅ ${result.provider || "AI"} API is ready!`);
      console.log(`   Using model: ${result.model}`);
      if (result.embeddingDimensions) {
        console.log(`   Embedding dimensions: ${result.embeddingDimensions}`);
      }
      if (result.note) console.log(`   ${result.note}`);
      if (result.recommendation) console.log(`   💡 ${result.recommendation}`);
    } else {
      // Only show detailed error if it's not an expected configuration issue
      const isExpectedError = result.error && (
        result.error.includes("Insufficient credits") ||
        result.error.includes("410") ||
        result.error.includes("No API key")
      );
      
      if (isExpectedError) {
        console.warn(
          "⚠️ AI API connection failed. AI search features may not work."
        );
        if (result.note) console.warn(`   ${result.note}`);
      } else {
        console.warn(
          "⚠️ AI API connection failed. AI search features may not work."
        );
        console.warn(`   Error: ${result.error}`);
        if (result.note) console.warn(`   ${result.note}`);
      }
    }
  }, 2000);
};

const scheduleInvitationCleanup = () => {
  // eslint-disable-next-line global-require
  const mongoose = require("mongoose");

  const runCleanup = () => {
    if (mongoose.connection.readyState === 1) {
      roomService
        .cleanupOldInvitationsDirect()
        .then((deletedCount) => {
          console.log(
            `✅ Old invitations cleaned up on startup (${deletedCount} deleted)`
          );
        })
        .catch((err) =>
          console.error("Error cleaning old invitations:", err.message)
        );
    } else setTimeout(runCleanup, 2000);
  };

  setTimeout(runCleanup, 3000);

  setInterval(
    () => {
      if (mongoose.connection.readyState === 1) {
        roomService
          .cleanupOldInvitationsDirect()
          .then((deletedCount) =>
            console.log(
              `✅ Old invitations cleaned up (${deletedCount} deleted)`
            )
          )
          .catch((err) =>
            console.error("Error cleaning old invitations:", err.message)
          );
      }
    },
    24 * 60 * 60 * 1000
  );
};

// ✅ Schedule orphaned files cleanup (files on disk without DB record)
const scheduleOrphanedFilesCleanup = () => {
  // eslint-disable-next-line global-require
  const mongoose = require("mongoose");

  const runCleanup = () => {
    if (mongoose.connection.readyState === 1) {
      fileService
        .cleanOrphanedFilesDirect(1) // Clean files older than 1 hour
        .then((result) => {
          if (result.deletedCount > 0) {
            console.log(
              `🧹 Orphaned files cleaned up on startup (${result.deletedCount} deleted)`
            );
          }
        })
        .catch((err) =>
          console.error("Error cleaning orphaned files:", err.message)
        );
    } else setTimeout(runCleanup, 2000);
  };

  setTimeout(runCleanup, 5000); // Run 5 seconds after startup

  // Run cleanup every 6 hours
  setInterval(
    () => {
      if (mongoose.connection.readyState === 1) {
        fileService
          .cleanOrphanedFilesDirect(1) // Clean files older than 1 hour
          .then((result) => {
            if (result.deletedCount > 0) {
              console.log(
                `🧹 Orphaned files cleaned up (${result.deletedCount} deleted)`
              );
            }
          })
          .catch((err) =>
            console.error("Error cleaning orphaned files:", err.message)
          );
      }
    },
    6 * 60 * 60 * 1000 // Every 6 hours
  );
};

// ======================
// 🚀 START SERVER
// ======================
const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`App running on port ${PORT}`);
  scheduleInvitationCleanup();
  scheduleOrphanedFilesCleanup();
  checkHFOnStartup();
});

// ======================
// 🔌 INITIALIZE SOCKET.IO
// ======================
const io = initializeSocketIO(server);
console.log("✅ Socket.IO initialized");

// Make io available globally for use in other modules
global.io = io;

// ======================
// 🛡️ ERROR HANDLING - منع توقف السيرفر
// ======================

// Handle unhandled promise rejections - لا توقف السيرفر
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Promise Rejection:");
  console.error(`   Error: ${err.name || "Unknown"}`);
  console.error(`   Message: ${err.message || err}`);
  if (err.stack) {
    console.error(`   Stack: ${err.stack}`);
  }
  // ✅ لا نوقف السيرفر - فقط نعرض الخطأ ونكمل العمل
  // هذا يمنع توقف الباك إند عند حدوث أخطاء غير متوقعة
});

// Handle uncaught exceptions - توقف نظيف فقط للحالات الخطيرة
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception (Critical Error):");
  console.error(`   Error: ${err.name || "Unknown"}`);
  console.error(`   Message: ${err.message || err}`);
  if (err.stack) {
    console.error(`   Stack: ${err.stack}`);
  }
  // ✅ للأخطاء الحرجة فقط - نوقف السيرفر بشكل نظيف
  console.error("⚠️  Server will shut down due to critical error...");
  server.close(() => {
    console.error("Server closed");
    process.exit(1);
  });
});

// Graceful shutdown عند إرسال إشارات التوقف
process.on("SIGTERM", () => {
  console.log("⚠️  SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("⚠️  SIGINT received. Shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
