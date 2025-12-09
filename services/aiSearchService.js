const File = require("../models/fileModel");
const Folder = require("../models/folderModel");
const {
  generateEmbedding,
  cosineSimilarity,
  combineFileDataForSearch,
} = require("./aiService");

/**
 * البحث الذكي الشامل: نصي + AI
 * يبحث في: اسم الملف، الوصف، الوسوم، محتوى الملف (extractedText)
 */
async function smartSearch(userId, query, options = {}) {
  const { limit = 20, minScore = 0.2, category = null } = options;

  try {
    console.log(`🔍 Smart Search: "${query}" for user ${userId}`);

    // 1. البحث النصي التقليدي (سريع) - في الاسم، الوصف، الوسوم، والمحتوى
    const textSearchRegex = new RegExp(
      query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );

    const textQuery = {
      userId,
      isDeleted: false,
      $or: [
        { name: textSearchRegex },
        { description: textSearchRegex },
        { tags: { $in: [textSearchRegex] } },
        { extractedText: textSearchRegex },
      ],
    };

    if (category && category !== "all") {
      textQuery.category = category;
    }

    const textFiles = await File.find(textQuery)
      .limit(limit * 2) // نجلب أكثر للترتيب لاحقاً
      .lean();

    console.log(`Found ${textFiles.length} files via text search`);

    // 2. إذا كان هناك ملفات مع embeddings، استخدم AI للبحث الدلالي
    let aiResults = [];

    try {
      const queryEmbedding = await generateEmbedding(query);

      const filesWithEmbeddings = await File.find({
        userId,
        isDeleted: false,
        embedding: { $exists: true, $ne: null },
        isProcessed: true,
      }).lean();

      if (category && category !== "all") {
        filesWithEmbeddings = filesWithEmbeddings.filter(
          (f) => f.category === category
        );
      }

      console.log(`Found ${filesWithEmbeddings.length} files with embeddings`);

      // حساب التشابه لكل ملف
      for (const file of filesWithEmbeddings) {
        if (!file.embedding || file.embedding.length === 0) {
          continue;
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

module.exports = {
  smartSearch,
  searchInFileContent,
  searchByFileName,
};

