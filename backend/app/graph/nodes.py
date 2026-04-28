from app.models import Profile
from app.agents.persona import build_persona_prompt
from app.agents.llm import chat, REPLICA_MODEL

STOP_WORDS = {"good night", "see you", "bye", "gotta go", "talk tomorrow", "night!", "goodnight"}

def _build_chat_msgs(state, speaker):
    pa = Profile(**state["profile_a"])
    pb = Profile(**state["profile_b"])
    scenario = state["scenario"]

    if speaker == "A":
        sys = build_persona_prompt(pa, pb.name, scenario)
        own, other = "A", "B"
    else:
        sys = build_persona_prompt(pb, pa.name, scenario)
        own, other = "B", "A"

    msgs = [{"role": "system", "content": sys}]
    for m in state["msgs"]:
        role = "assistant" if m["speaker"] == own else "user"
        msgs.append({"role": role, "content": m["text"]})

    # seed first turn if no user message yet
    if not any(m["role"] == "user" for m in msgs[1:]):
        msgs.append({"role": "user", "content": "Hey."})

    return msgs

async def agent_a_speaks(state):
    msgs = _build_chat_msgs(state, "A")
    text = await chat(msgs, REPLICA_MODEL)
    return {"msgs": [{"speaker": "A", "text": text}], "turn": state["turn"] + 1}

async def agent_b_speaks(state):
    msgs = _build_chat_msgs(state, "B")
    text = await chat(msgs, REPLICA_MODEL)
    return {"msgs": [{"speaker": "B", "text": text}], "turn": state["turn"] + 1}

def should_continue(state):
    if state["turn"] >= state["max_turns"]:
        return "end"
    if state["msgs"]:
        last = state["msgs"][-1]["text"].lower()
        if any(w in last for w in STOP_WORDS):
            return "end"
    return "continue"

async def finalize(state):
    return {"finished": True}
