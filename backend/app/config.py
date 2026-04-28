from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openrouter_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    redis_url: str = "redis://localhost:6379/0"
    database_url: str = "postgresql://postgres:postgres@localhost:5432/ditto"
    n_simulations_per_scenario: int = 5
    llm_concurrency: int = 10

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
