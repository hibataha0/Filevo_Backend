const File = require("../models/fileModel");
const { generateEmbedding, cosineSimilarity } = require("./aiService");

/**
 * بناء فلتر التاريخ حسب النطاق المحدد
 * @param {string} dateRange - 'yesterday', 'last7days', 'last30days', 'lastyear', 'custom'
 * @param {Date|string} startDate - تاريخ البداية (للـ custom)
 * @param {Date|string} endDate - تاريخ النهاية (للـ custom)
 * @returns {Object|null} - MongoDB date filter أو null
 */
function buildDateFilter(dateRange, startDate, endDate) {
  if (!dateRange || dateRange === "all") {
    return null;
  }

  const now = new Date();
  let start = null;
  const end = new Date(); // الآن

  switch (dateRange) {
    case "yesterday": {
      const yesterdayStart = new Date(now);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(now);
      yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
      yesterdayEnd.setHours(23, 59, 59, 999);
      return {
        $gte: yesterdayStart,
        $lte: yesterdayEnd,
      };
    }
    case "last7days": {
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "last30days": {
      start = new Date(now);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "lastyear": {
      start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "custom": {
      if (startDate && endDate) {
        start = new Date(startDate);
        const customEnd = new Date(endDate);
        customEnd.setHours(23, 59, 59, 999);
        return {
          $gte: start,
          $lte: customEnd,
        };
      }
      return null;
    }
    default:
      return null;
  }

  if (!start) {
    return null;
  }

  return {
    $gte: start,
    $lte: end,
  };
}

/**
 * البحث الذكي الشامل: نصي + AI
 * يبحث في: اسم الملف، الوصف، الوسوم، محتوى الملف (extractedText)
 * يدعم الفلترة حسب: التصنيف والتاريخ
 */
async function smartSearch(userId, query, options = {}) {
  const {
    limit = 20,
    minScore = 0.2,
    category = null,
    dateRange = null, // 'yesterday', 'last7days', 'last30days', 'lastyear', 'custom'
    startDate = null, // للـ custom date range
    endDate = null, // للـ custom date range
  } = options;

  try {
    console.log(`🔍 Smart Search: "${query}" for user ${userId}`);

    // 1. البحث النصي التقليدي (سريع) - في الاسم، الوصف، الوسوم، والمحتوى
    const textSearchRegex = new RegExp(
      query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );

    // بناء query التاريخ
    const dateFilter = buildDateFilter(dateRange, startDate, endDate);

    const textQuery = {
      userId,
      isDeleted: false,
      $or: [
        { name: textSearchRegex },
        { description: textSearchRegex },
        { tags: { $in: [textSearchRegex] } },
        { extractedText: textSearchRegex },
        // البحث في بيانات الصور
        { imageDescription: textSearchRegex },
        { imageScene: textSearchRegex },
        { imageObjects: { $in: [textSearchRegex] } },
        { imageText: textSearchRegex },
        // البحث في بيانات الصوت
        { audioTranscript: textSearchRegex },
        // البحث في بيانات الفيديو
        { videoTranscript: textSearchRegex },
        { videoDescription: textSearchRegex },
        { videoScenes: { $in: [textSearchRegex] } },
      ],
    };

    // فلترة حسب التصنيف
    if (category && category !== "all" && category !== null) {
      textQuery.category = category;
    }

    // فلترة حسب التاريخ
    if (dateFilter) {
      textQuery.createdAt = dateFilter;
    }

    const textFiles = await File.find(textQuery)
      .limit(limit * 2) // نجلب أكثر للترتيب لاحقاً
      .lean();

    console.log(`Found ${textFiles.length} files via text search`);

    // 2. إذا كان هناك ملفات مع embeddings، استخدم AI للبحث الدلالي
    const aiResults = [];

    try {
      const queryEmbedding = await generateEmbedding(query);

      const aiQuery = {
        userId,
        isDeleted: false,
        embedding: { $exists: true, $ne: null },
        isProcessed: true,
      };

      // تطبيق فلترة التصنيف على AI search
      if (category && category !== "all" && category !== null) {
        aiQuery.category = category;
      }

      // تطبيق فلترة التاريخ على AI search
      if (dateFilter) {
        aiQuery.createdAt = dateFilter;
      }

      // Limit the number of files to process to prevent memory issues and hanging
      const maxFilesToProcess = 500; // Maximum files to process for AI search
      const filesWithEmbeddings = await File.find(aiQuery)
        .limit(maxFilesToProcess)
        .lean();

      console.log(`Found ${filesWithEmbeddings.length} files with embeddings`);

      // حساب التشابه لكل ملف - استخدام batch processing لتجنب blocking
      // Process in smaller chunks to avoid blocking the event loop
      const chunkSize = 50;
      for (let i = 0; i < filesWithEmbeddings.length; i += chunkSize) {
        const chunk = filesWithEmbeddings.slice(i, i + chunkSize);
        
        // Process chunk synchronously but yield to event loop between chunks
        chunk.forEach((file) => {
          if (!file.embedding || file.embedding.length === 0) {
            return;
          }

          const similarity = cosineSimilarity(queryEmbedding, file.embedding);

          if (similarity >= minScore) {
            aiResults.push({
              type: "file",
              item: file,
              score: similarity,
              searchType: "ai",
            });
          }
        });
        
        // Yield to event loop every chunk to prevent blocking
        if (i + chunkSize < filesWithEmbeddings.length) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      // ترتيب نتائج AI
      aiResults.sort((a, b) => b.score - a.score);
      console.log(`Found ${aiResults.length} files via AI search`);
    } catch (error) {
      console.error(
        "Error in AI search, using text search only:",
        error.message
      );
      // نستمر بالبحث النصي فقط
    }

    // 3. دمج النتائج
    const resultsMap = new Map();

    // إضافة نتائج البحث النصي مع score عالي
    textFiles.forEach((file) => {
      // حساب score بناءً على عدد التطابقات
      let score = 0.8;

      if (file.name.toLowerCase().includes(query.toLowerCase())) {
        score += 0.1; // تطابق في الاسم = أولوية أعلى
      }

      if (
        file.extractedText &&
        file.extractedText.toLowerCase().includes(query.toLowerCase())
      ) {
        score += 0.05; // تطابق في المحتوى
      }

      resultsMap.set(file._id.toString(), {
        type: "file",
        item: file,
        score: Math.min(score, 1.0),
        searchType: "text",
      });
    });

    // إضافة نتائج AI (إذا كانت أفضل من النتائج النصية)
    aiResults.forEach((result) => {
      const fileId = result.item._id.toString();
      const existing = resultsMap.get(fileId);

      if (!existing || result.score > existing.score) {
        resultsMap.set(fileId, result);
      }
    });

    // 4. تحويل Map إلى Array وترتيب
    const results = Array.from(resultsMap.values());
    results.sort((a, b) => b.score - a.score);

    // 5. إرجاع النتائج المحدودة
    return results.slice(0, limit);
  } catch (error) {
    console.error("Error in smart search:", error);
    throw error;
  }
}

/**
 * البحث في محتوى الملفات فقط (extractedText)
 */
async function searchInFileContent(userId, query, options = {}) {
  const { limit = 20 } = options;

  try {
    const textSearchRegex = new RegExp(
      query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );

    const files = await File.find({
      userId,
      isDeleted: false,
      extractedText: textSearchRegex,
      isProcessed: true,
    })
      .limit(limit)
      .lean();

    return files.map((file) => ({
      type: "file",
      item: file,
      score: 0.8,
      searchType: "content",
    }));
  } catch (error) {
    console.error("Error searching in file content:", error);
    throw error;
  }
}

/**
 * البحث في اسم الملف فقط
 */
async function searchByFileName(userId, query, options = {}) {
  const { limit = 20 } = options;

  try {
    const textSearchRegex = new RegExp(
      query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );

    const files = await File.find({
      userId,
      isDeleted: false,
      name: textSearchRegex,
    })
      .limit(limit)
      .lean();

    return files.map((file) => ({
      type: "file",
      item: file,
      score: 0.9, // score عالي لأن البحث في الاسم دقيق
      searchType: "filename",
    }));
  } catch (error) {
    console.error("Error searching by filename:", error);
    throw error;
  }
}

/**
 * البحث عن طريق التاغ (Tags) - للملفات والمجلدات
 */
async function searchByTags(userId, tagQuery, options = {}) {
  const { limit = 20 } = options;
  const Folder = require("../models/folderModel");

  try {
    // البحث في tags - يمكن أن يكون tag واحد أو عدة tags
    // إذا كان tagQuery عبارة عن نص، نبحث عنه في جميع tags
    // إذا كان array، نبحث عن أي tag يطابق
    const tagSearchRegex = new RegExp(
      tagQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );

    // البحث في ملفات
    const files = await File.find({
      userId,
      isDeleted: false,
      tags: { $in: [tagSearchRegex] },
    })
      .limit(limit)
      .lean();

    // البحث في مجلدات
    const folders = await Folder.find({
      userId,
      isDeleted: false,
      tags: { $in: [tagSearchRegex] },
    })
      .limit(limit)
      .lean();

    // دمج النتائج
    const results = [
      ...files.map((file) => ({
        type: "file",
        item: file,
        score: 0.95, // score عالي لأن البحث في tags دقيق
        searchType: "tags",
      })),
      ...folders.map((folder) => ({
        type: "folder",
        item: folder,
        score: 0.95, // score عالي لأن البحث في tags دقيق
        searchType: "tags",
      })),
    ];

    // ترتيب حسب score (من الأعلى للأقل)
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  } catch (error) {
    console.error("Error searching by tags:", error);
    throw error;
  }
}

module.exports = {
  smartSearch,
  searchInFileContent,
  searchByFileName,
  searchByTags,
};
