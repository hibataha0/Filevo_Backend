const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ApiError = require("../utils/apiError");

// Create uploads directory if it doesn't exist
const uploadsDir = "my_files";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Storage configuration for multiple files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // All files go to the main uploads directory
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename but add timestamp to avoid conflicts
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${timestamp}-${name}${ext}`);
  },
});

// File filter to allow all file types
const fileFilter = (req, file, cb) => {
  // Allow all file types for file uploads
  cb(null, true);
};

// Multer configuration for multiple files
const uploadMultipleFiles = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 1000 * 1024 * 1024, // 100MB per file
    files: 50, // Maximum 50 files per upload
  },
});

// Multer configuration for single file
const uploadSingleFile = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 1000 * 1024 * 1024, // 600MB per file
  },
});

// Middleware exports
exports.uploadMultipleFiles = uploadMultipleFiles.array("files", 50); // 'files' is the field name
exports.uploadSingleFile = uploadSingleFile.single("file"); // 'file' is the field name

// Helper function to validate file types
exports.validateFileType = (allowedTypes) => (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(`File type ${file.mimetype} not allowed`, 400), false);
  }
};

// Helper function to validate file size
exports.validateFileSize = (maxSize) => (req, file, cb) => {
  if (file.size <= maxSize) {
    cb(null, true);
  } else {
    cb(new ApiError(`File size exceeds ${maxSize} bytes`, 400), false);
  }
};
