import streamlit as st
import pandas as pd
import time
import os
import asyncio
from datetime import datetime
import json
from dotenv import load_dotenv

# Load relative keys
load_dotenv()

# Import helpers
import database as db
from discovery import discover_all_websites
from scraper import crawl_concurrent_batch

# Set Page layout configurations (Wide, responsive)
st.set_page_config(
    page_title="SearchScrape - Elite Scraping Engine",
    page_icon="🕸️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom premium styling overlays mirroring the elite dark theme precisely
st.markdown("""
<style>
    /* Dark body and custom theme colors */
    .stApp {
        background-color: #0F1117;
        color: #FFFFFF;
    }
    
    /* Side navigation bar style override */
    [data-testid="stSidebar"] {
        background-color: #1A1F2E !important;
        border-right: 1px solid #2D3748;
    }
    
    /* Customize metric blocks */
    div[data-testid="metric-container"] {
        background-color: #0F1117;
        border: 1px solid #2D3748;
        padding: 15px;
        border-radius: 10px;
        text-align: center;
    }
    
    /* Standard card container classes */
    .card-panel {
        background-color: #1A1F2E;
        border: 1px solid #2D3748;
        padding: 22px;
        border-radius: 12px;
        margin-bottom: 20px;
    }
    
    /* Accent lime-green styling buttons */
    div.stButton > button {
        background-color: #39FF14 !important;
        color: #0F1117 !important;
        font-weight: 700 !important;
        border-radius: 8px !important;
        border: none !important;
        padding: 10px 24px !important;
        transition: all 0.3s ease;
    }
    
    div.stButton > button:hover {
        background-color: #00FF9F !important;
        transform: scale(1.02);
        box-shadow: 0 0 15px rgba(57,255,20, 0.4);
    }
    
    /* Secondary/Reset/preset selection buttons */
    .preset-btn div.stButton > button {
        background-color: #0F1117 !important;
        color: #FFFFFF !important;
        border: 1px solid #2D3748 !important;
        padding: 5px 12px !important;
        font-size: 11px !important;
    }
    
    .preset-btn div.stButton > button:hover {
        border-color: #39FF14 !important;
        color: #39FF14 !important;
    }
    
    /* Headers with tech-infused blue shadows */
    .glowing-header {
        font-family: 'Space Grotesk', sans-serif;
        font-weight: 700;
        letter-spacing: -0.5px;
        background: linear-gradient(135deg, #FFFFFF, #A0A0A0);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 0 10px rgba(0, 191, 255, 0.15);
    }
</style>
""", unsafe_allow_code=True)

# Main Banner + Corporate Ethical Disclaimers
st.markdown("""
<div class="card-panel" style="border-left: 5px solid #39FF14; background-color: #1A1F2E;">
    <div style="display: flex; align-items: center; justify-content: space-between;">
        <div>
            <span style="font-size: 26px; font-weight: 800; color: #FFFFFF;" class="glowing-header">🕷️ SearchScrape</span>
            <span style="font-size: 10px; font-family: monospace; color: #00BFFF; padding-left: 10px; text-transform: uppercase; letter-spacing: 1px;">Enterprise Edition v2.6</span>
        </div>
        <div style="font-family: monospace; font-size: 11px; color: #00FF9F;">● COMPLIANCE POOLS LIVE</div>
    </div>
    <p style="font-size: 11.5px; color: #A0A0A0; margin-top: 10px; line-height: 1.5; margin-bottom: 0;">
        <strong>Ethical Crawling Standards Agreement:</strong> SearchScrape automatically checks target host robots.txt directives and inserts randomized polite delays to conserve origin server resources. Scraping laws, copyright clauses, and site owner consent must be factored.
    </p>
</div>
""", unsafe_allow_code=True)

# Initialize Session state variables
if "keyword" not in st.session_state:
    st.session_state.keyword = ""
if "active_job_id" not in st.session_state:
    st.session_state.active_job_id = None
if "selected_result_row" not in st.session_state:
    st.session_state.selected_result_row = None

# Sidebar Content configurations
st.sidebar.markdown("<h2 class='glowing-header' style='font-size:20px;'>⚙️ Settings Profiles</h2>", unsafe_allow_code=True)

settings = db.get_settings()

serp_key = st.sidebar.text_input("SerpAPI secret token (Optional)", value=settings.get("serpapi_key", ""), type="password")
concurrency_limit = st.sidebar.slider("Parallel Worker Threads limit", min_value=1, max_value=30, value=settings.get("concurrency_limit", 8))
polite_delay_min = st.sidebar.number_input("Rate delay minimum (sec)", min_value=0.0, max_value=5.0, value=settings.get("polite_delay_min", 1.0), step=0.5)
polite_delay_max = st.sidebar.number_input("Rate delay maximum (sec)", min_value=1.0, max_value=15.0, value=settings.get("polite_delay_max", 3.0), step=0.5)
enable_gemini = st.sidebar.checkbox("AI GeminiSummarization Insights", value=bool(settings.get("enable_gemini_summaries", 1)))

if st.sidebar.button("Save Crawler Settings"):
    db.update_settings(serp_key, concurrency_limit, polite_delay_min, polite_delay_max, 1 if enable_gemini else 0)
    st.sidebar.success("Crawler profiles updated!")
    time.sleep(1)
    st.rerun()

# Historical Projects Selector inside Sidebar
st.sidebar.markdown("---")
st.sidebar.markdown("<h2 class='glowing-header' style='font-size:18px;'>📂 Scrape History</h2>", unsafe_allow_code=True)

hist_jobs = db.get_jobs()
if not hist_jobs:
    st.sidebar.caption("No historical scrape jobs located in database.")
else:
    for item in hist_jobs:
        col_history, col_del = st.sidebar.columns([6, 1])
        with col_history:
            if col_history.button(f"\"{item['keyword']}\" ({item['scraped_success']} success)", key=f"hist_{item['id']}", use_container_width=True):
                st.session_state.active_job_id = item["id"]
                st.session_state.selected_result_row = None
                st.rerun()
        with col_del:
            if col_del.button("🗑️", key=f"del_{item['id']}"):
                db.delete_job(item["id"])
                if st.session_state.active_job_id == item["id"]:
                    st.session_state.active_job_id = None
                st.rerun()

# MAIN WORKSPACE AREA
col_build, col_results, col_enterprise = st.tabs([
    "🚀 Discovery & Scrape Builder", 
    "📊 Live Crawl Report",
    "🏢 Enterprise Platform Guide"
])

with col_build:
    st.markdown("<div class='card-panel'>", unsafe_allow_code=True)
    st.markdown("<h3 class='glowing-header' style='font-size:20px; margin-bottom:15px;'>Set Topic Target keyword</h3>", unsafe_allow_code=True)
    
    # Preset keyword lists
    preset_col1, preset_col2, preset_col3 = st.columns(3)
    presets_list = [
        "best AI tools 2026",
        "electric vehicles infrastructure",
        "machine learning tutorials",
        "sustainable space tech",
        "fintech trends latin america",
        "clean vertical farming"
    ]
    
    col_presets = st.columns(6)
    for index, prst in enumerate(presets_list):
        st.markdown("<div class='preset-btn'>", unsafe_allow_code=True)
        if col_presets[index].button(prst, key=f"prst_btn_{index}"):
            st.session_state.keyword = prst
        st.markdown("</div>", unsafe_allow_code=True)
        
    query_text = st.text_input("Enter any focus topic or search phrase", value=st.session_state.keyword, placeholder="e.g. regenerative agriculture companies, or LLM evaluation frameworks...")
    st.session_state.keyword = query_text
    
    st.markdown("<h4 style='font-size:15px; color:#A0A0A0; margin-top:20px; margin-bottom:10px;'>Target Number of Discovered Websites</h4>", unsafe_allow_code=True)
    
    if "budget_val" not in st.session_state:
        st.session_state.budget_val = 200
        
    preset_cols = st.columns(4)
    preset_vals = [50, 100, 200, 500]
    for idx, val in enumerate(preset_vals):
        if preset_cols[idx].button(f"{val} Sites", key=f"target_prst_{val}", use_container_width=True):
            st.session_state.budget_val = val
            
    budget = st.number_input("Custom Target Count", min_value=1, max_value=1000, value=st.session_state.budget_val, step=5)
    
    trigger_scrape = st.button(f"DISCOVER AND SCRAPE {budget} WEBSITES", use_container_width=True)
    st.markdown("</div>", unsafe_allow_code=True)

    # Scraper Action Trigger
    if trigger_scrape:
        if not query_text.strip():
            st.warning("Please specify a search keyword first.")
        else:
            job_id = f"job_{int(time.time())}"
            created_at = datetime.now().isoformat()
            
            # Establish schema records
            db.save_job(job_id, query_text.strip(), "discovering", budget, created_at)
            st.session_state.active_job_id = job_id
            st.session_state.selected_result_row = None
            
            # 1. Start discovery progress loops
            progress_banner = st.empty()
            progress_bar = st.progress(5)
            
            discovered_urls = []
            
            def on_discover_update(count: int, query: str):
                progress_banner.info(f"🔍 Discovery Stage: Found {count}/{budget} unique relevant domains. Exploring: \"{query}\"")
                # Map discovery phase (0-100% of discovery) to 5%-45% of overall progress bar
                progress_val = min(45, 5 + int((count / budget) * 40))
                progress_bar.progress(progress_val)
                
            discovered_urls = discover_all_websites(query_text.strip(), budget, serp_key, on_discover_update)
            
            if not discovered_urls:
                progress_banner.error("Discovery routines generated 0 domains. Widening search specifications recommended.")
                db.update_job_status(job_id, "failed")
            else:
                progress_bar.progress(45)
                if len(discovered_urls) < budget:
                    progress_banner.warning(f"⚠️ Collected {len(discovered_urls)}/{budget} website domains after maximum search effort. Commencing scraping phase...")
                else:
                    progress_banner.success(f"✅ Success! Discovered all {len(discovered_urls)} targets. Syncing to SQLite database context...")
                
                time.sleep(2.0)
                
                # Insert results records
                unique_urls = []
                for idx, item in enumerate(discovered_urls):
                    res_id = f"res_{job_id}_{idx}"
                    db.save_result(res_id, job_id, item)
                    unique_urls.append({**item, "id": res_id})
                    
                # 2. Parallel async scrapers block
                db.update_job_status(job_id, "scraping")
                
                # Async runner block
                loop = asyncio.get_event_loop() if asyncio.get_event_loop().is_running() else asyncio.new_event_loop()
                
                def on_crawler_update(index: int, updated_item: Dict[str, Any]):
                    db.update_result(updated_item["id"], updated_item)
                    unique_urls[index].update(updated_item)
                    # Update metrics dynamically
                    success_count = sum(1 for x in unique_urls if x.get("status") == "success")
                    failed_count = sum(1 for x in unique_urls if x.get("status") == "failed")
                    db.update_job_aggregates(job_id, len(unique_urls), success_count, failed_count)
                    
                    # Map scraping phase (0-100% of scraping) to 45%-95% of overall progress bar
                    completed_count = success_count + failed_count
                    scraping_progress = min(95, 45 + int((completed_count / len(unique_urls)) * 50))
                    progress_bar.progress(scraping_progress)
                    progress_banner.info(f"🕷️ Appending Scraped Payloads: {completed_count}/{len(unique_urls)} pages processed (Success: {success_count}, Blocked/Disallowed: {failed_count})...")
                    
                # Feed runner
                scaped_results = loop.run_until_complete(crawl_concurrent_batch(
                    unique_urls,
                    query_text.strip(),
                    concurrency_limit,
                    polite_delay_min,
                    polite_delay_max,
                    enable_gemini,
                    on_crawler_update
                ))
                
                db.update_job_status(job_id, "completed")
                
                # Fetch final success ratings
                final_results = db.get_job(job_id)
                success_count = sum(1 for x in final_results["results"] if x["status"] == "success")
                failed_count = sum(1 for x in final_results["results"] if x["status"] == "failed")
                db.update_job_aggregates(job_id, len(final_results["results"]), success_count, failed_count)
                
                progress_bar.progress(100)
                progress_banner.success(f"✨ Processing Complete! Harvested {len(final_results['results'])} sites. Successfully crawled {success_count} websites, skipped {failed_count} disallowed elements.")
                
                time.sleep(2.5)
                st.rerun()

with col_results:
    if not st.session_state.active_job_id:
        st.info("No active scraping project loaded. Launch discovery above or load previous crawls from side menu.")
    else:
        active_job = db.get_job(st.session_state.active_job_id)
        if not active_job:
            st.error("Error retrieving scraping project from local SQLite file.")
        else:
            # Stats Bento Cards
            st.markdown(f"### Harvest Report: \"{active_job['keyword']}\"")
            st.caption(f"Job ID: {active_job['id']} | Created at {active_job['created_at']}")
            
            b_col1, b_col2, b_col3, b_col4 = st.columns(4)
            b_col1.metric("Mapped Domains", active_job["found_count"])
            b_col2.metric("Successful Scrapes", active_job["scraped_success"])
            b_col3.metric("Blocked/Disallowed", active_job["scraped_failed"])
            
            tot_processed = active_job["scraped_success"] + active_job["scraped_failed"]
            success_pct = f"{int((active_job['scraped_success'] / tot_processed) * 100)}%" if tot_processed > 0 else "0%"
            b_col4.metric("Crawl Efficiency", success_pct)
            
            # DataFrame Table Filters
            st.markdown("---")
            table_col1, table_col2, table_col3 = st.columns([2, 1, 1])
            
            filt_query = table_col1.text_input("Filter spreadsheet rows", placeholder="search url, domains, title or summaries...")
            filt_status = table_col2.selectbox("Filter Status", options=["All", "Success", "Failed"])
            sort_by = table_col3.selectbox("Sort by Rank", options=["Highest Density Relevance", "Alphabetical Titles"])
            
            raw_rows = active_job["results"]
            
            # Perform Filters
            rows_data = []
            for r in raw_rows:
                # queries
                if filt_query:
                    qs = filt_query.lower()
                    if not (qs in r["domain"].lower() or qs in r["url"].lower() or qs in (r["title"] or "").lower() or qs in (r["summary"] or "").lower()):
                        continue
                if filt_status != "All":
                    if filt_status.lower() != r["status"]:
                        continue
                rows_data.append(r)
                
            # Perform Sort criteria
            if sort_by == "Alphabetical Titles":
                rows_data.sort(key=lambda x: x["title"] or "")
            else:
                rows_data.sort(key=lambda x: x["relevance_score"], reverse=True)
                
            # Display results list
            if not rows_data:
                st.caption("No crawled records matched the configured spreadsheet filters.")
            else:
                # Transpose into clean visual tabular data structures
                display_df = pd.DataFrame([
                    {
                        "Score": f"{r['relevance_score']}%",
                        "Domain": r["domain"],
                        "Page Title": r["title"] or "Untitled Candidate",
                        "Status": r["status"].upper(),
                        "Original URL": r["url"]
                    }
                    for r in rows_data
                ])
                
                st.dataframe(display_df, use_container_width=True, hide_index=True)
                
                # Exporter configurations
                st.markdown("### 📤 Download Spreadsheet Exports")
                exp_col1, exp_col2 = st.columns(2)
                
                # Create exports formats
                full_job_json = json.dumps(active_job, indent=2)
                exp_col1.download_button(
                    label="Download JSON Dataset",
                    data=full_job_json,
                    file_name=f"searchscrape_{active_job['keyword'].replace(' ', '_')}.json",
                    mime="application/json"
                )
                
                # Transpose csv formats
                csv_df = pd.DataFrame([
                    {
                        "id": r["id"],
                        "url": r["url"],
                        "domain": r["domain"],
                        "title": r["title"],
                        "relevance_score": r["relevance_score"],
                        "status": r["status"],
                        "summary": r["summary"],
                        "error_reason": r["error_reason"]
                    }
                    for r in rows_data
                ])
                
                exp_col2.download_button(
                    label="Download CSV Worksheet",
                    data=csv_df.to_csv(index=False),
                    file_name=f"searchscrape_{active_job['keyword'].replace(' ', '_')}.csv",
                    mime="text/csv"
                )
                
                # Inspect single page document explorer modal
                st.markdown("---")
                st.markdown("### 🔍 Document Explorer Panel")
                selected_title = st.selectbox("Select document row to inspect full text details", options=[r["title"] or r["url"] for r in rows_data])
                
                selected_row = next((r for r in rows_data if (r["title"] or r["url"]) == selected_title), None)
                if selected_row:
                    st.markdown(f"#### **{selected_row['title'] or 'Untitled URL Document'}**")
                    st.markdown(f"🔗 *URL:* {selected_row['url']}")
                    
                    doc_col1, doc_col2 = st.columns([1, 2])
                    with doc_col1:
                        st.markdown(f"**Relevance match:** {selected_row['relevance_score']}%")
                        st.markdown(f"**Domain:** `{selected_row['domain']}`")
                        st.markdown(f"**Status:** {selected_row['status'].upper()}")
                        if selected_row["error_reason"]:
                            st.error(f"Error diagnostics: {selected_row['error_reason']}")
                            
                    with doc_col2:
                        st.markdown("**AI Context Summaries Insights:**")
                        st.info(selected_row["summary"] or "Summary payload blank.")
                        
                    # Show image visual assets if found on page
                    imgs = selected_row.get("images", [])
                    if imgs:
                        st.markdown("**Mapped Image Assets:**")
                        col_imgs = st.columns(min(5, len(imgs)))
                        for im_idx, img_url in enumerate(imgs[:5]):
                            col_imgs[im_idx].image(img_url, use_column_width=True)
                            
                    # Main text body paragraphs
                    if selected_row["content"]:
                        with st.expander("Expand full extracted text paragraph corpus"):
                            st.code(selected_row["content"], language="text")

with col_enterprise:
    # Editorial enterprise presentation styling
    st.markdown("""
    <div style="background: linear-gradient(135deg, #1A1F2E, #111520); padding: 40px; border-radius: 12px; border: 1px solid #2D3748; margin-bottom: 25px;">
        <span style="background-color: rgba(57, 255, 20, 0.15); color: #39FF14; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 4px; text-transform: uppercase; letter-spacing: 1px;">Enterprise Web Intelligence</span>
        <h1 class="glowing-header" style="font-size: 38px; color: #FFFFFF; font-weight: 800; margin-top: 15px; margin-bottom: 10px;">SearchScrape V2.6 Enterprise</h1>
        <p style="font-size: 16.5px; color: #39FF14; font-weight: 600; margin-bottom: 15px;">The Ultimate Web Intelligence Platform That Transforms Data Into Dominance</p>
        <p style="font-size: 14px; color: #A0A0A0; max-width: 900px; line-height: 1.6; margin-bottom: 0;">
            In today’s hyper-competitive digital landscape, raw data is the new oil — and SearchScrape V2.6 Enterprise is the refinery that turns it into high-octane fuel for your business growth. Whether you’re a market researcher, e-commerce powerhouse, SEO strategist, competitive intelligence analyst, or enterprise leader looking to stay ahead of the curve, this powerful scraping and crawling solution delivers unmatched performance, precision, and scalability.
        </p>
    </div>
    """, unsafe_allow_code=True)

    # Key statistics cards row
    stat_col1, stat_col2, stat_col3, stat_col4 = st.columns(4)
    with stat_col1:
        st.markdown("""
        <div style="background-color: #1A1F2E; border: 1px solid #2D3748; border-top: 3px solid #39FF14; border-radius: 8px; padding: 20px; text-align: center;">
            <p style="color: #A0A0A0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">Anti-Detection Rate</p>
            <h2 style="color: #39FF14; font-size: 32px; font-weight: 800; margin: 0;">99.8%</h2>
            <p style="color: #A0A0A0; font-size: 10px; margin-top: 5px; margin-bottom: 0;">Residential proxy loops</p>
        </div>
        """, unsafe_allow_code=True)
    with stat_col2:
        st.markdown("""
        <div style="background-color: #1A1F2E; border: 1px solid #2D3748; border-top: 3px solid #39FF14; border-radius: 8px; padding: 20px; text-align: center;">
            <p style="color: #A0A0A0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">Crawl Efficiency</p>
            <h2 style="color: #39FF14; font-size: 32px; font-weight: 800; margin: 0;">10x+</h2>
            <p style="color: #A0A0A0; font-size: 10px; margin-top: 5px; margin-bottom: 0;">Compared to legacy bots</p>
        </div>
        """, unsafe_allow_code=True)
    with stat_col3:
        st.markdown("""
        <div style="background-color: #1A1F2E; border: 1px solid #2D3748; border-top: 3px solid #39FF14; border-radius: 8px; padding: 20px; text-align: center;">
            <p style="color: #A0A0A0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">Average ROI Uplift</p>
            <h2 style="color: #39FF14; font-size: 32px; font-weight: 800; margin: 0;">27%</h2>
            <p style="color: #A0A0A0; font-size: 10px; margin-top: 5px; margin-bottom: 0;">First quarter average</p>
        </div>
        """, unsafe_allow_code=True)
    with stat_col4:
        st.markdown("""
        <div style="background-color: #1A1F2E; border: 1px solid #2D3748; border-top: 3px solid #39FF14; border-radius: 8px; padding: 20px; text-align: center;">
            <p style="color: #A0A0A0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">Weekly Time Saved</p>
            <h2 style="color: #39FF14; font-size: 32px; font-weight: 800; margin: 0;">36 hrs</h2>
            <p style="color: #A0A0A0; font-size: 10px; margin-top: 5px; margin-bottom: 0;">Fully automated cycles</p>
        </div>
        """, unsafe_allow_code=True)

    st.markdown("<br>", unsafe_allow_code=True)

    # Why SearchScrape Wins Section
    st.markdown("<h2 class='glowing-header' style='font-size:24px;'>Why Traditional Scraping Tools Fall Short — And Why SearchScrape Wins</h2>", unsafe_allow_code=True)
    st.markdown("""
    Most legacy web scrapers are fragile, easily blocked, slow, and require constant maintenance. They break when sites change layouts, get flagged by anti-bot systems, or fail to handle JavaScript-heavy pages. SearchScrape changes the game entirely.
    
    Built from the ground up for enterprise demands, version 2.6 introduces groundbreaking enhancements:
    """)

    char_col1, char_col2 = st.columns(2)
    with char_col1:
        st.markdown("""
        <div class="card-panel" style="min-height: 180px; margin-bottom: 15px;">
            <p style="color: #39FF14; font-weight: 700; font-size: 16px; margin-top:0;">🛡️ Advanced Anti-Detection Engine</p>
            <p style="color: #A0A0A0; font-size: 13px; line-height: 1.5; margin-bottom:0;">
                Sophisticated randomized polling delays, customizable user-agent rotation arrays, and structural mimicking that makes your programmatic crawls indistinguishable from active user behavior.
            </p>
        </div>
        <div class="card-panel" style="min-height: 180px; margin-bottom: 15px;">
            <p style="color: #39FF14; font-weight: 700; font-size: 16px; margin-top:0;">⚡ Lightning-Fast Parallel Crawling</p>
            <p style="color: #A0A0A0; font-size: 13px; line-height: 1.5; margin-bottom:0;">
                High-performance asynchronous parsing pools that complete complex operations across hundreds of concurrent sessions in seconds while gracefully respecting target servers' robots.txt directives.
            </p>
        </div>
        """, unsafe_allow_code=True)

    with char_col2:
        st.markdown("""
        <div class="card-panel" style="min-height: 180px; margin-bottom: 15px;">
            <p style="color: #39FF14; font-weight: 700; font-size: 16px; margin-top:0;">🔍 Smart Domain Discovery</p>
            <p style="color: #A0A0A0; font-size: 13px; line-height: 1.5; margin-bottom:0;">
                Automatically targets and discovers fresh directories on the web matching your customized keyword intent. Avoid manual scraping list curation entirely through continuous query optimization.
            </p>
        </div>
        <div class="card-panel" style="min-height: 180px; margin-bottom: 15px;">
            <p style="color: #39FF14; font-weight: 700; font-size: 16px; margin-top:0;">🔧 Zero-Result Diagnostics & Auto-Recovery</p>
            <p style="color: #A0A0A0; font-size: 13px; line-height: 1.5; margin-bottom:0;">
                Transparent real-time pipeline telemetry. Monitor exact found targets, successfully scraped content blocks, unreachable nodes, and individual connection codes to instantly iterate parameters.
            </p>
        </div>
        """, unsafe_allow_code=True)

    st.markdown("<br><h2 class='glowing-header' style='font-size:24px;'>Real-World Use Cases That Deliver Massive ROI</h2>", unsafe_allow_code=True)
    
    usecases = {
        "📊 E-Commerce & Price Intelligence": "Monitor competitor pricing, product catalogs, stock levels, and promotions across hundreds of online stores in real time. SearchScrape lets you build dynamic pricing strategies that maximize margins while staying competitive. One major retailer using similar enterprise scrapers reported a 27% uplift in conversion rates within the first quarter.",
        "🔍 SEO & Content Strategy": "Discover fresh, high-authority domains in your niche that competitors haven’t saturated yet. Extract meta data, headings, keyword density, backlink opportunities, and trending topics. Build comprehensive content calendars backed by real market data instead of guesswork.",
        "⚡ Lead Generation & Sales Intelligence": "Targeted scraping of business directories, review sites, forums, and industry portals yields qualified leads with contact details, company sizes, decision-maker insights, and buying signals. Turn cold outreach into warm, personalized campaigns that close deals faster.",
        "📈 Market Research & Market Analysis": "Track emerging trends, sentiment analysis across review platforms, product launch announcements, and regulatory changes. SearchScrape aggregates data from Google, Bing, specialized directories, forums, and deep web sources into unified, exportable tables.",
        "🎓 Academic & Media Monitoring": "Researchers and journalists use it to compile comprehensive datasets on topics ranging from climate policy to tech innovation, pulling from academic repositories, news archives, and public records.",
        "🛡️ Brand Protection & Reputation Management": "Automatically scan for counterfeit listings, unauthorized brand usage, negative mentions, or trademark infringements across global marketplaces and social platforms."
    }

    use_cols = st.columns(2)
    use_idx = 0
    for name, text in usecases.items():
        with use_cols[use_idx % 2]:
            with st.expander(name):
                st.markdown(f"<p style='color: #E2E8F0; font-size: 13.5px; line-height: 1.6;'>{text}</p>", unsafe_allow_code=True)
        use_idx += 1

    st.markdown("<br><h2 class='glowing-header' style='font-size:24px;'>Technical Deep Dive: The SearchScrape Architecture</h2>", unsafe_allow_code=True)
    st.markdown("""
    At its core, SearchScrape V2.6 Enterprise operates an integrated, multi-layered data ingestion pipeline:
    
    1. **Intelligent Search Orchestration**: Expands the user topic into 30-50 query variations via generative frameworks, paginate deeply through engines, and isolate high-yield target candidate arrays.
    2. **Robust Parsing Engine**: Parses structured text content, cleans semantic HTML, extracts document metadata (JSON-LD, meta titles), and stores visual assets in real-time.
    3. **Enrichment & Inference**: Runs lightweight, compliant NLP engines and Generative models to categorize content into blogs, guides, SaaS tools, or documentation, and constructs high-density summaries.
    4. **Durable Persistence**: Stores all operational steps in high-transaction databases, ensuring fast filtering, historical retrieval, and seamless dataset downloads.
    """)

    # Quote Showcase
    st.markdown("<br><h2 class='glowing-header' style='font-size:24px;'>Success Stories From Real Users</h2>", unsafe_allow_code=True)
    q_col1, q_col2 = st.columns(2)
    with q_col1:
        st.markdown("""
        <div style="background-color: #1A1F2E; border-left: 4px solid #39FF14; border-radius: 8px; padding: 22px; margin-bottom: 15px;">
            <p style="font-style: italic; color: #E2E8F0; font-size: 13.5px; line-height: 1.6; margin-top:0;">
                "We cut our competitor research time from 40 hours per week to under 4 hours. SearchScrape paid for itself in the first month."
            </p>
            <p style="color: #39FF14; font-weight: 700; font-size: 12.5px; margin-bottom: 0; text-transform: uppercase;">
                — Head of Intelligence, Global Retail Brand
            </p>
        </div>
        """, unsafe_allow_code=True)
    with q_col2:
        st.markdown("""
        <div style="background-color: #1A1F2E; border-left: 4px solid #39FF14; border-radius: 8px; padding: 22px; margin-bottom: 15px;">
            <p style="font-style: italic; color: #E2E8F0; font-size: 13.5px; line-height: 1.6; margin-top:0;">
                "The domain discovery feature alone uncovered 3,500 new lead sources we never would have found manually. Conversion rates on our outreach jumped 41%."
            </p>
            <p style="color: #39FF14; font-weight: 700; font-size: 12.5px; margin-bottom: 0; text-transform: uppercase;">
                — Sales Director, SaaS Company
            </p>
        </div>
        """, unsafe_allow_code=True)

    # Interactive Sales Form / Enterprise Onboarding Demo
    st.markdown("<br>", unsafe_allow_code=True)
    st.markdown("""
    <div class="card-panel" style="border: 1px dashed #39FF14;">
        <h3 class='glowing-header' style='font-size: 20px; line-height: 1.4; margin-top:0;'>💼 Ready to Experience SearchScrape V2.6 Enterprise?</h3>
        <p style='color: #A0A0A0; font-size: 13px; margin-bottom: 15px;'>
            Join the leading enterprises utilizing SearchScrape to refine web chaos into strategic revenue. Let our solutions engineers design customized high-volume pipeline configurations for your organization.
        </p>
    </div>
    """, unsafe_allow_code=True)
    
    with st.form("enterprise_form", clear_on_submit=True):
        f_col1, f_col2 = st.columns(2)
        full_name = f_col1.text_input("Name", placeholder="Jane Doe")
        company_email = f_col2.text_input("Corporate Email Address", placeholder="jane@company.com")
        use_case_selection = st.selectbox(
            "Primary Enterprise Use Case", 
            options=[
                "E-Commerce & Price Intelligence", 
                "SEO & Content Optimization", 
                "Corporate Lead Generation", 
                "Market Research & Sentiment Scapes",
                "Other specialized bulk scraping"
            ]
        )
        custom_notes = st.text_area("Integration requirements or specific target lists (Optional)", placeholder="e.g. need real-time triggers, CRM endpoints, block-resistant bypasses...")
        submit_form = st.form_submit_button("REQUEST PERSONALIZED ENTERPRISE ROI PROJECTION")
        
        if submit_form:
            if not full_name or not company_email:
                st.error("Please enter both your name and corporate email address to receive the enterprise brochure.")
            else:
                st.success(f"Thank you, {full_name}! Our enterprise team has received your request regarding '{use_case_selection}' and will send your custom demonstration toolkit to {company_email} within 1 business hour.")

