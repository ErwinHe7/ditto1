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

class JudgeScore(BaseModel):
    judge_id: str
    chemistry: int
    values_alignment: int
    energy_match: int
    conflict_handling: int
    curiosity: int
    overall: int
    reasoning: str

class ScenarioResult(BaseModel):
    scenario_id: str
    scenario_name: str
    transcripts: list[list[dict]]
    judge_scores: list[JudgeScore]
    avg_score: float = 0.0
    trimmed_avg_score: float = 0.0

class BestMatch(BaseModel):
    name: str
    score: float
    bio: str
    tag: str = ""
    gender: str = ""

class CompatibilityReport(BaseModel):
    profile_a: Profile
    profile_b: Profile
    scenario_results: list[ScenarioResult]
    overall_score: int
    trimmed_overall_score: int = 0
    confidence: float
    recommendation: Literal["strong_match", "promising", "uncertain", "skip"]
    summary: str
    pa_best_matches: list[BestMatch] = []
    pb_best_matches: list[BestMatch] = []
