const asyncHandler = require("express-async-handler");
const File = require("../models/fileModel");
const Folder = require("../models/folderModel");
const User = require("../models/userModel");
const { getCategoryByExtension } = require("../utils/fileUtils");
const { logActivity } = require("./activityLogService");

// Helper function to generate unique file name
async function generateUniqueFileName(originalName, parentFolderId, userId) {
    const path = require('path');
    const ext = path.extname(originalName);// Get file extension
    const baseName = path.basename(originalName, ext);// Get base name without extension
    
    let finalName = originalName;
    let counter = 1;
    
    while (true) {
        const existingFile = await File.findOne({ 
            name: finalName, 
            parentFolderId: parentFolderId || null, 
            userId: userId 
        });// Check if file with the same name exists
        
        if (!existingFile) {
            break;
        }
        
        // Extract base name without existing number
        const baseNameWithoutNumber = baseName.replace(/\(\d+\)$/, '');
        finalName = `${baseNameWithoutNumber} (${counter})${ext}`;
        counter++;
    }
    
    return finalName;
}

// @desc    Upload multiple files
// @route   POST /api/files/upload-multiple
// @access  Private
exports.uploadMultipleFiles = asyncHandler(async (req, res) => {
  const files = req.files;
  const userId = req.user._id;
  const parentFolderId = req.body.parentFolderId || null; // Optional: upload to specific folder

  if (!files || files.length === 0) {
    res.status(400).json({ message: "No files uploaded" });
    return;
  }

  try {
    const uploadedFiles = [];
    const errors = [];

    // Process each file
    for (const file of files) {
      try {
        const category = getCategoryByExtension(file.originalname, file.mimetype);
        
        // Generate unique file name
        const uniqueFileName = await generateUniqueFileName(file.originalname, parentFolderId, userId);

        const newFile = await File.create({
          name: uniqueFileName,
          type: file.mimetype,
          size: file.size,
          path: file.path,
          userId: userId,
          parentFolderId: parentFolderId,
          category: category,
          isShared: false,
          sharedWith: []
        });

        uploadedFiles.push(newFile);
        
        // Log activity
        await logActivity(userId, 'file_uploaded', 'file', newFile._id, newFile.name, {
          originalName: file.originalname,
          size: file.size,
          type: file.mimetype,
          category: category,
          parentFolderId: parentFolderId
        }, {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      } catch (error) {
        errors.push({
          filename: file.originalname,
          error: error.message
        });
      }
    }

    // Update parent folder size if uploading to a specific folder
    if (parentFolderId) {
      await updateFolderSize(parentFolderId);
    }

    res.status(200).json({
      message: ` ${uploadedFiles.length} files uploaded successfully`,
      files: uploadedFiles,
      errors: errors,
      totalFiles: uploadedFiles.length,
      totalSize: uploadedFiles.reduce((sum, file) => sum + file.size, 0)
    });

  } catch (error) {
    res.status(500).json({
      message: "Error uploading files",
      error: error.message
    });
  }
});

// @desc    Upload single file
// @route   POST /api/files/upload-single
// @access  Private
exports.uploadSingleFile = asyncHandler(async (req, res) => {
  const file = req.file;// Single file from multer
  const userId = req.user._id;  // Logged-in user ID
  const parentFolderId = req.body.parentFolderId || null;

  if (!file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  try {
    const category = getCategoryByExtension(file.originalname, file.mimetype);// Determine file category
    
    // Generate unique file name
    const uniqueFileName = await generateUniqueFileName(file.originalname, parentFolderId, userId);

    const newFile = await File.create({
      name: uniqueFileName,
      type: file.mimetype,
      size: file.size,
      path: file.path,
      userId: userId,
      parentFolderId: parentFolderId,
      category: category,
      isShared: false,
      sharedWith: []
    });

    // Log activity
    await logActivity(userId, 'file_uploaded', 'file', newFile._id, newFile.name, {
      originalName: file.originalname,
      size: file.size,
      type: file.mimetype,
      category: category,
      parentFolderId: parentFolderId
    }, {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Update parent folder size if uploading to a specific folder
    if (parentFolderId) {
      await updateFolderSize(parentFolderId);
    }

    res.status(201).json({
      message: "✅ File uploaded successfully",
      file: newFile
    });

  } catch (error) { 
    console.log('Error uploading file:', error),
    res.status(500).json({
      message: "Error uploading file",
      error: error.message,
     

    });
  }
});

// @desc    Get file details
// @route   GET /api/files/:id
// @access  Private
exports.getFileDetails = asyncHandler(async (req, res, next) => {
  const fileId = req.params.id;
  const userId = req.user._id;

  // Find file with populated user and sharedWith
  const file = await File.findById(fileId)
    .populate('userId', 'name email')
    .populate('parentFolderId', 'name')
    .populate('sharedWith', 'name email');

  if (!file) {
    return res.status(404).json({
      message: "File not found"
    });
  }

  // Check if user has access (owner or shared with)
  const isOwner = file.userId._id.toString() === userId.toString();
  const hasAccess = isOwner || file.sharedWith.some(user => user._id.toString() === userId.toString());

  if (!hasAccess) {
    return res.status(403).json({
      message: "Access denied"
    });
  }

  // Calculate readable size
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get file extension
  const getFileExtension = (filename) => {
    return filename.split('.').pop().toLowerCase();
  };

  res.status(200).json({
    message: "File details retrieved successfully",
    file: {
      _id: file._id,
      name: file.name,
      type: file.type,
      category: file.category,
      size: file.size,
      sizeFormatted: formatBytes(file.size),
      extension: getFileExtension(file.name),
      path: file.path,
      description: file.description || "",
      tags: file.tags || [],
      owner: {
        _id: file.userId._id,
        name: file.userId.name,
        email: file.userId.email
      },
      parentFolder: file.parentFolderId ? {
        _id: file.parentFolderId._id,
        name: file.parentFolderId.name
      } : null,
      isShared: file.isShared,
      sharedWith: file.sharedWith,
      sharedWithCount: file.sharedWith.length,
      isOwner: isOwner,
      isStarred: file.isStarred,
      createdAt: file.createdAt,
      uploadedAt: file.createdAt,
      updatedAt: file.updatedAt,
      lastModified: file.updatedAt
    }
  });
});

// @desc    Get files by category (for logged-in user only)
// @route   GET /api/files/category/:category
// @access  Private
exports.getFilesByCategory = asyncHandler(async (req, res) => {
  const { category } = req.params; // File category from URL
  const userId = req.user._id;
  const parentFolderId = req.query.parentFolderId || null;

  // Build query
  const query = { category, userId, isDeleted: false }; // ✅ فقط الملفات غير المحذوفة
  if (parentFolderId) {
    query.parentFolderId = parentFolderId;
  }

  // جلب الملفات الخاصة بالمستخدم في نفس الفئة
  const files = await File.find(query);

  if (!files || files.length === 0) {
    return res.status(201).json({
      message: `No files found for user in category: ${category}`,
    });
  }

  res.status(200).json({
    message: `Files in category: ${category}`,
    count: files.length,
    files,
  });
});

// @desc    Get all files for user
// @route   GET /api/files
// @access  Private
exports.getAllFiles = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const parentFolderId = req.query.parentFolderId || null;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  // Sorting parameters
  const sortBy = req.query.sortBy || 'createdAt'; // name, size, createdAt, updatedAt, type, category
  const sortOrder = req.query.sortOrder || 'desc'; // asc, desc

  // Build query
  const query = { userId, isDeleted: false };
  if (parentFolderId) {
    query.parentFolderId = parentFolderId;
  }

  // Build sort object
  const sortObj = {};
  switch (sortBy) {
    case 'name':
      sortObj.name = sortOrder === 'asc' ? 1 : -1;
      break;
    case 'size':
      sortObj.size = sortOrder === 'asc' ? 1 : -1;
      break;
    case 'type':
      sortObj.type = sortOrder === 'asc' ? 1 : -1;
      break;
    case 'category':
      sortObj.category = sortOrder === 'asc' ? 1 : -1;
      break;
    case 'updatedAt':
      sortObj.updatedAt = sortOrder === 'asc' ? 1 : -1;
      break;
    case 'createdAt':
    default:
      sortObj.createdAt = sortOrder === 'asc' ? 1 : -1;
      break;
  }

  const files = await File.find(query)
    .skip(skip)
    .limit(limit)
    .sort(sortObj);

  const totalFiles = await File.countDocuments(query);

  res.status(200).json({
    message: "Files retrieved successfully",
    files: files,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalFiles / limit),
      totalFiles: totalFiles,
      hasNext: page < Math.ceil(totalFiles / limit),
      hasPrev: page > 1
    },
    sorting: {
      sortBy,
      sortOrder
    }
  });
});

// @desc    Get recent files
// @route   GET /api/files/recent
// @access  Private
exports.getRecentFiles = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const limit = parseInt(req.query.limit) || 10;

  const files = await File.find({ userId })
    .sort({ uploadedAt: -1 })
    .limit(limit)
    .populate('parentFolderId', 'name')
    .populate('userId', 'name email');

  res.status(200).json({
    message: 'Recent files retrieved successfully',
    count: files.length,
    files: files
  });
});

