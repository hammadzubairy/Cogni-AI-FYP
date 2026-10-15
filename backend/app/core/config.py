from pydantic_settings import BaseSettings, SettingsConfigDict


_WEAK_JWT = frozenset({"", "change-me", "changeme", "secret", "jwt-secret", "test"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "production"  # development | test | production
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB: str = "cogni"
    JWT_SECRET: str = "change-me"
    JWT_EXPIRE_MIN: int = 1440
    LLM_PROVIDER: str = "mock"
    LLM_MODEL: str = ""
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = ""
    AI_DETECTOR: str = "heuristic"
    CORS_ORIGINS: str = "http://localhost:5173"
    MAX_UPLOAD_MB: int = 25
    MAX_REQUEST_MB: int = 50
    LOGIN_RATE_LIMIT_MAX: int = 10
    LLM_RATE_LIMIT_MAX: int = 20

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_STARTTLS: bool = True
    PUBLIC_BASE_URL: str = "http://localhost:5173"
    PASSWORD_RESET_MINUTES: int = 30
    EMAIL_VERIFY_MINUTES: int = 60
    LOGIN_LOCKOUT_FAILURES: int = 8
    LOGIN_LOCKOUT_MINUTES: int = 10

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.strip().lower() == "production"

    @property
    def is_test(self) -> bool:
        return self.APP_ENV.strip().lower() == "test"


settings = Settings()


def assert_production_safe() -> None:
    """Raise RuntimeError naming the bad variable when APP_ENV=production."""
    if not settings.is_production:
        return
    secret = (settings.JWT_SECRET or "").strip()
    if len(secret) < 32 or secret.lower() in _WEAK_JWT:
        raise RuntimeError(
            "JWT_SECRET must be set to a strong secret of at least 32 characters "
            "(not a placeholder like change-me) when APP_ENV=production."
        )
    if settings.LLM_PROVIDER.strip().lower() == "mock":
        raise RuntimeError(
            "LLM_PROVIDER=mock is not allowed when APP_ENV=production."
        )
    if "*" in settings.cors_origins_list:
        raise RuntimeError(
            "CORS_ORIGINS must not contain '*' when APP_ENV=production."
        )
    db = settings.MONGO_DB.strip().lower()
    if db.endswith(("_dev", "_demo", "_test")):
        raise RuntimeError(
            f"MONGO_DB={settings.MONGO_DB!r} looks like a throwaway name; "
            "refusing to start in production."
        )
