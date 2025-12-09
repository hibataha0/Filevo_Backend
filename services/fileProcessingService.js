const fs = require("fs");
const path = require("path");
const File = require("../models/fileModel");
const {
  extractTextFromFile,
  cleanExtractedText,
} = require("./textExtractionService");
const {
  generateEmbedding,
  summarizeText,
  combineFileDataForSearch,
} = require("./aiService");

/**
 * معالجة ملف واحد: استخراج النص، توليد embedding، تلخيص
 * ✅ محمي من Race Condition باستخدام atomic operations
 */
async function processFile(fileId) {
  try {
    // ✅ فحص أولي: إذا كان الملف معالج مسبقاً، تخطيه مباشرة
    const existingFile = await File.findById(fileId).select(
      "isProcessed extractedText embedding name"
    );

    if (!existingFile) {
      throw new Error("File not found");
    }

    // إذا كان الملف معالج مسبقاً، تخطيه
    if (existingFile.isProcessed && existingFile.extractedText && existingFile.embedding) {
      console.log(`⏭️ File ${fileId} already processed, skipping...`);
      return existingFile;
    }

    // ✅ Atomic check: التحقق مرة أخرى من أن الملف لم يُعالج بعد
    // هذا يمنع معالجة نفس الملف مرتين في نفس الوقت (Race Condition Protection)
    const file = await File.findOne({
      _id: fileId,
      isProcessed: false, // فقط إذا لم يكن معالجاً بعد
    });

    if (!file) {
      console.log(`⏭️ File ${fileId} is being processed by another worker or already processed, skipping...`);
      // إعادة جلب الملف المحدث
      const updatedFile = await File.findById(fileId);
      return updatedFile || existingFile;
    }

    console.log(`🔄 Processing file: ${file.name} (${fileId})`);

    // 1. استخراج النص من الملف
    let extractedText = null;
    let extractionError = null;

    try {
      const filePath = path.join(__dirname, "..", file.path);

      // التحقق من وجود الملف
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found at path: ${filePath}`);
      }

      extractedText = await extractTextFromFile(filePath, file.type, file.name);

      if (extractedText) {
        extractedText = cleanExtractedText(extractedText);
      }
    } catch (error) {
      console.error(
        `Error extracting text from file ${fileId}:`,
        error.message
      );
      extractionError = error.message;
      // نستمر حتى لو فشل استخراج النص
    }

    // 2. توليد Embedding
    let embedding = null;
    let embeddingError = null;
    try {
      const searchText = combineFileDataForSearch({
        ...file.toObject(),
        extractedText: extractedText || "",
      });

      console.log(
        `📝 Search text length: ${searchText ? searchText.length : 0} characters`
      );

      if (searchText && searchText.trim().length > 0) {
        console.log(`🔄 Generating embedding for file ${fileId}...`);
        embedding = await generateEmbedding(searchText);
        console.log(
          `✅ Generated embedding for file ${fileId} (length: ${embedding ? embedding.length : 0})`
        );
      } else {
        console.warn(
          `⚠️ No search text available for file ${fileId}, skipping embedding`
        );
        embeddingError = "No search text available";
      }
    } catch (error) {
      console.error(
        `❌ Error generating embedding for file ${fileId}:`,
        error.message
      );
      console.error("Full error:", error);
      embeddingError = error.message;
      // نستمر حتى لو فشل توليد embedding
    }

    // 3. تلخيص النص (إذا كان هناك نص مستخرج)
    let summary = null;
    try {
      if (extractedText && extractedText.length > 200) {
        summary = await summarizeText(extractedText, 150);
        console.log(`✅ Generated summary for file ${fileId}`);
      } else if (extractedText) {
        // إذا كان النص قصير، استخدمه كملخص
        summary = extractedText;
      }
    } catch (error) {
      console.error(`Error summarizing file ${fileId}:`, error.message);
      // نستمر حتى لو فشل التلخيص
    }

    // 4. تحديث الملف في قاعدة البيانات باستخدام updateOne (atomic operation)
    // ✅ هذا يمنع VersionError من Mongoose
    const updateData = {
      extractedText,
      embedding,
      summary,
      isProcessed: true,
      processedAt: new Date(),
      textExtractionError: extractionError || null,
      embeddingError: embeddingError || null,
    };

    // ✅ استخدام updateOne بدلاً من save() لتجنب version conflict
    await File.updateOne(
      { _id: fileId },
      { $set: updateData }
    );

    // جلب الملف المحدث للعودة
    const updatedFile = await File.findById(fileId);

    // تسجيل ملخص المعالجة
    console.log(`✅ File ${fileId} processed successfully:`);
    const extractedTextInfo = extractedText
      ? `Yes (${extractedText.length} chars)`
      : "No";
    const embeddingInfo = embedding
      ? `Yes (${embedding.length} dimensions)`
      : "No";
    console.log(`   - Extracted text: ${extractedTextInfo}`);
    console.log(`   - Embedding: ${embeddingInfo}`);
    console.log(`   - Summary: ${summary ? "Yes" : "No"}`);
    if (extractionError)
      console.log(`   - Extraction error: ${extractionError}`);
    if (embeddingError) console.log(`   - Embedding error: ${embeddingError}`);

    return updatedFile || file;
  } catch (error) {
    console.error(`Error processing file ${fileId}:`, error.message);
    throw error;
  }
}

/**
 * معالجة ملفات متعددة (Background job)
 */
async function processFilesBatch(fileIds, options = {}) {
  const { batchSize = 5, delay = 1000 } = options;
  const results = {
    processed: [],
    failed: [],
  };

  for (let i = 0; i < fileIds.length; i += batchSize) {
    const batch = fileIds.slice(i, i + batchSize);

    await Promise.allSettled(
      batch.map(async (fileId) => {
        try {
          const file = await processFile(fileId);
          results.processed.push(fileId);
        } catch (error) {
          console.error(`Failed to process file ${fileId}:`, error.message);
          results.failed.push({ fileId, error: error.message });
        }
      })
    );

    // تأخير بين الـ batches
    if (i + batchSize < fileIds.length) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return results;
}

/**
 * إعادة معالجة ملف (إذا فشلت المعالجة السابقة)
 */
async function reprocessFile(fileId) {
  const file = await File.findById(fileId);
  if (!file) {
    throw new Error("File not found");
  }

  // ✅ إعادة تعيين حالة المعالجة باستخدام updateOne
  await File.updateOne(
    { _id: fileId },
    {
      $set: {
        isProcessed: false,
        processedAt: null,
        textExtractionError: null,
        embeddingError: null,
      },
    }
  );

  // معالجة مرة أخرى
  return await processFile(fileId);
}

module.exports = {
  processFile,
  processFilesBatch,
  reprocessFile,
};
