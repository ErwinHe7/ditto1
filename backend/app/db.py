import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor

def get_conn():
    url = os.getenv("DATABASE_URL", "")
    if not url:
        return None
    # Railway gives postgres:// — psycopg2 needs postgresql://
    url = url.replace("postgres://", "postgresql://", 1)
    return psycopg2.connect(url, cursor_factory=RealDictCursor)

def init_db():
    conn = get_conn()
    if not conn:
        return
    with conn:
        conn.cursor().execute("""
            CREATE TABLE IF NOT EXISTS match_jobs (
                job_id TEXT PRIMARY KEY,
                status TEXT NOT NULL DEFAULT 'pending',
                progress TEXT DEFAULT '',
                report JSONB,
                error_detail TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
    conn.close()

def upsert_job(job_id: str, **fields):
    conn = get_conn()
    if not conn:
        return
    cols = ["job_id"] + list(fields.keys())
    vals = [job_id] + [json.dumps(v) if isinstance(v, (dict, list)) else v for v in fields.values()]
    set_clause = ", ".join(f"{k} = EXCLUDED.{k}" for k in fields)
    set_clause += ", updated_at = NOW()"
    sql = f"""
        INSERT INTO match_jobs ({', '.join(cols)})
        VALUES ({', '.join(['%s'] * len(vals))})
        ON CONFLICT (job_id) DO UPDATE SET {set_clause}
    """
    with conn:
        conn.cursor().execute(sql, vals)
    conn.close()

def get_job(job_id: str) -> dict | None:
    conn = get_conn()
    if not conn:
        return None
    with conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM match_jobs WHERE job_id = %s", (job_id,))
        row = cur.fetchone()
    conn.close()
    return dict(row) if row else None

def list_jobs(limit=50) -> list:
    conn = get_conn()
    if not conn:
        return []
    with conn:
        cur = conn.cursor()
        cur.execute("SELECT job_id, status, progress, created_at, updated_at FROM match_jobs ORDER BY created_at DESC LIMIT %s", (limit,))
        rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]
