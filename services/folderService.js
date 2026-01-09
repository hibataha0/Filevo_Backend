const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const Folder = require("../models/folderModel");
const File = require("../models/fileModel");
const User = require("../models/userModel");
const ApiError = require("../utils/apiError");
const { getCategoryByExtension } = require("../utils/fileUtils");
const { logActivity } = require("./activityLogService");
const fs = require("fs");
const path = require("path");

// ✅ Folder Access Sessions - لحفظ حالة التحقق من الوصول للمجلدات المحمية
// Key format: `${userId}_${folderId}`
// Value: expiry timestamp (in milliseconds)
const folderAccessSessions = new Map();
const FOLDER_ACCESS_SESSION_DURATION = 30 * 60 * 1000; // 30 دقيقة

// ✅ Helper function to check and clean expired sessions
function getFolderAccessSession(userId, folderId) {
  const key = `${userId}_${folderId}`;
  const expiryTime = folderAccessSessions.get(key);

  if (!expiryTime) {
    return false;
  }

  // Check if session has expired
  if (Date.now() > expiryTime) {
    folderAccessSessions.delete(key);
    return false;
  }

  return true;
}

// ✅ Helper function to set folder access session
function setFolderAccessSession(userId, folderId) {
  const key = `${userId}_${folderId}`;
  const expiryTime = Date.now() + FOLDER_ACCESS_SESSION_DURATION;
  folderAccessSessions.set(key, expiryTime);
}

// ✅ Helper function to clear folder access session
function clearFolderAccessSession(userId, folderId) {
  const key = `${userId}_${folderId}`;
  folderAccessSessions.delete(key);
}

// ✅ Helper function to generate unique folder name
async function generateUniqueFolderName(baseName, parentId, userId) {
  let finalName = baseName;
  let counter = 1;

  while (true) {
    const existingFolder = await Folder.findOne({
      name: finalName,
      parentId: parentId || null,
      userId: userId,
    });

    if (!existingFolder) {
      break;
    }

    const baseNameWithoutNumber = baseName.replace(/\(\d+\)$/, "");
    finalName = `${baseNameWithoutNumber} (${counter})`;
    counter++;
  }

  return finalName;
}

// ✅ Helper function to calculate folder size recursively
async function calculateFolderSizeRecursive(folderId) {
  try {
    const files = await File.find({
      parentFolderId: folderId,
      isDeleted: false,
    });
    let totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

    const subfolders = await Folder.find({
      parentId: folderId,
      isDeleted: false,
    });
    for (const subfolder of subfolders) {
      totalSize += await calculateFolderSizeRecursive(subfolder._id);
    }

    return totalSize;
  } catch (error) {
    console.error("Error calculating folder size:", error);
    return 0;
  }
}

// ✅ Helper function to calculate folder files count recursively
async function calculateFolderFilesCountRecursive(folderId) {
  try {
    const files = await File.find({
      parentFolderId: folderId,
      isDeleted: false,
    });
    let totalFiles = files.length;

    const subfolders = await Folder.find({
      parentId: folderId,
      isDeleted: false,
    });
    for (const subfolder of subfolders) {
      const subfolderFilesCount = await calculateFolderFilesCountRecursive(
        subfolder._id
      );
      totalFiles += subfolderFilesCount;
    }

    return totalFiles;
  } catch (error) {
    console.error(
      `❌ Error calculating folder files count for ${folderId}:`,
      error
    );
    return 0;
  }
}

// ✅ Helper function to calculate folder stats (size + files count) recursively - أكثر كفاءة
async function calculateFolderStatsRecursive(folderId) {
  try {
    const files = await File.find({
      parentFolderId: folderId,
      isDeleted: false,
    });
    let totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
    let totalFiles = files.length;

    // console.log(`   🔍 Folder ${folderId}: Direct files count: ${totalFiles}, Direct size: ${totalSize} bytes`);

    const subfolders = await Folder.find({
      parentId: folderId,
      isDeleted: false,
    });
    // console.log(`   🔍 Folder ${folderId}: Subfolders count: ${subfolders.length}`);

    for (const subfolder of subfolders) {
      const subfolderStats = await calculateFolderStatsRecursive(subfolder._id);
      const subSize =
        subfolderStats && subfolderStats.size ? Number(subfolderStats.size) : 0;
      const subFiles =
        subfolderStats && subfolderStats.filesCount
          ? Number(subfolderStats.filesCount)
          : 0;
      totalSize += subSize;
      totalFiles += subFiles;
    }

    const result = {
      size: Number(totalSize) || 0,
      filesCount: Number(totalFiles) || 0,
    };

    // console.log(`   ✅ Final stats for ${folderId}: size=${result.size}, filesCount=${result.filesCount}`);

    return result;
  } catch (error) {
    console.error(`❌ Error calculating folder stats for ${folderId}:`, error);
    return {
      size: 0,
      filesCount: 0,
    };
  }
}

// ✅ Helper function to update folder size and filesCount (increment/decrement)
// هذه الدالة تحدث القيم المخزنة مباشرة بدون حساب recursive - أسرع بكثير
async function updateFolderStats(folderId, sizeDelta, filesCountDelta) {
  try {
    if (!folderId) return;

    // ✅ تحديث المجلد الحالي والحصول على parentId في query واحد
    const folder = await Folder.findByIdAndUpdate(
      folderId,
      {
        $inc: {
          size: sizeDelta || 0,
          filesCount: filesCountDelta || 0,
        },
      },
      { select: "parentId", new: false } // ✅ جلب parentId فقط
    ).lean();

    // ✅ تحديث المجلدات الأب أيضاً (propagate up)
    if (folder && folder.parentId) {
      await updateFolderStats(folder.parentId, sizeDelta, filesCountDelta);
    }
  } catch (error) {
    console.error(`❌ Error updating folder stats for ${folderId}:`, error);
  }
}

// ✅ Helper function to recalculate and update folder stats (for initial setup or fixing)
// هذه الدالة تحسب القيم بشكل recursive وتخزنها - تستخدم عند الحاجة لإصلاح البيانات
async function recalculateAndUpdateFolderStats(folderId) {
  try {
    if (!folderId) return;

    const stats = await calculateFolderStatsRecursive(folderId);

    await Folder.findByIdAndUpdate(folderId, {
      size: stats.size || 0,
      filesCount: stats.filesCount || 0,
    });

    // ✅ تحديث المجلدات الأب أيضاً
    const folder = await Folder.findById(folderId);
    if (folder && folder.parentId) {
      await recalculateAndUpdateFolderStats(folder.parentId);
    }
  } catch (error) {
    console.error(
      `❌ Error recalculating folder stats for ${folderId}:`,
      error
    );
  }
}

