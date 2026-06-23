import axios from "axios";
import * as cheerio from "cheerio";
import { generateContentWithRetry } from "./gemini_client";
import { AppSettings, WebpageResult } from "./database";

// Modern User-Agents for request spoofing
const AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/605.1.15"
];

function getRandomAgent(): string {
  return AGENTS[Math.floor(Math.random() * AGENTS.length)];
}

/**
 * Parses a simple robots.txt of a domain to enforce ethical scraping
 */
export async function isAllowedByRobotsTxt(url: string, userAgent = "SearchScrapeBot"): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.origin}/robots.txt`;
    
    const response = await axios.get(robotsUrl, {
      headers: { "User-Agent": getRandomAgent() },
      timeout: process.env.VERCEL ? 1500 : 5000,
      validateStatus: (stat) => stat === 200
    });

    const lines = response.data.split(/\r?\n/);
    let appliesToUs = false;
    const disallows: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || trimmed === "") continue;

      const partSplit = trimmed.split(":");
      if (partSplit.length < 2) continue;

      const directive = partSplit[0].toLowerCase().trim();
      const value = partSplit.slice(1).join(":").trim();

      if (directive === "user-agent") {
        const ua = value.toLowerCase();
        if (ua === "*" || ua.includes(userAgent.toLowerCase())) {
          appliesToUs = true;
        } else {
          appliesToUs = false;
        }
      }

      if (appliesToUs && directive === "disallow") {
        if (value) {
          disallows.push(value);
        }
      }
    }

    // Check if path is matched in disallows
    const currentPath = parsedUrl.pathname + parsedUrl.search;
    for (const pattern of disallows) {
      // Escape special regex chars except *
      const regexStr = "^" + pattern
        .replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
        .replace(/\\\*/g, ".*");
      const regex = new RegExp(regexStr);
      if (regex.test(currentPath) || (pattern === "/" && currentPath === "/")) {
        return { allowed: false, reason: `Blocked by domain's robots.txt rule: 'Disallow: ${pattern}'` };
      }
    }

    return { allowed: true };
  } catch (err: any) {
    // If robots.txt doesn't exist or times out, we assume standard accessibility (liberal fallback)
    return { allowed: true };
  }
}

/**
 * Creates summaries utilizing Gemini server-side SDK with throttling and retries
 */
async function generateAiSummary(rawContent: string, keyword: string): Promise<string> {
  const truncated = rawContent.slice(0, 3000); // Feed a reasonable chunk
  const prompt = `Analyze this scraped text content from a web page and summarize it in relation to the query keyword: "${keyword}".
Focus on what the site offers, its perspective, and key information concerning the keyword. Keep the summary under 120 words.
Make it professional, objective, and dense with details.
Scraped web page text:
${truncated}`;

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini summary generation timeout")), 3000)
    );

    const fetchPromise = generateContentWithRetry(prompt);
    const text = await Promise.race([fetchPromise, timeoutPromise]);
    return text || "";
  } catch (e: any) {
    console.warn("All AI summarization attempts failed, falling back to local extractor:", e.message || e);
    return "";
  }
}

/**
 * Main webpage scraper routine
 */
