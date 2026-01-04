const mongoose = require("mongoose");

const dbConnection = () => {
  // ✅ تحسين معالجة الاتصال بقاعدة البيانات - لا توقف السيرفر عند الفشل
  mongoose
    .connect(process.env.DB_URI, {
      // ✅ خيارات إضافية لتحسين الاستقرار
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    })
    .then((conn) => {
      console.log(`✅ Database Connected: ${conn.connection.host}`);
    })
    .catch((err) => {
      // ✅ لا نوقف السيرفر - فقط نعرض الخطأ ونحاول إعادة الاتصال
      console.error(`❌ Database Connection Error: ${err.message}`);
      console.error("⚠️  Server will continue running. Retrying connection...");
      
      // ✅ إعادة محاولة الاتصال بعد 5 ثواني
      setTimeout(() => {
        console.log("🔄 Retrying database connection...");
        dbConnection();
      }, 5000);
    });

  // ✅ معالجة أحداث الاتصال
  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️  MongoDB disconnected. Attempting to reconnect...");
  });

  mongoose.connection.on("error", (err) => {
    console.error(`❌ MongoDB connection error: ${err.message}`);
    // ✅ لا نوقف السيرفر - فقط نعرض الخطأ
  });

  mongoose.connection.on("reconnected", () => {
    console.log("✅ MongoDB reconnected successfully");
  });
};

module.exports = dbConnection;


