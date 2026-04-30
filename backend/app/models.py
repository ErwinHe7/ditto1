from pydantic import BaseModel
from typing import Literal

class Profile(BaseModel):
    name: str
    age: int
    gender: str
    bio: str
    interests: list[str]
    communication_style: str
    values: list[str]
    deal_breakers: list[str] = []
    looking_for: str
    relationship_intent: str = "unsure"
    chat_history: str = ""

class JudgeScore(BaseModel):
    judge_id: str
    chemistry: int
    values_alignment: int
    energy_match: int
    conflict_handling: int
    curiosity: int
    overall: int
    reasoning: str

class BehaviorImpact(BaseModel):
    loop_index: int
    target: str
    delta: int
    reason: str

class MatchBreakdown(BaseModel):
    chemistry: int
    values_alignment: int
    emotional_safety: int
    conflict_handling: int
    long_term_risk: str
    score_increased: list[str] = []
    score_lowered: list[str] = []

class ScenarioResult(BaseModel):
    scenario_id: str
    scenario_name: str
    transcripts: list[list[dict]]
    judge_scores: list[JudgeScore]
    avg_score: float = 0.0
    trimmed_avg_score: float = 0.0
    behavior_impacts: list[BehaviorImpact] = []

class BestMatch(BaseModel):
    name: str
    score: float
    bio: str
    tag: str = ""
    gender: str = ""

class ScoutMatch(BestMatch):
    age: int
    why: str = ""
    boosters: list[str] = []
    profile: Profile

class CompatibilityReport(BaseModel):
    profile_a: Profile
    profile_b: Profile
    scenario_results: list[ScenarioResult]
    overall_score: int
    trimmed_overall_score: int = 0
    confidence: float
    recommendation: Literal["strong_match", "promising", "uncertain", "skip"]
    summary: str
    breakdown: MatchBreakdown | None = None
    next_chat_suggestions: list[str] = []
    affection_score: int = 0
    affection_tips: list[str] = []
    pa_best_matches: list[BestMatch] = []
    pb_best_matches: list[BestMatch] = []
