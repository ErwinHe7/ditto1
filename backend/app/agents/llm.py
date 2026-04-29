from openai import AsyncOpenAI
from app.config import settings

REPLICA_MODEL = "anthropic/claude-haiku-4.5"        # persona agents — fast
JUDGE_CHEMISTRY_MODEL = "openai/gpt-5.5"            # chemistry judge
JUDGE_VALUES_MODEL = "anthropic/claude-opus-4.7"    # values judge
SUMMARY_MODEL = "anthropic/claude-haiku-4.5"

def get_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=settings.openrouter_api_key,
        base_url="https://api.tokenrouter.com/v1",
    )

async def chat(msgs: list[dict], model: str, temperature=0.9, max_tokens=200, json_mode=False) -> str:
    kwargs = {
        "model": model,
        "messages": msgs,
        "max_tokens": max_tokens,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = await get_client().chat.completions.create(**kwargs)
    return resp.choices[0].message.content
