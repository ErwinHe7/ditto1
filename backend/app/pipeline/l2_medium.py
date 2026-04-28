import random
from app.models import Profile

async def l2_medium_filter(target: Profile, candidates: list[Profile], top_k: int = 10) -> list[Profile]:
    """
    Production: single 'first_coffee' scenario x 3 turns x 1 judge per pair.
    gpt-4o-mini, ~$0.001/pair. 100 candidates = $0.10, ~20s parallel.
    """
    return random.sample(candidates, min(top_k, len(candidates)))