// ✅ Helper function to recursively delete folder and all its contents
async function deleteFolderRecursive(folderId, userId) {
  // Get folder info before deletion
  const folder = await Folder.findOne({ _id: folderId, userId: userId });
  if (!folder) {
    return; // Folder doesn't exist or doesn't belong to user
  }

  // Find all subfolders
  const subfolders = await Folder.find({ parentId: folderId, userId: userId });

  // Recursively delete each subfolder
  for (const subfolder of subfolders) {
    await deleteFolderRecursive(subfolder._id, userId);
  }

  // Find all files in this folder
  const files = await File.find({ parentFolderId: folderId, userId: userId });

  // Delete physical files from file system
  for (const file of files) {
    const filePath = path.join(__dirname, "..", file.path);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        // If file doesn't exist or can't be deleted, continue
        console.error(`Error deleting file ${filePath}:`, err.message);
      }
    }
  }

  // Delete all files from database
  await File.deleteMany({ parentFolderId: folderId, userId: userId });

  // Delete all subfolders from database (should be empty now after recursive deletion)
  await Folder.deleteMany({ parentId: folderId, userId: userId });

  // Try to delete the physical folder if it exists
  const folderPath = path.join(__dirname, "..", folder.path);
  if (fs.existsSync(folderPath)) {
    try {
      // Use rmSync if available (Node.js 14.14.0+), otherwise use rmdirSync
      if (fs.rmSync) {
        fs.rmSync(folderPath, { recursive: true, force: true });
      } else {
        fs.rmdirSync(folderPath, { recursive: true });
      }
    } catch (err) {
      // If folder doesn't exist or can't be deleted, continue
      console.error(`Error deleting folder ${folderPath}:`, err.message);
    }
  }

  // Delete the folder itself from database (must be last)
  await Folder.findByIdAndDelete(folderId);
}

// @desc    Create new empty folder
// @route   POST /api/folders/create
// @access  Private
exports.createFolder = asyncHandler(async (req, res, next) => {
  const { name, parentId } = req.body;
  const userId = req.user._id;

  if (!name) {
    return next(new ApiError("Folder name is required", 400));
  }

  // Validate parentId if provided
  let validatedParentId = null;
  if (parentId) {
    const parentFolder = await Folder.findOne({
      _id: parentId,
      userId: userId,
      isDeleted: false,
    });

    if (!parentFolder) {
      return next(
        new ApiError(
          "Parent folder not found or you don't have access to it",
          404
        )
      );
    }

    validatedParentId = parentFolder._id;
  }

  const uniqueName = await generateUniqueFolderName(
    name,
    validatedParentId,
    userId
  );

  const folder = await Folder.create({
    name: uniqueName,
    userId: userId,
    size: 0,
    path: `uploads/${uniqueName}`,
    parentId: validatedParentId,
    isShared: false,
    sharedWith: [],
    // ✅ التأكد من أن المجلد الجديد غير محمي
    isProtected: false,
    protectionType: "none",
    passwordHash: null,
  });

  await logActivity(
    userId,
    "folder_created",
    "folder",
    folder._id,
    folder.name,
    {},
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(201).json({
    message: "✅ Folder created successfully",
    folder: folder,
  });
});

// @desc    Upload folder with nested structure
// @route   POST /api/folders/upload
// @access  Private
exports.uploadFolder = asyncHandler(async (req, res, next) => {
  const files = req.files;
  const userId = req.user._id;
  const folderName = req.body.folderName || "Uploaded Folder";
  let parentFolderId = req.body.parentFolderId || null;

  // Validate parentFolderId if provided
  if (parentFolderId) {
    const parentFolder = await Folder.findOne({
      _id: parentFolderId,
      userId: userId,
      isDeleted: false,
    });

    if (!parentFolder) {
      return next(
        new ApiError(
          "Parent folder not found or you don't have access to it",
          404
        )
      );
    }

    parentFolderId = parentFolder._id;
  }

  console.log("📁 Uploading folder:", folderName, "for user:", userId);
  console.log("📁 Files count:", files ? files.length : 0);

  // ✅ دعم طرق مختلفة لإرسال relativePaths
  // يدعم: req.body.relativePaths أو req.body['relativePaths[]']
  let relativePaths = req.body.relativePaths;

  // ✅ إذا كانت undefined، حاول الحصول عليها من relativePaths[]
  if (!relativePaths && req.body["relativePaths[]"]) {
    relativePaths = req.body["relativePaths[]"];
  }

  // ✅ إذا كانت string (JSON string)، حولها إلى array
  if (typeof relativePaths === "string") {
    try {
      // ✅ محاولة parse كـ JSON أولاً
      relativePaths = JSON.parse(relativePaths);
    } catch (e) {
      // ✅ إذا فشل parse، اعتبرها string مفرد
      relativePaths = [relativePaths];
    }
  }

  // ✅ التأكد من أن relativePaths هو array
  if (!Array.isArray(relativePaths)) {
    relativePaths = [];
  }

  if (!files || files.length === 0) {
    return next(new ApiError("No files uploaded", 400));
  }

  // ✅ التحقق من أن relativePaths تطابق عدد الملفات
  if (relativePaths.length !== files.length) {
    console.warn(
      `⚠️ relativePaths count (${relativePaths.length}) != files count (${files.length})`
    );
    console.warn("⚠️ Fixing relativePaths - using file names...");

    // ✅ إصلاح: استخدام أسماء الملفات كـ relativePaths
    relativePaths = files.map((file) => file.originalname);
    console.log("✅ Fixed relativePaths count:", relativePaths.length);
  }

  try {
    const uniqueFolderName = await generateUniqueFolderName(
      folderName,
      parentFolderId,
      userId
    );

    const rootFolder = await Folder.create({
      name: uniqueFolderName,
      userId: userId,
      size: 0,
      path: `uploads/${uniqueFolderName}`,
      parentId: parentFolderId,
      isShared: false,
      sharedWith: [],
    });

    const folderMap = new Map();
    folderMap.set("", rootFolder._id);

    const createdFiles = [];
    const createdFolders = [rootFolder];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relativePath = relativePaths[i];

      // ✅ التحقق من أن relativePath موجود وصالح
      if (!relativePath || typeof relativePath !== "string") {
        console.warn(
          `⚠️ Invalid relativePath at index ${i}, using file name: ${file.originalname}`
        );
        // ✅ استخدام اسم الملف كـ relativePath
        const fileName = file.originalname;
        const category = getCategoryByExtension(
          file.originalname,
          file.mimetype
        );

        const newFile = await File.create({
          name: file.originalname,
          type: file.mimetype,
          size: file.size,
          path: file.path,
          userId: userId,
          parentFolderId: rootFolder._id, // ✅ وضع الملف مباشرة في المجلد الجذر
          category: category,
        });

        createdFiles.push(newFile);
        continue;
      }

      // ✅ التحقق إذا كان relativePath يحتوي على مسار نسبي (مثل "subfolder/file.pdf")
      // أو فقط اسم ملف (مثل "file.pdf")
      const hasSubfolder =
        relativePath.includes("/") && relativePath.split("/").length > 1;

      let currentParentFolderId = rootFolder._id;

      if (hasSubfolder) {
        // ✅ الحالة 1: relativePath يحتوي على مسار نسبي (مثل "subfolder/file.pdf")
        // ✅ إنشاء المجلدات الفرعية
        const pathParts = relativePath
          .split("/")
          .filter((part) => part.length > 0);
        const fileName = pathParts.pop() || file.originalname;
        const folderPath = pathParts.join("/");

        if (folderPath) {
          if (!folderMap.has(folderPath)) {
            const parts = folderPath
              .split("/")
              .filter((part) => part.length > 0);
            let current = "";

            for (let part of parts) {
              const currPath = current ? `${current}/${part}` : part;

              if (!folderMap.has(currPath)) {
                const parentId = current
                  ? folderMap.get(current)
                  : rootFolder._id;
                const uniqueSubFolderName = await generateUniqueFolderName(
                  part,
                  parentId,
                  userId
                );

                const newFolder = await Folder.create({
                  name: uniqueSubFolderName,
                  userId: userId,
                  size: 0,
                  path: `uploads/${uniqueFolderName}/${currPath}`,
                  parentId: parentId,
                });

                folderMap.set(currPath, newFolder._id);
                createdFolders.push(newFolder);
              }

              current = currPath;
            }
          }

          currentParentFolderId = folderMap.get(folderPath);
        }

        const category = getCategoryByExtension(
          file.originalname,
          file.mimetype
        );

        const newFile = await File.create({
          name: fileName, // ✅ استخدام اسم الملف من المسار
          type: file.mimetype,
          size: file.size,
          path: file.path,
          userId: userId,
          parentFolderId: currentParentFolderId,
          category: category,
        });

        createdFiles.push(newFile);
      } else {
        // ✅ الحالة 2: relativePath هو فقط اسم ملف (مثل "file.pdf")
        // ✅ وضع الملف مباشرة في المجلد الجذر بدون إنشاء مجلدات فرعية
        const category = getCategoryByExtension(
          file.originalname,
          file.mimetype
        );

        const newFile = await File.create({
          name: file.originalname,
          type: file.mimetype,
          size: file.size,
          path: file.path,
          userId: userId,
          parentFolderId: rootFolder._id, // ✅ وضع الملف مباشرة في المجلد الجذر
          category: category,
        });

        createdFiles.push(newFile);
      }
    }

    // ✅ تحديث حجم وعدد الملفات للمجلدات - استخدام الدوال الجديدة (أسرع بكثير)
    for (const file of createdFiles) {
      if (file.parentFolderId) {
        await updateFolderStats(file.parentFolderId, file.size, 1);
      }
    }

    // ✅ إعادة حساب القيم النهائية للتأكد من الدقة
    await recalculateAndUpdateFolderStats(rootFolder._id);

    // ✅ إعادة جلب المجلد مع القيم المحدثة
    const updatedRootFolder = await Folder.findById(rootFolder._id);

    res.status(201).json({
      message: "Folder uploaded successfully",
      folder: updatedRootFolder,
      filesCount: createdFiles.length,
      foldersCount: createdFolders.length,
      totalSize: updatedRootFolder.size || 0,
    });
  } catch (error) {
    console.error("❌ Error uploading folder:", error);
    return next(new ApiError("Error uploading folder: " + error.message, 500));
  }
});

