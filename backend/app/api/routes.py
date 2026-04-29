import json
import uuid
import os
from fastapi import APIRouter
from pydantic import BaseModel
from app.models import Profile
from app.pipeline.l1_coarse import l1_coarse_filter
from app.pipeline.l2_medium import l2_medium_rank
from app.pipeline.l3_deep import (
    run_l3_deep_match,
    scout_profile_matches_from_scores,
    find_top_matches_via_simulation,
)
from app import db as DB

router = APIRouter()

# In-memory fallback for local/dev. Production requests also return the report
# directly so Vercel does not need background threads or a database to display it.
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

class ScoutRequest(BaseModel):
    profile: Profile
    top_n: int = 3

@router.post("/match")
async def start_match(req: MatchRequest):
    job_id = str(uuid.uuid4())[:8]
    progress = "starting..."

    def on_progress(msg):
        nonlocal progress
        progress = msg
        _set(job_id, status="running", progress=msg)

    _set(job_id, status="running", progress=progress)
    try:
        report = await run_l3_deep_match(req.profile_a, req.profile_b, on_progress=on_progress)
        report_json = json.loads(report.model_dump_json())
        _set(job_id, status="done", progress="complete", report=report_json)
        return {
            "job_id": job_id,
            "status": "done",
            "progress": "complete",
            "report": report_json,
        }
    except Exception as e:
        import traceback
        detail = traceback.format_exc()[:1500]
        _set(job_id, status="error", progress=str(e), error_detail=detail)
        return {
            "job_id": job_id,
            "status": "error",
            "progress": str(e),
            "error_detail": detail[:400],
        }

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

@router.post("/scout")
async def scout_matches(req: ScoutRequest):
    with open(os.path.abspath(PROFILES_PATH)) as f:
        candidates = [Profile(**p) for p in json.load(f)]
    top_n = max(1, min(req.top_n, 5))
    l1_pool = await l1_coarse_filter(req.profile, candidates, top_k=max(6, top_n * 2))
    l2_ranked = await l2_medium_rank(req.profile, l1_pool, top_k=top_n)
    matches = scout_profile_matches_from_scores(req.profile, l2_ranked, top_n=top_n)
    return {
        "pipeline": {
            "l1_candidates": len(l1_pool),
            "l2_quick_dates_per_candidate": 3,
            "l3_full_loops_per_scenario": 7,
        },
        "matches": [json.loads(m.model_dump_json()) for m in matches],
    }

@router.post("/match/top")
async def find_top_matches(req: ScoutRequest):
    """
    Tiered auto-match: L1 coarse -> L2 light sim -> L3 deep sim.
    Picks top_n best candidates from sample_profiles.json by actually
    simulating dates, not just keyword affinity.
    """
    job_id = str(uuid.uuid4())[:8]
    progress = "starting tiered match..."

    def on_progress(msg):
        nonlocal progress
        progress = msg
        _set(job_id, status="running", progress=msg)

    _set(job_id, status="running", progress=progress)

    with open(os.path.abspath(PROFILES_PATH)) as f:
        candidates = [Profile(**p) for p in json.load(f)]

    top_n = max(1, min(req.top_n, 5))
    try:
        reports = await find_top_matches_via_simulation(
            req.profile, candidates, top_n=top_n, on_progress=on_progress
        )
        reports_json = [json.loads(r.model_dump_json()) for r in reports]
        _set(job_id, status="done", progress="complete", reports=reports_json)
        return {
            "job_id": job_id,
            "status": "done",
            "progress": "complete",
            "reports": reports_json,
        }
    except Exception as e:
        import traceback
        detail = traceback.format_exc()[:1500]
        _set(job_id, status="error", progress=str(e), error_detail=detail)
        return {
            "job_id": job_id,
            "status": "error",
            "progress": str(e),
            "error_detail": detail[:400],
        }

@router.get("/sample-profiles")
def get_sample_profiles():
    with open(os.path.abspath(PROFILES_PATH)) as f:
        return json.load(f)
