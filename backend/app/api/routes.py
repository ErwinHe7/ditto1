import json
import uuid
import asyncio
import threading
import os
from fastapi import APIRouter
from pydantic import BaseModel
from app.models import Profile
from app import db as DB

router = APIRouter()

# In-memory fallback (used when no DATABASE_URL set)
_mem: dict[str, dict] = {}

PROFILES_PATH = os.path.join(os.path.dirname(__file__), "../../sample_profiles.json")

def _set(job_id, **fields):
    _mem.setdefault(job_id, {}).update(fields)
    try:
        DB.upsert_job(job_id, **fields)
    except Exception:
        pass

def _get(job_id) -> dict:
    try:
        row = DB.get_job(job_id)
        if row:
            if row.get("report") and isinstance(row["report"], str):
                row["report"] = json.loads(row["report"])
            return row
    except Exception:
        pass
    return _mem.get(job_id, {"status": "not_found", "progress": ""})

class MatchRequest(BaseModel):
    profile_a: Profile
    profile_b: Profile

def _run_match_thread(job_id: str, pa_dict: dict, pb_dict: dict):
    from app.pipeline.l3_deep import run_l3_deep_match

    def on_progress(msg):
        _set(job_id, status="running", progress=msg)

    _set(job_id, status="running", progress="starting...")
    try:
        pa, pb = Profile(**pa_dict), Profile(**pb_dict)
        report = asyncio.run(run_l3_deep_match(pa, pb, on_progress=on_progress))
        _set(job_id, status="done", progress="complete",
             report=json.loads(report.model_dump_json()))
    except Exception as e:
        import traceback
        _set(job_id, status="error", progress=str(e),
             error_detail=traceback.format_exc()[:800])

@router.post("/match")
def start_match(req: MatchRequest):
    job_id = str(uuid.uuid4())[:8]
    _set(job_id, status="pending", progress="")
    threading.Thread(
        target=_run_match_thread,
        args=(job_id, req.profile_a.model_dump(), req.profile_b.model_dump()),
        daemon=True
    ).start()
    return {"job_id": job_id}

@router.get("/match/{job_id}")
def get_match(job_id: str):
    job = _get(job_id)
    return {
        "job_id": job_id,
        "status": job.get("status", "not_found"),
        "progress": job.get("progress", ""),
        **({"report": job["report"]} if job.get("report") else {}),
        **({"error_detail": job.get("error_detail", "")[:400]} if job.get("error_detail") else {}),
    }

@router.get("/jobs")
def list_jobs():
    rows = DB.list_jobs(50)
    if not rows:
        return [{"job_id": k, "status": v.get("status"), "progress": v.get("progress")} for k, v in _mem.items()]
    return rows

@router.get("/sample-profiles")
def get_sample_profiles():
    with open(os.path.abspath(PROFILES_PATH)) as f:
        return json.load(f)
