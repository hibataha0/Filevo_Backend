const axios = require("axios");
const OpenAI = require("openai");

// ✅ OpenRouter Configuration (مجاني تماماً وموثوق)
// للحصول على Token مجاني: https://openrouter.ai/keys
// بدون بطاقة ائتمان، بدون اشتراك
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_EMBEDDING_MODEL =
  process.env.OPENROUTER_EMBEDDING_MODEL || "text-embedding-3-small"; // مجاني وسريع - يدعم العربية والإنجليزية

// Debug: التحقق من قراءة المتغير (سيتم طباعته عند تحميل الملف)
if (OPENROUTER_API_KEY) {
  console.log("✅ OPENROUTER_API_KEY loaded successfully");
} else {
  console.warn("⚠️ OPENROUTER_API_KEY is not set in config.env");
  console.warn(
    "   Make sure dotenv.config() is called before requiring this module"
  );
}

// Hugging Face Configuration (للتوافق مع الكود القديم - اختياري)
const HF_API_KEY = process.env.HF_API_KEY || process.env.HF_API_TOKEN;
const HF_EMBEDDING_MODEL =
  process.env.HF_EMBEDDING_MODEL || "sentence-transformers/all-MiniLM-L6-v2";
const HF_SUMMARIZATION_MODEL =
  process.env.HF_SUMMARIZATION_MODEL || "facebook/bart-large-cnn";
const HF_API_BASE_URL =
  process.env.HF_API_BASE_URL || "https://api-inference.huggingface.co";

// تهيئة OpenAI client للـ OpenRouter
let openaiClient = null;
if (OPENROUTER_API_KEY) {
  try {
    openaiClient = new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
    console.log("✅ OpenRouter client initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize OpenRouter client:", error.message);
  }
} else {
  console.warn("⚠️ OPENROUTER_API_KEY is not set in config.env");
}

/**
 * دالة مساعدة للـ retry مع معالجة 503
 */
async function retryWithBackoff(fn, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error;

      // إذا كان النموذج قيد التحميل (503)
      if (
        error.response &&
        error.response.status === 503 &&
        attempt < maxAttempts
      ) {
        const waitTime = 10 * attempt;
        console.warn(
          `⚠️ Model is loading (503). Waiting ${waitTime} seconds... (attempt ${attempt}/${maxAttempts})`
        );
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, waitTime * 1000);
        });
        // استمر في المحاولة
        // eslint-disable-next-line no-continue
        continue;
      }

      // إذا كان 410 أو آخر محاولة، ارمي الخطأ
      if (error.response && error.response.status === 410) {
        throw error; // سيعالج في الدالة الرئيسية
      }

      if (attempt >= maxAttempts) {
        throw error;
      }
    }
  }
  throw lastError;
}

/**
 * طريقة بديلة لتوليد Embedding (تُستخدم عند فشل الطريقة الرئيسية)
 */
async function generateEmbeddingAlternative(text) {
  try {
    const textToEmbed = text.length > 512 ? text.substring(0, 512) : text;

    console.log(
      `🔄 Trying alternative embedding method with different model...`
    );

    const headers = {
      "Content-Type": "application/json",
    };

    if (HF_API_KEY) {
      headers.Authorization = `Bearer ${HF_API_KEY}`;
    }

    // استخدام نموذج بديل موثوق
    const alternativeModel =
      "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";

    console.log(`   Using alternative model: ${alternativeModel}`);

    // جرب /models/{model} أولاً
    let response;
    try {
      const makeAltRequest = async () =>
        axios.post(
          `${HF_API_BASE_URL}/models/${alternativeModel}`,
          { inputs: textToEmbed }, // ✅ صيغة {inputs: text}
          {
            headers,
            timeout: 30000,
          }
        );
      response = await retryWithBackoff(makeAltRequest, 2);
    } catch (error) {
      // إذا فشل - جرب /pipeline/feature-extraction/{model}
      if (
        error.response &&
        (error.response.status === 410 || error.response.status === 404)
      ) {
        const makePipelineRequest = async () =>
          axios.post(
            `${HF_API_BASE_URL}/pipeline/feature-extraction/${alternativeModel}`,
            textToEmbed, // النص مباشرة
            {
              headers,
              timeout: 30000,
            }
          );
        response = await retryWithBackoff(makePipelineRequest, 2);
      } else {
        throw error;
      }
    }

    // معالجة الاستجابة
    let embedding = response.data;

    if (Array.isArray(embedding)) {
      if (embedding.length > 0 && Array.isArray(embedding[0])) {
        embedding = embedding[0];
      }
    }

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Invalid response from alternative endpoint");
    }

    console.log(
      `✅ Alternative embedding generated (${embedding.length} dimensions)`
    );
    return embedding;
  } catch (error) {
    console.error(
      "❌ Alternative embedding method also failed:",
      error.message
    );
    throw new Error(
      `All embedding methods failed. Last error: ${error.message}. ` +
        `Please check: 1) HF_API_KEY is valid, 2) Model is available on HuggingFace, 3) Internet connection`
    );
  }
}