// Helper function to update folder size (including subfolders)
async function updateFolderSize(folderId) {
  try {
    // Get all files directly in this folder
    const files = await File.find({ parentFolderId: folderId, isDeleted: false });
    let totalSize = files.reduce((sum, file) => sum + file.size, 0);
    
    // Get all subfolders and calculate their sizes recursively
    const subfolders = await Folder.find({ parentId: folderId, isDeleted: false });
    for (const subfolder of subfolders) {
      const subfolderSize = await calculateFolderSizeRecursive(subfolder._id);
      totalSize += subfolderSize;
    }
    
    await Folder.findByIdAndUpdate(folderId, { size: totalSize });
  } catch (error) {
    console.error('Error updating folder size:', error);
  }
}

// Helper function to calculate folder size recursively
async function calculateFolderSizeRecursive(folderId) {
  try {
    // Get all files directly in this folder
    const files = await File.find({ parentFolderId: folderId, isDeleted: false });
    let totalSize = files.reduce((sum, file) => sum + file.size, 0);
    
    // Get all subfolders and calculate their sizes recursively
    const subfolders = await Folder.find({ parentId: folderId, isDeleted: false });
    for (const subfolder of subfolders) {
      const subfolderSize = await calculateFolderSizeRecursive(subfolder._id);
      totalSize += subfolderSize;
    }
    
    return totalSize;
  } catch (error) {
    console.error('Error calculating folder size recursively:', error);
    return 0;
  }
}

