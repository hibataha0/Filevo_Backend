// ✅ تحميل dotenv أولاً قبل أي require آخر
const dotenv = require("dotenv");
dotenv.config({ path: "config.env" });

// const { request } = require("express");
//requireبتعمل import للبكح تاعت express
const express = require("express"); //بجيب express نفسه
const cors = require("cors"); //للسماح بالاتصال من الفرونت إند
const morgan = require("morgan"); //بيطبع في الـ console كل الطلبات اللي بتوصل للسيرفر (للتجريب).
const path = require("path");
const ApiError = require("./utils/apiError");
const authRoutes = require("./api/authRoutes");
const userRoute = require("./api/userRoute");
const dbConnection = require("./config/database");

const globalError = require("./middlewares/errMiddlewarel");
const fileRoutes = require("./api/fileRoutes");
const folderRoutes = require("./api/folderRoutes");
const activityLogRoutes = require("./api/activityLogRoutes");
const roomRoutes = require("./api/roomRoutes");
const searchRoutes = require("./api/searchRoutes");
const roomService = require("./services/roomService");
const { checkHFConnection } = require("./services/aiService");

//connect with db
dbConnection();

// التحقق من اتصال AI API (OpenRouter أو HuggingFace)
const checkHFOnStartup = () => {
  setTimeout(async () => {
    const result = await checkHFConnection();
    if (result.connected) {
      console.log(`✅ ${result.provider || "AI"} API is ready!`);
      console.log(`   Using model: ${result.model}`);
      if (result.embeddingDimensions) {
        console.log(`   Embedding dimensions: ${result.embeddingDimensions}`);
      }
      if (result.note) {
        console.log(`   ${result.note}`);
      }
      if (result.recommendation) {
        console.log(`   💡 ${result.recommendation}`);
      }
    } else {
      console.warn(
        "⚠️ AI API connection failed. AI search features may not work."
      );
      console.warn(`   Error: ${result.error}`);
      console.warn("   You can still use text-based search.");
      if (result.openRouterSetup) {
        console.warn(`   📝 ${result.openRouterSetup}`);
      }
      if (result.huggingFaceSetup) {
        console.warn(`   📝 ${result.huggingFaceSetup}`);
      }
    }
  }, 2000); // انتظار 2 ثانية بعد بدء السيرفر
};

// Schedule automatic cleanup of old invitations every 24 hours
const scheduleInvitationCleanup = () => {
  // Wait for database connection before running cleanup
  const mongoose = require("mongoose");

  const runCleanup = () => {
    if (mongoose.connection.readyState === 1) {
      // Database is connected, run cleanup
      roomService
        .cleanupOldInvitationsDirect()
        .then((deletedCount) => {
          console.log(
            `✅ Old invitations cleaned up on startup (${deletedCount} deleted)`
          );
        })
        .catch((err) => {
          console.error("Error cleaning up old invitations:", err.message);
        });
    } else {
      // Wait a bit and try again
      setTimeout(runCleanup, 2000);
    }
  };

  // Start cleanup after a short delay to ensure DB connection
  setTimeout(runCleanup, 3000);

  // Schedule to run every 24 hours
  setInterval(
    () => {
      if (mongoose.connection.readyState === 1) {
        roomService
          .cleanupOldInvitationsDirect()
          .then((deletedCount) => {
            console.log(
              `✅ Old invitations cleaned up (${deletedCount} deleted)`
            );
          })
          .catch((err) => {
            console.error("Error cleaning up old invitations:", err.message);
          });
      }
    },
    24 * 60 * 60 * 1000
  ); // 24 hours in milliseconds
};
//express app
const app = express(); //اعمل ابكليشن express جديد

// جعل مجلد my_files متاح للوصول العام
app.use("/my_files", express.static(path.join(__dirname, "my_files")));

// ✅ خدمة الملفات الثابتة من مجلد uploads (لصور المستخدمين)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Enable CORS for all origins
app.use(cors());

app.use(express.json());

//Midddlewares

//هاي منشان يطبع كل العمليات الي بقوم فيهم من get ,post ...
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
  console.log(`mode:${process.env.NODE_ENV}`);
}

app.get("/", (req, res) => {
  res.send("Our API V2");
});

//Routs
app.use("/api/v1/users", userRoute);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/files", fileRoutes);
app.use("/api/v1/folders", folderRoutes);
app.use("/api/v1/activity-log", activityLogRoutes);
app.use("/api/v1/rooms", roomRoutes);
app.use("/api/v1/search", searchRoutes);

app.use((req, res, next) => {
  next(new ApiError(`Can't find this route : ${req.originalUrl}`, 400));
});

// Middleware لمعالجة الأخطاء
app.use(globalError);

//HTTP METHODS
//GET - Retrive Date
// app.get('/users',(req,res)=>{//بتؤخذ route الي هي path لاشي ع سيرفر
//     //2_call back function --> req الي جاي , res

//     if(users.length==0)
//     {
//         res.status(404).send('No users found!');
//         return;
//     }
//   res.status(200).send(users);
// });

//POST - create data
// app.post('/users',(req,res)=>{
//    // console.log(req.body);
//    const user=req.body;
//    const finduser= users.find((x)=> x.id === user.id);
//    if(finduser)
//    {
//      res.status(400).send('user already exists');
//      return;
//    }
//     users.push(user);
//     res.status(201).send('created');
// })

//PUT
//DELETE
// app.delete('/users/:id', (req, res) => {
//   const { id } = req.params;
//   const findUserIndex = users.findIndex((x) => x.id == id);

//   if (findUserIndex === -1) {
//     res.status(400).send("User not found!");
//     return;
//   }

//   // نحذف المستخدم من المصفوفة
//   users.splice(findUserIndex, 1);

//   // نرجع الرد بعد الحذف
//   res.status(200).send("User deleted successfully!");
// });

const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () => {
  console.log(`App running GGHG ${PORT}`);
  // Start automatic cleanup
  scheduleInvitationCleanup();
  // Check Hugging Face API connection
  checkHFOnStartup();
});

// Handle rejection outside express
process.on("unhandledRejection", (err) => {
  console.error(`UnhandledRejection Errors: ${err.name} | ${err.message}`);
  server.close(() => {
    console.error(`Shutting down....`);
    process.exit(1);
  });
});
