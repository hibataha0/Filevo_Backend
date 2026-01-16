const express = require("express");
const asyncHandler = require("express-async-handler");
const router = express.Router();

const {
  smartSearch,
  searchInFileContent,
  searchByFileName,
  searchByTags,
} = require("../services/aiSearchService");
const {
  processFile,
  reprocessFile,
} = require("../services/fileProcessingService");
const { protect } = require("../services/authService");
const { checkHFConnection } = require("../services/aiService");

// @desc    Test route
// @route   GET /api/v1/search/test
// @access  Public
router.get("/test", (req, res) => {
  res.status(200).json({
    message: "Search routes are working!",
    availableRoutes: [
      "POST /api/v1/search/smart",
      "POST /api/v1/search/content",
      "POST /api/v1/search/filename",
      "POST /api/v1/search/tags",
      "POST /api/v1/search/process/:fileId",
      "POST /api/v1/search/reprocess/:fileId",
      "GET /api/v1/search/hf-status",
    ],
  });
});

// @desc    Check Hugging Face API connection status
// @route   GET /api/v1/search/hf-status
// @access  Private
router.get(
  "/hf-status",
  protect,
  asyncHandler(async (req, res) => {
    const status = await checkHFConnection();
    res.status(200).json({
      message: status.connected
        ? "Hugging Face API is connected"
        : "Hugging Face API is not connected",
      connected: status.connected,
      model: status.model && status.model.id ? status.model.id : null,
      error: status.error || null,
    });
  })
);

// @desc    Smart Search (نصي + AI) - البحث الذكي الشامل
// @route   POST /api/v1/search/smart
// @access  Private
router.post(
  "/smart",
  protect,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const {
      query,
      limit = 20,
      minScore = 0.2,
      category = null,
      dateRange = null, // 'yesterday', 'last7days', 'last30days', 'lastyear', 'custom'
      startDate = null, // للـ custom date range (ISO string)
      endDate = null, // للـ custom date range (ISO string)
    } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        message: "Query is required",
      });
    }

    const results = await smartSearch(userId, query.trim(), {
      limit: parseInt(limit, 10),
      minScore: parseFloat(minScore),
      category,
      dateRange,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    });

    res.status(200).json({
      message: "Smart search completed successfully",
      query,
      resultsCount: results.length,
      results: results.map((r) => ({
        type: r.type,
        _id: r.item._id,
        name: r.item.name,
        category: r.item.category,
        size: r.item.size,
        summary: r.item.summary,
        description: r.item.description,
        tags: r.item.tags,
        relevanceScore: Math.round(r.score * 100) / 100,
        searchType: r.searchType || "text",
        hasExtractedText: !!r.item.extractedText,
        createdAt: r.item.createdAt,
        updatedAt: r.item.updatedAt,
        // إضافة URLs للفتح والتحميل
        viewUrl: `/api/v1/files/${r.item._id}/view`, // للفتح المباشر (صور، PDF، فيديو، صوت، نص)
        downloadUrl: `/api/v1/files/${r.item._id}/download`, // للتحميل
        detailsUrl: `/api/v1/files/${r.item._id}`, // للتفاصيل (JSON)
      })),
    });
  })
);

// @desc    Search in file content only
// @route   POST /api/v1/search/content
// @access  Private
router.post(
  "/content",
  protect,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { query, limit = 20 } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        message: "Query is required",
      });
    }

    const results = await searchInFileContent(userId, query.trim(), {
      limit: parseInt(limit, 10),
    });

    res.status(200).json({
      message: "Content search completed successfully",
      query,
      resultsCount: results.length,
      results: results.map((r) => ({
        type: r.type,
        _id: r.item._id,
        name: r.item.name,
        category: r.item.category,
        summary: r.item.summary,
        extractedTextPreview: r.item.extractedText
          ? `${r.item.extractedText.substring(0, 300)}...`
          : null,
      })),
    });
  })
);

// @desc    Search by file name only
// @route   POST /api/v1/search/filename
// @access  Private
router.post(
  "/filename",
  protect,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { query, limit = 20 } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        message: "Query is required",
      });
    }

    const results = await searchByFileName(userId, query.trim(), {
      limit: parseInt(limit, 10),
    });

    res.status(200).json({
      message: "Filename search completed successfully",
      query,
      resultsCount: results.length,
      results: results.map((r) => ({
        type: r.type,
        _id: r.item._id,
        name: r.item.name,
        category: r.item.category,
        size: r.item.size,
        createdAt: r.item.createdAt,
      })),
    });
  })
);

// @desc    Search by tags - البحث عن طريق التاغ
// @route   POST /api/v1/search/tags
// @access  Private
router.post(
  "/tags",
  protect,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { tag, limit = 20 } = req.body;

    if (!tag || tag.trim().length === 0) {
      return res.status(400).json({
        message: "Tag is required",
      });
    }

    const results = await searchByTags(userId, tag.trim(), {
      limit: parseInt(limit, 10),
    });

    res.status(200).json({
      message: "Tag search completed successfully",
      tag,
      resultsCount: results.length,
      results: results.map((r) => ({
        type: r.type,
        _id: r.item._id,
        name: r.item.name,
        category: r.item.category || null,
        size: r.item.size || 0,
        tags: r.item.tags || [],
        description: r.item.description || "",
        relevanceScore: Math.round(r.score * 100) / 100,
        searchType: r.searchType,
        createdAt: r.item.createdAt,
        updatedAt: r.item.updatedAt,
      })),
    });
  })
);

// @desc    Process file (extract text, generate embedding, summarize)
// @route   POST /api/v1/search/process/:fileId
// @access  Private
router.post(
  "/process/:fileId",
  protect,
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const userId = req.user._id;

    const File = require("../models/fileModel");
    const file = await File.findOne({ _id: fileId, userId });

    if (!file) {
      return res.status(404).json({
        message: "File not found",
      });
    }

    const processedFile = await processFile(fileId);

    res.status(200).json({
      success: true,
      message: "File processed successfully",
      file: {
        _id: processedFile._id,
        name: processedFile.name,
        isProcessed: processedFile.isProcessed,
        hasExtractedText: !!processedFile.extractedText,
        hasEmbedding: !!processedFile.embedding,
        hasSummary: !!processedFile.summary,
        extractedTextLength: processedFile.extractedText
          ? processedFile.extractedText.length
          : 0,
        embeddingDimensions: processedFile.embedding
          ? processedFile.embedding.length
          : 0,
        summaryLength: processedFile.summary ? processedFile.summary.length : 0,
        textExtractionError: processedFile.textExtractionError || null,
        embeddingError: processedFile.embeddingError || null,
        processedAt: processedFile.processedAt,
      },
    });
  })
);

// @desc    Reprocess file
// @route   POST /api/v1/search/reprocess/:fileId
// @access  Private
router.post(
  "/reprocess/:fileId",
  protect,
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const userId = req.user._id;

    const File = require("../models/fileModel");
    const file = await File.findOne({ _id: fileId, userId });

    if (!file) {
      return res.status(404).json({
        message: "File not found",
      });
    }

    const processedFile = await reprocessFile(fileId);

    res.status(200).json({
      message: "File reprocessed successfully",
      file: {
        _id: processedFile._id,
        name: processedFile.name,
        isProcessed: processedFile.isProcessed,
        hasExtractedText: !!processedFile.extractedText,
        hasEmbedding: !!processedFile.embedding,
        hasSummary: !!processedFile.summary,
      },
    });
  })
);

module.exports = router;
