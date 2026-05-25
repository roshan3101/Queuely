from contextlib import asynccontextmanager
import logging
import asyncio

from fastapi import FastAPI
from redis.asyncio import Redis

from queuely.api.routes.auth import router as auth_router
from queuely.api.errors import register_exception_handlers
from queuely.api.routes.jobs import router as jobs_router
from queuely.api.routes.ops import router as ops_router
from queuely.api.routes.system import router as system_router
from queuely.api.routes.ws import router as ws_router
from queuely.core.config import get_settings
from queuely.core.logging import configure_logging
from queuely.core.middleware import RequestContextMiddleware
from queuely.websocket.manager import WebSocketManager
from queuely.websocket.redis_fanout import run_fanout


settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
    app.state.redis = redis_client
    app.state.ws_manager = WebSocketManager()
    stop_event = asyncio.Event()
    fanout_task = asyncio.create_task(run_fanout(redis_client, app.state.ws_manager, stop_event))
    logger.info("Application startup complete")
    try:
        yield
    finally:
        stop_event.set()
        fanout_task.cancel()
        try:
            await fanout_task
        except Exception:
            pass
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
    app.include_router(jobs_router)
    app.include_router(ops_router)
    app.include_router(system_router)
    app.include_router(ws_router)

    @app.get("/health", tags=["system"])
    async def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
