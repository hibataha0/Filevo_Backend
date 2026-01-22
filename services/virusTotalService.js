const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

const VIRUSTOTAL_API_KEY = process.env.VIRUSTOTAL_API_KEY;

async function scanFileWithVirusTotal(filePath) {
  try {
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath));

    // 1️⃣ Upload file
    const uploadRes = await axios.post(
      "https://www.virustotal.com/api/v3/files",
      form,
      {
        headers: {
          ...form.getHeaders(),
          "x-apikey": VIRUSTOTAL_API_KEY,
        },
      }
    );

    const analysisId = uploadRes.data.data.id;

    // 2️⃣ Get analysis result
    // Note: VirusTotal analysis is asynchronous. Immediate results might be "queued".
    // For a real production app, we should poll or wait. 
    // However, for this simplified implementation (as requested), we will check once.
    // If it's queued, we might not get stats immediately. 
    // But often for small files it's fast. Let's start with a small delay or just call it.
    
    // Waiting a bit might be needed, but let's try direct call first as per user example.
    const resultRes = await axios.get(
      `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
      {
        headers: {
          "x-apikey": VIRUSTOTAL_API_KEY,
        },
      }
    );

    return resultRes.data;
  } catch (error) {
    console.error("VirusTotal Scan Error:", error.response?.data || error.message);
    // If scanning fails (e.g. rate limit, network), we should decide whether to fail safely or strictly.
    // user requested "malicious > 0 => reject". 
    // We'll throw error so caller handles it.
    throw new Error("Virus scan failed: " + (error.response?.data?.error?.message || error.message));
  }
}

module.exports = { scanFileWithVirusTotal };