export async function scrapePage(
  result: WebpageResult, 
  keyword: string, 
  settings: AppSettings
): Promise<Partial<WebpageResult>> {
  try {
    // 1. Robots.txt ethical boundary checking
    const robotStatus = await isAllowedByRobotsTxt(result.url);
    if (!robotStatus.allowed) {
      return {
        status: "failed",
        errorReason: robotStatus.reason || "Disallowed by robots.txt directory permissions"
      };
    }

    // 2. Polite Delay implementation (to prevent overloading targets)
    if (settings.politeModeDelayMin > 0) {
      const waitSec = settings.politeModeDelayMin + Math.random() * (settings.politeModeDelayMax - settings.politeModeDelayMin);
      await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
    }

    // 3. Page fetch
    const response = await axios.get(result.url, {
      headers: {
        "User-Agent": getRandomAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webkit,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.google.com/"
      },
      timeout: process.env.VERCEL ? 3500 : 15000, // 15s absolute timeout
      maxRedirects: 3
    });

    const html = response.data;
    if (typeof html !== "string") {
      throw new Error("Returned invalid content-type, expected HTML document text");
    }

    const $ = cheerio.load(html);

    // Clean page: strip headers, side nav boilerplates, styles, and scripts
    $("script, style, noscript, iframe, svg, nav, footer, header, #header, #footer, .sidebar, .nav, .menu, ad, advertisement").remove();

    // Grab headers to update page text title
    let pageTitle = $("title").text().trim();
    if (!pageTitle) {
      pageTitle = $("h1").first().text().trim() || result.title || "Untitled Document";
    }

    const metaDescription = $('meta[name="description"]').attr("content")?.trim() || result.description;

    // Collect images
    const images: string[] = [];
    $("img").each((_, img) => {
      const src = $(img).attr("src");
      if (src && !src.startsWith("data:") && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/"))) {
        try {
          const absoluteUrl = src.startsWith("/") ? new URL(src, result.url).href : src;
          if (images.length < 5) {
            images.push(absoluteUrl);
          }
        } catch (_) {}
      }
    });

    // Reconstruct structural main body text
    const paragraphs: string[] = [];
    $("h1, h2, h3, p").each((_, elem) => {
      const txt = $(elem).text().trim();
      // Only keep readable sentences
      if (txt.length > 25 && !txt.includes("{") && !txt.includes("}")) {
        paragraphs.push(txt);
      }
    });

    const fullContent = paragraphs.join("\n\n");
    if (fullContent.length < 100) {
      throw new Error("Page contains insufficient readable content or represents a boilerplate redirection layer");
    }

    // Create summary
    let summaryText = "";
    if (settings.enableGeminiSummarization) {
      summaryText = await generateAiSummary(fullContent, keyword);
    }

    // Default structural fallback summary if Gemini wasn't used or failed
    if (!summaryText) {
      summaryText = paragraphs.slice(0, 3).join(" ") || fullContent.slice(0, 300);
      if (summaryText.length > 400) {
        summaryText = summaryText.slice(0, 397) + "...";
      }
    }

    return {
      title: pageTitle,
      description: metaDescription,
      summary: summaryText,
      content: fullContent.slice(0, 8000), // Cap database storage size safely
      images: images,
      status: "success"
    };

  } catch (err: any) {
    let reason = err.message || "Unknown retrieval error";
    if (err.response) {
      reason = `HTTP Error Code: ${err.response.status} (${err.response.statusText || "unauthorized"})`;
    } else if (err.code === "ECONNABORTED") {
      reason = "Scraping timed out after 15 seconds";
    }
    return {
      status: "failed",
      errorReason: reason
    };
  }
}

/**
 * Runs a concurrent batch of page scrapes with pool restriction
 */
export async function scrapeBatch(
  results: WebpageResult[], 
  keyword: string, 
  settings: AppSettings,
  onItemCompleted: (index: number, updatedItem: WebpageResult) => void
): Promise<WebpageResult[]> {
  const activeLimit = Math.max(1, Math.min(30, settings.concurrencyLimit));
  const workList = [...results];
  const finishedList: WebpageResult[] = [];
  
  // Custom pooled concurrency resolver
  const poolLauncher = async () => {
    while (workList.length > 0) {
      const idx = results.length - workList.length;
      const item = workList.shift();
      if (!item) break;

      // Update status to scraping
      const scrapingItem = { ...item, status: "scraping" as const };
      onItemCompleted(idx, scrapingItem);

      // Fetch
      const updates = await scrapePage(scrapingItem, keyword, settings);
      const finalized = { ...scrapingItem, ...updates };
      
      finishedList.push(finalized);
      onItemCompleted(idx, finalized);
    }
  };

  const poolThreads = Array(activeLimit).fill(null).map(() => poolLauncher());
  await Promise.all(poolThreads);

  return results.map(orig => finishedList.find(f => f.url === orig.url) || { ...orig, status: "failed" as const, errorReason: "Queue cancelled" });
}
