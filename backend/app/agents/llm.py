import asyncio
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
    last_error = None
    for attempt in range(3):
        try:
            resp = await get_client().chat.completions.create(**kwargs)
            content = resp.choices[0].message.content
            if content and content.strip():
                return content
            last_error = ValueError("empty LLM response")
        except Exception as e:
            last_error = e
        if attempt < 2:
            await asyncio.sleep(0.6 * (attempt + 1))
    raise last_error or ValueError("LLM call failed")
