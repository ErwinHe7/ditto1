import asyncio
import json
import redis
from app.tasks.celery_app import celery_app
from app.models import Profile
from app.pipeline.l3_deep import run_l3_deep_match
from app.config import settings

r = redis.from_url(settings.redis_url)

@celery_app.task(name="run_match")
def run_match_job(profile_a_dict: dict, profile_b_dict: dict, job_id: str):
    pa = Profile(**profile_a_dict)
    pb = Profile(**profile_b_dict)

    def on_progress(msg):
        r.set(f"match:{job_id}:progress", msg, ex=3600)

    r.set(f"match:{job_id}:status", "running", ex=3600)
    report = asyncio.run(run_l3_deep_match(pa, pb, on_progress=on_progress))
    r.set(f"match:{job_id}:status", "done", ex=3600)
    r.set(f"match:{job_id}:report", report.model_dump_json(), ex=3600)
    return {"status": "done", "job_id": job_id}