// @desc    Get folder details
// @route   GET /api/folders/:id
// @access  Private
exports.getFolderDetails = asyncHandler(async (req, res, next) => {
  const folderId = req.params.id;
  const userId = req.user._id;

  // ✅ Find folder - استخدام select لتقليل البيانات المطلوبة
  // ✅ بدون populate - سنجلب البيانات بشكل منفصل إذا احتجناها
  let folder = await Folder.findById(folderId)
    .select(
      "name userId parentId path size filesCount description tags isShared sharedWith isStarred isProtected protectionType createdAt updatedAt"
    )
    .lean(); // ✅ استخدام lean() لتقليل overhead

  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  // Check if user has access
  const userIdStr = userId.toString();
  const folderUserId = folder.userId.toString();
  const isOwner = folderUserId === userIdStr;

  // ✅ تحسين sharedWith check - بدون populate
  const isSharedWith =
    folder.sharedWith &&
    folder.sharedWith.some((sw) => {
      const swUser = sw.user;
      const sharedUserId =
        swUser && swUser.toString
          ? swUser.toString()
          : (swUser || "").toString();
      return sharedUserId === userIdStr;
    });

  // Check if folder is shared in a room where user is a member
  let isSharedInRoom = false;
  let roomInfo = null;
  let sharedInRoomInfo = null;

  // ✅ فقط إذا لم يكن المستخدم هو المالك أو مشترك معه مباشرة
  if (!isOwner && !isSharedWith) {
    const Room = require("../models/roomModel");
    // ✅ تحسين query - استخدام select لتقليل البيانات المطلوبة + index محسّن
    const room = await Room.findOne({
      "folders.folderId": folderId,
      "members.user": userId,
      isActive: true,
    })
      .select(
        "_id name description folders.$.folderId folders.$.sharedBy folders.$.sharedAt"
      )
      .lean(); // ✅ استخدام lean() لتقليل overhead - بدون populate

    isSharedInRoom = !!room;

    if (room) {
      // Get folder sharing info from room
      const folderInRoom = Array.isArray(room.folders)
        ? room.folders.find(
            (f) => f && f.folderId && f.folderId.toString() === folderId
          )
        : null;

      roomInfo = {
        _id: room._id,
        name: room.name,
        description: room.description || "",
      };

      // ✅ جلب sharedBy user فقط إذا كان موجوداً
      const sharedByUserId = folderInRoom && folderInRoom.sharedBy;
      const sharedByUser = sharedByUserId
        ? await User.findById(sharedByUserId).select("name email").lean()
        : null;

      sharedInRoomInfo = {
        sharedAt: (folderInRoom && folderInRoom.sharedAt) || null,
        sharedBy: sharedByUser
          ? {
              _id: sharedByUser._id,
              name: sharedByUser.name,
              email: sharedByUser.email,
            }
          : null,
        room: roomInfo,
      };
    }

    if (!isSharedInRoom) {
      return next(new ApiError("Folder not found", 404));
    }
  }

  // ✅ استخدام القيم المخزنة مباشرة - أسرع بكثير!
  const totalSize = Number(folder.size) || 0;
  const totalFilesCount = Number(folder.filesCount) || 0;

  // ✅ جلب جميع البيانات المتوازية في مرة واحدة - أسرع بكثير!
  // ✅ إذا كان المستخدم هو المالك، لا نحتاج جلب owner user (نعرفه من req.user)
  const promises = [
    Folder.countDocuments({
      parentId: folderId,
      isDeleted: false,
    }),
    File.countDocuments({
      parentFolderId: folderId,
      isDeleted: false,
    }),
    folder.parentId
      ? Folder.findById(folder.parentId).select("_id name").lean()
      : Promise.resolve(null),
  ];

  // ✅ جلب owner user فقط إذا لم يكن المستخدم هو المالك
  if (!isOwner) {
    promises.push(User.findById(folder.userId).select("name email").lean());
  } else {
    promises.push(Promise.resolve(null)); // ✅ placeholder
  }

  // ✅ جلب sharedWith users فقط إذا كانوا موجودين وضروريين
  if (folder.sharedWith && folder.sharedWith.length > 0) {
    const sharedUserIds = folder.sharedWith
      .map((sw) => {
        const swUser = sw.user;
        return swUser || (swUser && swUser._id) || null;
      })
      .filter(Boolean);

    if (sharedUserIds.length > 0) {
      promises.push(
        User.find({
          _id: { $in: sharedUserIds },
        })
          .select("name email")
          .lean()
      );
    } else {
      promises.push(Promise.resolve([]));
    }
  } else {
    promises.push(Promise.resolve([]));
  }

  const [
    subfoldersCount,
    directFilesCount,
    parentFolder,
    ownerUser,
    sharedUsers,
  ] = await Promise.all(promises);

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // ✅ بناء sharedWith مع البيانات المحدثة
  const sharedWithFormatted =
    folder.sharedWith && folder.sharedWith.length > 0
      ? folder.sharedWith.map((sw) => {
          const swUser = sw.user;
          const sharedUserId =
            swUser && swUser.toString
              ? swUser.toString()
              : (swUser || "").toString();
          const sharedUser = sharedUsers.find(
            (u) => u._id.toString() === sharedUserId
          );
          const swUserId = swUser || (swUser && swUser._id) || sw.user;
          return {
            user: sharedUser
              ? {
                  _id: sharedUser._id,
                  name: sharedUser.name,
                  email: sharedUser.email,
                }
              : { _id: swUserId },
            permission: sw.permission || "view",
            sharedAt: sw.sharedAt || new Date(),
          };
        })
      : [];

  // Build response object
  const folderResponse = {
    _id: folder._id,
    name: folder.name,
    type: "folder",
    size: totalSize, // ✅ الحجم الكلي (مخزن)
    sizeFormatted: formatBytes(totalSize),
    path: folder.path,
    description: folder.description || "",
    tags: folder.tags || [],
    owner: (() => {
      if (isOwner) {
        return {
          _id: req.user._id,
          name: req.user.name,
          email: req.user.email,
        };
      }
      if (ownerUser) {
        return {
          _id: ownerUser._id,
          name: ownerUser.name,
          email: ownerUser.email,
        };
      }
      return { _id: folder.userId };
    })(),
    parentFolder: parentFolder
      ? {
          _id: parentFolder._id,
          name: parentFolder.name,
        }
      : null,
    isShared: folder.isShared,
    sharedWith: sharedWithFormatted,
    sharedWithCount: sharedWithFormatted.length,
    subfoldersCount: subfoldersCount,
    filesCount: totalFilesCount, // ✅ عدد الملفات الكلي (مخزن)
    totalItems: subfoldersCount + directFilesCount, // ✅ العناصر المباشرة فقط
    isStarred: folder.isStarred,
    // 🔒 Folder Protection Info (without password hash)
    isProtected: folder.isProtected || false,
    protectionType: folder.protectionType || "none",
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    lastModified: folder.updatedAt,
  };

  // Add room sharing info if shared in room
  if (isSharedInRoom && sharedInRoomInfo) {
    folderResponse.sharedInRoom = {
      room: sharedInRoomInfo.room,
      sharedAt: sharedInRoomInfo.sharedAt,
      lastModified: folder.updatedAt,
    };
  }

  res.status(200).json({
    message: "Folder details retrieved successfully",
    folder: folderResponse,
  });
});

