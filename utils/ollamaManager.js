const { spawn, exec } = require("child_process");
const axios = require("axios");
const util = require("util");
const execPromise = util.promisify(exec);

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";

let ollamaProcess = null;

/**
 * التحقق من أن Ollama مثبت
 */
async function isOllamaInstalled() {
  try {
    await execPromise("ollama --version");
    return true;
  } catch (error) {
    return false;
  }
}

// تم إلغاء التثبيت التلقائي - المستخدم يجب أن يثبت Ollama يدوياً

/**
 * التحقق من أن Ollama يعمل
 */
async function isOllamaRunning() {
  try {
    const response = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, {
      timeout: 2000,
    });
    return { running: true, models: response.data?.models || [] };
  } catch (error) {
    return { running: false, error: error.message };
  }
}

/**
 * تشغيل Ollama
 */
function startOllama() {
  return new Promise((resolve, reject) => {
    // التحقق من أن Ollama غير مشغل بالفعل
    isOllamaRunning()
      .then((status) => {
        if (status.running) {
          console.log("✅ Ollama is already running");
          resolve(status);
          return;
        }

        console.log("🔄 Starting Ollama server...");

        // تشغيل Ollama
        ollamaProcess = spawn("ollama", ["serve"], {
          detached: false,
          stdio: "pipe",
        });

        ollamaProcess.stdout.on("data", (data) => {
          const output = data.toString();
          if (output.includes("Starting server")) {
            console.log("✅ Ollama server started");
          }
        });

        ollamaProcess.stderr.on("data", (data) => {
          console.error(`Ollama stderr: ${data}`);
        });

        ollamaProcess.on("error", (error) => {
          console.error(`❌ Failed to start Ollama: ${error.message}`);
          reject(error);
        });

        // انتظار حتى يبدأ Ollama
        setTimeout(async () => {
          const status = await isOllamaRunning();
          if (status.running) {
            resolve(status);
          } else {
            reject(new Error("Ollama failed to start"));
          }
        }, 3000);
      })
      .catch(reject);
  });
}

/**
 * تحميل النموذج إذا لم يكن موجوداً
 */
async function ensureModelInstalled() {
  try {
    const status = await isOllamaRunning();

    if (!status.running) {
      throw new Error("Ollama is not running");
    }

    const hasModel = status.models.some((m) => m.name === OLLAMA_MODEL);

    if (hasModel) {
      console.log(`✅ Model ${OLLAMA_MODEL} is already installed`);
      return true;
    }

    console.log(`📥 Installing model ${OLLAMA_MODEL}...`);
    console.log("⏳ This may take a few minutes...");

    const pullProcess = spawn("ollama", ["pull", OLLAMA_MODEL], {
      stdio: "inherit",
    });

    return new Promise((resolve, reject) => {
      pullProcess.on("close", (code) => {
        if (code === 0) {
          console.log(`✅ Model ${OLLAMA_MODEL} installed successfully`);
          resolve(true);
        } else {
          reject(new Error(`Failed to install model: exit code ${code}`));
        }
      });

      pullProcess.on("error", (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error(`❌ Error ensuring model installation: ${error.message}`);
    throw error;
  }
}

/**
 * تهيئة Ollama تلقائياً
 */
async function initializeOllama() {
  try {
    console.log("🚀 Initializing Ollama...");

    // 1. التحقق من التثبيت
    const installed = await isOllamaInstalled();

    if (!installed) {
      console.warn("⚠️ Ollama is not installed. Please install it manually:");
      console.warn("   Windows: winget install Ollama.Ollama");
      console.warn("   Or download from: https://ollama.com/download");
      console.warn("   After installation, restart the server.");
      return { success: false, error: "Ollama not installed" };
    }

    // 2. تشغيل Ollama
    await startOllama();

    // 3. تحميل النموذج
    await ensureModelInstalled();

    // 4. التحقق النهائي
    const finalStatus = await isOllamaRunning();
    if (finalStatus.running) {
      console.log("✅ Ollama is ready!");
      console.log(
        `   Models available: ${finalStatus.models.map((m) => m.name).join(", ")}`
      );
      return { success: true, models: finalStatus.models };
    }

    return { success: false, error: "Failed to verify Ollama" };
  } catch (error) {
    console.error(`❌ Failed to initialize Ollama: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * إيقاف Ollama
 */
function stopOllama() {
  if (ollamaProcess) {
    console.log("🛑 Stopping Ollama...");
    ollamaProcess.kill();
    ollamaProcess = null;
  }
}

// إيقاف Ollama عند إغلاق السيرفر
process.on("SIGTERM", stopOllama);
process.on("SIGINT", stopOllama);

module.exports = {
  initializeOllama,
  isOllamaRunning,
  isOllamaInstalled,
  startOllama,
  ensureModelInstalled,
  stopOllama,
};
