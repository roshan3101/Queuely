from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    project_name: str = Field(default="Queuely", alias="PROJECT_NAME")
    environment: Literal["development", "staging", "production", "test"] = Field(
        default="development",
        alias="ENVIRONMENT",
    )
    api_host: str = Field(default="0.0.0.0", alias="API_HOST")
    api_port: int = Field(default=8000, alias="API_PORT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    database_url: str = Field(..., alias="DATABASE_URL")
    redis_host: str = Field(default="redis", alias="REDIS_HOST")
    redis_port: int = Field(default=6379, alias="REDIS_PORT")
    redis_db: int = Field(default=0, alias="REDIS_DB")
    redis_password: str | None = Field(default=None, alias="REDIS_PASSWORD")
    celery_broker_url: str = Field(..., alias="CELERY_BROKER_URL")
    celery_result_backend: str = Field(..., alias="CELERY_RESULT_BACKEND")
    jwt_secret_key: str = Field(..., alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=60, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_minutes: int = Field(default=10080, alias="REFRESH_TOKEN_EXPIRE_MINUTES")
    rate_limit_capacity: int = Field(default=60, alias="RATE_LIMIT_CAPACITY")
    rate_limit_refill_rate: float = Field(default=1.0, alias="RATE_LIMIT_REFILL_RATE")
    websocket_ping_interval: int = Field(default=30, alias="WEBSOCKET_PING_INTERVAL")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4.1-mini", alias="OPENAI_MODEL")
    openai_embedding_model: str = Field(default="text-embedding-ada-002", alias="OPENAI_EMBEDDING_MODEL")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    prompt_max_input_tokens: int = Field(default=6000, alias="PROMPT_MAX_INPUT_TOKENS")
    prompt_response_headroom_tokens: int = Field(default=1200, alias="PROMPT_RESPONSE_HEADROOM_TOKENS")
    prompt_system_budget_tokens: int = Field(default=900, alias="PROMPT_SYSTEM_BUDGET_TOKENS")
    prompt_memory_budget_tokens: int = Field(default=1200, alias="PROMPT_MEMORY_BUDGET_TOKENS")
    prompt_code_budget_tokens: int = Field(default=1800, alias="PROMPT_CODE_BUDGET_TOKENS")
    prompt_history_budget_tokens: int = Field(default=1600, alias="PROMPT_HISTORY_BUDGET_TOKENS")
    prompt_summary_budget_tokens: int = Field(default=500, alias="PROMPT_SUMMARY_BUDGET_TOKENS")
    prompt_recent_messages_limit: int = Field(default=20, alias="PROMPT_RECENT_MESSAGES_LIMIT")
    retrieval_top_k: int = Field(default=5, alias="RETRIEVAL_TOP_K")
    retrieval_candidate_limit: int = Field(default=20, alias="RETRIEVAL_CANDIDATE_LIMIT")
    retrieval_min_similarity_score: float = Field(default=0.72, alias="RETRIEVAL_MIN_SIMILARITY_SCORE")
    retrieval_recency_boost_factor: float = Field(default=0.2, alias="RETRIEVAL_RECENCY_BOOST_FACTOR")
    retrieval_recency_half_life_hours: int = Field(default=72, alias="RETRIEVAL_RECENCY_HALF_LIFE_HOURS")
    retrieval_min_content_length: int = Field(default=4, alias="RETRIEVAL_MIN_CONTENT_LENGTH")
    memory_retention_messages_per_user: int = Field(default=500, alias="MEMORY_RETENTION_MESSAGES_PER_USER")
    memory_retention_max_age_days: int = Field(default=180, alias="MEMORY_RETENTION_MAX_AGE_DAYS")
    cors_origins_raw: str = Field(default="http://localhost:3000", alias="CORS_ORIGINS")
    trusted_hosts_raw: str = Field(default="localhost,127.0.0.1", alias="TRUSTED_HOSTS")
    max_upload_size_bytes: int = Field(default=5 * 1024 * 1024, alias="MAX_UPLOAD_SIZE_BYTES")
    max_request_size_bytes: int = Field(default=2 * 1024 * 1024, alias="MAX_REQUEST_SIZE_BYTES")
    smtp_host: str | None = Field(default=None, alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_username: str | None = Field(default=None, alias="SMTP_USERNAME")
    smtp_password: str | None = Field(default=None, alias="SMTP_PASSWORD")
    smtp_use_tls: bool = Field(default=True, alias="SMTP_USE_TLS")
    smtp_from_email: str | None = Field(default=None, alias="SMTP_FROM_EMAIL")
    pdf_max_pages: int = Field(default=100, alias="PDF_MAX_PAGES")
    pdf_max_file_size_bytes: int = Field(default=25 * 1024 * 1024, alias="PDF_MAX_FILE_SIZE_BYTES")
    pdf_allowed_roots_raw: str = Field(default="backend/storage/uploads,.", alias="PDF_ALLOWED_ROOTS")
    pdf_enable_ocr: bool = Field(default=True, alias="PDF_ENABLE_OCR")
    pdf_enable_table_extraction: bool = Field(default=True, alias="PDF_ENABLE_TABLE_EXTRACTION")
    pdf_ocr_dpi_scale: float = Field(default=2.0, alias="PDF_OCR_DPI_SCALE")
    pdf_scan_text_threshold: int = Field(default=24, alias="PDF_SCAN_TEXT_THRESHOLD")
    tesseract_cmd: str | None = Field(default=None, alias="TESSERACT_CMD")

    @property
    def redis_url(self) -> str:
        auth_part = ""
        if self.redis_password:
            auth_part = f":{self.redis_password}@"
        return f"redis://{auth_part}{self.redis_host}:{self.redis_port}/{self.redis_db}"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

    @property
    def trusted_hosts(self) -> list[str]:
        return [host.strip() for host in self.trusted_hosts_raw.split(",") if host.strip()]

    @property
    def pdf_allowed_roots(self) -> list[str]:
        return [path.strip() for path in self.pdf_allowed_roots_raw.split(",") if path.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