// @desc    Delete file (move to trash)
// @route   DELETE /api/files/:id
// @access  Private
exports.deleteFile = asyncHandler(async (req, res) => {
  const fileId = req.params.id;
  const userId = req.user._id;

  // Find file
  const file = await File.findOne({ _id: fileId, userId: userId });
  
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Check if already deleted
  if (file.isDeleted) {
    return res.status(400).json({ message: "File is already deleted" });
  }

  // Set deleted status with 30 days expiry
  const now = new Date();
  const expiryDate = new Date(now);
  expiryDate.setDate(expiryDate.getDate() + 30);

  file.isDeleted = true;
  file.deletedAt = now;
  file.deleteExpiryDate = expiryDate;
  await file.save();

  // Log activity
  await logActivity(userId, 'file_deleted', 'file', file._id, file.name, {
    originalSize: file.size,
    type: file.type,
    category: file.category,
    deleteExpiryDate: expiryDate
  }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: "✅ File moved to trash successfully",
    file: file,
    deleteExpiryDate: expiryDate
  });
});

// @desc    Restore file from trash
// @route   PUT /api/files/:id/restore
// @access  Private
exports.restoreFile = asyncHandler(async (req, res) => {
  const fileId = req.params.id;
  const userId = req.user._id;

  // Find file
  const file = await File.findOne({ _id: fileId, userId: userId });
  
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Check if file is deleted
  if (!file.isDeleted) {
    return res.status(400).json({ message: "File is not in trash" });
  }

  // Restore file
  file.isDeleted = false;
  file.deletedAt = null;
  file.deleteExpiryDate = null;
  await file.save();

  // Log activity
  await logActivity(userId, 'file_restored', 'file', file._id, file.name, {
    originalSize: file.size,
    type: file.type,
    category: file.category
  }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: "✅ File restored successfully",
    file: file
  });
});

// @desc    Delete file permanently
// @route   DELETE /api/files/:id/permanent
// @access  Private
exports.deleteFilePermanent = asyncHandler(async (req, res) => {
  const fileId = req.params.id;
  const userId = req.user._id;
  const fs = require('fs');
  const path = require('path');

  // Find file
  const file = await File.findOne({ _id: fileId, userId: userId });
  
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Delete physical file
  const filePath = path.join(__dirname, '..', file.path);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Delete from database
  await File.findByIdAndDelete(fileId);

  // Log activity
  await logActivity(userId, 'file_permanently_deleted', 'file', fileId, file.name, {
    originalSize: file.size,
    type: file.type,
    category: file.category
  }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: "✅ File deleted permanently"
  });
});

