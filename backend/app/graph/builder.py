"""
Simulation graph: pure async loop, no LangGraph dependency.
Same conceptual state machine: A speaks -> B speaks -> check -> repeat.
"""
from app.graph.state import SimulationState
from app.graph.nodes import agent_a_speaks, agent_b_speaks, should_continue, finalize

async def run_simulation(initial_state: SimulationState) -> SimulationState:
    state = dict(initial_state)
    state["msgs"] = []
    state["turn"] = 0
    state["finished"] = False

    while True:
        update = await agent_a_speaks(state)
        state["msgs"] = state["msgs"] + update["msgs"]
        state["turn"] = update["turn"]

        update = await agent_b_speaks(state)
        state["msgs"] = state["msgs"] + update["msgs"]
        state["turn"] = update["turn"]

        if should_continue(state) == "end":
            break

    await finalize(state)
    return state
