const asyncHandler = require('express-async-handler');
const Folder = require('../models/folderModel');
const File = require('../models/fileModel');
const User = require('../models/userModel');
const ApiError = require('../utils/apiError');
const { getCategoryByExtension } = require('../utils/fileUtils');
const { logActivity } = require('./activityLogService');

// Helper function to generate unique folder name
async function generateUniqueFolderName(baseName, parentId, userId) {
    let finalName = baseName;
    let counter = 1;
    
    while (true) {
        const existingFolder = await Folder.findOne({ 
            name: finalName, 
            parentId: parentId || null, 
            userId: userId 
        });
        
        if (!existingFolder) {
            break;
        }
        
        const baseNameWithoutNumber = baseName.replace(/\(\d+\)$/, '');
        finalName = `${baseNameWithoutNumber} (${counter})`;
        counter++;
    }
    
    return finalName;
}

// @desc    Create new empty folder
// @route   POST /api/folders/create
// @access  Private
exports.createFolder = asyncHandler(async (req, res, next) => {
    const { name, parentId } = req.body;
    const userId = req.user._id;

    if (!name) {
        return next(new ApiError('Folder name is required', 400));
    }

    const uniqueName = await generateUniqueFolderName(name, parentId, userId);

    const folder = await Folder.create({
        name: uniqueName,
        userId: userId,
        size: 0,
        path: `uploads/${uniqueName}`,
        parentId: parentId || null,
        isShared: false,
        sharedWith: []
    });

    await logActivity(userId, 'folder_created', 'folder', folder._id, folder.name, {}, {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
    });

    res.status(201).json({ 
        message: "✅ Folder created successfully",
        folder: folder 
    });
});

// @desc    Upload folder with nested structure
// @route   POST /api/folders/upload
// @access  Private
exports.uploadFolder = asyncHandler(async (req, res, next) => {
    const files = req.files;
    const userId = req.user._id;
    const folderName = req.body.folderName || 'Uploaded Folder';
    const parentFolderId = req.body.parentFolderId || null;
    const relativePaths = req.body.relativePaths; // <-- مهم جداً

    if (!files || files.length === 0) {
        return next(new ApiError('No files uploaded', 400));
    }

    if (!relativePaths || relativePaths.length !== files.length) {
        return next(new ApiError('relativePaths mismatch', 400));
    }

    try {
        const uniqueFolderName = await generateUniqueFolderName(folderName, parentFolderId, userId);

        const rootFolder = await Folder.create({
            name: uniqueFolderName,
            userId: userId,
            size: 0,
            path: `uploads/${uniqueFolderName}`,
            parentId: parentFolderId,
            isShared: false,
            sharedWith: []
        });

        const folderMap = new Map();
        folderMap.set('', rootFolder._id);

        const createdFiles = [];
        const createdFolders = [rootFolder];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const relativePath = relativePaths[i]; // <-- من Flutter

            const pathParts = relativePath.split('/'); 
            const fileName = pathParts.pop(); 
            const folderPath = pathParts.join('/');

            let currentParentFolderId = rootFolder._id;

            if (folderPath) {
                if (!folderMap.has(folderPath)) {
                    const parts = folderPath.split('/');
                    let current = '';

                    for (let part of parts) {
                        const currPath = current ? `${current}/${part}` : part;

                        if (!folderMap.has(currPath)) {
                            const parentId = current ? folderMap.get(current) : rootFolder._id;
                            const uniqueSubFolderName = await generateUniqueFolderName(part, parentId, userId);

                            const newFolder = await Folder.create({
                                name: uniqueSubFolderName,
                                userId: userId,
                                size: 0,
                                path: `uploads/${uniqueFolderName}/${currPath}`,
                                parentId: parentId
                            });

                            folderMap.set(currPath, newFolder._id);
                            createdFolders.push(newFolder);
                        }

                        current = currPath;
                    }
                }
                

                currentParentFolderId = folderMap.get(folderPath);
            }

            const category = getCategoryByExtension(file.originalname, file.mimetype);

            const newFile = await File.create({
                name: file.originalname,
                type: file.mimetype,
                size: file.size,
                path: file.path,
                userId: userId,
                parentFolderId: currentParentFolderId,
                category: category
            });

            createdFiles.push(newFile);
        }

        for (const folder of createdFolders) {
            const folderSize = await calculateFolderSizeRecursive(folder._id);
            await Folder.findByIdAndUpdate(folder._id, { size: folderSize });
        }

        const rootFolderSize = await calculateFolderSizeRecursive(rootFolder._id);

        res.status(201).json({
            message: 'Folder uploaded successfully',
            folder: rootFolder,
            filesCount: createdFiles.length,
            foldersCount: createdFolders.length,
            totalSize: rootFolderSize
        });

    } catch (error) {
        return next(new ApiError('Error uploading folder: ' + error.message, 500));
    }
});