/**
 * توليد Embedding باستخدام Hugging Face (Fallback)
 */
async function generateEmbeddingHuggingFace(text) {
  try {
    const textToEmbed = text.length > 512 ? text.substring(0, 512) : text;

    console.log(
      `🔄 Calling Hugging Face Inference API (FALLBACK) for embedding...`
    );
    console.log(`   Model: ${HF_EMBEDDING_MODEL}`);
    console.log(`   Text length: ${textToEmbed.length} chars`);

    if (!HF_API_KEY) {
      throw new Error(
        "No API key available. Please set OPENROUTER_API_KEY or HF_API_KEY in config.env"
      );
    }

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${HF_API_KEY}`,
    };

    // جرب /models/{model} أولاً
    let response;
    try {
      const makeRequest = async () =>
        axios.post(
          `${HF_API_BASE_URL}/models/${HF_EMBEDDING_MODEL}`,
          { inputs: textToEmbed },
          {
            headers,
            timeout: 30000,
          }
        );
      response = await retryWithBackoff(makeRequest, 3);
    } catch (error) {
      // إذا كان 410 أو 404 - جرب /pipeline/feature-extraction/{model}
      if (
        error.response &&
        (error.response.status === 410 || error.response.status === 404)
      ) {
        console.warn(
          `⚠️ Endpoint returned ${error.response.status}. Trying alternative endpoint...`
        );
        try {
          const makeAltRequest = async () =>
            axios.post(
              `${HF_API_BASE_URL}/pipeline/feature-extraction/${HF_EMBEDDING_MODEL}`,
              textToEmbed,
              {
                headers,
                timeout: 30000,
              }
            );
          response = await retryWithBackoff(makeAltRequest, 2);
        } catch (altError) {
          // إذا فشل أيضاً - جرب نموذج بديل
          if (altError.response && altError.response.status === 410) {
            console.warn(
              `⚠️ Alternative endpoint also failed. Trying alternative model...`
            );
            return await generateEmbeddingAlternative(text);
          }
          throw altError;
        }
      } else {
        throw error;
      }
    }

    // معالجة الاستجابة
    let embedding = response.data;

    if (Array.isArray(embedding)) {
      if (embedding.length > 0 && Array.isArray(embedding[0])) {
        embedding = embedding[0];
      }
    }

    if (!Array.isArray(embedding) && typeof embedding === "object") {
      embedding =
        embedding.embeddings || embedding.output || embedding[0] || null;
    }

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      throw new Error(
        `Invalid response from Hugging Face - no embedding found. Response type: ${typeof response.data}`
      );
    }

    console.log(
      `✅ Embedding generated successfully via HuggingFace (${embedding.length} dimensions)`
    );
    return embedding;
  } catch (error) {
    console.error("❌ HuggingFace fallback also failed:", error.message);
    throw error;
  }
}

/**
 * توليد Embedding باستخدام OpenRouter API (مجاني وموثوق)
 * ✅ أفضل حل مجاني حالياً - بدون بطاقة ائتمان
 */
async function generateEmbedding(text) {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error("Text is required for embedding");
    }

    // تقليل النص إذا كان طويل جداً (OpenAI API يدعم حتى 8191 token)
    // لكن للسرعة والأداء، نحدد إلى 8000 حرف
    const textToEmbed = text.length > 8000 ? text.substring(0, 8000) : text;

    // ✅ استخدام OpenRouter أولاً (الأفضل)
    if (openaiClient && OPENROUTER_API_KEY) {
      try {
        console.log(`🔄 Calling OpenRouter API (FREE) for embedding...`);
        console.log(`   Model: ${OPENROUTER_EMBEDDING_MODEL}`);
        console.log(`   Text length: ${textToEmbed.length} chars`);

        const response = await openaiClient.embeddings.create({
          model: OPENROUTER_EMBEDDING_MODEL,
          input: textToEmbed,
        });

        if (
          !response.data ||
          !response.data[0] ||
          !response.data[0].embedding
        ) {
          throw new Error("Invalid response from OpenRouter API");
        }

        const embedding = response.data[0].embedding;

        console.log(
          `✅ Embedding generated successfully via OpenRouter (${embedding.length} dimensions)`
        );
        return embedding;
      } catch (openRouterError) {
        console.warn(
          `⚠️ OpenRouter API failed: ${openRouterError.message}. Trying HuggingFace fallback...`
        );
        // إذا فشل OpenRouter - جرب HuggingFace كبديل
        return await generateEmbeddingHuggingFace(text);
      }
    }

    // إذا لم يكن OpenRouter متاحاً - استخدم HuggingFace
    console.warn(
      "⚠️ OpenRouter API not configured. Using HuggingFace fallback..."
    );
    return await generateEmbeddingHuggingFace(text);
  } catch (error) {
    console.error("❌ Error generating embedding:", error.message);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * تلخيص النص باستخدام Hugging Face API
 */
async function summarizeText(text, maxLength = 200) {
  try {
    if (!text || text.trim().length === 0) {
      return null;
    }

    // إذا كان النص قصير، لا حاجة للتلخيص
    if (text.length <= maxLength) {
      return text;
    }

    // تقليل النص للحد الأقصى للنموذج
    const textToSummarize = text.substring(0, 1024); // الحد الأقصى للنموذج

    console.log(`🔄 Summarizing text using Hugging Face (FREE)...`);

    // إعداد headers - مع أو بدون token
    const headers = {
      "Content-Type": "application/json",
    };

    if (HF_API_KEY) {
      headers.Authorization = `Bearer ${HF_API_KEY}`;
    }

    const response = await axios.post(
      `${HF_API_BASE_URL}/models/${HF_SUMMARIZATION_MODEL}`,
      {
        inputs: textToSummarize,
        parameters: {
          max_length: maxLength,
          min_length: Math.floor(maxLength / 2),
        },
      },
      {
        headers,
        timeout: 60000, // 60 seconds timeout
      }
    );

    // معالجة الاستجابة - قد تكون بأشكال مختلفة
    let summary = null;

    if (Array.isArray(response.data) && response.data.length > 0) {
      summary =
        response.data[0].summary_text ||
        response.data[0].generated_text ||
        response.data[0];
    } else if (response.data.summary_text) {
      summary = response.data.summary_text;
    } else if (response.data.generated_text) {
      summary = response.data.generated_text;
    } else if (typeof response.data === "string") {
      summary = response.data;
    }

    if (!summary) {
      throw new Error(
        `Invalid response from Hugging Face: ${JSON.stringify(response.data).substring(0, 200)}`
      );
    }

    return summary.trim();
  } catch (error) {
    console.error("Error summarizing text:", error.message);
    // Fallback: إرجاع أول 200 كلمة
    const words = text
      .split(" ")
      .slice(0, maxLength / 5)
      .join(" ");
    return words + (text.length > words.length ? "..." : "");
  }
}

/**
 * حساب التشابه بين embeddings (Cosine Similarity)
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i += 1) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * دمج بيانات الملف في نص واحد للبحث
 */
function combineFileDataForSearch(file) {
  const parts = [
    file.name,
    file.description || "",
    file.category || "",
    file.extractedText ? file.extractedText.substring(0, 2000) : "", // أول 2000 حرف من النص المستخرج
    file.summary || "",
    ...(file.tags || []),
  ];

  return parts.filter(Boolean).join(" ");
}

/**
 * التحقق من اتصال AI API (OpenRouter أولاً، ثم HuggingFace كبديل)
 */
async function checkHFConnection() {
  try {
    // ✅ التحقق من OpenRouter أولاً (الأفضل)
    // إعادة قراءة المتغير مباشرة من process.env للتأكد
    const currentOpenRouterKey = process.env.OPENROUTER_API_KEY;

    console.log(`🔍 Checking OpenRouter API...`);
    console.log(`   OPENROUTER_API_KEY exists: ${!!currentOpenRouterKey}`);
    console.log(
      `   OPENROUTER_API_KEY length: ${currentOpenRouterKey ? currentOpenRouterKey.length : 0}`
    );

    if (currentOpenRouterKey && currentOpenRouterKey.trim().length > 0) {
      // إعادة تهيئة client دائماً للتأكد من استخدام المفتاح الصحيح
      try {
        const newClient = new OpenAI({
          apiKey: currentOpenRouterKey.trim(),
          baseURL: "https://openrouter.ai/api/v1",
        });
        openaiClient = newClient;
        console.log("✅ OpenRouter client initialized");
      } catch (error) {
        console.error(
          "❌ Failed to initialize OpenRouter client:",
          error.message
        );
        openaiClient = null;
      }

      if (openaiClient) {
        try {
          console.log("🔄 Testing OpenRouter API connection...");
          const testResponse = await openaiClient.embeddings.create({
            model: OPENROUTER_EMBEDDING_MODEL,
            input: "test",
          });

          if (
            testResponse.data &&
            testResponse.data[0] &&
            testResponse.data[0].embedding
          ) {
            console.log(`✅ OpenRouter API test successful!`);
            return {
              connected: true,
              provider: "OpenRouter",
              model: OPENROUTER_EMBEDDING_MODEL,
              hasToken: true,
              embeddingDimensions: testResponse.data[0].embedding.length,
              note: "✅ OpenRouter API is ready! (Recommended - Free & Reliable)",
            };
          }
        } catch (openRouterError) {
          console.warn(`⚠️ OpenRouter test failed: ${openRouterError.message}`);
          if (openRouterError.response) {
            console.warn(`   Status: ${openRouterError.response.status}`);
            console.warn(
              `   Data: ${JSON.stringify(openRouterError.response.data)}`
            );
          }
          console.warn(`   Checking HuggingFace fallback...`);
        }
      }
    } else {
      console.warn(
        "⚠️ OPENROUTER_API_KEY not found in environment variables. Using HuggingFace fallback..."
      );
    }

    // Fallback: التحقق من HuggingFace
    if (!HF_API_KEY) {
      return {
        connected: false,
        error: "No API key configured",
        note: "Please add OPENROUTER_API_KEY (recommended) or HF_API_KEY to config.env",
        openRouterSetup: "Get free token from: https://openrouter.ai/keys",
        huggingFaceSetup:
          "Get token from: https://huggingface.co/settings/tokens",
      };
    }

    // اختبار HuggingFace
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HF_API_KEY}`,
      };

      const testText = "test";
      let response;

      try {
        response = await axios.post(
          `${HF_API_BASE_URL}/models/${HF_EMBEDDING_MODEL}`,
          { inputs: testText },
          {
            headers,
            timeout: 5000,
          }
        );
      } catch (error) {
        if (
          error.response &&
          (error.response.status === 410 || error.response.status === 404)
        ) {
          response = await axios.post(
            `${HF_API_BASE_URL}/pipeline/feature-extraction/${HF_EMBEDDING_MODEL}`,
            testText,
            {
              headers,
              timeout: 5000,
            }
          );
        } else {
          throw error;
        }
      }

      const embeddingDimensions = (() => {
        if (!Array.isArray(response.data) || response.data.length === 0) {
          return 384;
        }
        if (Array.isArray(response.data[0])) {
          return response.data[0].length;
        }
        return response.data.length;
      })();

      return {
        connected: true,
        provider: "HuggingFace (Fallback)",
        model: HF_EMBEDDING_MODEL,
        hasToken: true,
        embeddingDimensions,
        note: "Hugging Face API is ready (using fallback)",
        recommendation: "Consider using OpenRouter API for better reliability",
      };
    } catch (testError) {
      if (testError.response && testError.response.status === 503) {
        return {
          connected: true,
          provider: "HuggingFace (Fallback)",
          model: HF_EMBEDDING_MODEL,
          hasToken: true,
          note: "Hugging Face API is available but model is loading",
          warning: "Model is loading (503) - this is normal for first request",
        };
      }

      return {
        connected: false,
        provider: "HuggingFace (Fallback)",
        error: testError.message,
        note: "HuggingFace API test failed. Consider using OpenRouter API instead.",
        openRouterSetup: "Get free token from: https://openrouter.ai/keys",
      };
    }
  } catch (error) {
    return {
      connected: false,
      error: error.message,
      note: "Please check your API configuration in config.env",
    };
  }
}

module.exports = {
  generateEmbedding,
  summarizeText,
  cosineSimilarity,
  combineFileDataForSearch,
  checkHFConnection,
};
