const fs = require("fs");
const path = require("path");
const axios = require("axios");
const OpenAI = require("openai");

// ✅ OpenRouter Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // للـ Vision API

// تهيئة OpenAI client
let openaiClient = null;
if (OPENROUTER_API_KEY) {
  try {
    openaiClient = new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  } catch (error) {
    console.error("Failed to initialize OpenRouter client:", error.message);
  }
}

// تهيئة OpenAI client للـ Vision (إذا كان متوفراً)
let openaiVisionClient = null;
if (OPENAI_API_KEY) {
  try {
    openaiVisionClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
  } catch (error) {
    console.error("Failed to initialize OpenAI Vision client:", error.message);
  }
}

/**
 * استخراج وصف من الصورة باستخدام OpenAI Vision API
 * @param {string} imagePath - مسار الصورة
 * @returns {Promise<Object>} - { description, objects, scene, colors }
 */
async function extractImageData(imagePath) {
  try {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    // قراءة الصورة كـ base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = getImageMimeType(imagePath);

    // استخدام OpenAI Vision API
    if (openaiVisionClient) {
      try {
        const response = await openaiVisionClient.chat.completions.create({
          model: "gpt-4o-mini", // أو gpt-4-vision-preview
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Describe this image in detail. Include: main objects, scene description, colors, mood, and any text visible in the image. Respond in JSON format with keys: description, objects (array), scene, colors (array), mood, text.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 500,
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          try {
            // محاولة تحويل JSON
            const parsed = JSON.parse(content);
            return {
              description: parsed.description || content,
              objects: parsed.objects || [],
              scene: parsed.scene || "",
              colors: parsed.colors || [],
              mood: parsed.mood || "",
              text: parsed.text || "",
            };
          } catch {
            // إذا لم يكن JSON، استخدم النص كوصف
            return {
              description: content,
              objects: [],
              scene: "",
              colors: [],
              mood: "",
              text: "",
            };
          }
        }
      } catch (error) {
        console.warn("OpenAI Vision API failed, trying alternative:", error.message);
      }
    }

    // Fallback: استخدام OpenRouter مع Vision models
    if (openaiClient) {
      try {
        const response = await openaiClient.chat.completions.create({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Describe this image in detail. Include: main objects, scene description, colors, mood, and any text visible in the image.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 500,
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          return {
            description: content,
            objects: extractObjectsFromDescription(content),
            scene: extractSceneFromDescription(content),
            colors: extractColorsFromDescription(content),
            mood: "",
            text: "",
          };
        }
      } catch (error) {
        console.warn("OpenRouter Vision failed:", error.message);
      }
    }

    // إذا فشل كل شيء، نرجع وصف بسيط
    return {
      description: "Image file - no description available",
      objects: [],
      scene: "",
      colors: [],
      mood: "",
      text: "",
    };
  } catch (error) {
    console.error("Error extracting image data:", error.message);
    return {
      description: null,
      objects: [],
      scene: "",
      colors: [],
      mood: "",
      text: "",
      error: error.message,
    };
  }
}

/**
 * استخراج نص من الصوت باستخدام Whisper API
 * @param {string} audioPath - مسار الملف الصوتي
 * @returns {Promise<string>} - النص المستخرج
 */
async function extractAudioTranscript(audioPath) {
  try {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    // استخدام OpenAI Whisper API
    if (openaiVisionClient || openaiClient) {
      const client = openaiVisionClient || openaiClient;
      try {
        const transcript = await client.audio.transcriptions.create({
          file: fs.createReadStream(audioPath),
          model: "whisper-1",
          language: "ar", // يمكن تحديد اللغة أو تركه تلقائياً
        });

        return transcript.text || "";
      } catch (error) {
        console.warn("Whisper API failed:", error.message);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error("Error extracting audio transcript:", error.message);
    return null;
  }
}

/**
 * استخراج بيانات من الفيديو (transcript + thumbnails description)
 * @param {string} videoPath - مسار الفيديو
 * @returns {Promise<Object>} - { transcript, scenes, thumbnails }
 */
async function extractVideoData(videoPath) {
  try {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    // ملاحظة: استخراج الفيديو يتطلب مكتبات إضافية مثل ffmpeg
    // هنا نرجع بيانات أساسية - يمكن تحسينها لاحقاً
    return {
      transcript: null, // يحتاج ffmpeg + whisper
      scenes: [],
      thumbnails: [],
      description: "Video file - processing not available yet",
    };
  } catch (error) {
    console.error("Error extracting video data:", error.message);
    return {
      transcript: null,
      scenes: [],
      thumbnails: [],
      description: null,
      error: error.message,
    };
  }
}

/**
 * دمج بيانات الصورة في نص للبحث
 */
function combineImageDataForSearch(imageData) {
  const parts = [
    imageData.description || "",
    imageData.scene || "",
    ...(imageData.objects || []),
    ...(imageData.colors || []),
    imageData.mood || "",
    imageData.text || "",
  ];

  return parts.filter(Boolean).join(" ");
}

/**
 * دمج بيانات الصوت في نص للبحث
 */
function combineAudioDataForSearch(audioData) {
  return audioData.transcript || "";
}

/**
 * دمج بيانات الفيديو في نص للبحث
 */
function combineVideoDataForSearch(videoData) {
  const parts = [
    videoData.transcript || "",
    videoData.description || "",
    ...(videoData.scenes || []),
  ];

  return parts.filter(Boolean).join(" ");
}

// Helper functions
function getImageMimeType(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return mimeTypes[ext] || "image/jpeg";
}

function extractObjectsFromDescription(description) {
  // استخراج كلمات رئيسية من الوصف
  const commonObjects = [
    "person",
    "people",
    "car",
    "building",
    "tree",
    "water",
    "sky",
    "sun",
    "moon",
    "animal",
    "dog",
    "cat",
    "bird",
    "food",
    "book",
    "phone",
    "computer",
  ];
  const words = description.toLowerCase().split(/\s+/);
  return commonObjects.filter((obj) => words.includes(obj));
}

function extractSceneFromDescription(description) {
  // استخراج وصف المشهد
  if (description.toLowerCase().includes("beach")) return "beach";
  if (description.toLowerCase().includes("mountain")) return "mountain";
  if (description.toLowerCase().includes("city")) return "city";
  if (description.toLowerCase().includes("indoor")) return "indoor";
  if (description.toLowerCase().includes("outdoor")) return "outdoor";
  return "";
}

function extractColorsFromDescription(description) {
  const colors = [
    "red",
    "blue",
    "green",
    "yellow",
    "orange",
    "purple",
    "pink",
    "brown",
    "black",
    "white",
    "gray",
  ];
  const words = description.toLowerCase().split(/\s+/);
  return colors.filter((color) => words.includes(color));
}

module.exports = {
  extractImageData,
  extractAudioTranscript,
  extractVideoData,
  combineImageDataForSearch,
  combineAudioDataForSearch,
  combineVideoDataForSearch,
};







