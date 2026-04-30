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
    looking_for_gender: str = "opposite"
    relationship_intent: str = "any"
    custom_candidate: Profile | None = None

def _with_custom_candidate(candidates: list[Profile], custom_candidate: Profile | None) -> list[Profile]:
    if not custom_candidate or not custom_candidate.name or not custom_candidate.bio:
        return candidates
    deduped = [c for c in candidates if c.name.lower() != custom_candidate.name.lower()]
    return [custom_candidate, *deduped]

def _filter_candidates(req: ScoutRequest, candidates: list[Profile]) -> list[Profile]:
    pool = _with_custom_candidate(candidates, req.custom_candidate)
    pool = [c for c in pool if c.name.lower() != req.profile.name.lower()]

    gender_pref = req.looking_for_gender.lower().strip()
    if gender_pref in {"men", "man", "male", "males"}:
        pool = [c for c in pool if c.gender.lower() == "male"]
    elif gender_pref in {"women", "woman", "female", "females"}:
        pool = [c for c in pool if c.gender.lower() == "female"]

    intent = req.relationship_intent.lower().strip()
    if intent not in {"", "any", "unsure"}:
        intent_pool = [
            c for c in pool
            if intent in c.relationship_intent.lower()
            or intent in c.looking_for.lower()
            or intent in c.bio.lower()
        ]
        if intent_pool:
            pool = intent_pool

    return pool

def _l1_target_for(req: ScoutRequest) -> Profile:
    # "Everyone" should not be forced through the opposite-gender fallback in L1.
    if req.looking_for_gender.lower().strip() in {"everyone", "all", "any"}:
        return req.profile.model_copy(update={"gender": "other"})
    return req.profile

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
    filtered_candidates = _filter_candidates(req, candidates)
    l1_pool = await l1_coarse_filter(_l1_target_for(req), filtered_candidates, top_k=max(6, top_n * 2))
    l2_ranked = await l2_medium_rank(req.profile, l1_pool, top_k=top_n)
    matches = scout_profile_matches_from_scores(req.profile, l2_ranked, top_n=top_n)
    return {
        "pipeline": {
            "candidate_pool": len(filtered_candidates),
            "l1_candidates": len(l1_pool),
            "l2_quick_dates_per_candidate": 3,
            "l3_full_loops_per_scenario": 7,
            "gender_filter": req.looking_for_gender,
            "intent_filter": req.relationship_intent,
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

    top_n = max(1, min(req.top_n, 3))
    try:
        filtered_candidates = _filter_candidates(req, candidates)
        reports = await find_top_matches_via_simulation(
            req.profile,
            filtered_candidates,
            top_n=top_n,
            on_progress=on_progress,
            l1_target=_l1_target_for(req),
        )
        reports_json = [json.loads(r.model_dump_json()) for r in reports]
        payload = {
            "kind": "top_matches",
            "target": json.loads(req.profile.model_dump_json()),
            "pipeline": {
                "candidate_pool": len(filtered_candidates),
                "l1_target": 100,
                "l2_target": 10,
                "l3_full_dates": len(reports_json),
                "scenarios": 4,
                "loops_per_scenario": 7,
            },
            "reports": reports_json,
        }
        _set(job_id, status="done", progress="complete", report=payload)
        return {
            "job_id": job_id,
            "status": "done",
            "progress": "complete",
            "report": payload,
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
