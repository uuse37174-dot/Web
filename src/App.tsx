import React, { useState, useEffect, useRef } from "react";
import { 
  Globe, 
  Search, 
  Settings, 
  History, 
  Play, 
  Download, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ShieldAlert, 
  HelpCircle, 
  RefreshCw, 
  Layers, 
  ChevronRight, 
  Sliders, 
  Info, 
  FileText, 
  ArrowLeft,
  Trash2,
  ListFilter,
  Check,
  AlertTriangle,
  ExternalLink,
  BookOpen
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ScrapeJob, WebpageResult, AppSettings } from "./types";

// Keyword presets requested by the user
const PRESET_KEYWORDS = [
  "best AI tools 2026",
  "electric vehicles infrastructure",
  "machine learning tutorials",
  "sustainable space tech",
  "fintech trends latin america",
  "clean vertical farming"
];

export default function App() {
  // Application tabs / views
  const [activeTab, setActiveTab] = useState<"home" | "results" | "history" | "settings">("home");
  
  // Core Form State
  const [keyword, setKeyword] = useState("");
  const [websiteLimit, setWebsiteLimit] = useState(200);
  
  // Scraper Context
  const [activeJob, setActiveJob] = useState<ScrapeJob | null>(null);
  const [jobHistory, setJobHistory] = useState<Omit<ScrapeJob, "results">[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    serpApiKey: "",
    concurrencyLimit: 8,
    politeModeDelayMin: 1,
    politeModeDelayMax: 3,
    maxPagesPerSite: 2,
    enableGeminiSummarization: true,
    enablePlaywrightMock: false
  });

  // Settings UI and Detail views toggle
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<WebpageResult | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all");
  const [sortBy, setSortBy] = useState<"relevance" | "title" | "status">("relevance");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Progressive Web App (PWA) Install Triggers
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstallable, setIsAppInstallable] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(false);

  // Background polling state
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize
  useEffect(() => {
    fetchSettings();
    fetchHistory();

    // Listen to Chrome PWA installation prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsAppInstallable(true);
    };

    const handleAppInstalled = () => {
      console.log("[PWA] SearchScrape successfully installed!");
      setIsAppInstalled(true);
      setIsAppInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
      setIsAppInstalled(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function triggerAppInstallation() {
    if (!deferredPrompt) {
      alert("To install SearchScrape on your iOS or Safari device, tap the Share icon and click 'Add to Home Screen'.");
      return;
    }
    setIsAppInstallable(false);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Install status choice outcome: ${outcome}`);
    setDeferredPrompt(null);
  }

  // Poll active scraping job
  useEffect(() => {
    if (activeJob && (activeJob.status === "pending" || activeJob.status === "discovering" || activeJob.status === "scraping")) {
      // Start polling
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(() => {
          pollJobStatus(activeJob.id);
        }, 2000);
      }
    } else {
      // Stop polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [activeJob]);

  // Api interactions
  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }

  async function fetchHistory() {
    try {
      const res = await fetch("/api/scrapes");
      if (res.ok) {
        const data = await res.json();
        setJobHistory(data);
      }
    } catch (err) {
      console.error("Failed to load list history:", err);
    }
  }

  async function saveSettings(updated: AppSettings) {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        setSettings(updated);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  }

  async function pollJobStatus(jobId: string) {
    try {
      const res = await fetch(`/api/scrapes/${jobId}`);
      if (res.ok) {
        const data: ScrapeJob = await res.json();
        setActiveJob(data);
        if (data.status === "completed" || data.status === "failed") {
          // Job complete, refresh historical records lists
          fetchHistory();
        }
      }
    } catch (err) {
      console.error("Error polling job status:", err);
    }
  }

  async function handleStartScrape(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!keyword.trim()) return;

    try {
      // Switch view to let user watch the scrape
      setActiveTab("home");
      setSelectedResult(null);

      const res = await fetch("/api/scrapes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          totalWebsites: websiteLimit
        })
      });

      if (res.ok) {
        const startedJob = await res.json();
        setActiveJob(startedJob);
      } else {
        let errorMessage = "Unknown server response";
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errData = await res.json();
            errorMessage = errData.error || "Unknown server response";
          } else {
            const textResponse = await res.text();
            errorMessage = textResponse.slice(0, 200).trim() || `HTTP standard error ${res.status}`;
          }
        } catch (parseErr) {
          errorMessage = `HTTP error ${res.status}`;
        }
        alert(`Error initiating search scrape: ${errorMessage}`);
      }
    } catch (err: any) {
      console.error("Failed to initiate scraping job:", err);
      alert(`Failed to communicate with discovery server: ${err?.message || "Check network connection or server status"}`);
    }
  }

  async function handleLoadJobDetails(jobId: string) {
    try {
      const res = await fetch(`/api/scrapes/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveJob(data);
        setActiveTab("results");
        setSelectedResult(null);
      }
    } catch (err) {
      console.error("Error fetching historic job:", err);
    }
  }

  async function handleDeleteJob(jobId: string, e: React.MouseEvent) {
    e.stopPropagation(); // Avoid triggering details loading
    if (!confirm("Are you sure you want to delete this scrape project history?")) return;

    try {
      const res = await fetch(`/api/scrapes/${jobId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setJobHistory(prev => prev.filter(j => j.id !== jobId));
        if (activeJob?.id === jobId) {
          setActiveJob(null);
        }
      }
    } catch (err) {
      console.error("Error deleting job from backend storage:", err);
    }
  }

  // Client side exporter engines
  function handleExportJSON() {
    if (!activeJob) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeJob, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `searchscrape_${activeJob.keyword.replace(/\s+/g, "_")}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  function handleExportCSV() {
    if (!activeJob || !activeJob.results) return;
    const headers = ["ID", "URL", "Domain", "Title", "Relevance", "Status", "Summary", "Error Reason"];
    const rows = activeJob.results.map(r => [
      r.id, 
      r.url, 
      r.domain, 
      r.title ? r.title.replace(/"/g, '""') : "Untitled", 
      r.relevanceScore, 
      r.status, 
      r.summary ? r.summary.replace(/"/g, '""') : "", 
      r.errorReason ? r.errorReason.replace(/"/g, '""') : ""
    ]);
    const csvContent = [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `searchscrape_${activeJob.keyword.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  // Helpers for live progress metrics
  const getProgressPercentage = () => {
    if (!activeJob) return 0;
    if (activeJob.status === "completed") return 100;
    if (activeJob.status === "pending") return 5;
    if (activeJob.status === "discovering") return 20;
    
    // Scraping live progress
    if (activeJob.status === "scraping" && activeJob.websitesFound > 0) {
      const processedCount = activeJob.websitesScraped + activeJob.websitesFailed;
      const pct = 20 + Math.floor((processedCount / activeJob.websitesFound) * 80);
      return Math.min(100, pct);
    }
    return 10;
  };

  // Filter and Sort Web results for presentation
  const getFilteredResults = () => {
    if (!activeJob || !activeJob.results) return [];
    
    let items = [...activeJob.results];
    
    // 1. Text filter
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      items = items.filter(r => 
        r.title?.toLowerCase().includes(q) || 
        r.domain?.toLowerCase().includes(q) || 
        r.url?.toLowerCase().includes(q) || 
        r.summary?.toLowerCase().includes(q)
      );
    }

    // 2. Status filter
    if (statusFilter !== "all") {
      items = items.filter(r => r.status === statusFilter);
    }

    // 3. Sorting
    if (sortBy === "relevance") {
      items.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } else if (sortBy === "title") {
      items.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (sortBy === "status") {
      items.sort((a, b) => a.status.localeCompare(b.status));
    }

    return items;
  };

  // Dynamic success rates info
  const successCount = activeJob?.websitesScraped || 0;
  const failureCount = activeJob?.websitesFailed || 0;
  const processedCount = successCount + failureCount;
  const successRatio = processedCount > 0 ? Math.round((successCount / processedCount) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#0F1117] text-white selection:bg-[#39FF14] selection:text-black font-sans">
      
      {/* Dynamic Header */}
      <header className="sticky top-0 z-30 bg-[#0F1117]/90 backdrop-blur-md border-b border-[#1A1F2E] px-4 md:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-[#00FF9F] to-[#00BFFF] p-[2px] shadow-[0_0_15px_rgba(57,255,20,0.3)]">
            <div className="h-full w-full bg-[#0F1117] rounded-[6px] flex items-center justify-center">
              <Globe className="text-[#39FF14] h-5 w-5 animate-pulse" />
            </div>
          </div>
          <div>
            <h1 className="font-display font-bold text-lg md:text-xl tracking-tight bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent">
              SearchScrape
            </h1>
            <span className="text-[10px] font-mono text-[#00BFFF] tracking-wider block -mt-1 uppercase">v2.6 Enterprise</span>
          </div>
        </div>

        {/* Global Action items */}
        <div className="flex items-center space-x-1 md:space-x-4">
          <button 
            id="nav-home"
            onClick={() => setActiveTab("home")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "home" ? "bg-[#1A1F2E] text-[#39FF14] border border-[#39FF14]/30" : "text-gray-400 hover:text-white"
            }`}
          >
            Home / Build
          </button>
          
          <button 
            id="nav-results"
            onClick={() => {
              if (activeJob) setActiveTab("results");
              else alert("No active scraping project to view. Run a keyword scrape first!");
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "results" ? "bg-[#1A1F2E] text-[#39FF14] border border-[#39FF14]/30" : "text-gray-400 hover:text-white"
            } ${!activeJob ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Crawl Viewer
          </button>

          <button 
            id="nav-history"
            onClick={() => setActiveTab("history")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "history" ? "bg-[#1A1F2E] text-[#39FF14] border border-[#39FF14]/30" : "text-gray-400 hover:text-white"
            }`}
          >
            Projects
          </button>

          <button 
            id="nav-settings"
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 text-gray-400 hover:text-[#39FF14] rounded-lg hover:bg-[#1A1F2E] transition-all"
            title="Extraction Configurations"
          >
            <Settings className="h-4 w-4" />
          </button>

          {isAppInstallable && (
            <button
              id="pwa-install-btn"
              onClick={triggerAppInstallation}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#39FF14] text-[#0F1117] hover:bg-[#39FF14]/90 focus:outline-none transition-all shadow-[0_0_12px_rgba(57,255,20,0.4)] flex items-center space-x-1.5 md:ml-1 cursor-pointer"
              title="Add SearchScrape app to your device home screen"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Install App</span>
            </button>
          )}
        </div>
      </header>

      {/* Corporate Ethical & Legal Warning Banner */}
      <div className="bg-[#1A1F2E]/80 border-b border-[#1A1F2E] px-4 md:px-8 py-2.5 flex items-center justify-between text-xs text-gray-300">
        <div className="flex items-center space-x-2.5 max-w-4xl">
          <ShieldAlert className="text-[#39FF14] h-4 w-4 shrink-0" />
          <span>
            <strong className="text-white font-medium">Ethical Scraping Compliance:</strong> SearchScrape automatically checks 
            <span className="text-[#00BFFF] font-mono px-1">robots.txt</span> parameters and applies randomized rate delays to honor host bandwidth agreements. Build responsibly.
          </span>
        </div>
        <div className="hidden lg:flex items-center space-x-1.5 text-[11px] font-mono text-[#00FF9F]">
          <span className="h-2 w-2 rounded-full bg-[#00FF9F] animate-ping" />
          <span>POLITE ENGINE ONLINE</span>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* VIEW 1: HOME WORKSPACE */}
        {activeTab === "home" && (
          <div className="lg:col-span-3 space-y-6">
            
            {/* Main Action Card */}
            <div className="bg-[#1A1F2E] border border-[#2D3748] rounded-xl p-6 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#39FF14]/5 to-transparent rounded-full pointer-events-none" />
              
              <h2 className="font-display font-semibold text-xl md:text-2xl mb-2 flex items-center space-x-2">
                <span>Start Smart Discovery & Extraction</span>
              </h2>
              <p className="text-xs text-gray-400 mb-6">
                Discover up to 500 relevant domains parsed against custom templates, scraping fully qualified keywords, metadata, images, and summarized contents concurrently.
              </p>

              <form onSubmit={handleStartScrape} className="space-y-5">
                
                {/* Text input with search icons */}
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-2 font-mono uppercase tracking-wider">
                    Query Keyword or Specific Topic
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="e.g. machine learning tutorials for biology or circular economics..."
                      className="w-full bg-[#0F1117] border border-[#2D3748] focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] rounded-lg py-3 pl-11 pr-4 text-sm font-medium text-white placeholder-gray-500 outline-none transition-all"
                      required
                    />
                    <Search className="absolute left-4 top-3.5 h-4.5 w-4.5 text-gray-400" />
                  </div>
                </div>

                {/* Predefined helpers list */}
                <div>
                  <label className="block text-[11px] font-mono text-gray-400 mb-2 uppercase tracking-wider">
                    Quick Preset Badges
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_KEYWORDS.map((kw, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setKeyword(kw)}
                        className={`text-xs px-2.5 py-1.5 rounded-md border transition-all ${
                          keyword === kw 
                            ? "bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/40" 
                            : "bg-[#0F1117] text-gray-300 border-[#2D3748] hover:border-gray-500"
                        }`}
                      >
                        {kw}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Number of sites controls */}
                <div className="relative pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-mono text-gray-300 uppercase tracking-wider">
                      Website Extraction Budget
                    </label>
                    <span className="text-xs font-mono font-bold text-[#39FF14] bg-[#0F1117] px-2 py-0.5 border border-[#2D3748] rounded">
                      {websiteLimit} domains
                    </span>
                  </div>
                  
                  {/* Selectors rows */}
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {[50, 100, 200, 500].map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setWebsiteLimit(b)}
                        className={`text-xs font-medium py-2 rounded-md border transition-all ${
                          websiteLimit === b
                            ? "bg-[#1A1F2E] border-[#39FF14] text-[#39FF14]"
                            : "bg-[#0F1117] border-[#2D3748] text-gray-400 hover:text-white"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                    
                    {/* Manual input box */}
                    <input 
                      type="number"
                      min={10}
                      max={500}
                      value={websiteLimit}
                      onChange={(e) => setWebsiteLimit(parseInt(e.target.value) || 200)}
                      placeholder="custom"
                      className="bg-[#0F1117] border border-[#2D3748] text-white text-xs font-medium rounded-md text-center py-2 focus:ring-1 focus:ring-[#39FF14] outline-none"
                    />
                  </div>
                </div>

                {/* Big Green submission button */}
                <button
                  type="submit"
                  disabled={activeJob?.status === "pending" || activeJob?.status === "discovering" || activeJob?.status === "scraping"}
                  className={`w-full py-4.5 rounded-lg font-display font-semibold transition-all shadow-lg flex items-center justify-center space-x-2.5 cursor-pointer ${
                    activeJob?.status === "pending" || activeJob?.status === "discovering" || activeJob?.status === "scraping"
                      ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                      : "bg-[#39FF14] text-[#0F1117] hover:bg-[#00FF9F] hover:shadow-[0_0_25px_rgba(57,255,20,0.4)]"
                  }`}
                >
                  <Play className="h-5 w-5 fill-current" />
                  <span className="text-sm uppercase tracking-wider">Discover & Scrape All</span>
                </button>

              </form>
            </div>

            {/* Live Progress monitoring Panel */}
            {activeJob && (
              <div className="bg-[#1A1F2E] border border-[#2D3748] rounded-xl p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-[#2D3748] pb-4">
                  <div>
                    <h3 className="font-display font-semibold text-lg flex items-center space-x-2">
                      <span className="text-gray-400">Current Task:</span>
                      <span className="text-[#39FF14] font-medium font-mono text-base">"{activeJob.keyword}"</span>
                    </h3>
                    <div className="flex space-x-2.5 text-xs text-gray-400 items-center mt-1">
                      <span className="capitalize font-mono text-xs bg-[#0F1117] px-2.5 py-0.5 rounded border border-[#2D3748]">
                        Status: <span className="text-[#00BFFF]">{activeJob.status}</span>
                      </span>
                      <span>•</span>
                      <span>Initiated: {new Date(activeJob.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  {/* Complete status or spin */}
                  {activeJob.status === "completed" ? (
                    <span className="bg-emerald-500/10 text-[#00FF9F] border border-emerald-500/30 px-3 py-1 rounded text-xs font-mono font-medium flex items-center space-x-1.5">
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>COMPLETED</span>
                    </span>
                  ) : activeJob.status === "failed" ? (
                    <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-3 py-1 rounded text-xs font-mono font-medium flex items-center space-x-1.5">
                      <XCircle className="h-3.5 w-3.5" />
                      <span>FAILED</span>
                    </span>
                  ) : (
                    <div className="flex items-center space-x-2 text-xs font-mono text-gray-300">
                      <RefreshCw className="h-3.5 w-3.5 text-[#39FF14] animate-spin" />
                      <span className="animate-pulse">Active Crawler...</span>
                    </div>
                  )}
                </div>

                {/* Progress bar visual container */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-gray-400">
                    <span>Task Pipeline Progress</span>
                    <span className="text-[#39FF14] font-bold">{getProgressPercentage()}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-[#0F1117] rounded-full overflow-hidden border border-[#2D3748]">
                    <div 
                      className="h-full bg-gradient-to-r from-[#39FF14] to-[#00FF9F] rounded-full transition-all duration-500" 
                      style={{ width: `${getProgressPercentage()}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 text-right italic pt-1">
                    {activeJob.status === "discovering" && "Searching via fallbacks for high rank matching domains..."}
                    {activeJob.status === "scraping" && `Obeying robots.txt guidelines. Scraping ${activeJob.websitesScraped + activeJob.websitesFailed}/${activeJob.websitesFound} discovered candidates...`}
                    {activeJob.status === "completed" && `Successfully compiled lists! ${activeJob.websitesScraped} results generated.`}
                  </p>
                </div>

                {/* Statistics Cards Bento Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  <div className="bg-[#0F1117] border border-[#2D3748] rounded-lg p-3.5 text-center">
                    <span className="text-[10px] font-mono text-gray-400 block uppercase">Discovered Domains</span>
                    <span className="text-xl font-display font-semibold text-[#00BFFF]">{activeJob.websitesFound}</span>
                  </div>
                  <div className="bg-[#0F1117] border border-[#2D3748] rounded-lg p-3.5 text-center">
                    <span className="text-[10px] font-mono text-gray-400 block uppercase font-medium">Scraped Successful</span>
                    <span className="text-xl font-display font-semibold text-[#39FF14]">{activeJob.websitesScraped}</span>
                  </div>
                  <div className="bg-[#0F1117] border border-[#2D3748] rounded-lg p-3.5 text-center">
                    <span className="text-[10px] font-mono text-gray-400 block uppercase">Unreachable / Disallowed</span>
                    <span className="text-xl font-display font-semibold text-red-400">{activeJob.websitesFailed}</span>
                  </div>
                  <div className="bg-[#0F1117] border border-[#2D3748] rounded-lg p-3.5 text-center">
                    <span className="text-[10px] font-mono text-gray-400 block uppercase">Crawl Efficiency</span>
                    <span className="text-xl font-display font-semibold text-white">{successRatio}%</span>
                  </div>
                </div>

                {/* View results shortcut button */}
                {activeJob.status === "completed" && (
                  <button
                    onClick={() => setActiveTab("results")}
                    className="w-full py-2.5 bg-[#1A1F2E] border border-[#39FF14]/30 hover:border-[#39FF14] text-[#39FF14] text-xs font-semibold rounded-lg uppercase tracking-wider transition-all flex items-center justify-center space-x-2"
                  >
                    <span>Inspect Extracted Contents Table</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: CRAWL VIEWER RESULTS TABLE */}
        {activeTab === "results" && activeJob && (
          <div className="lg:col-span-3 space-y-6">
            
            {/* Results control panel header */}
            <div className="bg-[#1A1F2E] border border-[#2D3748] rounded-xl p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono text-[#39FF14] uppercase tracking-wide">Crawl Viewer</span>
                    <span className="text-gray-500">•</span>
                    <span className="text-xs text-gray-300 font-mono">Job ID: {activeJob.id}</span>
                  </div>
                  <h3 className="font-display font-semibold text-lg md:text-xl">
                    Topic Results for "{activeJob.keyword}"
                  </h3>
                </div>

                {/* Export button set */}
                <div className="flex space-x-2 scale-95 origin-right">
                  <button
                    onClick={handleExportJSON}
                    className="bg-[#0F1117] hover:bg-[#1A1F2E] border border-[#2D3748] hover:border-gray-500 text-white text-xs px-3.5 py-2.5 rounded-lg transition-all flex items-center space-x-2 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5 text-[#00BFFF]" />
                    <span>JSON</span>
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="bg-[#39FF14] hover:bg-[#00FF9F] text-[#0F1117] text-xs font-semibold px-3.5 py-2.5 rounded-lg shadow-sm transition-all flex items-center space-x-2 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5 font-bold" />
                    <span>CSV Spreadsheet</span>
                  </button>
                </div>
              </div>

              {/* Filtering, Search & Sorting Controls bar */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                <div className="relative md:col-span-2">
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="Filter domains, keywords, title or snippet text..."
                    className="w-full bg-[#0F1117] border border-[#2D3748] focus:border-[#39FF14] text-xs py-2.5 pl-9 pr-4 rounded-lg outline-none placeholder-gray-500 text-white"
                  />
                  <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-gray-500" />
                </div>

                {/* Status picker */}
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e: any) => setStatusFilter(e.target.value)}
                    className="w-full bg-[#0F1117] border border-[#2D3748] focus:border-[#39FF14] text-xs py-2.5 px-3 rounded-lg outline-none cursor-pointer"
                  >
                    <option value="all">Statuses: All Results</option>
                    <option value="success">Success only</option>
                    <option value="failed">Unreachable / Disallowed</option>
                  </select>
                </div>

                {/* Sort Order */}
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e: any) => setSortBy(e.target.value)}
                    className="w-full bg-[#0F1117] border border-[#2D3748] focus:border-[#39FF14] text-xs py-2.5 px-3 rounded-lg outline-none cursor-pointer"
                  >
                    <option value="relevance">Rank: Highest Density</option>
                    <option value="title">Sort Alphabetically</option>
                    <option value="status">Group by Crawler Status</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Scrape results table */}
            <div className="bg-[#1A1F2E] border border-[#2D3748] rounded-xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-left">
                  <thead>
                    <tr className="bg-[#0F1117] border-b border-[#2D3748] text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                      <th className="py-3.5 px-4 w-12 text-center">Score</th>
                      <th className="py-3.5 px-4 w-44">Domain</th>
                      <th className="py-3.5 px-4">HTML Meta Info Title</th>
                      <th className="py-3.5 px-4 w-32 text-center">Crawler Status</th>
                      <th className="py-3.5 px-4 w-28 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2D3748]/65 text-xs">
                    {getFilteredResults().length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-500 font-mono">
                          No matching records satisfy current queries. Try widening filters.
                        </td>
                      </tr>
                    ) : (
                      getFilteredResults().map((res) => (
                        <tr 
                          key={res.id} 
                          className="hover:bg-[#252C3E] transition-all cursor-pointer"
                          onClick={() => setSelectedResult(res)}
                        >
                          {/* Circle Badge Score */}
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-flex h-8 w-8 rounded-full items-center justify-center text-[10px] font-bold font-mono ${
                              res.relevanceScore >= 70 
                                ? "bg-[#39FF14]/10 text-[#39FF14]" 
                                : res.relevanceScore >= 40 
                                  ? "bg-[#00BFFF]/10 text-[#00BFFF]" 
                                  : "bg-gray-800 text-gray-500"
                            }`}>
                              {res.relevanceScore}%
                            </span>
                          </td>

                          {/* Domain */}
                          <td className="py-3.5 px-4 font-mono text-[11px] text-[#00FF9F] max-w-[170px] truncate">
                            {res.domain}
                          </td>

                          {/* Title + Snippet */}
                          <td className="py-3.5 px-4 max-w-sm">
                            <div className="text-white font-medium truncate mb-0.5">
                              {res.title || "Untitled Candidate Webpage"}
                            </div>
                            <div className="text-[10px] text-gray-400 line-clamp-1">
                              {res.summary || res.description || "No preview summary extracted. Obeying direct index criteria."}
                            </div>
                          </td>

                          {/* Success / Fail Badge */}
                          <td className="py-3.5 px-4 text-center">
                            {res.status === "success" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-[#00FF9F] border border-emerald-500/25">
                                success
                              </span>
                            ) : res.status === "failed" ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/10 text-red-400 border border-red-500/20" title={res.errorReason}>
                                blocked/fail
                              </span>
                            ) : res.status === "scraping" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-[#00BFFF] border border-blue-500/20 animate-pulse">
                                scraping
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-gray-800 text-gray-500">
                                pending
                              </span>
                            )}
                          </td>

                          {/* Button actions */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedResult(res);
                              }}
                              className="text-xs font-semibold text-[#39FF14] hover:text-white hover:underline uppercase tracking-wider"
                            >
                              Explore
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: PROJECTS PANEL HISTORY */}
        {activeTab === "history" && (
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-[#1A1F2E] border border-[#2D3748] rounded-xl p-5">
              <h3 className="font-display font-semibold text-lg md:text-xl">
                Historical Scrape Projects Index
              </h3>
              <p className="text-xs text-gray-400 pt-1">
                Load, review, or export previously accomplished scrapes stored on the internal platform database.
              </p>
            </div>

            {/* List historic items */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobHistory.length === 0 ? (
                <div className="col-span-2 text-center py-16 bg-[#1A1F2E] border border-[#2D3748] rounded-xl text-gray-400 font-mono text-sm">
                  No historical crawls recorded. Establish a scraper project to build index history.
                </div>
              ) : (
                jobHistory.map((j) => (
                  <div 
                    key={j.id}
                    onClick={() => handleLoadJobDetails(j.id)}
                    className={`bg-[#1A1F2E] hover:bg-[#252C3E] border rounded-xl p-5 cursor-pointer transition-all ${
                      activeJob?.id === j.id ? "border-[#39FF14] shadow-[0_0_15px_rgba(57,255,20,0.15)]" : "border-[#2D3748]"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-mono text-gray-400 block uppercase">Keyword Topic</span>
                        <h4 className="font-display font-semibold text-base text-[#39FF14] mb-2 leading-tight">
                          "{j.keyword}"
                        </h4>
                      </div>
                      
                      {/* Delete project button */}
                      <button
                        onClick={(e) => handleDeleteJob(j.id, e)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-[#0F1117] rounded-lg transition-all"
                        title="Delete project history"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-[#2D3748]/50 my-3 font-mono text-center">
                      <div className="bg-[#0F1117] py-1.5 rounded">
                        <span className="text-[9px] text-gray-400 block uppercase">Harvested</span>
                        <span className="text-xs font-bold text-[#00BFFF]">{j.websitesFound}</span>
                      </div>
                      <div className="bg-[#0F1117] py-1.5 rounded">
                        <span className="text-[9px] text-gray-400 block uppercase">Success</span>
                        <span className="text-xs font-bold text-[#39FF14]">{j.websitesScraped}</span>
                      </div>
                      <div className="bg-[#0F1117] py-1.5 rounded">
                        <span className="text-[9px] text-gray-400 block uppercase">Failed</span>
                        <span className="text-xs font-bold text-red-400">{j.websitesFailed}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono mt-2">
                      <span>{new Date(j.createdAt).toLocaleDateString()}</span>
                      <span className="flex items-center text-[#00FF9F]">
                        <span>Review Result</span>
                        <ChevronRight className="h-3 w-3 ml-0.5" />
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SIDE BAR LAYOUT FOR STATUS INFORMATION */}
        <div className="space-y-6">
          
          {/* Active Job summary mini panel */}
          {activeJob && (
            <div className="bg-[#1A1F2E] border border-dashed border-[#2D3748] rounded-xl p-5 space-y-4">
              <h4 className="font-display font-medium text-xs font-mono uppercase text-gray-300 tracking-wider flex items-center space-x-1.5">
                <Layers className="h-4 w-4 text-[#39FF14]" />
                <span>Harvest Summary</span>
              </h4>
              
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-[#2D3748]/40">
                  <span className="text-gray-400">Target Keyword:</span>
                  <span className="text-[#39FF14] font-medium font-mono">{activeJob.keyword}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#2D3748]/40">
                  <span className="text-gray-400">Total Found:</span>
                  <span className="font-mono">{activeJob.websitesFound}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#2D3748]/40">
                  <span className="text-gray-400">Successful:</span>
                  <span className="font-mono text-[#00FF9F] font-bold">{activeJob.websitesScraped}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-gray-400">Failed / Skips:</span>
                  <span className="font-mono text-red-400">{activeJob.websitesFailed}</span>
                </div>
              </div>

              {/* View detail button when compiling completed */}
              {activeJob.status === "completed" && activeTab !== "results" && (
                <button
                  onClick={() => setActiveTab("results")}
                  className="w-full py-2 bg-[#39FF14] hover:bg-[#00FF9F] text-[#0F1117] text-xs font-bold rounded-lg transition-all text-center block"
                >
                  LOAD EXPANDED REPORT
                </button>
              )}
            </div>
          )}

          {/* Quick instructions Panel: How SearchScrape executes */}
          <div className="bg-[#1A1F2E] border border-[#2D3748] rounded-xl p-5 space-y-4">
            <h4 className="font-display font-medium text-xs font-mono uppercase text-gray-300 tracking-wider flex items-center space-x-1.5 text-white">
              <BookOpen className="h-4 w-4 text-[#00BFFF]" />
              <span>How It Works</span>
            </h4>
            <ol className="text-xs text-gray-400 space-y-3 list-decimal list-inside pl-1">
              <li>
                <strong className="text-white font-medium">Domain Discovery:</strong> Generates smart variations of search queries and crawls DuckDuckGo fallback layers to map target sites.
              </li>
              <li>
                <strong className="text-white font-medium">Etiquette Checks:</strong> Resolves and checks targeted domains' <span className="font-mono text-[#00BFFF]">robots.txt</span> before initializing extraction.
              </li>
              <li>
                <strong className="text-white font-medium">Parallel Parsing:</strong> Harnesses Axios parallel pools matching requested concurrency sliders to extract headlines, paras, and image arrays.
              </li>
              <li>
                <strong className="text-white font-medium">NLP Insights:</strong> Feeds extracted body paragraphs back into Gemini API to build crisp, relevant summary paragraph briefs in real-time.
              </li>
            </ol>
          </div>

          {/* Progressive Web App Installer card */}
          <div className="bg-gradient-to-br from-[#1A1F2E] to-[#111520] border border-[#39FF14]/25 rounded-xl p-5 space-y-4 shadow-[0_0_15px_rgba(57,255,20,0.05)]">
            <h4 className="font-display font-medium text-xs font-mono uppercase text-[#39FF14] tracking-wider flex items-center space-x-1.5 font-bold">
              <Download className="h-4 w-4 text-[#39FF14]" />
              <span>Mobile & Desktop App</span>
            </h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              Access SearchScrape V2.6 Enterprise directly from your phone's home screen or desktop taskbar like a native app.
            </p>
            {isAppInstalled ? (
              <div className="bg-[#39FF14]/10 border border-[#39FF14]/30 rounded p-2.5 text-center text-xs text-[#39FF14] font-medium font-mono">
                ✓ SEARCHSCRAPE INSTALLED
              </div>
            ) : (
              <div className="space-y-2.5">
                <button
                  onClick={triggerAppInstallation}
                  className="w-full py-2.5 bg-[#39FF14] hover:bg-[#00FF9F] text-[#0F1117] text-xs font-bold rounded-lg transition-all text-center flex items-center justify-center space-x-1.5 focus:outline-none cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>INSTALL ON DEVICE</span>
                </button>
                <div className="text-[10px] text-gray-500 pt-0.5 leading-normal space-y-1">
                  <p><strong>Android / Chrome:</strong> Tap "INSTALL ON DEVICE" above or select "Add to home screen" in your browser menu.</p>
                  <p><strong>iOS / Safari:</strong> Tap share icon <span className="bg-[#0F1117]/60 px-1 py-0.2 rounded border border-gray-700">⎋</span> then select "Add to Home Screen".</p>
                </div>
              </div>
            )}
          </div>

          {/* Preset settings overview widget */}
          <div className="bg-[#1A1F2E] border border-[#2D3748] rounded-xl p-5 space-y-3.5">
            <h4 className="font-display font-medium text-xs font-mono uppercase text-gray-300 tracking-wider flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Sliders className="h-4 w-4 text-[#39FF14]" />
                <span>Worker Profile</span>
              </span>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="text-[10px] text-[#00BFFF] hover:underline"
              >
                EDIT
              </button>
            </h4>
            
            <div className="space-y-2 text-[11px] font-mono text-gray-400">
              <div className="flex justify-between">
                <span>Concurrency Pool:</span>
                <span className="text-[#39FF14] font-bold">{settings.concurrencyLimit} tasks</span>
              </div>
              <div className="flex justify-between">
                <span>Rate Limits Delay:</span>
                <span>{settings.politeModeDelayMin}-{settings.politeModeDelayMax}s</span>
              </div>
              <div className="flex justify-between">
                <span>Gemini Summaries:</span>
                <span className={settings.enableGeminiSummarization ? "text-[#00FF9F]" : "text-gray-500"}>
                  {settings.enableGeminiSummarization ? "ENABLED" : "OFF"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>SerpAPI Key:</span>
                <span>{settings.serpApiKey ? "CONFIGURED (SERP)" : "NONE (DDG)"}</span>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* POPUP OVERLAY 1: SETTINGS DRAWER PANEL */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1A1F2E] border border-[#2D3748] rounded-xl max-w-lg w-full overflow-hidden shadow-2xl"
            >
              <div className="bg-[#0F1117] border-b border-[#2D3748] p-5 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <Settings className="text-[#39FF14] h-5 w-5" />
                  <h3 className="font-display font-semibold text-base text-white">
                    Extraction settings profiles
                  </h3>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-gray-400 hover:text-white font-mono text-lg"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-5">
                
                {/* Connection to SERPAPI key (NOT Gemini) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-300">
                      SerpAPI Access Key (Optional)
                    </label>
                    <span className="text-[10px] font-mono text-[#00BFFF]">Google Search Provider</span>
                  </div>
                  <input 
                    type="password"
                    value={settings.serpApiKey}
                    onChange={(e) => setSettings({ ...settings, serpApiKey: e.target.value })}
                    placeholder="Enter SerpAPI secret, e.g. a6b4c3..."
                    className="w-full bg-[#0F1117] border border-[#2D3748] rounded px-3 py-2 text-xs focus:border-[#39FF14] outline-none text-white"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    If missing, SearchScrape falls back to polite organic HTML index scraping.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Concurrency pool size */}
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">
                      Pool Concurrency Max
                    </label>
                    <input 
                      type="number"
                      min={1}
                      max={30}
                      value={settings.concurrencyLimit}
                      onChange={(e) => setSettings({ ...settings, concurrencyLimit: Math.min(30, Math.max(1, parseInt(e.target.value) || 8)) })}
                      className="w-full bg-[#0F1117] border border-[#2D3748] rounded px-3 py-2 text-xs text-white"
                    />
                    <span className="text-[9px] text-gray-500">Threads operating simultaneously (max: 30)</span>
                  </div>

                  {/* Delay timers */}
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">
                      Polite delay limits (sec)
                    </label>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="number"
                        min={0}
                        max={10}
                        value={settings.politeModeDelayMin}
                        onChange={(e) => setSettings({ ...settings, politeModeDelayMin: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-[#0F1117] border border-[#2D3748] rounded text-center py-2 text-xs text-white"
                      />
                      <span className="text-gray-500">-</span>
                      <input 
                        type="number"
                        min={1}
                        max={15}
                        value={settings.politeModeDelayMax}
                        onChange={(e) => setSettings({ ...settings, politeModeDelayMax: parseFloat(e.target.value) || 3 })}
                        className="w-full bg-[#0F1117] border border-[#2D3748] rounded text-center py-2 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Summaries via Gemini toggles */}
                <div className="flex items-start space-x-3 pt-3 border-t border-[#2D3748]/55">
                  <input
                    type="checkbox"
                    id="gemini-toggle"
                    checked={settings.enableGeminiSummarization}
                    onChange={(e) => setSettings({ ...settings, enableGeminiSummarization: e.target.checked })}
                    className="mt-1 h-4 w-4 bg-[#0F1117] border-[#2D3748] accent-[#39FF14]"
                  />
                  <div>
                    <label htmlFor="gemini-toggle" className="text-xs font-medium text-gray-100 block cursor-pointer">
                      Enable Gemini AI-Powered Insights
                    </label>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Utilizes our integrated Gemini API model to formulate concise 100-word summaries in direct relation to your search topic. Highly recommended.
                    </p>
                  </div>
                </div>

                {/* Save button settings */}
                <div className="pt-4 border-t border-[#2D3748]/55 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setSettings({
                        serpApiKey: "",
                        concurrencyLimit: 8,
                        politeModeDelayMin: 1,
                        politeModeDelayMax: 3,
                        maxPagesPerSite: 2,
                        enableGeminiSummarization: true,
                        enablePlaywrightMock: false
                      });
                    }}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    Reset Defaults
                  </button>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setIsSettingsOpen(false)}
                      className="bg-transparent text-gray-400 px-4 py-2 rounded text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        saveSettings(settings);
                        setIsSettingsOpen(false);
                      }}
                      className="bg-[#39FF14] hover:bg-[#00FF9F] text-[#0F1117] font-semibold px-5 py-2 rounded text-xs shadow"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* POPUP OVERLAY 2: WEBPAGE DISCOVERY ELEMENT DETAIL OVERLAY */}
      <AnimatePresence>
        {selectedResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="bg-[#1A1F2E] border border-[#2D3748] rounded-xl max-w-3xl w-full h-[85vh] flex flex-col overflow-hidden shadow-2xl"
            >
              
              {/* Overlay header details */}
              <div className="bg-[#0F1117] border-b border-[#2D3748] p-5 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-3 truncate">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                    selectedResult.relevanceScore >= 70 ? "bg-[#39FF14]/15 text-[#39FF14]" : "bg-gray-800 text-gray-400"
                  }`}>
                    {selectedResult.relevanceScore}%
                  </div>
                  <div className="truncate">
                    <h3 className="font-display font-semibold text-white text-sm md:text-base leading-tight truncate">
                      {selectedResult.title || "Untitled crawled document"}
                    </h3>
                    <span className="text-[10px] font-mono text-[#00FF9F] block truncate mt-0.5">
                      {selectedResult.url}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="text-gray-400 hover:text-white font-mono text-lg shrink-0 ml-4"
                >
                  ✕
                </button>
              </div>

              {/* Crawl overlay body body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Diagnostics and crawler result alerts */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-[#0f1117] p-2.5 rounded-lg border border-[#2d3748]">
                    <span className="text-[10px] font-mono text-gray-500 block uppercase">Root Domain</span>
                    <span className="text-xs font-semibold text-[#00BFFF]">{selectedResult.domain}</span>
                  </div>
                  <div className="bg-[#0f1117] p-2.5 rounded-lg border border-[#2d3748]">
                    <span className="text-[10px] font-mono text-gray-500 block uppercase font-medium">Crawl Status</span>
                    <span className={`text-xs font-semibold capitalize ${
                      selectedResult.status === "success" ? "text-[#39FF14]" : "text-red-400"
                    }`}>
                      {selectedResult.status}
                    </span>
                  </div>
                  <div className="col-span-2 md:col-span-1 bg-[#0f1117] p-2.5 rounded-lg border border-[#2d3748] truncate">
                    <span className="text-[10px] font-mono text-gray-500 block uppercase">Matched Score Weight</span>
                    <span className="text-xs font-semibold text-white">{selectedResult.relevanceScore} / 100</span>
                  </div>
                </div>

                {/* Status Errors banner if failed */}
                {selectedResult.status === "failed" && (
                  <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-4 flex items-start space-x-3 text-xs text-red-300">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
                    <div>
                      <strong className="text-white block font-semibold">Crawl Operations Failed</strong>
                      <span className="block mt-0.5">{selectedResult.errorReason || "Unknown connection failure, timeout, or blocked access request."}</span>
                    </div>
                  </div>
                )}

                {/* Extracted Gemini NLP summaries */}
                {selectedResult.status === "success" && (
                  <div className="bg-[#00FF9F]/5 border border-[#39FF14]/30 rounded-xl p-5 space-y-2">
                    <h4 className="font-display font-semibold text-xs font-mono uppercase text-[#00FF9F] tracking-wider flex items-center space-x-1.5">
                      <FileText className="h-4 w-4" />
                      <span>Smart Page Summary (NLP contextual)</span>
                    </h4>
                    <p className="text-xs md:text-sm text-gray-200 leading-relaxed italic">
                      "{selectedResult.summary || "No contextual AI summaries extracted. Check details in page corpus parameters."}"
                    </p>
                  </div>
                )}

                {/* Excerpt image arrays if found on page */}
                {selectedResult.images && selectedResult.images.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="font-mono text-gray-400 text-[11px] uppercase tracking-wider">
                      Extracted Visual assets ({selectedResult.images.length} images mapped)
                    </h4>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {selectedResult.images.map((imgSrc, ipIdx) => (
                        <div key={ipIdx} className="h-20 w-32 border border-[#2D3748] bg-[#0F1117] rounded overflow-hidden shrink-0">
                          <img 
                            src={imgSrc} 
                            alt={`Scraped asset ${ipIdx}`} 
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              // Hide image if broken link
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scraped Page body paragraphs text */}
                {selectedResult.status === "success" && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-mono font-medium text-gray-300 uppercase tracking-widest">
                      Extracted Text Content Corpus
                    </h4>
                    <div className="bg-[#0F1117] border border-[#2D3748] rounded-xl p-5 max-h-72 overflow-y-auto text-xs text-gray-300 leading-relaxed font-mono whitespace-pre-wrap">
                      {selectedResult.content || "Empty content payload."}
                    </div>
                  </div>
                )}

              </div>

              {/* overlay footer buttons */}
              <div className="bg-[#0F1117] border-t border-[#2D3748] p-4 flex items-center justify-between shrink-0">
                <a
                  href={selectedResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#00BFFF] hover:underline flex items-center space-x-1 font-mono"
                >
                  <span>Launch original page</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>

                <button
                  onClick={() => setSelectedResult(null)}
                  className="bg-[#2D3748] hover:bg-gray-700 text-white text-xs font-semibold px-4 py-2 rounded-lg"
                >
                  Close Document Viewer
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Corporate Footnotes */}
      <footer className="bg-[#0F1117] border-t border-[#1A1F2E]/70 py-6 px-4 md:px-8 text-center text-xs text-gray-500 font-mono mt-auto shrink-0">
        <p>© 2026 SearchScrape Enterprise Inc. Released under AI Studio developer guidelines.</p>
        <p className="text-[10px] text-gray-600 mt-1">
          Harnessing Gemini API & custom polite pooling crawling threads. Run legally.
        </p>
      </footer>

    </div>
  );
}