// ✅ getFolderContents - يعرض محتويات المجلد مع pagination
// @desc    Get folder contents (with pagination)
// @route   GET /api/folders/:id/contents
// @access  Private
exports.getFolderContents = asyncHandler(async (req, res, next) => {
  const folderId = req.params.id;
  const userId = req.user._id;

  // ✅ Pagination parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Find folder - check if user owns it, has direct access, or it's shared in a room
  let folder = await Folder.findById(folderId)
    .select("name size filesCount createdAt updatedAt userId sharedWith")
    .lean();

  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  // Check if user has access
  const userIdStr = userId.toString();
  const folderUserId = folder.userId.toString();
  const isOwner = folderUserId === userIdStr;

  // Check if folder is directly shared with user
  const isSharedWith =
    folder.sharedWith &&
    folder.sharedWith.some((sw) => {
      const swUser = sw.user;
      const sharedUserId =
        swUser && swUser.toString
          ? swUser.toString()
          : (swUser || "").toString();
      return sharedUserId === userIdStr;
    });

  // Check if folder is shared in a room where user is a member
  let isSharedInRoom = false;
  if (!isOwner && !isSharedWith) {
    const Room = require("../models/roomModel");
    const room = await Room.findOne({
      "folders.folderId": folderId,
      "members.user": userId,
      isActive: true,
    }).lean();

    isSharedInRoom = !!room;
  }

  // If user doesn't have access, return error
  if (!isOwner && !isSharedWith && !isSharedInRoom) {
    return next(new ApiError("Folder not found", 404));
  }

  // ✅ DB-level pagination محسّن - جلب limit مضاعف للتعويض عن الدمج
  // ✅ هذا أسرع بكثير من جلب كل البيانات ثم pagination في JS
  const fetchLimit = Math.max(limit * 2, 50); // ✅ جلب المزيد للتعويض عن الدمج والترتيب

  // ✅ جلب جميع البيانات المتوازية - أسرع بكثير!
  // ✅ ملاحظة: لا نضيف filter بـ userId لأن المجلد مشترك ويجب عرض جميع المحتويات بغض النظر عن المالك
  const [subfolders, files, totalSubfolders, totalFiles] = await Promise.all([
    Folder.find({
      parentId: folderId,
      isDeleted: false,
    })
      .select("name size filesCount createdAt updatedAt isStarred parentId")
      .sort({ createdAt: -1 })
      .limit(fetchLimit)
      .lean(),
    File.find({
      parentFolderId: folderId,
      isDeleted: false,
    })
      .select(
        "name type size createdAt updatedAt isStarred parentFolderId category"
      )
      .sort({ createdAt: -1 })
      .limit(fetchLimit)
      .lean(),
    Folder.countDocuments({
      parentId: folderId,
      isDeleted: false,
    }),
    File.countDocuments({
      parentFolderId: folderId,
      isDeleted: false,
    }),
  ]);

  // ✅ استخدام القيم المخزنة مباشرة - أسرع بكثير!
  const subfoldersWithDetails = subfolders.map((subfolder) => {
    return {
      ...subfolder,
      type: "folder",
      size: Number(subfolder.size) || 0,
      filesCount: Number(subfolder.filesCount) || 0,
    };
  });

  const filesWithDetails = files.map((file) => {
    return {
      ...file,
      type: "file",
    };
  });

  // ✅ دمج subfolders و files وترتيبهم حسب التاريخ
  const allContents = [...subfoldersWithDetails, ...filesWithDetails].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  // ✅ تطبيق pagination على المدمج (للحفاظ على نفس Response structure)
  const totalItems = totalSubfolders + totalFiles;
  const paginatedContents = allContents.slice(skip, skip + limit);

  // ✅ فصل subfolders و files من النتائج المصفاة
  const subfoldersPaginated = paginatedContents.filter(
    (item) => item.type === "folder"
  );
  const filesPaginated = paginatedContents.filter(
    (item) => item.type === "file"
  );

  res.status(200).json({
    message: "Folder contents retrieved successfully",
    folder: folder,
    contents: paginatedContents,
    subfolders: subfoldersPaginated,
    files: filesPaginated,
    totalItems: totalItems,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalItems / limit),
      totalItems: totalItems,
      totalSubfolders: totalSubfolders,
      totalFiles: totalFiles,
      hasNext: page < Math.ceil(totalItems / limit),
      hasPrev: page > 1,
    },
  });
});

// ✅ getAllFolders - يعرض فقط المجلدات بدون parent (parentId = null)
// @desc    Get all folders for user (without parent - parentId = null)
// @route   GET /api/folders
// @access  Private
exports.getAllFolders = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  // ✅ فقط المجلدات بدون parent (null)
  const parentId = null;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const query = {
    userId,
    isDeleted: false,
    parentId: null, // ✅ فقط المجلدات بدون parent
  };

  const folders = await Folder.find(query)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const totalFolders = await Folder.countDocuments(query);

  // ✅ استخدام القيم المخزنة مباشرة - أسرع بكثير!
  const foldersWithDetails = folders.map((folder) => {
    const folderObj = folder.toObject ? folder.toObject() : { ...folder };
    // ✅ استخدام القيم المخزنة مباشرة (size و filesCount)
    folderObj.size = Number(folder.size) || 0;
    folderObj.filesCount = Number(folder.filesCount) || 0;
    return folderObj;
  });

  // ✅ التحقق النهائي من القيم قبل الإرسال
  // console.log('📦 Final folders with details:');
  // foldersWithDetails.forEach((folder, index) => {
  //     console.log(`   Folder ${index + 1}: ${folder.name}`);
  //     console.log(`      size: ${folder.size} (type: ${typeof folder.size})`);
  //     console.log(`      filesCount: ${folder.filesCount} (type: ${typeof folder.filesCount})`);
  // });

  res.status(200).json({
    message: "Folders retrieved successfully",
    folders: foldersWithDetails,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalFolders / limit),
      totalFolders: totalFolders,
      hasNext: page < Math.ceil(totalFolders / limit),
      hasPrev: page > 1,
    },
  });
});

