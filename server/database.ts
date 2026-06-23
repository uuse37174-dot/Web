import fs from "fs";
import path from "path";

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
  concurrencyLimit: number;
  politeModeDelayMin: number;
  politeModeDelayMax: number;
  maxPagesPerSite: number;
  enableGeminiSummarization: boolean;
  enablePlaywrightMock: boolean;
}

const DB_FILE = path.join(process.cwd(), "data", "searchscrape_db.json");

function ensureDbDirectory() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  serpApiKey: "",
  concurrencyLimit: 8,
  politeModeDelayMin: 1,
  politeModeDelayMax: 3,
  maxPagesPerSite: 2,
  enableGeminiSummarization: true,
  enablePlaywrightMock: false,
};

export class SearchScrapeDb {
  private static loadRaw(): { jobs: ScrapeJob[]; settings: AppSettings } {
    ensureDbDirectory();
    if (!fs.existsSync(DB_FILE)) {
      const initial = { jobs: [], settings: DEFAULT_SETTINGS };
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    try {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      const parsed = JSON.parse(raw);
      return {
        jobs: parsed.jobs || [],
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      };
    } catch (e) {
      console.error("Database reading error, resetting database", e);
      return { jobs: [], settings: DEFAULT_SETTINGS };
    }
  }

  private static saveRaw(data: { jobs: ScrapeJob[]; settings: AppSettings }) {
    ensureDbDirectory();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  }

  public static getJobs(): ScrapeJob[] {
    return this.loadRaw().jobs;
  }

  public static getJob(id: string): ScrapeJob | null {
    const jobs = this.getJobs();
    return jobs.find((j) => j.id === id) || null;
  }

  public static createJob(keyword: string, totalWebsites: number): ScrapeJob {
    const data = this.loadRaw();
    const newJob: ScrapeJob = {
      id: "job_" + Date.now(),
      keyword,
      status: "pending",
      totalWebsitesRequested: totalWebsites,
      websitesFound: 0,
      websitesScraped: 0,
      websitesFailed: 0,
      createdAt: new Date().toISOString(),
      results: [],
    };
    data.jobs.unshift(newJob);
    // Keep maximum of 50 jobs in history to prevent storage bloating
    if (data.jobs.length > 50) {
      data.jobs = data.jobs.slice(0, 50);
    }
    this.saveRaw(data);
    return newJob;
  }

  public static updateJob(id: string, updates: Partial<Omit<ScrapeJob, "id" | "results">>): ScrapeJob | null {
    const data = this.loadRaw();
    const jobIndex = data.jobs.findIndex((j) => j.id === id);
    if (jobIndex === -1) return null;

    data.jobs[jobIndex] = {
      ...data.jobs[jobIndex],
      ...updates,
    };
    this.saveRaw(data);
    return data.jobs[jobIndex];
  }

  public static updateJobResults(id: string, results: WebpageResult[]): ScrapeJob | null {
    const data = this.loadRaw();
    const jobIndex = data.jobs.findIndex((j) => j.id === id);
    if (jobIndex === -1) return null;

    data.jobs[jobIndex].results = results;
    
    // Recalculate summary counters
    const successCount = results.filter((r) => r.status === "success").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    data.jobs[jobIndex].websitesFound = results.length;
    data.jobs[jobIndex].websitesScraped = successCount;
    data.jobs[jobIndex].websitesFailed = failedCount;

    this.saveRaw(data);
    return data.jobs[jobIndex];
  }

  public static deleteJob(id: string): boolean {
    const data = this.loadRaw();
    const initialLength = data.jobs.length;
    data.jobs = data.jobs.filter((j) => j.id !== id);
    this.saveRaw(data);
    return data.jobs.length < initialLength;
  }

  public static getSettings(): AppSettings {
    return this.loadRaw().settings;
  }

  public static updateSettings(settings: Partial<AppSettings>): AppSettings {
    const data = this.loadRaw();
    data.settings = {
      ...data.settings,
      ...settings,
    };
    this.saveRaw(data);
    return data.settings;
  }
}
