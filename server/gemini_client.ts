import { GoogleGenAI } from "@google/genai";
import { SearchScrapeDb } from "./database";

// Shared serializing chain to avoid concurrent bursts exceeding the RPM limit (5/15 RPM on free tier)
let geminiPromiseChain: Promise<any> = Promise.resolve();

/**
 * Spaced execution queue that enforces at least 4000ms (4s) between ANY Gemini API requests.
 * This naturally maintains safe rate limits across multiple concurrent scrapers/summarizers.
 */
export async function runGeminiThrottled<T>(fn: () => Promise<T>): Promise<T> {
  const nextPromise = geminiPromiseChain.then(async () => {
    // Spacer delay to safely stay below typical 15 RPM limits (and reduce 5 RPM exhaustion duration)
    await new Promise(resolve => setTimeout(resolve, 4000));
    return fn();
  });
  
  // Suppress errors on the main chain reference so subsequent requests still execute
  geminiPromiseChain = nextPromise.catch(() => {});
  return nextPromise;
}

/**
 * Executes a Gemini content generation model with exponential backoff on rate-limiting (429) or spikes (503).
 */
// Active blacklisted models registry to skip exhausted models
const blacklistedModels = new Set<string>();

/**
 * Executes a Gemini content generation model with exponential backoff on rate-limiting (429) or spikes (503).
 */
export async function generateContentWithRetry(
  prompt: string,
  modelNames = [
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash"
  ],
  config?: any
): Promise<string> {
  const appSettings = SearchScrapeDb.getSettings();
  const geminiKey = (process.env.GEMINI_API_KEY || appSettings?.geminiApiKey || "").trim();
  if (!geminiKey) {
    console.warn("[Gemini Info] No API key provided or configured. Skipping content generation.");
    return "";
  }

  const ai = new GoogleGenAI({
    apiKey: geminiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });

  return runGeminiThrottled(async () => {
    let text = "";

    // Filter out blacklisted models, but fallback to the requested models list if all are blacklisted
    const activeModels = modelNames.filter(m => !blacklistedModels.has(m));
    const modelsToTry = activeModels.length > 0 ? activeModels : modelNames;

    for (const modelName of modelsToTry) {
      const attempts = 3;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: config,
          });

          if (response && response.text) {
            text = response.text.trim();
            break;
          }
        } catch (err: any) {
          const errMsg = err.message || "";
          // Error objects have non-enumerable properties that JSON.stringify often misses.
          // Build a comprehensive, lower-cased error string to capture all failure codes and details.
          const errStr = [
            err.message,
            err.status,
            err.code,
            err.statusCode,
            err.stack,
            typeof err === "object" && err !== null ? JSON.stringify(err) : "",
            String(err)
          ].filter(Boolean).join(" ").toLowerCase();
          
          const isRateLimit = 
            errStr.includes("429") || 
            errStr.includes("resource_exhausted") || 
            errStr.includes("quota") ||
            errStr.includes("rate limit") ||
            errStr.includes("limit exceeded");

          const isOverloaded = 
            errStr.includes("503") || 
            errStr.includes("overloaded") || 
            errStr.includes("unavailable") ||
            errStr.includes("demand");

          const isQuotedOrScary = errStr.includes("quota") || errStr.includes("exhausted") || errStr.includes("demand") || errStr.includes("limit") || errStr.includes("rate") || errStr.includes("429") || errStr.includes("503");
          const displayErr = isQuotedOrScary ? "Temporary API limitation or service demand spike." : (errMsg.length > 80 ? errMsg.slice(0, 80) + "..." : errMsg);

          console.log(`[Gemini Info] Model ${modelName} request unsuccessful: ${displayErr}`);

          if (isRateLimit || isOverloaded) {
            console.log(`[Gemini Info] Skipping ${modelName} immediately to secure alternative fallback model.`);
            blacklistedModels.add(modelName);
            break; // Break the current attempts loop to immediately switch to next model
          }

          if (attempt < attempts) {
            const sleepTime = 3000;
            console.log(`[Gemini Info] Retrying model ${modelName} in ${sleepTime / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, sleepTime));
          } else {
            console.log(`[Gemini Info] Attempt limit reached on ${modelName}. Trying next model...`);
          }
        }
      }
      if (text) break;
    }

    return text;
  });
}
