const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ApiError = require('../utils/apiError');

// Create uploads directory if it doesn't exist
const uploadsDir = 'my_files';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Custom storage configuration for folder uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Extract folder path from the file's fieldname
    const folderPath = extractFolderPath(file.fieldname);
    const fullPath = path.join(uploadsDir, folderPath);
    
    // Create directory structure if it doesn't exist
    fs.mkdirSync(fullPath, { recursive: true });
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    // Keep original filename but add timestamp to avoid conflicts
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${timestamp}-${name}${ext}`);
  }
});

// Extract folder path from fieldname
function extractFolderPath(fieldname) {
  // fieldname format: "folder/subfolder/file" or just "file"
  const parts = fieldname.split('/');
  
  // Remove the last part (filename) to get folder path
  if (parts.length > 1) {
    return parts.slice(0, -1).join('/');
  }
  
  // If no folder structure, return empty string (root folder)
  return '';
}

// File filter to allow all file types for folder uploads
const fileFilter = (req, file, cb) => {
  // Allow all file types for folder uploads
  cb(null, true);
};

// Multer configuration for folder uploads
const uploadFolder = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
    files: 1000 // Maximum 1000 files per upload
  }
});

// Middleware to handle folder uploads
exports.uploadFolder = uploadFolder.any();

// Helper function to get folder structure from uploaded files
exports.getFolderStructure = (files) => {
  const structure = {};
  
  files.forEach(file => {
    const fieldname = file.fieldname;
    const parts = fieldname.split('/');
    
    // Build nested structure
    let current = structure;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      if (!current[folderName]) {
        current[folderName] = {
          type: 'folder',
          children: {},
          files: []
        };
      }
      current = current[folderName].children;
    }
    
    // Add file to the appropriate folder
    const fileName = parts[parts.length - 1];
    const parentFolder = getParentFolder(structure, parts.slice(0, -1));
    parentFolder.files.push({
      name: fileName,
      originalName: file.originalname,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype,
      type: 'file'
    });
  });
  
  return structure;
};

// Helper function to get parent folder from structure
function getParentFolder(structure, pathParts) {
  let current = structure;
  for (const part of pathParts) {
    if (current[part] && current[part].type === 'folder') {
      current = current[part].children;
    }
  }
  return current;
}

// Helper function to calculate folder size
exports.calculateFolderSize = (structure) => {
  let totalSize = 0;
  
  function calculateSize(obj) {
    for (const key in obj) {
      if (obj[key].type === 'folder') {
        calculateSize(obj[key].children);
        obj[key].size = obj[key].files.reduce((sum, file) => sum + file.size, 0);
        totalSize += obj[key].size;
      } else if (obj[key].type === 'file') {
        totalSize += obj[key].size;
      }
    }
  }
  
  calculateSize(structure);
  return totalSize;
};