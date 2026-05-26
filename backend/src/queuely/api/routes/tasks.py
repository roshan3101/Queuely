from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.orm import Session

from queuely.api.auth import require_active_user
from queuely.api.dependencies import get_db_session, get_request_id
from queuely.api.rate_limit import rate_limit_job_submission
from queuely.core.responses import ApiResponse
from queuely.models.job import JobStatus, JobType
from queuely.models.user import User
from queuely.schemas.jobs import JobCancelResponse, JobListResponse, JobRead, JobSubmitRequest
from queuely.services.jobs import cancel_job, get_job_for_user, list_jobs_for_user, serialize_job, submit_job


router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", response_model=ApiResponse[JobRead], status_code=status.HTTP_202_ACCEPTED)
def create_task(
    payload: JobSubmitRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    _: None = Depends(rate_limit_job_submission),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[JobRead]:
    job = submit_job(session=session, user=current_user, payload=payload, idempotency_key=idempotency_key)
    return ApiResponse(data=job, request_id=request_id)


@router.get("", response_model=ApiResponse[JobListResponse])
def list_tasks(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: JobStatus | None = Query(default=None),
    job_type: JobType | None = Query(default=None),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[JobListResponse]:
    tasks = list_jobs_for_user(
        session=session,
        user=current_user,
        limit=limit,
        offset=offset,
        status=status,
        job_type=job_type,
    )
    return ApiResponse(data=tasks, request_id=request_id)


@router.get("/{task_id}", response_model=ApiResponse[JobRead])
def get_task(
    task_id: str,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[JobRead]:
    job = get_job_for_user(session=session, user=current_user, job_id=task_id)
    return ApiResponse(data=serialize_job(job), request_id=request_id)


@router.post("/{task_id}/cancel", response_model=ApiResponse[JobCancelResponse])
def cancel_task(
    task_id: str,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(require_active_user),
    request_id: str | None = Depends(get_request_id),
) -> ApiResponse[JobCancelResponse]:
    result = cancel_job(session=session, user=current_user, job_id=task_id)
    return ApiResponse(data=result, request_id=request_id)