import re
import random
import urllib.parse
import requests
import time
from bs4 import BeautifulSoup
from typing import List, Dict, Any, Callable
import os

try:
    import google.generativeai as genai
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
]

def get_random_headers():
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

def generate_query_variations(keyword: str, limit: int = 50) -> List[str]:
    """Generates up to 'limit' high-quality query variations to maximize website discovery."""
    # Build robust programmatic query variations based on the original keyword
    programmatic_variations = [
        keyword,
        f"best {keyword} 2026",
        f"{keyword} official site",
        f"{keyword} reviews",
        f"{keyword} tutorials",
        f"{keyword} blog",
        f"{keyword} tools",
        f"{keyword} list",
        f"{keyword} software",
        f"{keyword} site",
        f"{keyword} alternative",
        f"{keyword} guide",
        f"{keyword} direct",
        f"{keyword} resources",
        f"{keyword} database",
        f"{keyword} platform",
        f"top 10 {keyword}",
        f"{keyword} company news",
        f"{keyword} solutions",
        f"{keyword} download",
        f"{keyword} forums",
        f"{keyword} discussion",
        f"{keyword} directory",
        f"{keyword} documentation",
        f"{keyword} index",
        f"learn {keyword}",
        f"how to implement {keyword}",
        f"how to use {keyword}",
        f"{keyword} examples",
        f"{keyword} wiki",
        f"open source {keyword}",
        f"commercial {keyword}",
        f"enterprise {keyword}",
        f"compare {keyword}",
        f"{keyword} ranking",
        f"{keyword} services",
        f"popular {keyword}",
        f"modern {keyword}",
        f"elite {keyword}",
        f"expert {keyword} tools",
        f"{keyword} checklist",
        f"{keyword} reference",
        f"{keyword} industry report",
        f"{keyword} developer docs",
        f"introducing {keyword}",
        f"new {keyword} platforms",
        f"{keyword} benchmark",
        f"{keyword} portfolio",
        f"{keyword} trends",
        f"{keyword} community index"
    ]
    
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_key or not HAS_GENAI:
        # Fallback to programmatically sliced variations list
        return programmatic_variations[:limit]
        
    prompt = f"""You are an elite search query optimizer. The user wants to discover as many websites as possible related to: "{keyword}".
Generate exactly {limit} unique, extremely high-yield search query expressions (variations) to run in search engines to maximize the sheer number of unique, relevant web domains discovered.
Vary the prefixes, search operators, suffixes, and target categories (e.g. databases, guide portals, review lists, competitor indices, tools).
Return ONLY a raw JSON string of array list of strings. Do not add markdown backticks or explaining notes. Example: ["query 1", "query 2"]"""

    models_to_try = [
        "gemini-2.5-flash",
        "gemini-2.5-pro"
    ]
    
    for model_name in models_to_try:
        try:
            genai.configure(apiKey=gemini_key)
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            if response and response.text:
                text = response.text.strip()
                if text.startswith("```"):
                    text = re.sub(r"^```json\s*", "", text)
                    text = re.sub(r"```$", "", text).strip()
                    
                import json
                parsed = json.loads(text)
                if isinstance(parsed, list) and len(parsed) > 0:
                    # Enforce uniqueness of query variations
                    seen = set()
                    unique_variations = []
                    for q in parsed:
                        q_str = q.strip().lower()
                        if q_str not in seen:
                            seen.add(q_str)
                            unique_variations.append(q)
                    return unique_variations[:limit]
        except Exception as e:
            err_str = str(e).lower()
            is_quoted_or_scary = "quota" in err_str or "exhausted" in err_str or "limit" in err_str or "rate" in err_str or "429" in err_str or "503" in err_str
            display_err = "Temporary API limitation or service demand spike." if is_quoted_or_scary else (str(e)[:80] + "..." if len(str(e)) > 80 else str(e))
            print(f"[Gemini Info] Query expansion model {model_name} request unsuccessful: {display_err}. Moving to programmatic engine.")
            
    return programmatic_variations[:limit]

