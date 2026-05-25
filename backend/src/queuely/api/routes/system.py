import asyncio

from fastapi import APIRouter, Depends
from redis.asyncio import Redis

from queuely.api.dependencies import get_redis, get_request_id
from queuely.core.responses import ApiResponse
from queuely.db.health import check_database


router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health/live", response_model=ApiResponse[dict[str, str]])
async def liveness(request_id: str | None = Depends(get_request_id)) -> ApiResponse[dict[str, str]]:
    return ApiResponse(data={"status": "ok"}, request_id=request_id)


@router.get("/health/ready", response_model=ApiResponse[dict[str, object]])
async def readiness(
    redis_client: Redis = Depends(get_redis),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[dict[str, object]]:
    database_ok, redis_ok = await asyncio.gather(
        asyncio.to_thread(check_database),
        redis_client.ping(),
    )
    return ApiResponse(
        data={
            "status": "ok" if database_ok and redis_ok else "degraded",
            "checks": {
                "database": database_ok,
                "redis": bool(redis_ok),
            },
        },
        request_id=request_id,
    )
