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
const { checkHFConnection } = require("./services/aiService");

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
      console.warn(
        "⚠️ AI API connection failed. AI search features may not work."
      );
      console.warn(`   Error: ${result.error}`);
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

// ======================
// 🚀 START SERVER
// ======================
const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`App running on port ${PORT}`);
  scheduleInvitationCleanup();
  checkHFOnStartup();
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error(`UnhandledRejection: ${err.name} | ${err.message}`);
  server.close(() => process.exit(1));
});