// @desc    Get folder details
// @route   GET /api/folders/:id
// @access  Private
exports.getFolderDetails = asyncHandler(async (req, res, next) => {
    const folderId = req.params.id;
    const userId = req.user._id;

    const folder = await Folder.findOne({ _id: folderId, userId: userId })
        .populate('userId', 'name email')
        .populate('sharedWith.user', 'name email');

    if (!folder) {
        return next(new ApiError('Folder not found', 404));
    }

    const subfoldersCount = await Folder.countDocuments({ parentId: folderId, isDeleted: false });
    const filesCount = await File.countDocuments({ parentFolderId: folderId, isDeleted: false });

    let parentFolder = null;
    if (folder.parentId) {
        parentFolder = await Folder.findById(folder.parentId);
    }

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    res.status(200).json({
        message: 'Folder details retrieved successfully',
        folder: {
            _id: folder._id,
            name: folder.name,
            type: 'folder',
            size: folder.size,
            sizeFormatted: formatBytes(folder.size),
            path: folder.path,
            description: folder.description || "",
            tags: folder.tags || [],
            owner: {
                _id: folder.userId._id,
                name: folder.userId.name,
                email: folder.userId.email
            },
            parentFolder: parentFolder ? {
                _id: parentFolder._id,
                name: parentFolder.name
            } : null,
            isShared: folder.isShared,
            sharedWith: folder.sharedWith,
            sharedWithCount: folder.sharedWith.length,
            subfoldersCount: subfoldersCount,
            filesCount: filesCount,
            totalItems: subfoldersCount + filesCount,
            isStarred: folder.isStarred,
            createdAt: folder.createdAt,
            updatedAt: folder.updatedAt
        }
    });
});

// @desc    Get folder contents
// @route   GET /api/folders/:id/contents
// @access  Private
exports.getFolderContents = asyncHandler(async (req, res, next) => {
    const folderId = req.params.id;
    const userId = req.user._id;

    const folder = await Folder.findOne({ _id: folderId, userId: userId });
    if (!folder) {
        return next(new ApiError('Folder not found', 404));
    }

    const subfolders = await Folder.find({ parentId: folderId, isDeleted: false }).sort({ createdAt: -1 });
    const files = await File.find({ parentFolderId: folderId, isDeleted: false }).sort({ createdAt: -1 });

    res.status(200).json({
        message: 'Folder contents retrieved successfully',
        folder: folder,
        contents: [...subfolders, ...files],
        subfolders: subfolders,
        files: files,
        totalItems: subfolders.length + files.length
    });
});

// @desc    Get all folders for user
// @route   GET /api/folders
// @access  Private
exports.getAllFolders = asyncHandler(async (req, res, next) => {
    const userId = req.user._id;
    const parentId = req.query.parentId || null;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { userId, isDeleted: false };
    if (parentId) {
        query.parentId = parentId;
    }

    const folders = await Folder.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

    const totalFolders = await Folder.countDocuments(query);

    res.status(200).json({
        message: 'Folders retrieved successfully',
        folders: folders,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalFolders / limit),
            totalFolders: totalFolders
        }
    });
});

// @desc    Get all items (files + folders)
// @route   GET /api/folders/all-items
// @access  Private
exports.getAllItems = asyncHandler(async (req, res, next) => {
    const userId = req.user._id;
    const parentId = req.query.parentId || null;

    const folderQuery = { userId, isDeleted: false };
    const fileQuery = { userId, isDeleted: false };
    
    if (parentId) {
        folderQuery.parentId = parentId;
        fileQuery.parentFolderId = parentId;
    }

    const folders = await Folder.find(folderQuery);
    const files = await File.find(fileQuery);

    const allItems = [
        ...folders.map(folder => ({ ...folder.toObject(), type: 'folder' })),
        ...files.map(file => ({ ...file.toObject(), type: 'file' }))
    ];

    res.status(200).json({
        message: 'All items retrieved successfully',
        items: allItems
    });
});

