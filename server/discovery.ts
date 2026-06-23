import axios from "axios";
import * as cheerio from "cheerio";
import { generateContentWithRetry } from "./gemini_client";
import { AppSettings, WebpageResult } from "./database";

// Modern User-Agents for clean search requests
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Generate smart query variations. Focuses on producing diverse search modifiers
 * based on the user's original keyword.
 */
export async function generateQueryVariations(keyword: string, limit: number = 15): Promise<string[]> {
  const localFallbacks = [
    keyword,
    `best ${keyword} 2026`,
    `${keyword} official site`,
    `${keyword} review opinions`,
    `${keyword} tutorial guide`,
    `${keyword} directory list`,
    `${keyword} news articles`,
    `${keyword} blog posts`,
    `top ${keyword} tools`,
    `how to use ${keyword}`,
    `${keyword} documentation resources`,
    `${keyword} forums discussion`,
    `latest ${keyword} trends`,
    `${keyword} platform alternatives`,
    `innovative ${keyword} companies`
  ];

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.log("No Gemini API key found, using local query variation templates");
    return localFallbacks.slice(0, limit);
  }

  try {
    const prompt = `You are a search query optimizer. The user wants to discover websites related to: "${keyword}".
Generate exactly ${limit} unique, highly effective, smart search query modifications/expressions to run in Google/DuckDuckGo to uncover diverse, high-quality, relevant source material (e.g., blogs, tutorials, tools, directories, official docs, reviews, industry reports).
Return them as a simple JSON array of strings: ["query 1", "query 2", ...]. Ensure no numbers, notes, or extra tags in output. Return ONLY the strict JSON array format.`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini query generation timeout")), 3500)
    );

    const fetchPromise = generateContentWithRetry(prompt, undefined, {
      responseMimeType: "application/json"
    });

    const text = await Promise.race([fetchPromise, timeoutPromise]);

    if (text) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, limit);
      }
    }
  } catch (e: any) {
    console.error("All fallback attempts to generate query variations with Gemini failed, using defaults:", e.message || e);
  }

  return localFallbacks.slice(0, limit);
}

/**
 * Basic categorization rules based on URL strings, title, and snippets
 */
function classifyUrl(url: string, title: string, snippet: string): { category: string; weight: number } {
  const fullText = (url + " " + title + " " + snippet).toLowerCase();
  
  if (fullText.includes("blog") || fullText.includes("/p/") || fullText.includes("/post/")) {
    return { category: "Blog / Opinion", weight: 1.0 };
  }
  if (fullText.includes("news") || fullText.includes("daily") || fullText.includes("today") || fullText.includes("times") || fullText.includes("news/")) {
    return { category: "News / Article", weight: 1.1 };
  }
  if (fullText.includes("guide") || fullText.includes("tutorial") || fullText.includes("learn") || fullText.includes("how-to") || fullText.includes("docs")) {
    return { category: "Tutorial / Guide", weight: 1.2 };
  }
  if (fullText.includes("tool") || fullText.includes("software") || fullText.includes("app") || fullText.includes("github") || fullText.includes("pricing")) {
    return { category: "SaaS / Tool", weight: 1.3 };
  }
  if (fullText.includes("forum") || fullText.includes("reddit") || fullText.includes("community") || fullText.includes("thread")) {
    return { category: "Forum / Community", weight: 0.9 };
  }
  
  return { category: "General Website", weight: 1.0 };
}

/**
 * Relevance scoring based on keyword frequency and domain authority heuristics
 */
function scoreRelevance(keyword: string, title: string, snippet: string, url: string, categoryWeight: number): number {
  const textToScan = (title + " " + snippet).toLowerCase();
  const words = keyword.toLowerCase().split(/\s+/);
  
  let matchCount = 0;
  for (const word of words) {
    if (word.length < 3) continue;
    const regex = new RegExp(word, "g");
    const count = (textToScan.match(regex) || []).length;
    matchCount += count;
  }
  
  // Base Score
  let score = 30 + matchCount * 12 * categoryWeight;

  // Domain filters (boosting standard directories, reducing questionable domains)
  const domain = new URL(url).hostname;
  if (domain.endsWith(".org") || domain.endsWith(".edu") || domain.endsWith(".gov")) {
    score += 15; // academic boost
  }
  if (url.includes("reddit.com") || url.includes("wikipedia.org") || url.includes("medium.com")) {
    score += 10; // trusted content aggregates
  }
  if (domain.includes("spam") || url.includes("ads") || domain.includes("park")) {
    score -= 40; // warning flag
  }

  // Cap density scores to logical maximums
  return Math.max(1, Math.min(100, Math.round(score)));
}

/**
 * Filter out clear platform spam and parked domains
 */
function isSpamDomain(hostname: string): boolean {
  const blacklist = [
    "doubleclick.net", "adsystem", "googleads", "analytics", "tracking", "facebook.com/tr",
    "parked-domain", "buy-domain", "exactseek", "gobuck", "example.com"
  ];
  return blacklist.some(term => hostname.toLowerCase().includes(term));
}

/**
 * Execute SerAPI Search
 */
