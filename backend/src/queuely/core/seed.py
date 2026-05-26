from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from queuely.core.config import Settings
from queuely.models.user import User
from queuely.services.security import hash_password


logger = logging.getLogger(__name__)


def seed_superuser(db: Session, settings: Settings) -> None:
    email = (settings.seed_superuser_email or "").strip().lower()
    password = settings.seed_superuser_password or ""
    full_name = settings.seed_superuser_full_name

    if not email or not password:
        return

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            is_active=True,
            is_superuser=False,
        )
        db.add(user)
        db.commit()
        logger.info("seeded_user email=%s created=true", email)
        return

    changed = False
    desired_password_hash = hash_password(password)
    if user.password_hash != desired_password_hash:
        user.password_hash = desired_password_hash
        changed = True
    if user.is_superuser:
        user.is_superuser = False
        changed = True
    if not user.is_active:
        user.is_active = True
        changed = True
    if changed:
        db.commit()
        logger.info("seeded_user email=%s updated=true", email)
