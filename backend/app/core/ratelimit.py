"""Simple in-memory sliding-window rate limiter. Per-process only: fine for
a single-instance deployment, resets on restart. Not shared across workers."""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.core.config import settings
from app.core.deps import CurrentUser


class InMemoryRateLimiter:
    def __init__(self, max_calls: int, window_seconds: float):
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window_seconds:
            hits.popleft()
        if len(hits) >= self.max_calls:
            raise HTTPException(
                status_code=429, detail="Too many requests. Try again in a minute."
            )
        hits.append(now)


login_limiter = InMemoryRateLimiter(
    max_calls=settings.LOGIN_RATE_LIMIT_MAX, window_seconds=60
)
llm_limiter = InMemoryRateLimiter(
    max_calls=settings.LLM_RATE_LIMIT_MAX, window_seconds=60
)


def check_login_rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    login_limiter.check(f"ip:{ip}")


def check_llm_rate_limit(user: CurrentUser) -> None:
    llm_limiter.check(f"user:{user.id}")