// @desc    Get deleted files (trash)
// @route   GET /api/files/trash
// @access  Private
exports.getTrashFiles = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Get deleted files
  const files = await File.find({ 
    userId: userId, 
    isDeleted: true 
  })
    .sort({ deletedAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('parentFolderId', 'name');

  const totalFiles = await File.countDocuments({ 
    userId: userId, 
    isDeleted: true 
  });

  res.status(200).json({
    message: "Trash files retrieved successfully",
    files: files,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalFiles / limit),
      totalFiles: totalFiles,
      hasNext: page < Math.ceil(totalFiles / limit),
      hasPrev: page > 1
    }
  });
});

// @desc    Clean expired deleted files (should be called by cron job)
// @route   DELETE /api/files/clean-expired
// @access  Private
exports.cleanExpiredFiles = asyncHandler(async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const now = new Date();

  // Find expired deleted files
  const expiredFiles = await File.find({
    isDeleted: true,
    deleteExpiryDate: { $lt: now }
  });

  let deletedCount = 0;
  const errors = [];

  for (const file of expiredFiles) {
    try {
      // Delete physical file
      const filePath = path.join(__dirname, '..', file.path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Delete from database
      await File.findByIdAndDelete(file._id);
      deletedCount++;
    } catch (error) {
      errors.push({
        fileId: file._id,
        error: error.message
      });
    }
  }

  res.status(200).json({
    message: `✅ ${deletedCount} expired files deleted permanently`,
    deletedCount: deletedCount,
    errors: errors
  });
});

// @desc    Star/Unstar file
// @route   PUT /api/files/:id/star
// @access  Private
exports.toggleStarFile = asyncHandler(async (req, res) => {
  const fileId = req.params.id;
  const userId = req.user._id;

  // Find file
  const file = await File.findOne({ _id: fileId, userId: userId });
  
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Toggle star status
  file.isStarred = !file.isStarred;
  await file.save();

  // Log activity
  await logActivity(userId, file.isStarred ? 'file_starred' : 'file_unstarred', 'file', file._id, file.name, {
    originalSize: file.size,
    type: file.type,
    category: file.category
  }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: file.isStarred ? "✅ File starred successfully" : "✅ File unstarred successfully",
    file: file
  });
});

// @desc    Get starred files
// @route   GET /api/files/starred
// @access  Private
exports.getStarredFiles = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Get starred files - exclude deleted files
  const files = await File.find({ 
    userId: userId, 
    isStarred: true,
    isDeleted: false
  })
    .sort({ uploadedAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('parentFolderId', 'name');

  const totalFiles = await File.countDocuments({ 
    userId: userId, 
    isStarred: true,
    isDeleted: false
  });

  res.status(200).json({
    message: "Starred files retrieved successfully",
    files: files,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalFiles / limit),
      totalFiles: totalFiles,
      hasNext: page < Math.ceil(totalFiles / limit),
      hasPrev: page > 1
    }
  });
});

// @desc    Update file metadata
// @route   PUT /api/files/:id
// @access  Private
exports.updateFile = asyncHandler(async (req, res) => {
  const fileId = req.params.id;
  const userId = req.user._id;
  const { name, description, tags, parentFolderId } = req.body;

  // Find file
  const file = await File.findOne({ _id: fileId, userId: userId });
  
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Update name if provided
  if (name !== undefined && name !== file.name) {
    // Check if new name is not empty
    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "File name cannot be empty" });
    }
    
    // Generate unique name for the new name
    const newName = await generateUniqueFileName(name, file.parentFolderId, userId);
    file.name = newName;
  }

  // Update parent folder if provided
  if (parentFolderId !== undefined && parentFolderId !== file.parentFolderId?.toString()) {
    // If moving to a specific folder, verify it exists and belongs to user
    if (parentFolderId) {
      const targetFolder = await Folder.findOne({ _id: parentFolderId, userId: userId });
      if (!targetFolder) {
        return res.status(404).json({ message: "Target folder not found" });
      }
    }
    
    const oldParentFolderId = file.parentFolderId;
    file.parentFolderId = parentFolderId || null;
    
    // Update folder sizes
    if (oldParentFolderId) {
      await updateFolderSize(oldParentFolderId);
    }
    if (file.parentFolderId) {
      await updateFolderSize(file.parentFolderId);
    }
  }

  // Update metadata fields
  if (description !== undefined) {
    file.description = description;
  }
  if (tags !== undefined) {
    file.tags = Array.isArray(tags) ? tags : [];
  }
  
  await file.save();

  // Log activity
  await logActivity(userId, 'file_updated', 'file', file._id, file.name, {
    changes: {
      nameChanged: name !== undefined && name !== file.name,
      descriptionChanged: description !== undefined,
      tagsChanged: tags !== undefined,
      parentFolderChanged: parentFolderId !== undefined && parentFolderId !== file.parentFolderId?.toString()
    },
    originalSize: file.size,
    type: file.type,
    category: file.category
  }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });
