from typing import TypedDict, Annotated
from operator import add

class SimulationState(TypedDict):
    profile_a: dict
    profile_b: dict
    scenario: dict
    msgs: Annotated[list[dict], add]
    turn: int
    max_turns: int
    finished: bool