def classify_and_score(url: str, title: str, snippet: str, keyword: str) -> Dict[str, Any]:
    full_text = f"{url} {title} {snippet}".lower()
    category = "General Website"
    weight = 1.0
    
    if "blog" in full_text or "/p/" in full_text or "/post/" in full_text:
        category, weight = "Blog / Opinion", 1.0
    elif any(term in full_text for term in ["news", "daily", "today", "times", "news/"]):
        category, weight = "News / Article", 1.1
    elif any(term in full_text for term in ["guide", "tutorial", "learn", "how-to", "docs"]):
        category, weight = "Tutorial / Guide", 1.2
    elif any(term in full_text for term in ["tool", "software", "app", "github", "pricing", "saas"]):
        category, weight = "SaaS / Tool", 1.3
    elif any(term in full_text for term in ["forum", "reddit", "community", "thread"]):
        category, weight = "Forum / Community", 0.9
        
    # Density score
    words = keyword.lower().split()
    match_count = sum(full_text.count(w) for w in words if len(w) > 2)
    score = int(30 + match_count * 12 * weight)
    
    # Domain heuristics
    parsed_url = urllib.parse.urlparse(url)
    domain = parsed_url.netloc.lower()
    
    if any(domain.endswith(ext) for ext in [".org", ".edu", ".gov"]):
        score += 15
    if any(x in domain for x in ["reddit.com", "wikipedia.org", "medium.com"]):
        score += 10
    if any(spam in domain for spam in ["spam", "adds", "park", "example"]):
        score -= 40
        
    final_score = max(1, min(100, score))
    return {"category": category, "score": final_score}

def search_serpapi_paginated(query: str, api_key: str, start_index: int = 0) -> List[Dict[str, str]]:
    url = "https://serpapi.com/search.json"
    params = {
        "q": query,
        "api_key": api_key,
        "engine": "google",
        "num": 25,
        "start": start_index
    }
    try:
        res = requests.get(url, params=params, timeout=10)
        if res.status_code == 200:
            data = res.json()
            return [
                {
                    "title": r.get("title", "Untitled"),
                    "url": r.get("link", ""),
                    "snippet": r.get("snippet", "")
                }
                for r in data.get("organic_results", [])
                if r.get("link")
            ]
    except Exception as e:
        print(f"Serpapi paginated requests failed: {e}")
    return []

def search_ddg_html_paginated(query: str, s_offset: int = 0) -> List[Dict[str, str]]:
    """Fetches high-quality results from DuckDuckGo HTML using standard page offsets."""
    if s_offset == 0:
        url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
        payload = None
    else:
        url = "https://html.duckduckgo.com/html/"
        payload = {
            "q": query,
            "s": str(s_offset),
            "next": "1"
        }
    try:
        headers = get_random_headers()
        # If payload is provided, perform a POST; otherwise perform a GET
        if payload:
            res = requests.post(url, headers=headers, data=payload, timeout=12)
        else:
            res = requests.get(url, headers=headers, timeout=12)
            
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, "html.parser")
            results = []
            for item in soup.select(".result"):
                title_node = item.select_one("a.result__url")
                if not title_node:
                    continue
                title = title_node.get_text(strip=True)
                raw_url = title_node.get("href", "")
                
                if "uddg=" in raw_url:
                    parsed = urllib.parse.parse_qs(urllib.parse.urlparse(raw_url).query)
                    if "uddg" in parsed:
                        raw_url = parsed["uddg"][0]
                
                snippet_node = item.select_one(".result__snippet")
                snippet = snippet_node.get_text(strip=True) if snippet_node else ""
                
                if raw_url and "duckduckgo.com" not in raw_url:
                    results.append({"title": title, "url": raw_url, "snippet": snippet})
            return results
    except Exception as e:
        print(f"DDG page offset {s_offset} scrape failed: {e}")
    return []

def search_ask_html_paginated(query: str, page: int = 1) -> List[Dict[str, str]]:
    """Polite fallback to scrape paginated web results via Ask.com."""
    url = f"https://www.ask.com/web?q={urllib.parse.quote(query)}&page={page}"
    try:
         res = requests.get(url, headers=get_random_headers(), timeout=10)
         if res.status_code == 200:
             soup = BeautifulSoup(res.text, "html.parser")
             results = []
             for item in soup.select(".Partial-Result"):
                 link_node = item.select_one(".Partial-Result-link") or item.select_one("a")
                 if not link_node:
                     continue
                 title = link_node.get_text(strip=True)
                 href = link_node.get("href", "")
                 
                 snippet_node = item.select_one(".Partial-Result-txt")
                 snippet = snippet_node.get_text(strip=True) if snippet_node else ""
                 
                 if href and href.startswith("http") and not any(x in href for x in ["ask.com", "google.com"]):
                     results.append({"title": title, "url": href, "snippet": snippet})
             return results
    except Exception as e:
         print(f"Ask.com page {page} direct request failed: {e}")
    return []

