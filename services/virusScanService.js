const NodeClam = require("clamscan");

let clamInstancePromise = null;

const defaultHost = process.env.CLAMAV_HOST || "127.0.0.1";
const defaultPort = Number(process.env.CLAMAV_PORT || 3310);
const scanTimeout = Number(process.env.CLAMAV_TIMEOUT_MS || 60000);
let isDisabled = process.env.AV_SCAN_DISABLED === "true";

async function getClamInstance() {
  // Allow disabling from env (useful for local/dev or if ClamAV not installed)
  if (isDisabled) {
    return null;
  }

  if (!clamInstancePromise) {
    clamInstancePromise = (async () => {
      try {
        const nc = await new NodeClam().init({
          clamdscan: {
            host: defaultHost,
            port: defaultPort,
            timeout: scanTimeout,
          },
          clamscan: {
            path: process.env.CLAMSCAN_PATH,
          },
          remove_infected: false,
          debug_mode: false,
          scan_log: null,
          preference: "clamdscan",
        });

        console.log(
          `[AV] ClamAV initialized (host=${defaultHost}, port=${defaultPort})`
        );
        return nc;
      } catch (err) {
        // إذا فشل الاتصال بـ ClamAV، لا نطيّح السيرفر، فقط نعطّل الفحص
        console.error(
          "[AV] Failed to initialize ClamAV. Virus scanning will be skipped.",
          err.message
        );
        isDisabled = true;
        return null;
      }
    })();
  }

  return clamInstancePromise;
}

/**
 * Scan a single file for viruses.
 * Throws if ClamAV is unreachable unless AV_SCAN_DISABLED=true is set.
 */
async function scanFileForViruses(filePath) {
  try {
    const clam = await getClamInstance();

    // إذا التعطيل مفعّل أو ClamAV غير متوفر → نتخطى الفحص بدون كسر الرفع
    if (!clam) {
      return { isInfected: false, viruses: [], skipped: true };
    }

    const { isInfected, viruses } = await clam.scanFile(filePath);
    return { isInfected, viruses: viruses || [], skipped: false };
  } catch (err) {
    console.error(
      `[AV] Error while scanning file "${filePath}". Upload will continue without blocking.`,
      err.message
    );
    // لا نمنع الرفع إذا في مشكلة بمحرّك الفحص نفسه
    return {
      isInfected: false,
      viruses: [],
      skipped: true,
      error: err.message,
    };
  }
}

module.exports = {
  scanFileForViruses,
};
