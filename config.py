import os

# Application Settings
APP_NAME = "SearchScrape"
APP_VERSION = "2.6.0"
DB_FILE = "searchscrape.db"

# Visual Theme Hex Codes
COLOR_BACKGROUND = "#0F1117"
COLOR_CARD = "#1A1F2E"
COLOR_ACCENT = "#39FF14"  # Bright Neon Lime Green
COLOR_ACCENT_HOVER = "#00FF9F"
COLOR_TEXT_PRIMARY = "#FFFFFF"
COLOR_TEXT_SECONDARY = "#A0A0A0"
COLOR_GLOW_LIGHT = "#00BFFF"

# Default Crawler Settings
DEFAULT_CONCURRENCY = 8
DEFAULT_POLITE_DELAY_MIN = 1.0
DEFAULT_POLITE_DELAY_MAX = 3.0
DEFAULT_ENABLE_SUMMARIES = True
MAX_THREAD_LIMIT = 30

# Web Request Configurations
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
]

DEFAULT_TIMEOUT = 15  # seconds
MAX_BODY_PAGES = 6000  # maximum raw chars to store

# Preset Keyword Collections for quick navigation
PRESET_TOPICS = [
    "best AI tools 2026",
    "electric vehicles infrastructure",
    "machine learning tutorials",
    "sustainable space tech",
    "fintech trends latin america",
    "clean vertical farming"
]