// ✅ getAllItems - يعرض فقط المجلدات والملفات بدون parent
// @desc    Get all items (files + folders) without parent
// @route   GET /api/folders/all-items
// @access  Private
exports.getAllItems = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  // ✅ فقط المجلدات والملفات بدون parent (null)
  const parentId = null;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const folderQuery = {
    userId,
    isDeleted: false,
    parentId: null, // ✅ فقط المجلدات بدون parent
  };

  const fileQuery = {
    userId,
    isDeleted: false,
    parentFolderId: null, // ✅ فقط الملفات بدون parent
  };

  const folders = await Folder.find(folderQuery)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const files = await File.find(fileQuery)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const totalFolders = await Folder.countDocuments(folderQuery);
  const totalFiles = await File.countDocuments(fileQuery);

  // ✅ استخدام القيم المخزنة مباشرة - أسرع بكثير!
  const foldersWithDetails = folders.map((folder) => {
    const folderObj = folder.toObject();
    // ✅ استخدام القيم المخزنة مباشرة (size و filesCount)
    folderObj.size = Number(folder.size) || 0;
    folderObj.filesCount = Number(folder.filesCount) || 0;
    return { ...folderObj, type: "folder" };
  });

  const allItems = [
    ...foldersWithDetails,
    ...files.map((file) => ({ ...file.toObject(), type: "file" })),
  ];

  const totalItems = totalFolders + totalFiles;

  res.status(200).json({
    message: "All items retrieved successfully",
    items: allItems,
    folders: folders,
    files: files,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalItems / limit),
      totalItems: totalItems,
      totalFolders: totalFolders,
      totalFiles: totalFiles,
      hasNext: page < Math.ceil(totalItems / limit),
      hasPrev: page > 1,
    },
  });
});

// @desc    Get recent folders
// @route   GET /api/folders/recent
// @access  Private
exports.getRecentFolders = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const limit = parseInt(req.query.limit) || 10;

  // ✅ جلب المجلدات مع القيم المخزنة مباشرة - بدون أي حساب recursive
  const folders = await Folder.find({ userId, isDeleted: false })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select(
      "name size filesCount createdAt updatedAt isStarred isShared parentId"
    )
    .lean(); // ✅ استخدام lean() لتقليل overhead

  // ✅ استخدام القيم المخزنة مباشرة - أسرع بكثير!
  const foldersWithDetails = folders.map((folder) => {
    // ✅ استخدام القيم المخزنة مباشرة (size و filesCount)
    folder.size = Number(folder.size) || 0;
    folder.filesCount = Number(folder.filesCount) || 0;
    return folder;
  });

  res.status(200).json({
    message: "Recent folders retrieved successfully",
    folders: foldersWithDetails,
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
    return next(new ApiError("Folder not found", 404));
  }

  // Mark folder as deleted
  folder.isDeleted = true;
  folder.deletedAt = new Date();
  await folder.save();

  // Recursively mark all subfolders as deleted
  async function markSubfoldersAsDeleted(parentId) {
    const subfolders = await Folder.find({
      parentId: parentId,
      userId: userId,
      isDeleted: false,
    });
    for (const subfolder of subfolders) {
      subfolder.isDeleted = true;
      subfolder.deletedAt = new Date();
      await subfolder.save();
      // Recursively mark children
      await markSubfoldersAsDeleted(subfolder._id);
    }
  }

  // Mark all subfolders as deleted recursively
  await markSubfoldersAsDeleted(folderId);

  // Mark all files in this folder and subfolders as deleted
  // Get all folder IDs including subfolders
  async function getAllSubfolderIds(parentId) {
    const folderIds = [parentId];
    const subfolders = await Folder.find({
      parentId: parentId,
      userId: userId,
    });
    for (const subfolder of subfolders) {
      const childIds = await getAllSubfolderIds(subfolder._id);
      folderIds.push(...childIds);
    }
    return folderIds;
  }

  const allFolderIds = await getAllSubfolderIds(folderId);
  await File.updateMany(
    { parentFolderId: { $in: allFolderIds }, userId: userId },
    { isDeleted: true, deletedAt: new Date() }
  );

  // ✅ تحديث حجم وعدد الملفات للمجلد الأب - استخدام الدوال الجديدة (أسرع بكثير)
  if (folder.parentId) {
    await recalculateAndUpdateFolderStats(folder.parentId);
  }

  res.status(200).json({
    message: "✅ Folder deleted successfully",
    folder: folder,
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
    return next(new ApiError("Folder not found", 404));
  }

  folder.isDeleted = false;
  folder.deletedAt = null;
  await folder.save();

  // ✅ تحديث حجم وعدد الملفات للمجلد الأب - استخدام الدوال الجديدة (أسرع بكثير)
  if (folder.parentId) {
    await recalculateAndUpdateFolderStats(folder.parentId);
  }

  res.status(200).json({
    message: "✅ Folder restored successfully",
    folder: folder,
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
    return next(new ApiError("Folder not found", 404));
  }

  // Recursively delete folder and all its contents
  await deleteFolderRecursive(folderId, userId);

  // Log activity
  await logActivity(
    userId,
    "folder_permanently_deleted",
    "folder",
    folderId,
    folder.name,
    {
      originalSize: folder.size,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: "✅ Folder and all its contents deleted permanently",
  });
});

// @desc    Get trash folders
// @route   GET /api/folders/trash
// @access  Private
exports.getTrashFolders = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const folders = await Folder.find({ userId, isDeleted: true })
    .sort({ deletedAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalFolders = await Folder.countDocuments({ userId, isDeleted: true });

  // ✅ استخدام القيم المخزنة مباشرة - أسرع بكثير!
  const foldersWithDetails = folders.map((folder) => {
    const folderObj = folder.toObject();
    // ✅ استخدام القيم المخزنة مباشرة (size و filesCount)
    folderObj.size = Number(folder.size) || 0;
    folderObj.filesCount = Number(folder.filesCount) || 0;
    return folderObj;
  });

  res.status(200).json({
    message: "Trash folders retrieved successfully",
    folders: foldersWithDetails,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalFolders / limit),
      totalFolders: totalFolders,
      hasNext: page < Math.ceil(totalFolders / limit),
      hasPrev: page > 1,
    },
  });
});