console.log('File metadata updated:', file);
  res.status(200).json({
    message: "✅ File metadata updated successfully",
    file: file
    
  });
});

// @desc    Update all folder sizes (admin function)
// @route   PUT /api/files/update-folder-sizes
// @access  Private
exports.updateAllFolderSizes = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  try {
    // Get all folders for the user
    const folders = await Folder.find({ userId: userId, isDeleted: false });
    
    let updatedCount = 0;
    const errors = [];
    
    // Update each folder size
    for (const folder of folders) {
      try {
        const newSize = await calculateFolderSizeRecursive(folder._id);
        await Folder.findByIdAndUpdate(folder._id, { size: newSize });
        updatedCount++;
      } catch (error) {
        errors.push({
          folderId: folder._id,
          folderName: folder.name,
          error: error.message
        });
      }
    }
    
    res.status(200).json({
      message: `✅ ${updatedCount} folder sizes updated successfully`,
      updatedCount: updatedCount,
      totalFolders: folders.length,
      errors: errors
    });
    
  } catch (error) {
    res.status(500).json({
      message: "Error updating folder sizes",
      error: error.message
    });
  }
});

// @desc    Share file with users
// @route   POST /api/files/:id/share
// @access  Private
exports.shareFile = asyncHandler(async (req, res) => {
  const fileId = req.params.id;
  const userId = req.user._id;
  const { users, permission } = req.body;

  // Validate input
  if (!users || !Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ message: "Users array is required" });
  }

  if (!permission || !["view", "edit", "delete"].includes(permission)) {
    return res.status(400).json({ message: "Valid permission (view/edit/delete) is required" });
  }

  // Find file
  const file = await File.findOne({ _id: fileId, userId: userId });
  
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Validate that all users exist
  const userDocuments = await User.find({ _id: { $in: users } });
  if (userDocuments.length !== users.length) {
    return res.status(400).json({ message: "One or more users not found" });
  }

  // Don't allow sharing with yourself
  const usersToShare = users.filter(id => id.toString() !== userId.toString());
  if (usersToShare.length === 0) {
    return res.status(400).json({ message: "Cannot share with yourself" });
  }

  // Add users to sharedWith array (avoid duplicates)
  const alreadyShared = file.sharedWith.map(sw => sw.user.toString());
  const newUsers = usersToShare.filter(id => !alreadyShared.includes(id.toString()));

  for (const userIdToAdd of newUsers) {
    file.sharedWith.push({
      user: userIdToAdd,
      permission: permission,
      sharedAt: new Date()
    });
  }

  file.isShared = file.sharedWith.length > 0;
  await file.save();

  // Populate user info
  await file.populate('sharedWith.user', 'name email');

  // Log activity
  await logActivity(userId, 'file_shared', 'file', file._id, file.name, {
    sharedUsers: newUsers,
    permission: permission,
    totalSharedUsers: file.sharedWith.length
  }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: "✅ File shared successfully",
    file: file,
    newlyShared: newUsers.length,
    alreadyShared: usersToShare.length - newUsers.length
  });
});

// @desc    Update permission for shared users
// @route   PUT /api/files/:id/share
// @access  Private
exports.updateFilePermissions = asyncHandler(async (req, res) => {
  const fileId = req.params.id;
  const userId = req.user._id;
  const { userPermissions } = req.body; // [{ userId, permission }, ...]

  // Validate input
  if (!userPermissions || !Array.isArray(userPermissions) || userPermissions.length === 0) {
    return res.status(400).json({ message: "userPermissions array is required" });
  }

  // Find file
  const file = await File.findOne({ _id: fileId, userId: userId });
  
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  let updatedCount = 0;

  // Update permissions for each user
  for (const { userId: targetUserId, permission } of userPermissions) {
    if (!permission || !["view", "edit", "delete"].includes(permission)) {
      continue;
    }

    const sharedEntry = file.sharedWith.find(
      sw => sw.user.toString() === targetUserId.toString()
    );

    if (sharedEntry) {
      sharedEntry.permission = permission;
      updatedCount++;
    }
  }

  if (updatedCount === 0) {
    return res.status(400).json({ message: "No valid permissions to update" });
  }

  await file.save();

  // Populate user info
  await file.populate('sharedWith.user', 'name email');

  // Log activity
  await logActivity(userId, 'file_permissions_updated', 'file', file._id, file.name, {
    updatedPermissions: userPermissions,
    updatedCount: updatedCount
  }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: `✅ Permissions updated for ${updatedCount} user(s)`,
    file: file
  });
});

