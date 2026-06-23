import sqlite3
import json
import os
from typing import List, Dict, Any, Optional

DB_FILE = "searchscrape.db"

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create jobs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        keyword TEXT NOT NULL,
        status TEXT NOT NULL,
        total_requested INTEGER NOT NULL,
        found_count INTEGER DEFAULT 0,
        scraped_success INTEGER DEFAULT 0,
        scraped_failed INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    )
    """)
    
    # Create results table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS results (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        url TEXT NOT NULL,
        domain TEXT NOT NULL,
        title TEXT,
        description TEXT,
        summary TEXT,
        content TEXT,
        relevance_score INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        error_reason TEXT,
        images_json TEXT,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    )
    """)
    
    # Create settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        serpapi_key TEXT DEFAULT '',
        concurrency_limit INTEGER DEFAULT 8,
        polite_delay_min REAL DEFAULT 1.0,
        polite_delay_max REAL DEFAULT 3.0,
        enable_gemini_summaries INTEGER DEFAULT 1
    )
    """)
    
    # Put default settings
    cursor.execute("SELECT COUNT(*) FROM settings")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO settings (id, serpapi_key, concurrency_limit, polite_delay_min, polite_delay_max, enable_gemini_summaries)
        VALUES (1, '', 8, 1.0, 3.0, 1)
        """)
        
    conn.commit()
    conn.close()

def save_job(job_id: str, keyword: str, status: str, total_requested: int, created_at: str):
    conn = get_db_connection()
    conn.execute("""
    INSERT INTO jobs (id, keyword, status, total_requested, created_at)
    VALUES (?, ?, ?, ?, ?)
    """, (job_id, keyword, status, total_requested, created_at))
    conn.commit()
    conn.close()

def update_job_status(job_id: str, status: str):
    conn = get_db_connection()
    conn.execute("UPDATE jobs SET status = ? WHERE id = ?", (status, job_id))
    conn.commit()
    conn.close()

def update_job_aggregates(job_id: str, found: int, success: int, failed: int):
    conn = get_db_connection()
    conn.execute("""
    UPDATE jobs 
    SET found_count = ?, scraped_success = ?, scraped_failed = ?
    WHERE id = ?
    """, (found, success, failed, job_id))
    conn.commit()
    conn.close()

def save_result(result_id: str, job_id: str, data: Dict[str, Any]):
    conn = get_db_connection()
    images_str = json.dumps(data.get("images", []))
    conn.execute("""
    INSERT INTO results (id, job_id, url, domain, title, description, summary, content, relevance_score, status, error_reason, images_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        result_id,
        job_id,
        data["url"],
        data["domain"],
        data.get("title", ""),
        data.get("description", ""),
        data.get("summary", ""),
        data.get("content", ""),
        data.get("relevance_score", 0),
        data["status"],
        data.get("error_reason", ""),
        images_str
    ))
    conn.commit()
    conn.close()

def update_result(result_id: str, updates: Dict[str, Any]):
    conn = get_db_connection()
    keys = list(updates.keys())
    values = [updates[k] if k != "images" else json.dumps(updates[k]) for k in keys]
    set_clause = ", ".join([f"{k} = ?" if k != "images" else "images_json = ?" for k in keys])
    values.append(result_id)
    
    conn.execute(f"UPDATE results SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()

def get_jobs() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()
    jobs = [dict(r) for r in rows]
    conn.close()
    return jobs

def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        conn.close()
        return None
    job = dict(row)
    
    # Retrieve nested results
    results_rows = conn.execute("SELECT * FROM results WHERE job_id = ? ORDER BY relevance_score DESC", (job_id,)).fetchall()
    results = []
    for r in results_rows:
        rd = dict(r)
        try:
            rd["images"] = json.loads(rd["images_json"]) if rd.get("images_json") else []
        except:
            rd["images"] = []
        results.append(rd)
        
    job["results"] = results
    conn.close()
    return job

def delete_job(job_id: str):
    conn = get_db_connection()
    conn.execute("DELETE FROM results WHERE job_id = ?", (job_id,))
    conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
    conn.commit()
    conn.close()

def get_settings() -> Dict[str, Any]:
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    settings = dict(row) if row else {}
    conn.close()
    return settings

def update_settings(serpapi_key: str, concurrency_limit: int, polite_delay_min: float, polite_delay_max: float, enable_gemini_summaries: int):
    conn = get_db_connection()
    conn.execute("""
    UPDATE settings 
    SET serpapi_key = ?, concurrency_limit = ?, polite_delay_min = ?, polite_delay_max = ?, enable_gemini_summaries = ?
    WHERE id = 1
    """, (serpapi_key, concurrency_limit, polite_delay_min, polite_delay_max, enable_gemini_summaries))
    conn.commit()
    conn.close()

# Automate SQLite directory checks
init_db()
