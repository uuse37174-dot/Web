import re
import urllib.parse
import csv
import json
import io
import sys
from typing import List, Dict, Any, Optional

def setup_logger():
    """Returns a simple formatted terminal logger."""
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] (%(filename)s:%(lineno)d) - %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    return logging.getLogger("SearchScrape")

logger = setup_logger()

def clean_url(url: str) -> Optional[str]:
    """Sanitizes and normalizes incoming URLs."""
    try:
        parsed = urllib.parse.urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return None
        # Lowercase the hostname and strip duplicate slashes in path
        netloc = parsed.netloc.lower()
        path = re.sub(r'/{2,}', '/', parsed.path)
        normalized = f"{parsed.scheme}://{netloc}{path}"
        if parsed.query:
            normalized += f"?{parsed.query}"
        return normalized
    except Exception as e:
        logger.debug(f"Normalization failed for {url}: {e}")
        return None

def extract_domain(url: str) -> str:
    """Extracts raw web domain names from urls."""
    try:
        parsed = urllib.parse.urlparse(url)
        return parsed.netloc.lower()
    except Exception:
        return ""

def clean_extracted_text(text: str) -> str:
    """Purges extreme excess spacing, boilerplate remnants and junk delimiters."""
    if not text:
        return ""
    # Strip javascript curly braces blocks or style structures
    text = re.sub(r'\{[^{}]*\}', ' ', text)
    # Replace multiple occurrences of whitespace/newlines with clean spacings
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'\n+', '\n\n', text)
    return text.strip()

def export_to_csv_string(results: List[Dict[str, Any]]) -> str:
    """Transforms scraped data records directly into a fully compatible CSV string payload."""
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    
    # Headers
    writer.writerow([
        "ID", "URL", "Domain", "Title", "Relevance Score %", 
        "Status", "Summary", "Error Reason"
    ])
    
    for r in results:
        writer.writerow([
            r.get("id", ""),
            r.get("url", ""),
            r.get("domain", ""),
            r.get("title", ""),
            r.get("relevance_score", 0),
            r.get("status", ""),
            r.get("summary", ""),
            r.get("error_reason", "")
        ])
        
    return output.getvalue()

def export_to_json_string(job_data: Dict[str, Any]) -> str:
    """Formats full job structures including results into beautifully formatted JSON string files."""
    try:
        return json.dumps(job_data, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed parsing full JSON payload export: {e}")
        return "{}"
