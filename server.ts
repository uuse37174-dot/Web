import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { SearchScrapeDb, AppSettings } from "./server/database";
import { discoverWebsites } from "./server/discovery";
import { scrapeBatch } from "./server/scraper";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "20mb" }));

// 1. Get previous job history
app.get("/api/scrapes", (req, res) => {
  try {
    const jobs = SearchScrapeDb.getJobs();
    // Strip heavy full-text content in listing to make the response extremely fast
    const lightJobs = jobs.map((job) => ({
      id: job.id,
      keyword: job.keyword,
      status: job.status,
      totalWebsitesRequested: job.totalWebsitesRequested,
      websitesFound: job.websitesFound,
      websitesScraped: job.websitesScraped,
      websitesFailed: job.websitesFailed,
      createdAt: job.createdAt,
    }));
    res.json(lightJobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load jobs list" });
  }
});

// 2. Get specific job details with full webpage crawl results
app.get("/api/scrapes/:id", (req, res) => {
  try {
    const id = req.params.id;
    const job = SearchScrapeDb.getJob(id);
    if (!job) {
      return res.status(404).json({ error: "Scraping project not found" });
    }
    res.json(job);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load job details" });
  }
});

// 3. Initiate new background scrape job
app.post("/api/scrapes", async (req, res) => {
  try {
    const { keyword, totalWebsites } = req.body;
    if (!keyword || typeof keyword !== "string" || keyword.trim() === "") {
      return res.status(400).json({ error: "A valid keyword or target topic is required" });
    }
    const limit = parseInt(totalWebsites) || 200;

    // Create record
    const settings = SearchScrapeDb.getSettings();

    // On Vercel, run synchronously within the HTTP request lifecycle and cap the limit for rapid, non-blocking return
    if (process.env.VERCEL) {
      const vercelLimit = Math.min(limit, 8); // Max 8 sites for instant results
      const job = SearchScrapeDb.createJob(keyword.trim(), vercelLimit);
      
      const fastSettings = {
        ...settings,
        concurrencyLimit: Math.max(settings.concurrencyLimit, 8),
        politeModeDelayMin: 0,
        politeModeDelayMax: 0
      };

      console.log(`[PWA/Vercel Sync] Starting fast sync crawl of ${vercelLimit} sites for: ${keyword}`);
      await runBackgroundScraping(job.id, keyword.trim(), vercelLimit, fastSettings);

      const completedJob = SearchScrapeDb.getJob(job.id) || job;
      return res.json(completedJob);
    }

    // Default: local/persistent multi-threaded background process
    const job = SearchScrapeDb.createJob(keyword.trim(), limit);
    runBackgroundScraping(job.id, keyword.trim(), limit, settings).catch((err) => {
      console.error(`Background job failure for ${job.id}:`, err);
      SearchScrapeDb.updateJob(job.id, { status: "failed" });
    });

    res.json(job);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create scraping job" });
  }
});

// 4. Delete scrape job from history
app.delete("/api/scrapes/:id", (req, res) => {
  try {
    const success = SearchScrapeDb.deleteJob(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Scraping project not found" });
    }
    res.json({ success: true, message: "Scrape history deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Error deleting scrape" });
  }
});

// 5. Get current crawler settings
app.get("/api/settings", (req, res) => {
  try {
    const settings = SearchScrapeDb.getSettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch settings" });
  }
});

// 6. Update user configuration setting options
app.post("/api/settings", (req, res) => {
  try {
    const updated = SearchScrapeDb.updateSettings(req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save settings options" });
  }
});

/**
 * Background async runner orchestrating Discovery + Scraping
 */
async function runBackgroundScraping(jobId: string, keyword: string, totalWebsites: number, settings: AppSettings) {
  try {
    // Stage 1: Website Discovery
    SearchScrapeDb.updateJob(jobId, { status: "discovering" });
    
    const webpageResults = await discoverWebsites({
      keyword,
      totalRequested: totalWebsites,
      settings,
      onProgress: (foundCount) => {
        // Increment discovery updates
        SearchScrapeDb.updateJob(jobId, { websitesFound: foundCount });
      }
    });

    if (webpageResults.length === 0) {
      SearchScrapeDb.updateJob(jobId, { status: "completed", websitesFound: 0 });
      return;
    }

    // Initialize with found list in pending state
    SearchScrapeDb.updateJobResults(jobId, webpageResults);
    SearchScrapeDb.updateJob(jobId, { status: "scraping" });

    // Stage 2: Pooled Async crawling
    const currentResults = [...webpageResults];
    await scrapeBatch(currentResults, keyword, settings, (index, updatedItem) => {
      currentResults[index] = updatedItem;
      // Persist partial state update to supporting real-time frontends polling
      SearchScrapeDb.updateJobResults(jobId, currentResults);
    });

    // Finalize Complete status
    SearchScrapeDb.updateJob(jobId, { status: "completed" });
    console.log(`Job ${jobId} finished successfully!`);
  } catch (err) {
    console.error(`Scraping workflow worker thread error:`, err);
    SearchScrapeDb.updateJob(jobId, { status: "failed" });
  }
}

// Export the Express app instance for serverless setups (like Vercel API routes)
export { app };
export default app;

// Start full-stack web serving only when not running in a serverless environment (Vercel)
if (!process.env.VERCEL) {
  async function bootstrap() {
    // Vite integration
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`SearchScrape Server actively listening at http://localhost:${PORT}`);
    });
  }

  bootstrap().catch((err) => {
    console.error("Critical server startup failure:", err);
  });
}