// @desc    Clean expired folders
// @route   DELETE /api/folders/clean-expired
// @access  Private
exports.cleanExpiredFolders = asyncHandler(async (req, res, next) => {
  // Implementation for cleaning expired folders
  res.status(200).json({
    message: "Clean expired folders",
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
    return next(new ApiError("Folder not found", 404));
  }

  folder.isStarred = !folder.isStarred;
  await folder.save();

  res.status(200).json({
    message: folder.isStarred ? "✅ Folder starred" : "✅ Folder unstarred",
    folder: folder,
  });
});

// @desc    Get starred folders
// @route   GET /api/folders/starred
// @access  Private
exports.getStarredFolders = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const folders = await Folder.find({
    userId,
    isStarred: true,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalFolders = await Folder.countDocuments({
    userId,
    isStarred: true,
    isDeleted: false,
  });

  // ✅ استخدام القيم المخزنة مباشرة - أسرع بكثير!
  const foldersWithDetails = folders.map((folder) => {
    const folderObj = folder.toObject();
    // ✅ استخدام القيم المخزنة مباشرة (size و filesCount)
    folderObj.size = Number(folder.size) || 0;
    folderObj.filesCount = Number(folder.filesCount) || 0;
    return folderObj;
  });

  res.status(200).json({
    message: "Starred folders retrieved successfully",
    folders: foldersWithDetails,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalFolders / limit),
      totalFolders: totalFolders,
      hasNext: page < Math.ceil(totalFolders / limit),
      hasPrev: page > 1,
    },
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
    return next(new ApiError("Folder not found", 404));
  }

  if (name) folder.name = name;
  if (description !== undefined) folder.description = description;
  if (tags !== undefined) folder.tags = tags;

  await folder.save();

  res.status(200).json({
    message: "✅ Folder updated successfully",
    folder: folder,
  });
});

// ✅ Move folder to another folder
// @desc    Move folder to another folder
// @route   PUT /api/folders/:id/move
// @access  Private
exports.moveFolder = asyncHandler(async (req, res, next) => {
  const folderId = req.params.id;
  const userId = req.user._id;
  let { targetFolderId } = req.body; // null للجذر أو folderId للمجلد

  // ✅ معالجة targetFolderId - إذا كان "null" أو "" أو undefined، اجعله null
  if (
    targetFolderId === "null" ||
    targetFolderId === "" ||
    targetFolderId === undefined
  ) {
    targetFolderId = null;
  }

  // Find folder
  const folder = await Folder.findOne({ _id: folderId, userId: userId });
  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  // If targetFolderId is provided, verify it exists and belongs to user
  if (targetFolderId) {
    const targetFolder = await Folder.findOne({
      _id: targetFolderId,
      userId: userId,
    });
    if (!targetFolder) {
      return next(new ApiError("Target folder not found", 404));
    }

    // ✅ منع نقل المجلد إلى نفسه
    if (folderId.toString() === targetFolderId.toString()) {
      return next(new ApiError("Cannot move folder to itself", 400));
    }

    // ✅ منع نقل المجلد إلى أحد أبنائه (لتجنب الحلقات)
    async function isDescendant(parentId, childId) {
      const children = await Folder.find({
        parentId: parentId,
        userId: userId,
        isDeleted: false,
      });
      for (const child of children) {
        if (child._id.toString() === childId.toString()) {
          return true;
        }
        if (await isDescendant(child._id, childId)) {
          return true;
        }
      }
      return false;
    }

    if (await isDescendant(folderId, targetFolderId)) {
      return next(
        new ApiError("Cannot move folder into its own subfolder", 400)
      );
    }

    // Check if folder is already in this folder
    if (
      folder.parentId &&
      folder.parentId.toString() === targetFolderId.toString()
    ) {
      return next(new ApiError("Folder is already in this location", 400));
    }
  } else {
    // Moving to root - check if already in root
    if (!folder.parentId || folder.parentId === null) {
      return next(new ApiError("Folder is already in root", 400));
    }
  }

  // Store old parent folder ID
  const oldParentFolderId = folder.parentId ? folder.parentId.toString() : null;

  // ✅ تحديث parentId مباشرة على الكائن وحفظه
  folder.parentId = targetFolderId;
  await folder.save();

  // ✅ إعادة جلب المجلد للتأكد من أن البيانات محدثة
  const refreshedFolder = await Folder.findById(folderId).populate(
    "parentId",
    "name"
  );

  // ✅ تحديث أحجام وعدد الملفات للمجلدات - استخدام الدوال الجديدة (أسرع بكثير)
  // ✅ إعادة حساب المجلد المنقول أولاً
  await recalculateAndUpdateFolderStats(folderId);

  // ✅ إعادة حساب المجلدات الأب
  if (oldParentFolderId) {
    await recalculateAndUpdateFolderStats(oldParentFolderId);
  }
  if (targetFolderId) {
    await recalculateAndUpdateFolderStats(targetFolderId);
  }

  // Log activity
  await logActivity(
    userId,
    "folder_moved",
    "folder",
    refreshedFolder._id,
    refreshedFolder.name,
    {
      fromFolder: oldParentFolderId || "root",
      toFolder: targetFolderId || "root",
      originalSize: refreshedFolder.size,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: "✅ Folder moved successfully",
    folder: refreshedFolder,
    fromFolder: oldParentFolderId || null,
    toFolder: targetFolderId || null,
  });
});

// ✅ SHARING FUNCTIONS - Folder Sharing

// @desc    Share folder with users
// @route   POST /api/folders/:id/share
// @access  Private
exports.shareFolder = asyncHandler(async (req, res, next) => {
  const folderId = req.params.id;
  const userId = req.user._id;
  const { users, permission } = req.body;

  if (!users || !Array.isArray(users) || users.length === 0) {
    return next(new ApiError("Users array is required", 400));
  }

  if (!permission || !["view", "edit", "delete"].includes(permission)) {
    return next(new ApiError("Valid permission is required", 400));
  }

  const folder = await Folder.findOne({ _id: folderId, userId: userId });
  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  const userDocuments = await User.find({ _id: { $in: users } });
  if (userDocuments.length !== users.length) {
    return next(new ApiError("One or more users not found", 400));
  }

  const usersToShare = users.filter(
    (id) => id.toString() !== userId.toString()
  );
  if (usersToShare.length === 0) {
    return next(new ApiError("Cannot share with yourself", 400));
  }

  const alreadyShared = folder.sharedWith.map((sw) => sw.user.toString());
  const newUsers = usersToShare.filter(
    (id) => !alreadyShared.includes(id.toString())
  );

  for (const userIdToAdd of newUsers) {
    folder.sharedWith.push({
      user: userIdToAdd,
      permission: permission,
      sharedAt: new Date(),
    });
  }

  folder.isShared = folder.sharedWith.length > 0;
  await folder.save();
  await folder.populate("sharedWith.user", "name email");

  await logActivity(
    userId,
    "folder_shared",
    "folder",
    folder._id,
    folder.name,
    {
      sharedUsers: newUsers,
      permission: permission,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: "✅ Folder shared successfully",
    folder: folder,
    newlyShared: newUsers.length,
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
    return next(new ApiError("userPermissions array is required", 400));
  }

  const folder = await Folder.findOne({ _id: folderId, userId: userId });
  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  let updatedCount = 0;

  for (const { userId: targetUserId, permission } of userPermissions) {
    if (!["view", "edit", "delete"].includes(permission)) continue;

    const sharedEntry = folder.sharedWith.find(
      (sw) => sw.user.toString() === targetUserId.toString()
    );

    if (sharedEntry) {
      sharedEntry.permission = permission;
      updatedCount++;
    }
  }

  if (updatedCount === 0) {
    return next(new ApiError("No valid permissions to update", 400));
  }

  await folder.save();
  await folder.populate("sharedWith.user", "name email");

  res.status(200).json({
    message: `✅ Permissions updated for ${updatedCount} user(s)`,
    folder: folder,
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
    return next(new ApiError("Users array is required", 400));
  }

  const folder = await Folder.findOne({ _id: folderId, userId: userId });
  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  const initialCount = folder.sharedWith.length;
  folder.sharedWith = folder.sharedWith.filter(
    (sw) => !users.includes(sw.user.toString())
  );
  folder.isShared = folder.sharedWith.length > 0;

  await folder.save();
  const removedCount = initialCount - folder.sharedWith.length;

  res.status(200).json({
    message: `✅ ${removedCount} user(s) removed from sharing`,
    folder: folder,
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
    "sharedWith.user": userId,
    isDeleted: false,
  })
    .populate("userId", "name email")
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const totalFolders = await Folder.countDocuments({
    "sharedWith.user": userId,
    isDeleted: false,
  });

  // ✅ استخدام القيم المخزنة مباشرة - أسرع بكثير!
  const formattedFolders = folders.map((folder) => {
    const folderObj = folder.toObject();
    const sharedEntry = folder.sharedWith.find(
      (sw) => sw.user.toString() === userId.toString()
    );

    return {
      ...folderObj,
      size: Number(folder.size) || 0, // ✅ الحجم الكلي (مخزن)
      filesCount: Number(folder.filesCount) || 0, // ✅ عدد الملفات الكلي (مخزن)
      myPermission: sharedEntry ? sharedEntry.permission : null,
    };
  });

  res.status(200).json({
    message: "Folders shared with me retrieved successfully",
    folders: formattedFolders,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalFolders / limit),
      totalFolders: totalFolders,
    },
  });
});

