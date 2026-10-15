from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import settings

ALGORITHM = "HS256"

# Fixed dummy hash so unknown-email login still pays a bcrypt cost.
_DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt()).decode()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def dummy_password_check(password: str) -> None:
    """Burn the same wall-clock as a real verify for unknown emails."""
    try:
        bcrypt.checkpw(password.encode(), _DUMMY_HASH.encode())
    except Exception:
        pass


def create_token(
    user_id: str,
    role: str,
    *,
    token_version: int = 0,
    scope: str | None = None,
) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "role": role,
        "tv": int(token_version),
        "iat": now,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRE_MIN),
    }
    if scope:
        payload["scope"] = scope
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Raises jwt.PyJWTError (or a subclass) on an invalid/expired token."""
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