// @desc    Remove sharing for specific users
// @route   DELETE /api/files/:id/share
// @access  Private
exports.unshareFile = asyncHandler(async (req, res) => {
  const fileId = req.params.id;
  const userId = req.user._id;
  const { users } = req.body; // Array of user IDs to remove

  // Validate input
  if (!users || !Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ message: "Users array is required" });
  }

  // Find file
  const file = await File.findOne({ _id: fileId, userId: userId });
  
  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  const initialCount = file.sharedWith.length;

  // Remove users from sharedWith
  file.sharedWith = file.sharedWith.filter(
    sw => !users.includes(sw.user.toString())
  );

  file.isShared = file.sharedWith.length > 0;
  await file.save();

  const removedCount = initialCount - file.sharedWith.length;

  // Populate user info
  await file.populate('sharedWith.user', 'name email');

  // Log activity
  await logActivity(userId, 'file_unshared', 'file', file._id, file.name, {
    removedUsers: users,
    removedCount: removedCount
  }, {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(200).json({
    message: `✅ ${removedCount} user(s) removed from sharing`,
    file: file
  });
});

// @desc    Get shared file details (for shared users)
// @route   GET /api/files/shared/:id
// @access  Private
exports.getSharedFileDetails = asyncHandler(async (req, res) => {
  const fileId = req.params.id;
  const userId = req.user._id;

  // Find file where user is in sharedWith
  const file = await File.findById(fileId)
    .populate('userId', 'name email')
    .populate('parentFolderId', 'name')
    .populate('sharedWith.user', 'name email');

  if (!file) {
    return res.status(404).json({ message: "File not found" });
  }

  // Check if user has access
  const isOwner = file.userId._id.toString() === userId.toString();
  const sharedEntry = file.sharedWith.find(sw => sw.user._id.toString() === userId.toString());
  
  if (!isOwner && !sharedEntry) {
    return res.status(403).json({ message: "Access denied" });
  }

  const userPermission = isOwner ? "owner" : sharedEntry.permission;

  // Format response
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileExtension = (filename) => {
    return filename.split('.').pop().toLowerCase();
  };

  res.status(200).json({
    message: "Shared file details retrieved successfully",
    file: {
      _id: file._id,
      name: file.name,
      type: file.type,
      category: file.category,
      size: file.size,
      sizeFormatted: formatBytes(file.size),
      extension: getFileExtension(file.name),
      path: file.path,
      description: file.description || "",
      tags: file.tags || [],
      owner: {
        _id: file.userId._id,
        name: file.userId.name,
        email: file.userId.email
      },
      parentFolder: file.parentFolderId ? {
        _id: file.parentFolderId._id,
        name: file.parentFolderId.name
      } : null,
      userPermission: userPermission,
      sharedWith: file.sharedWith,
      isStarred: file.isStarred,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt
    }
  });
});

// @desc    Get all files shared with current user
// @route   GET /api/files/shared-with-me
// @access  Private
exports.getFilesSharedWithMe = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Find all files where current user is in sharedWith
  const files = await File.find({
    'sharedWith.user': userId,
    isDeleted: false
  })
    .populate('userId', 'name email')
    .populate('parentFolderId', 'name')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const totalFiles = await File.countDocuments({
    'sharedWith.user': userId,
    isDeleted: false
  });

  // Format response to include permission
  const formattedFiles = files.map(file => {
    const sharedEntry = file.sharedWith.find(sw => sw.user.toString() === userId.toString());
    return {
      ...file.toObject(),
      myPermission: sharedEntry ? sharedEntry.permission : null
    };
  });

  res.status(200).json({
    message: "Files shared with me retrieved successfully",
    files: formattedFiles,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalFiles / limit),
      totalFiles: totalFiles,
      hasNext: page < Math.ceil(totalFiles / limit),
      hasPrev: page > 1
    }
  });
});