// @desc    Get shared folder details in room
// @route   GET /api/folders/shared-in-room/:id
// @access  Private
exports.getSharedFolderDetailsInRoom = asyncHandler(async (req, res, next) => {
  const folderId = req.params.id;
  const userId = req.user._id;

  const Room = require("../models/roomModel");

  // Find room where folder is shared and user is a member
  const room = await Room.findOne({
    "folders.folderId": folderId,
    "members.user": userId,
    isActive: true,
  })
    .populate("owner", "name email")
    .populate("members.user", "name email");

  if (!room) {
    return next(
      new ApiError("Folder not found in any room you're a member of", 404)
    );
  }

  // Get folder from room
  const folderInRoom = room.folders.find(
    (f) => f.folderId.toString() === folderId
  );
  if (!folderInRoom) {
    return next(new ApiError("Folder not found in room", 404));
  }

  // Get folder details
  const folder = await Folder.findById(folderId).populate(
    "userId",
    "name email"
  );

  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  // Get sharedBy user info
  let sharedByUser = null;
  if (folderInRoom.sharedBy) {
    sharedByUser = await User.findById(folderInRoom.sharedBy).select(
      "name email"
    );
  }

  // Calculate readable size
  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // ✅ استخدام القيم المخزنة مباشرة - أسرع بكثير!
  const totalSize = Number(folder.size) || 0;
  const totalFilesCount = Number(folder.filesCount) || 0;

  // ✅ جلب جميع البيانات المتوازية في مرة واحدة - أسرع بكثير!
  const [subfoldersCount, directFilesCount] = await Promise.all([
    Folder.countDocuments({
      parentId: folderId,
      isDeleted: false,
    }),
    File.countDocuments({
      parentFolderId: folderId,
      isDeleted: false,
    }),
  ]);

  res.status(200).json({
    message: "Shared folder details retrieved successfully",
    folder: {
      _id: folder._id,
      name: folder.name,
      category: "folder", // Folders don't have category, but we can set it as 'folder'
      size: totalSize, // ✅ الحجم الكلي (recursive)
      sizeFormatted: formatBytes(totalSize),
      filesCount: totalFilesCount, // ✅ عدد الملفات الكلي (recursive)
      sharedAt: folderInRoom.sharedAt,
      lastModified: folder.updatedAt,
      sharedBy: sharedByUser
        ? {
            _id: sharedByUser._id,
            name: sharedByUser.name,
            email: sharedByUser.email,
          }
        : null,
      room: {
        _id: room._id,
        name: room.name,
        description: room.description,
      },
      owner: {
        _id: folder.userId._id,
        name: folder.userId.name,
        email: folder.userId.email,
      },
      subfoldersCount: subfoldersCount,
      filesCount: totalFilesCount, // ✅ عدد الملفات الكلي (recursive)
      totalItems: subfoldersCount + directFilesCount, // ✅ العناصر المباشرة فقط
    },
  });
});

// ============================================
// 🔒 FOLDER PROTECTION FUNCTIONS
// ============================================

// @desc    Set password protection for folder
// @route   PUT /api/v1/folders/:id/protect
// @access  Private
exports.setFolderPassword = asyncHandler(async (req, res, next) => {
  const folderId = req.params.id;
  const userId = req.user._id;
  const { password, protectionType = "password" } = req.body;

  // Find folder
  const folder = await Folder.findOne({ _id: folderId, userId: userId });
  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  // ✅ التحقق من نوع الحماية
  if (protectionType !== "password" && protectionType !== "biometric") {
    return next(
      new ApiError(
        "protectionType must be either 'password' or 'biometric'",
        400
      )
    );
  }

  // ✅ التحقق من البيانات المطلوبة
  if (protectionType === "password") {
    if (!password || password.trim().length === 0) {
      return next(
        new ApiError("Password is required for password protection", 400)
      );
    }
    if (password.length < 4) {
      return next(
        new ApiError("Password must be at least 4 characters long", 400)
      );
    }
  }

  if (protectionType === "biometric") {
    if (password) {
      return next(
        new ApiError(
          "Password should not be provided for biometric protection",
          400
        )
      );
    }
  }

  // ✅ تعيين الحماية
  folder.isProtected = true;
  folder.protectionType = protectionType;

  // ✅ تشفير كلمة السر إذا كانت من نوع password
  if (protectionType === "password" && password) {
    const saltRounds = 10;
    folder.passwordHash = await bcrypt.hash(password, saltRounds);
  } else if (protectionType === "biometric") {
    // للبصمة، لا نحتاج passwordHash
    folder.passwordHash = null;
  }

  await folder.save();

  // Log activity
  await logActivity(
    userId,
    "folder_updated",
    "folder",
    folder._id,
    folder.name,
    {
      action: "password_protection_set",
      protectionType: protectionType,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: "✅ Folder protection enabled successfully",
    folder: {
      _id: folder._id,
      name: folder.name,
      isProtected: folder.isProtected,
      protectionType: folder.protectionType,
    },
  });
});

