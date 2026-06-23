import asyncio
import aiohttp
import random
import urllib.parse
from bs4 import BeautifulSoup
import os
from typing import List, Dict, Any, Callable

try:
    import google.generativeai as genai
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
]

async def check_robots_txt(url: str, user_agent: str = "SearchScrapeBot") -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(robots_url, headers={"User-Agent": random.choice(USER_AGENTS)}, timeout=5) as res:
                if res.status != 200:
                    return True # Default allowed if missing or auth error
                    
                text = await res.text()
                lines = text.split("\n")
                
                applies_to_us = False
                disallowed_paths = []
                
                for line in lines:
                    line = line.strip()
                    if line.startswith("#") or not line:
                        continue
                    if ":" not in line:
                        continue
                    
                    directive, val = line.split(":", 1)
                    directive = directive.strip().lower()
                    val = val.strip()
                    
                    if directive == "user-agent":
                        ua = val.lower()
                        if ua == "*" or user_agent.lower() in ua:
                            applies_to_us = True
                        else:
                            applies_to_us = False
                            
                    if applies_to_us and directive == "disallow":
                        if val:
                            disallowed_paths.append(val)
                            
                path_to_check = parsed.path or "/"
                for dis in disallowed_paths:
                    # Quick prefix match or match all
                    if dis == "/" or path_to_check.startswith(dis):
                        return False
    except:
        pass
    return True

gemini_lock = asyncio.Lock()

async def generate_gemini_summary(text_corpus: str, keyword: str) -> str:
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_key or not HAS_GENAI:
        return ""
        
    async with gemini_lock:
        # Rate limit safety delay
        await asyncio.sleep(3.0)
        
        models_to_try = [
            "gemini-2.5-flash",
            "gemini-2.5-pro"
        ]
        for model_name in models_to_try:
            attempts = 2
            for attempt in range(1, attempts + 1):
                try:
                    genai.configure(apiKey=gemini_key)
                    model = genai.GenerativeModel(model_name)
                    
                    prompt = f"""Summarize this web page text in context of target keyword: "{keyword}".
Focus on concrete details, keep it under 100 words. Return only the summary text.
Web text:
{text_corpus[:3000]}"""
                    
                    # Run model invocation
                    response = model.generate_content(prompt)
                    if response and response.text:
                        return response.text.strip()
                except Exception as e:
                    err_str = str(e).lower()
                    is_rate_limit = "429" in err_str or "resource" in err_str or "quota" in err_str
                    is_overloaded = "503" in err_str or "overloaded" in err_str or "unavailable" in err_str
                    
                    is_quoted_or_scary = "quota" in err_str or "exhausted" in err_str or "limit" in err_str or "rate" in err_str or "429" in err_str or "503" in err_str
                    display_err = "Temporary API limitation or service demand spike." if is_quoted_or_scary else (str(e)[:80] + "..." if len(str(e)) > 80 else str(e))
                    print(f"[Gemini Info] Scraper summary attempt {attempt}/{attempts} for {model_name} request unsuccessful: {display_err}")
                    
                    if is_rate_limit or is_overloaded:
                        print(f"[Gemini Info] Overload or Rate limit on {model_name}. Advancing directly to alternative fallback model.")
                        break # Break current attempts to try next model immediately
                        
                    if attempt < attempts:
                        await asyncio.sleep(2.0)
        return ""

async def scrape_single_page(url: str, keyword: str, delay_min: float, delay_max: float, run_ai_summaries: bool) -> Dict[str, Any]:
    # 1. Robots analysis
    allowed = await check_robots_txt(url)
    if not allowed:
        return {"status": "failed", "error_reason": "Blocked by domain robots.txt directives"}
        
    # 2. Polite Delay
    if delay_min > 0:
        wait_time = random.uniform(delay_min, delay_max)
        await asyncio.sleep(wait_time)
        
    # 3. Request page
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://www.google.fr/"
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=15) as res:
                if res.status != 200:
                    return {"status": "failed", "error_reason": f"HTTP response status code: {res.status}"}
                    
                html = await res.text()
                soup = BeautifulSoup(html, "html.parser")
                
                # strip clutter tags
                for script in soup(["script", "style", "nav", "footer", "header", "noscript", "iframe"]):
                    script.extract()
                    
                title = soup.title.string.strip() if soup.title else soup.h1.get_text(strip=True) if soup.h1 else "Untitled Document"
                
                # Meta description
                meta_desc = ""
                meta_tag = soup.find("meta", attrs={"name": "description"})
                if meta_tag and meta_tag.get("content"):
                    meta_desc = meta_tag["content"].strip()
                    
                # Images
                images = []
                for img in soup.find_all("img"):
                    src = img.get("src")
                    if src and src.startswith("http") and len(images) < 5:
                        images.append(src)
                        
                # Rebuild main body paragraphs
                paragraphs = []
                for tag in soup.find_all(["p", "h1", "h2", "h3"]):
                    txt = tag.get_text(strip=True)
                    if len(txt) > 30 and "{" not in txt and "}" not in txt:
                        paragraphs.append(txt)
                        
                full_content = "\n\n".join(paragraphs)
                if not paragraphs:
                    return {"status": "failed", "error_reason": "No readable textual paragraphs extracted from url body"}
                    
                # Create summaries
                summary = ""
                if run_ai_summaries:
                    summary = await generate_gemini_summary(full_content, keyword)
                    
                if not summary:
                    summary = " ".join(paragraphs[:3])
                    if len(summary) > 300:
                        summary = summary[:297] + "..."
                        
                return {
                    "status": "success",
                    "title": title,
                    "description": meta_desc or f"Web resource discussing {keyword}",
                    "images": images,
                    "summary": summary,
                    "content": full_content[:6000]
                }
    except asyncio.TimeoutError:
        return {"status": "failed", "error_reason": "Request timed out after 15 seconds"}
    except Exception as e:
        return {"status": "failed", "error_reason": str(e)}

async def crawl_concurrent_batch(
    results_list: List[Dict[str, Any]], 
    keyword: str, 
    concurrency_limit: int, 
    delay_min: float, 
    delay_max: float,
    run_ai_summaries: bool,
    on_completed_callback: Callable[[int, Dict[str, Any]], None]
) -> List[Dict[str, Any]]:
    
    semaphore = asyncio.Semaphore(concurrency_limit)
    finalized = [None] * len(results_list)
    
    async def worker(idx: int, item: Dict[str, Any]):
        async with semaphore:
            # Mark active
            on_completed_callback(idx, {**item, "status": "scraping"})
            
            updates = await scrape_single_page(
                item["url"], 
                keyword, 
                delay_min, 
                delay_max, 
                run_ai_summaries
            )
            
            final_item = {**item, **updates}
            finalized[idx] = final_item
            on_completed_callback(idx, final_item)
            
    tasks = [worker(i, item) for i, item in enumerate(results_list)]
    await asyncio.gather(*tasks)
    return finalized
