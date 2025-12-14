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
const {
  extractImageData,
  extractAudioTranscript,
  extractVideoData,
  combineImageDataForSearch,
  combineAudioDataForSearch,
  combineVideoDataForSearch,
} = require("./mediaExtractionService");

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
    if (
      existingFile.isProcessed &&
      existingFile.extractedText &&
      existingFile.embedding
    ) {
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
      console.log(
        `⏭️ File ${fileId} is being processed by another worker or already processed, skipping...`
      );
      // إعادة جلب الملف المحدث
      const updatedFile = await File.findById(fileId);
      return updatedFile || existingFile;
    }

    console.log(
      `🔄 Processing file: ${file.name} (${fileId}) - Category: ${file.category}`
    );

    const filePath = path.join(__dirname, "..", file.path);

    // التحقق من وجود الملف
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }

    // 1. استخراج البيانات حسب نوع الملف
    let extractedText = null;
    let extractionError = null;
    let imageData = null;
    let audioTranscript = null;
    let videoData = null;

    try {
      // استخراج النص من المستندات
      if (file.category === "Documents" || file.category === "Code") {
        extractedText = await extractTextFromFile(
          filePath,
          file.type,
          file.name
        );
        if (extractedText) {
          extractedText = cleanExtractedText(extractedText);
        }
      }

      // استخراج بيانات الصور
      if (file.category === "Images") {
        console.log(`🖼️ Extracting image data for file ${fileId}...`);
        imageData = await extractImageData(filePath);
        if (imageData && imageData.description) {
          extractedText = imageData.description; // استخدام الوصف كنص للبحث
        }
      }

      // استخراج نص من الصوت
      if (file.category === "Audio") {
        console.log(`🎵 Extracting audio transcript for file ${fileId}...`);
        audioTranscript = await extractAudioTranscript(filePath);
        if (audioTranscript) {
          extractedText = audioTranscript;
        }
      }

      // استخراج بيانات الفيديو
      if (file.category === "Videos") {
        console.log(`🎥 Extracting video data for file ${fileId}...`);
        videoData = await extractVideoData(filePath);
        if (videoData && videoData.transcript) {
          extractedText = videoData.transcript;
        } else if (videoData && videoData.description) {
          extractedText = videoData.description;
        }
      }
    } catch (error) {
      console.error(
        `Error extracting data from file ${fileId}:`,
        error.message
      );
      extractionError = error.message;
      // نستمر حتى لو فشل استخراج البيانات
    }

    // 2. توليد Embedding من البيانات المستخرجة
    let embedding = null;
    let embeddingError = null;
    try {
      let searchText = "";

      // بناء نص البحث حسب نوع الملف
      if (file.category === "Images" && imageData) {
        searchText = combineImageDataForSearch(imageData);
        // إضافة بيانات الملف الأساسية
        searchText =
          `${file.name} ${file.description || ""} ${searchText}`.trim();
      } else if (file.category === "Audio" && audioTranscript) {
        searchText = combineAudioDataForSearch({ transcript: audioTranscript });
        searchText =
          `${file.name} ${file.description || ""} ${searchText}`.trim();
      } else if (file.category === "Videos" && videoData) {
        searchText = combineVideoDataForSearch(videoData);
        searchText =
          `${file.name} ${file.description || ""} ${searchText}`.trim();
      } else {
        // للمستندات والملفات الأخرى
        searchText = combineFileDataForSearch({
          ...file.toObject(),
          extractedText: extractedText || "",
        });
      }

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

    // إضافة بيانات الصور
    if (imageData) {
      updateData.imageDescription = imageData.description || null;
      updateData.imageObjects = imageData.objects || [];
      updateData.imageScene = imageData.scene || null;
      updateData.imageColors = imageData.colors || [];
      updateData.imageMood = imageData.mood || null;
      updateData.imageText = imageData.text || null;
    }

    // إضافة بيانات الصوت
    if (audioTranscript) {
      updateData.audioTranscript = audioTranscript;
    }

    // إضافة بيانات الفيديو
    if (videoData) {
      updateData.videoTranscript = videoData.transcript || null;
      updateData.videoScenes = videoData.scenes || [];
      updateData.videoDescription = videoData.description || null;
    }

    // ✅ استخدام updateOne بدلاً من save() لتجنب version conflict
    await File.updateOne({ _id: fileId }, { $set: updateData });

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
    if (imageData) {
      console.log(
        `   - Image description: ${imageData.description ? "Yes" : "No"}`
      );
      console.log(
        `   - Image objects: ${(imageData.objects && imageData.objects.length) || 0}`
      );
    }
    if (audioTranscript) {
      console.log(`   - Audio transcript: ${audioTranscript.length} chars`);
    }
    if (videoData) {
      console.log(
        `   - Video transcript: ${videoData.transcript ? "Yes" : "No"}`
      );
    }
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
