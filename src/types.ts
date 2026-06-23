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