async function searchViaSerpApi(query: string, apiKey: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        q: query,
        api_key: apiKey,
        engine: "google",
        num: 30
      },
      timeout: 10000
    });
    
    const results = response.data.organic_results || [];
    return results.map((r: any) => ({
      title: r.title || "Untitled Result",
      url: r.link,
      snippet: r.snippet || ""
    })).filter((r: any) => r.url);
  } catch (e: any) {
    console.error(`SerpAPI error for query "${query}":`, e.message);
    return [];
  }
}

/**
 * Live Scraping fallback via DuckDuckGo HTML Interface
 */
async function searchViaDuckDuckGo(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      },
      timeout: 12000
    });

    const $ = cheerio.load(response.data);
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    $(".result").each((_, element) => {
      const titleNode = $(element).find("a.result__url");
      const title = titleNode.text().trim();
      let rawUrl = titleNode.attr("href") || "";
      const snippet = $(element).find(".result__snippet").text().trim();

      // DuckDuckGo redirects inside html links sometimes, parse out the real URL
      if (rawUrl.startsWith("//duckduckgo.com/y.js?")) {
        // e.g. //duckduckgo.com/y.js?uddg=https%3A%2F%2Fexample.com
        const uddgParam = new URL("https:" + rawUrl).searchParams.get("uddg");
        if (uddgParam) {
          rawUrl = decodeURIComponent(uddgParam);
        }
      } else if (rawUrl.startsWith("/l/?kh=-1&uddg=")) {
        const uddgParam = new URL("https://html.duckduckgo.com" + rawUrl).searchParams.get("uddg");
        if (uddgParam) {
          rawUrl = decodeURIComponent(uddgParam);
        }
      }

      if (rawUrl && title && !rawUrl.includes("duckduckgo.com")) {
        results.push({
          title,
          url: rawUrl,
          snippet
        });
      }
    });

    return results;
  } catch (e: any) {
    console.error(`DuckDuckGo scraping error for query "${query}":`, e.message);
    return [];
  }
}

interface DiscoverConfig {
  keyword: string;
  totalRequested: number;
  settings: AppSettings;
  onProgress: (foundCount: number, currentQuery: string) => void;
}

/**
 * Core website discovery workflow
 */
export async function discoverWebsites(config: DiscoverConfig): Promise<WebpageResult[]> {
  const { keyword, totalRequested, settings, onProgress } = config;
  
  // 1. Generate smart search expressions
  const queryLimit = process.env.VERCEL ? 2 : 20;
  const queries = await generateQueryVariations(keyword, queryLimit);
  console.log(`Generated ${queries.length} query variations for: "${keyword}"`);
  
  const uniqueUrls = new Set<string>();
  const discoveredResults: WebpageResult[] = [];

  // 2. Iterate queries matching user request and aggregate results
  // For safety and politeness, limit to processing up to 10 queries, yielding a large amount of sites
  const maxQueriesToProcess = process.env.VERCEL ? 2 : Math.min(queries.length, 12);
  
  for (let i = 0; i < maxQueriesToProcess; i++) {
    const query = queries[i];
    onProgress(discoveredResults.length, query);

    let items: Array<{ title: string; url: string; snippet: string }> = [];
    
    if (settings.serpApiKey) {
      items = await searchViaSerpApi(query, settings.serpApiKey);
    } 
    
    // Fallback if SerpAPI yielded nothing or wasn't provided
    if (items.length === 0) {
      items = await searchViaDuckDuckGo(query);
      // Small polite delay between HTML search fallback crawls
      const delayTime = process.env.VERCEL ? 50 : 1500;
      await new Promise(resolve => setTimeout(resolve, delayTime));
    }

    for (const item of items) {
      try {
        const urlObj = new URL(item.url);
        const domain = urlObj.hostname;
        const normalizedUrl = urlObj.origin + urlObj.pathname;

        if (uniqueUrls.has(normalizedUrl) || uniqueUrls.has(item.url)) {
          continue; // Duplicate
        }

        if (isSpamDomain(domain)) {
          continue; // Spam
        }

        uniqueUrls.add(normalizedUrl);

        // Score domain
        const classification = classifyUrl(item.url, item.title, item.snippet);
        const score = scoreRelevance(keyword, item.title, item.snippet, item.url, classification.weight);

        discoveredResults.push({
          id: "res_" + Math.random().toString(36).slice(2, 11),
          url: item.url,
          domain: domain,
          title: item.title,
          description: item.snippet || classification.category + " resource for " + keyword,
          summary: "", // Will be filled by scraper
          content: "", // Will be filled by scraper
          relevanceScore: score,
          status: "pending",
          images: []
        });

        // Break early if we gathered more than safe boundaries of active search result buffers
        if (discoveredResults.length >= totalRequested * 1.5) {
          break;
        }
      } catch (err) {
        // Skip invalid URLs
      }
    }

    // Check if we have ample websites to start scraping
    if (discoveredResults.length >= totalRequested * 1.2) {
      break;
    }
  }

  // Rank results on relevance score descending
  discoveredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Return exactly the top request budget of results
  return discoveredResults.slice(0, totalRequested);
}
