// Serverless API Handlers for Web Discovery and Scraping
// This provides serverless handlers with an in-memory database store,
// ideal for hosting environments like Vercel Serverless Functions.

export interface WebpageResult {
  id: string;
  url: string;
  domain: string;
  title: string;
  description: string;
  summary: string;
  content: string;
  relevanceScore: number;
  status: "pending" | "scraping" | "success" | "failed";
  errorReason?: string;
  images: string[];
}

export interface ScrapeJob {
  id: string;
  keyword: string;
  status: "pending" | "discovering" | "scraping" | "completed" | "failed";
  totalWebsitesRequested: number;
  websitesFound: number;
  websitesScraped: number;
  websitesFailed: number;
  createdAt: string;
  results: WebpageResult[];
}

export interface AppSettings {
  serpApiKey: string;
  geminiApiKey?: string;
  concurrencyLimit: number;
  politeModeDelayMin: number;
  politeModeDelayMax: number;
  maxPagesPerSite: number;
  enableGeminiSummarization: boolean;
  enablePlaywrightMock: boolean;
}

// In-memory data store for serverless environments
let scrapeJobsStore: ScrapeJob[] = [];
let appSettingsStore: AppSettings = {
  serpApiKey: "",
  geminiApiKey: "",
  concurrencyLimit: 8,
  politeModeDelayMin: 1,
  politeModeDelayMax: 3,
  maxPagesPerSite: 2,
  enableGeminiSummarization: true,
  enablePlaywrightMock: false,
};

/**
 * GET Handler for fetching all scrape jobs
 */
export async function getScrapeJobs(): Promise<ScrapeJob[]> {
  return [...scrapeJobsStore];
}

/**
 * POST Handler for starting a new scraping job
 */
export async function createScrapeJob(keyword: string, totalWebsites: number): Promise<ScrapeJob> {
  const cleanKeyword = keyword.trim();
  const id = Math.random().toString(36).substring(2, 11);
  
  const newJob: ScrapeJob = {
    id,
    keyword: cleanKeyword,
    status: "discovering",
    totalWebsitesRequested: totalWebsites || 8,
    websitesFound: 0,
    websitesScraped: 0,
    websitesFailed: 0,
    createdAt: new Date().toISOString(),
    results: [],
  };

  scrapeJobsStore.unshift(newJob);
  return newJob;
}

/**
 * GET Handler for retrieving a single job detail
 */
export async function getScrapeJobById(id: string): Promise<ScrapeJob | null> {
  const job = scrapeJobsStore.find((j) => j.id === id);
  return job ? { ...job } : null;
}

/**
 * DELETE Handler for removing a scrape job from history
 */
export async function deleteScrapeJob(id: string): Promise<boolean> {
  const initialLength = scrapeJobsStore.length;
  scrapeJobsStore = scrapeJobsStore.filter((j) => j.id !== id);
  return scrapeJobsStore.length < initialLength;
}

/**
 * GET Handler for app settings configuration
 */
export async function getAppSettings(): Promise<AppSettings> {
  return { ...appSettingsStore };
}

/**
 * POST Handler for saving app settings configuration
 */
export async function updateAppSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  appSettingsStore = {
    ...appSettingsStore,
    ...settings,
  };
  return { ...appSettingsStore };
}
