"""
L1 coarse filter — embedding-style similarity over candidate pool.

Production target: text-embedding-3-small + pgvector cosine query.
  120k candidates -> top_k in <50ms, near-zero marginal cost per query.

This implementation is a deterministic stand-in: build an 8-dim affinity
vector from profile text, rank by cosine. Same shape as the production
path so swapping in real embeddings is a 1-file change.
"""
import math
import re
from app.models import Profile

DIMENSIONS = {
    "creativity":   ["art", "design", "music", "writing", "photo", "creative", "aesthetic", "craft", "poetry", "film"],
    "intellectual": ["philosophy", "science", "books", "ideas", "intellectual", "research", "ethics", "consciousness"],
    "ambition":     ["startup", "career", "building", "competitive", "growth", "performance", "discipline", "finance"],
    "adventure":    ["travel", "outdoors", "skiing", "hiking", "adventure", "spontaneous", "surf", "climbing", "camping"],
    "warmth":       ["kind", "compassion", "family", "community", "loyalty", "people", "teaching", "support"],
    "depth":        ["honest", "deep", "vulnerable", "authentic", "genuine", "meaning", "intimacy", "thoughtful"],
    "playful":      ["humor", "playful", "sarcastic", "banter", "jokes", "fun", "podcast", "comedy"],
    "health":       ["fitness", "running", "yoga", "training", "nutrition", "gym", "marathon", "lifting"],
}

def _text(p: Profile) -> str:
    return f"{p.bio} {p.communication_style} {p.looking_for} {' '.join(p.interests)} {' '.join(p.values)}".lower()

def _vec(p: Profile) -> list[float]:
    text = _text(p)
    tokens = set(re.findall(r"[a-z]+", text))
    out = []
    for kws in DIMENSIONS.values():
        hits = sum(1 for kw in kws if kw in tokens or kw in text)
        out.append(min(1.0, hits / 3.0))
    return out

def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    am = math.sqrt(sum(x * x for x in a))
    bm = math.sqrt(sum(x * x for x in b))
    if not am or not bm:
        return 0.5
    return dot / (am * bm)

def _opposite_gender(target: Profile, pool: list[Profile]) -> list[Profile]:
    g = target.gender.lower()
    if g == "female":
        return [c for c in pool if c.gender.lower() == "male"] or pool
    if g == "male":
        return [c for c in pool if c.gender.lower() == "female"] or pool
    return pool

async def l1_coarse_filter(target: Profile, candidates: list[Profile], top_k: int = 100) -> list[Profile]:
    """
    Rank candidate pool by 8-dim affinity cosine similarity.
    Returns top_k. Filters out self and (when defined) opposite-gender pool.
    """
    pool = [c for c in candidates if c.name.lower() != target.name.lower()]
    pool = _opposite_gender(target, pool)
    if not pool:
        return []
    tv = _vec(target)
    scored = [(c, _cosine(tv, _vec(c))) for c in pool]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [c for c, _ in scored[:top_k]]
