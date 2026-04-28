import random
from app.models import Profile

async def l1_coarse_filter(target: Profile, candidates: list[Profile], top_k: int = 100) -> list[Profile]:
    """
    Production: embed bio + interests + values via text-embedding-3-small,
    store in pgvector, cosine similarity top_k. <50ms for 100k candidates.
    """
    return random.sample(candidates, min(top_k, len(candidates)))
