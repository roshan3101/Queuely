from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from redis.asyncio import Redis

from queuely.api.routes.auth import router as auth_router
from queuely.api.errors import register_exception_handlers
from queuely.api.routes.system import router as system_router
from queuely.core.config import get_settings
from queuely.core.logging import configure_logging
from queuely.core.middleware import RequestContextMiddleware


settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
    app.state.redis = redis_client
    logger.info("Application startup complete")
    try:
        yield
    finally:
        await redis_client.aclose()
        logger.info("Application shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.project_name,
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )
    app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(app)
    app.include_router(auth_router)
    app.include_router(system_router)

    @app.get("/health", tags=["system"])
    async def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
