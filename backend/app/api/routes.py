import json
import uuid
import asyncio
import threading
import os
from fastapi import APIRouter
from pydantic import BaseModel
from app.models import Profile

router = APIRouter()
_jobs: dict[str, dict] = {}

PROFILES_PATH = os.path.join(os.path.dirname(__file__), "../../sample_profiles.json")

def load_profiles():
    with open(os.path.abspath(PROFILES_PATH)) as f:
        return [Profile(**p) for p in json.load(f)]

class MatchRequest(BaseModel):
    profile_a: Profile
    profile_b: Profile

def _run_match_thread(job_id: str, pa_dict: dict, pb_dict: dict):
    from app.pipeline.l3_deep import run_l3_deep_match

    pa = Profile(**pa_dict)
    pb = Profile(**pb_dict)

    def on_progress(msg):
        _jobs[job_id]["progress"] = msg

    _jobs[job_id]["status"] = "running"
    try:
        report = asyncio.run(run_l3_deep_match(pa, pb, on_progress=on_progress))
        _jobs[job_id]["status"] = "done"
        _jobs[job_id]["report"] = json.loads(report.model_dump_json())
    except Exception as e:
        import traceback
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["progress"] = f"{type(e).__name__}: {e}"
        _jobs[job_id]["traceback"] = traceback.format_exc()

@router.post("/match")
def start_match(req: MatchRequest):
    job_id = str(uuid.uuid4())[:8]
    _jobs[job_id] = {"status": "pending", "progress": ""}
    t = threading.Thread(
        target=_run_match_thread,
        args=(job_id, req.profile_a.model_dump(), req.profile_b.model_dump()),
        daemon=True
    )
    t.start()
    return {"job_id": job_id}

@router.get("/match/{job_id}")
def get_match(job_id: str):
    job = _jobs.get(job_id, {"status": "not_found", "progress": ""})
    result = {"job_id": job_id, "status": job.get("status"), "progress": job.get("progress", "")}
    if job.get("report"):
        result["report"] = job["report"]
    if job.get("traceback"):
        result["error_detail"] = job["traceback"][:800]
    return result

@router.get("/sample-profiles")
def get_sample_profiles():
    with open(os.path.abspath(PROFILES_PATH)) as f:
        return json.load(f)

class BestMatchRequest(BaseModel):
    profile_a: Profile
    profile_b: Profile
    all_profiles: list[Profile]

def _run_best_match_thread(job_id: str, pa_dict: dict, pb_dict: dict, others_dict: list[dict]):
    """Quick single-scenario L2 comparison to find best match for each person among remaining profiles."""
    from app.graph.builder import run_simulation
    from app.graph.state import SimulationState
    from app.scenarios.definitions import SCENARIOS
    from app.scoring.judges import judge_holistic

    async def quick_score(p1: Profile, p2: Profile) -> float:
        scenario = SCENARIOS[0]  # first coffee — fastest read
        state: SimulationState = {
            "profile_a": p1.model_dump(), "profile_b": p2.model_dump(),
            "scenario": scenario, "msgs": [], "turn": 0,
            "max_turns": 4, "finished": False,
        }
        result = await run_simulation(state)
        score = await judge_holistic(result["msgs"], p1.model_dump(), p2.model_dump())
        return score.overall

    async def run_all():
        pa = Profile(**pa_dict)
        pb = Profile(**pb_dict)
        others = [Profile(**d) for d in others_dict]

        # filter out pa and pb from others
        others_for_pa = [p for p in others if p.name != pa.name]
        others_for_pb = [p for p in others if p.name != pb.name]

        # score pa against everyone else (opposite or all genders — just show top)
        pa_scores = []
        for candidate in others_for_pa:
            if candidate.name == pb.name:
                continue
            try:
                s = await quick_score(pa, candidate)
                pa_scores.append({"name": candidate.name, "score": s, "bio": candidate.bio[:80]})
            except Exception:
                pass

        pb_scores = []
        for candidate in others_for_pb:
            if candidate.name == pa.name:
                continue
            try:
                s = await quick_score(pb, candidate)
                pb_scores.append({"name": candidate.name, "score": s, "bio": candidate.bio[:80]})
            except Exception:
                pass

        pa_best = sorted(pa_scores, key=lambda x: x["score"], reverse=True)[:2]
        pb_best = sorted(pb_scores, key=lambda x: x["score"], reverse=True)[:2]
        return {"pa_best": pa_best, "pb_best": pb_best}

    _jobs[job_id]["status"] = "running"
    try:
        result = asyncio.run(run_all())
        _jobs[job_id]["status"] = "done"
        _jobs[job_id]["report"] = result
    except Exception as e:
        import traceback
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["traceback"] = traceback.format_exc()[:800]

@router.post("/best-matches")
def start_best_matches(req: BestMatchRequest):
    job_id = "bm-" + str(uuid.uuid4())[:6]
    _jobs[job_id] = {"status": "pending", "progress": "scanning other profiles..."}
    t = threading.Thread(
        target=_run_best_match_thread,
        args=(job_id, req.profile_a.model_dump(), req.profile_b.model_dump(),
              [p.model_dump() for p in req.all_profiles]),
        daemon=True
    )
    t.start()
    return {"job_id": job_id}
