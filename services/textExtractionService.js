const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const xlsx = require("xlsx");

/**
 * استخراج النص من ملف PDF
 * يتعامل مع PDF الصورية والتالفة بشكل صحيح
 */
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);

    // التحقق من وجود نص قابل للاستخراج
    if (!data.text || data.text.trim().length === 0) {
      console.warn(
        "⚠️ PDF contains no extractable text (likely scanned/image-only PDF)"
      );
      return null; // لا نرمي خطأ - فقط نرجع null
    }

    return data.text;
  } catch (error) {
    // إذا كان PDF تالف أو scanned - لا نرمي خطأ
    if (
      error.message.includes("Invalid PDF structure") ||
      error.message.includes("corrupt") ||
      error.message.includes("invalid")
    ) {
      console.warn(
        "⚠️ Invalid or scanned PDF - cannot extract text:",
        error.message
      );
      return null; // نرجع null بدلاً من رمي خطأ
    }

    // للأخطاء الأخرى - نرمي خطأ عادي
    console.error("Error extracting text from PDF:", error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

/**
 * استخراج النص من ملف Word (DOCX)
 */
async function extractTextFromDOCX(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    console.error("Error extracting text from DOCX:", error);
    throw new Error(`Failed to extract text from DOCX: ${error.message}`);
  }
}

/**
 * استخراج النص من ملف Excel
 */
async function extractTextFromExcel(filePath) {
  try {
    const workbook = xlsx.readFile(filePath);
    let text = "";

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const sheetData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

      sheetData.forEach((row) => {
        if (Array.isArray(row)) {
          text += row.join(" ") + "\n";
        }
      });
    });

    return text;
  } catch (error) {
    console.error("Error extracting text from Excel:", error);
    throw new Error(`Failed to extract text from Excel: ${error.message}`);
  }
}

/**
 * استخراج النص من ملف نصي عادي
 */
async function extractTextFromTXT(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    console.error("Error extracting text from TXT:", error);
    throw new Error(`Failed to extract text from TXT: ${error.message}`);
  }
}

/**
 * استخراج النص من ملفات Code
 */
async function extractTextFromCode(filePath, extension) {
  try {
    const codeExtensions = [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".py",
      ".java",
      ".cpp",
      ".c",
      ".html",
      ".css",
      ".json",
      ".xml",
      ".yaml",
      ".yml",
      ".md",
      ".txt",
      ".sql",
      ".sh",
      ".bash",
    ];

    if (codeExtensions.includes(extension.toLowerCase())) {
      return fs.readFileSync(filePath, "utf-8");
    }

    return null;
  } catch (error) {
    console.error("Error extracting text from code file:", error);
    return null;
  }
}

/**
 * تحديد نوع الملف واستخراج النص
 */
async function extractTextFromFile(filePath, mimeType, fileName) {
  try {
    const extension = path.extname(fileName).toLowerCase();

    // PDF
    if (mimeType === "application/pdf" || extension === ".pdf") {
      const pdfText = await extractTextFromPDF(filePath);
      // إذا كان null (PDF صورية أو تالف) - نرجع null بدون خطأ
      if (pdfText === null) {
        return null;
      }
      return pdfText;
    }

    // Word Documents
    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      extension === ".docx"
    ) {
      return await extractTextFromDOCX(filePath);
    }

    // Excel
    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      extension === ".xlsx" ||
      extension === ".xls"
    ) {
      return await extractTextFromExcel(filePath);
    }

    // Text files
    if (mimeType.startsWith("text/") || extension === ".txt") {
      return await extractTextFromTXT(filePath);
    }

    // Code files
    const codeText = await extractTextFromCode(filePath, extension);
    if (codeText) {
      return codeText;
    }

    // إذا لم نتمكن من استخراج النص
    return null;
  } catch (error) {
    console.error("Error in extractTextFromFile:", error);
    throw error;
  }
}

/**
 * تنظيف النص المستخرج
 */
function cleanExtractedText(text) {
  if (!text) return "";

  // إزالة المسافات الزائدة
  let cleaned = text.replace(/\s+/g, " ");

  // إزالة الأحرف الخاصة غير المرغوبة (مع الحفاظ على العربية)
  cleaned = cleaned.replace(
    /[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF.,;:!?()[\]{}'"-]/g,
    " "
  );

  // تقليل المسافات المتعددة
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // تحديد طول النص (لحفظ المساحة)
  const maxLength = 50000; // 50K characters
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength) + "...";
  }

  return cleaned;
}

module.exports = {
  extractTextFromFile,
  cleanExtractedText,
  extractTextFromPDF,
  extractTextFromDOCX,
  extractTextFromExcel,
  extractTextFromTXT,
};