// @desc    Verify folder password/biometric
// @route   POST /api/v1/folders/:id/verify-access
// @access  Private
exports.verifyFolderAccess = asyncHandler(async (req, res, next) => {
  const folderId = req.params.id;
  const userId = req.user._id;
  const { password, biometricToken } = req.body;

  // Find folder with password hash
  const folder = await Folder.findOne({ _id: folderId, userId: userId }).select(
    "+passwordHash"
  );

  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  // ✅ التحقق من الحالة
  if (!folder.isProtected || folder.protectionType === "none") {
    // ✅ إصلاح حالة غير متسقة إذا وجدت
    if (folder.isProtected && folder.protectionType === "none") {
      folder.isProtected = false;
      folder.protectionType = "none";
      folder.passwordHash = null;
      await folder.save();
    }

    return res.status(200).json({
      message: "Folder is not protected",
      hasAccess: true,
    });
  }

  // ✅ التحقق من نوع الحماية
  if (
    folder.protectionType !== "password" &&
    folder.protectionType !== "biometric"
  ) {
    return next(new ApiError("Invalid protection type", 500));
  }

  // Verify based on protection type
  let hasAccess = false;

  if (folder.protectionType === "password") {
    if (!password) {
      return next(new ApiError("Password is required", 400));
    }

    if (!folder.passwordHash) {
      return next(
        new ApiError("Folder protection is not properly configured", 500)
      );
    }

    hasAccess = await bcrypt.compare(password, folder.passwordHash);
  } else if (folder.protectionType === "biometric") {
    // For biometric, the frontend should verify the biometric first
    // Then send a token. Here we just verify the token exists
    // In a real implementation, you might want to verify the token signature
    if (!biometricToken) {
      return next(
        new ApiError("Biometric verification token is required", 400)
      );
    }

    // For now, we'll accept any non-empty token
    // In production, you should verify the token signature
    hasAccess = !!biometricToken;
  }

  if (!hasAccess) {
    return next(
      new ApiError(
        "Access denied. Invalid password or biometric verification failed",
        403
      )
    );
  }

  // ✅ حفظ session للوصول بعد التحقق الناجح
  setFolderAccessSession(userId.toString(), folderId.toString());

  res.status(200).json({
    message: "✅ Access granted",
    hasAccess: true,
    folder: {
      _id: folder._id,
      name: folder.name,
    },
  });
});

// @desc    Remove folder protection
// @route   DELETE /api/v1/folders/:id/protect
// @access  Private
exports.removeFolderProtection = asyncHandler(async (req, res, next) => {
  const folderId = req.params.id;
  const userId = req.user._id;
  const { password } = req.body; // Require password to remove protection

  // Find folder with password hash
  const folder = await Folder.findOne({ _id: folderId, userId: userId }).select(
    "+passwordHash"
  );

  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  if (!folder.isProtected) {
    return next(new ApiError("Folder is not protected", 400));
  }

  // Verify password before removing protection
  if (folder.protectionType === "password" && folder.passwordHash) {
    if (!password) {
      return next(
        new ApiError("Password is required to remove protection", 400)
      );
    }

    const isMatch = await bcrypt.compare(password, folder.passwordHash);
    if (!isMatch) {
      return next(
        new ApiError("Invalid password. Cannot remove protection", 403)
      );
    }
  }

  // ✅ إزالة الحماية - تنظيف كامل
  folder.isProtected = false;
  folder.protectionType = "none";
  folder.passwordHash = null;

  await folder.save();

  // ✅ مسح session للوصول بعد إزالة الحماية
  clearFolderAccessSession(userId.toString(), folderId.toString());

  // Log activity
  await logActivity(
    userId,
    "folder_updated",
    "folder",
    folder._id,
    folder.name,
    {
      action: "password_protection_removed",
    },
    {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    }
  );

  res.status(200).json({
    message: "✅ Folder protection removed successfully",
    folder: {
      _id: folder._id,
      name: folder.name,
      isProtected: folder.isProtected,
      protectionType: folder.protectionType,
    },
  });
});

// @desc    Middleware to check folder protection before access
// This will be used in routes that need folder access
exports.checkFolderAccess = asyncHandler(async (req, res, next) => {
  // 🛡️ Ignore non-HTTP internal calls or missing request context
  if (!req || !req.user) {
    return next();
  }

  const folderId =
    req.params.id || (req.body && req.body.folderId) || req.query.folderId;
  const userId = req.user._id;

  if (!folderId) {
    return next(); // No folder ID, skip check
  }

  // Find folder - check if user owns it, has direct access, or it's shared in a room
  let folder = await Folder.findById(folderId);

  if (!folder) {
    return next(new ApiError("Folder not found", 404));
  }

  // Check if user has access
  const userIdStr = userId.toString();
  const folderUserId = folder.userId.toString();
  const isOwner = folderUserId === userIdStr;

  // Check if folder is directly shared with user
  const isSharedWith =
    folder.sharedWith &&
    folder.sharedWith.some((sw) => {
      const swUser = sw.user;
      const sharedUserId =
        swUser && swUser.toString
          ? swUser.toString()
          : (swUser || "").toString();
      return sharedUserId === userIdStr;
    });

  // Check if folder is shared in a room where user is a member
  let isSharedInRoom = false;
  if (!isOwner && !isSharedWith) {
    const Room = require("../models/roomModel");
    const room = await Room.findOne({
      "folders.folderId": folderId,
      "members.user": userId,
      isActive: true,
    }).lean();

    isSharedInRoom = !!room;
  }

  // If user doesn't have access, return error
  if (!isOwner && !isSharedWith && !isSharedInRoom) {
    return next(new ApiError("Folder not found", 404));
  }

  // ✅ التحقق من الاتساق: إذا كان غير محمي، السماح بالوصول
  if (!folder.isProtected || folder.protectionType === "none") {
    // ✅ التأكد من أن الحالة متسقة
    if (folder.isProtected && folder.protectionType === "none") {
      // إصلاح حالة غير متسقة
      folder.isProtected = false;
      folder.protectionType = "none";
      folder.passwordHash = null;
      await folder.save();
    }
    return next();
  }

  // ✅ المجلد محمي - التحقق من session أو كلمة المرور
  // Check if user has valid access session
  const hasValidSession = getFolderAccessSession(
    userId.toString(),
    folderId.toString()
  );

  if (hasValidSession) {
    // ✅ المستخدم لديه session صالحة - السماح بالوصول
    return next();
  }

  // ✅ إذا لم تكن هناك session صالحة، التحقق من كلمة المرور في header أو body
  // 🛡️ Safe access to req.body - check if it exists first
  const password =
    req.headers["x-folder-password"] || (req.body && req.body.password);
  const biometricToken =
    req.headers["x-folder-biometric-token"] ||
    (req.body && req.body.biometricToken);

  if (password || biometricToken) {
    // ✅ التحقق من كلمة المرور
    const folderWithPassword = await Folder.findOne({
      _id: folderId,
      userId: userId,
    }).select("+passwordHash");

    if (!folderWithPassword) {
      return next(new ApiError("Folder not found", 404));
    }

    let hasAccess = false;

    if (folderWithPassword.protectionType === "password") {
      if (!password) {
        return next(
          new ApiError("Folder is protected. Please verify access first", 403)
        );
      }

      if (!folderWithPassword.passwordHash) {
        return next(
          new ApiError("Folder protection is not properly configured", 500)
        );
      }

      hasAccess = await bcrypt.compare(
        password,
        folderWithPassword.passwordHash
      );
    } else if (folderWithPassword.protectionType === "biometric") {
      if (!biometricToken) {
        return next(
          new ApiError("Folder is protected. Please verify access first", 403)
        );
      }
      hasAccess = !!biometricToken;
    }

    if (hasAccess) {
      // ✅ حفظ session بعد التحقق الناجح
      setFolderAccessSession(userId.toString(), folderId.toString());
      return next();
    }
  }

  // ✅ لا يوجد session ولا كلمة مرور صحيحة - رفض الوصول
  return next(
    new ApiError("Folder is protected. Please verify access first", 403)
  );
});

// ✅ Export helper functions for use in other services (e.g., fileService.js)
exports.updateFolderStats = updateFolderStats;
exports.recalculateAndUpdateFolderStats = recalculateAndUpdateFolderStats;