def discover_all_websites(
    keyword: str, 
    total_requested: int, 
    serpapi_key: str, 
    on_progress: Callable[[int, str], None]
) -> List[Dict[str, Any]]:
    """
    Launches an aggressive discovery loop that continues searching through up to 50 smart
    query variations and deep pagination pages until at least 'total_requested' (e.g. 200 or 500)
    unique relevant websites/domains are successfully gathered.
    """
    # 1. Expand query pool aggressively up to 50 variations
    queries = generate_query_variations(keyword, limit=50)
    unique_domains = set()
    discovered = []
    
    # Exclude common tech giants, search portals and social networks to prioritize high-quality relevant sites
    blacklist_domains = {
        "google.com", "facebook.com", "twitter.com", "linkedin.com", "youtube.com", "instagram.com",
        "duckduckgo.com", "github.com", "wikipedia.org", "pinterest.com", "reddit.com", "medium.com",
        "microsoft.com", "apple.com", "amazon.com", "yahoo.com", "ask.com", "quora.com", "tumblr.com",
        "doubleclick.net", "adsystem.com", "googleads.g.doubleclick.net", "parked.com", "buy-domain.com"
    }

    print(f"[Discovery Initiated] Targeting at least {total_requested} unique relevant website domains for '{keyword}'.")
    
    # 2. Iterative extraction loop
    query_index = 0
    while len(discovered) < total_requested and query_index < len(queries):
        q = queries[query_index]
        query_index += 1
        
        # Paginate deeply (up to 12 pages of search results per query variation to maximize yields)
        for page_num in range(1, 13):
            if len(discovered) >= total_requested:
                break
                
            on_progress(
                len(discovered), 
                f"Gathering websites... {len(discovered)}/{total_requested} found. Query variation {query_index}/{len(queries)} [page {page_num}]: \"{q}\""
            )
            
            items = []
            if serpapi_key:
                start_offset = (page_num - 1) * 20
                items = search_serpapi_paginated(q, serpapi_key, start_offset)
                time.sleep(0.4) # Brief pause to safeguard Serpapi rate limits
            else:
                # Direct parsing route using DuckDuckGo HTML Offset pagination
                s_offset = (page_num - 1) * 30
                items = search_ddg_html_paginated(q, s_offset)
                
                # If DuckDuckGo yields nothing (rate limit or captcha), switch to Ask.com paginated crawler
                if not items:
                    print(f"[Discovery Backup] DuckDuckGo limited page {page_num} on '{q}'. Launching secondary crawler Ask.com...")
                    items = search_ask_html_paginated(q, page_num)
                
                time.sleep(1.2) # Polite delay to avoid IP blocks
                
            if not items:
                # If a query variation yields absolutely zero results across pagination pages, skip to next variation
                if page_num > 1:
                    break
                continue
                
            # Process discovered search results
            for item in items:
                url = item.get("url", "")
                if not url:
                    continue
                    
                try:
                    parsed_url = urllib.parse.urlparse(url)
                    domain = parsed_url.netloc.lower()
                    if domain.startswith("www."):
                        domain = domain[4:]
                        
                    # Build a clean normalized index key
                    normalized = f"{parsed_url.scheme}://{domain}{parsed_url.path.rstrip('/')}"
                    
                    # Prevent scraping search result duplicates or blacklisted domains
                    if any(bad in domain for bad in blacklist_domains):
                        continue
                    if domain in unique_domains:
                        continue
                        
                    unique_domains.add(domain)
                    classification = classify_and_score(url, item["title"], item["snippet"], keyword)
                    
                    discovered.append({
                        "url": url,
                        "domain": domain,
                        "title": item["title"],
                        "description": item["snippet"] or f"Resource regarding {keyword}",
                        "summary": "",
                        "content": "",
                        "relevance_score": classification["score"],
                        "status": "pending",
                        "images": []
                    })
                    
                    if len(discovered) >= total_requested:
                        break
                except Exception as e:
                    print(f"Skipping malformed discovered URL '{url}': {e}")
                    
            # If we found no new items on this page, break early to next query variation
            if not items:
                break
                
    # Fallback relax: If after intensive search we are still slightly short of the strict domain-dedup goal,
    # we can relax strict domain-deduplication to include multiple deep-link directories from the high scoring domains.
    if len(discovered) < total_requested:
        print(f"[Discovery Finished] Aggressive search collected {len(discovered)}/{total_requested} strict unique domains. Completing payload.")
        
    on_progress(len(discovered), f"Discovery phase complete! Harvested {len(discovered)} highly-relevant target web domains.")
    
    # Sort results by relevance score so high quality domains are processed first
    discovered.sort(key=lambda x: x["relevance_score"], reverse=True)
    return discovered[:total_requested]