// @desc    Get recent folders
// @route   GET /api/folders/recent
// @access  Private
exports.getRecentFolders = asyncHandler(async (req, res, next) => {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;

    const folders = await Folder.find({ userId, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(limit);

    res.status(200).json({
        message: 'Recent folders retrieved successfully',
        folders: folders
    });
});

// @desc    Delete folder
// @route   DELETE /api/folders/:id
// @access  Private
exports.deleteFolder = asyncHandler(async (req, res, next) => {
    const folderId = req.params.id;
    const userId = req.user._id;

    const folder = await Folder.findOne({ _id: folderId, userId: userId });
    if (!folder) {
        return next(new ApiError('Folder not found', 404));
    }

    folder.isDeleted = true;
    folder.deletedAt = new Date();
    await folder.save();

    // Mark contents as deleted
    await Folder.updateMany({ parentId: folderId }, { isDeleted: true, deletedAt: new Date() });
    await File.updateMany({ parentFolderId: folderId }, { isDeleted: true, deletedAt: new Date() });

    res.status(200).json({
        message: '✅ Folder deleted successfully',
        folder: folder
    });
});

// @desc    Restore folder
// @route   PUT /api/folders/:id/restore
// @access  Private
exports.restoreFolder = asyncHandler(async (req, res, next) => {
    const folderId = req.params.id;
    const userId = req.user._id;

    const folder = await Folder.findOne({ _id: folderId, userId: userId });
    if (!folder) {
        return next(new ApiError('Folder not found', 404));
    }

    folder.isDeleted = false;
    folder.deletedAt = null;
    await folder.save();

    res.status(200).json({
        message: '✅ Folder restored successfully',
        folder: folder
    });
});

// @desc    Delete folder permanently
// @route   DELETE /api/folders/:id/permanent
// @access  Private
exports.deleteFolderPermanent = asyncHandler(async (req, res, next) => {
    const folderId = req.params.id;
    const userId = req.user._id;

    const folder = await Folder.findOne({ _id: folderId, userId: userId });
    if (!folder) {
        return next(new ApiError('Folder not found', 404));
    }

    await Folder.findByIdAndDelete(folderId);
    await Folder.deleteMany({ parentId: folderId });
    await File.deleteMany({ parentFolderId: folderId });

    res.status(200).json({
        message: '✅ Folder deleted permanently'
    });
});

// @desc    Get trash folders
// @route   GET /api/folders/trash
// @access  Private
exports.getTrashFolders = asyncHandler(async (req, res, next) => {
    const userId = req.user._id;

    const folders = await Folder.find({ userId, isDeleted: true })
        .sort({ deletedAt: -1 });

    res.status(200).json({
        message: 'Trash folders retrieved successfully',
        folders: folders
    });
});

// @desc    Clean expired folders
// @route   DELETE /api/folders/clean-expired
// @access  Private
exports.cleanExpiredFolders = asyncHandler(async (req, res, next) => {
    // Implementation for cleaning expired folders
    res.status(200).json({
        message: 'Clean expired folders'
    });
});

// @desc    Star/Unstar folder
// @route   PUT /api/folders/:id/star
// @access  Private
exports.toggleStarFolder = asyncHandler(async (req, res, next) => {
    const folderId = req.params.id;
    const userId = req.user._id;

    const folder = await Folder.findOne({ _id: folderId, userId: userId });
    if (!folder) {
        return next(new ApiError('Folder not found', 404));
    }

    folder.isStarred = !folder.isStarred;
    await folder.save();

    res.status(200).json({
        message: folder.isStarred ? "✅ Folder starred" : "✅ Folder unstarred",
        folder: folder
    });
});

// @desc    Get starred folders
// @route   GET /api/folders/starred
// @access  Private
exports.getStarredFolders = asyncHandler(async (req, res, next) => {
    const userId = req.user._id;

    const folders = await Folder.find({ userId, isStarred: true, isDeleted: false })
        .sort({ createdAt: -1 });

    res.status(200).json({
        message: "Starred folders retrieved successfully",
        folders: folders
    });
});

// @desc    Update folder
// @route   PUT /api/folders/:id
// @access  Private
exports.updateFolder = asyncHandler(async (req, res, next) => {
    const folderId = req.params.id;
    const userId = req.user._id;
    const { name, description, tags } = req.body;

    const folder = await Folder.findOne({ _id: folderId, userId: userId });
    if (!folder) {
        return next(new ApiError('Folder not found', 404));
    }

    if (name) folder.name = name;
    if (description !== undefined) folder.description = description;
    if (tags !== undefined) folder.tags = tags;

    await folder.save();

    res.status(200).json({
        message: '✅ Folder updated successfully',
        folder: folder
    });
});

// Helper function to calculate folder size recursively
async function calculateFolderSizeRecursive(folderId) {
    try {
        const files = await File.find({ parentFolderId: folderId, isDeleted: false });
        let totalSize = files.reduce((sum, file) => sum + file.size, 0);
        
        const subfolders = await Folder.find({ parentId: folderId, isDeleted: false });
        for (const subfolder of subfolders) {
            totalSize += await calculateFolderSizeRecursive(subfolder._id);
        }
        
        return totalSize;
    } catch (error) {
        console.error('Error calculating folder size:', error);
        return 0;
    }
}

// SHARING FUNCTIONS - Folder Sharing

// @desc    Share folder with users
// @route   POST /api/folders/:id/share
// @access  Private
exports.shareFolder = asyncHandler(async (req, res, next) => {
    const folderId = req.params.id;
    const userId = req.user._id;
    const { users, permission } = req.body;

    if (!users || !Array.isArray(users) || users.length === 0) {
        return next(new ApiError('Users array is required', 400));
    }

    if (!permission || !["view", "edit", "delete"].includes(permission)) {
        return next(new ApiError('Valid permission is required', 400));
    }

    const folder = await Folder.findOne({ _id: folderId, userId: userId });
    if (!folder) {
        return next(new ApiError('Folder not found', 404));
    }

    const userDocuments = await User.find({ _id: { $in: users } });
    if (userDocuments.length !== users.length) {
        return next(new ApiError('One or more users not found', 400));
    }

    const usersToShare = users.filter(id => id.toString() !== userId.toString());
    if (usersToShare.length === 0) {
        return next(new ApiError('Cannot share with yourself', 400));
    }

    const alreadyShared = folder.sharedWith.map(sw => sw.user.toString());
    const newUsers = usersToShare.filter(id => !alreadyShared.includes(id.toString()));

    for (const userIdToAdd of newUsers) {
        folder.sharedWith.push({
            user: userIdToAdd,
            permission: permission,
            sharedAt: new Date()
        });
    }

    folder.isShared = folder.sharedWith.length > 0;
    await folder.save();
    await folder.populate('sharedWith.user', 'name email');

    await logActivity(userId, 'folder_shared', 'folder', folder._id, folder.name, {
        sharedUsers: newUsers,
        permission: permission
    }, {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
    });

    res.status(200).json({
        message: "✅ Folder shared successfully",
        folder: folder,
        newlyShared: newUsers.length
    });
});

// @desc    Update folder permissions
// @route   PUT /api/folders/:id/share
// @access  Private
exports.updateFolderPermissions = asyncHandler(async (req, res, next) => {
    const folderId = req.params.id;
    const userId = req.user._id;
    const { userPermissions } = req.body;

    if (!userPermissions || !Array.isArray(userPermissions)) {
        return next(new ApiError('userPermissions array is required', 400));
    }

    const folder = await Folder.findOne({ _id: folderId, userId: userId });
    if (!folder) {
        return next(new ApiError('Folder not found', 404));
    }

    let updatedCount = 0;

    for (const { userId: targetUserId, permission } of userPermissions) {
        if (!["view", "edit", "delete"].includes(permission)) continue;

        const sharedEntry = folder.sharedWith.find(
            sw => sw.user.toString() === targetUserId.toString()
        );

        if (sharedEntry) {
            sharedEntry.permission = permission;
            updatedCount++;
        }
    }

    if (updatedCount === 0) {
        return next(new ApiError('No valid permissions to update', 400));
    }

    await folder.save();
    await folder.populate('sharedWith.user', 'name email');

    res.status(200).json({
        message: `✅ Permissions updated for ${updatedCount} user(s)`,
        folder: folder
    });
});

// @desc    Unshare folder
// @route   DELETE /api/folders/:id/share
// @access  Private
exports.unshareFolder = asyncHandler(async (req, res, next) => {
    const folderId = req.params.id;
    const userId = req.user._id;
    const { users } = req.body;

    if (!users || !Array.isArray(users)) {
        return next(new ApiError('Users array is required', 400));
    }

    const folder = await Folder.findOne({ _id: folderId, userId: userId });
    if (!folder) {
        return next(new ApiError('Folder not found', 404));
    }

    const initialCount = folder.sharedWith.length;
    folder.sharedWith = folder.sharedWith.filter(
        sw => !users.includes(sw.user.toString())
    );
    folder.isShared = folder.sharedWith.length > 0;

    await folder.save();
    const removedCount = initialCount - folder.sharedWith.length;

    res.status(200).json({
        message: `✅ ${removedCount} user(s) removed from sharing`,
        folder: folder
    });
});

// @desc    Get folders shared with me
// @route   GET /api/folders/shared-with-me
// @access  Private
exports.getFoldersSharedWithMe = asyncHandler(async (req, res, next) => {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const folders = await Folder.find({
        'sharedWith.user': userId,
        isDeleted: false
    })
        .populate('userId', 'name email')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

    const totalFolders = await Folder.countDocuments({
        'sharedWith.user': userId,
        isDeleted: false
    });

    const formattedFolders = folders.map(folder => {
        const sharedEntry = folder.sharedWith.find(sw => sw.user.toString() === userId.toString());
        return {
            ...folder.toObject(),
            myPermission: sharedEntry ? sharedEntry.permission : null
        };
    });

    res.status(200).json({
        message: "Folders shared with me retrieved successfully",
        folders: formattedFolders,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalFolders / limit),
            totalFolders: totalFolders
        }
    });
});
