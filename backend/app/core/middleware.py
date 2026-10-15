import logging
import time
import uuid

from fastapi.responses import JSONResponse
from jwt import PyJWTError

from app.core.logging import log_event
from app.core.security import decode_token

request_logger = logging.getLogger("app.request")


class RequestSizeLimitMiddleware:
    """Rejects requests whose declared Content-Length exceeds `max_bytes`,
    before the body is read. A defence-in-depth cap; `/materials` enforces
    its own (admin-configurable) upload limit on top of this."""

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = dict(scope.get("headers") or [])
            content_length = headers.get(b"content-length")
            if content_length is not None:
                try:
                    too_big = int(content_length) > self.max_bytes
                except ValueError:
                    too_big = False
                if too_big:
                    response = JSONResponse(
                        status_code=413,
                        content={"detail": "Request body too large.", "code": "PAYLOAD_TOO_LARGE"},
                    )
                    await response(scope, receive, send)
                    return
        await self.app(scope, receive, send)


def _user_id_from_headers(raw_headers: list[tuple[bytes, bytes]]) -> str | None:
    headers = dict(raw_headers)
    auth = (headers.get(b"authorization") or b"").decode("latin-1")
    if not auth.lower().startswith("bearer "):
        return None
    try:
        payload = decode_token(auth[7:])
        return payload.get("sub")
    except PyJWTError:
        return None


class RequestLoggingMiddleware:
    """Plain ASGI (not BaseHTTPMiddleware) so an unhandled exception in a
    route still propagates to the registered generic exception handler
    instead of being swallowed/re-raised by BaseHTTPMiddleware's call_next.
    Logs request id, method, path, status code, latency and the decoded
    user id (never the bearer token itself)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())
        start = time.monotonic()
        status_code = 500
        user_id = _user_id_from_headers(scope.get("headers") or [])

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                message["headers"] = [
                    *message.get("headers", []),
                    (b"x-request-id", request_id.encode()),
                ]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            log_event(
                request_logger,
                "request",
                request_id=request_id,
                method=scope.get("method"),
                path=scope.get("path"),
                status_code=status_code,
                latency_ms=round((time.monotonic() - start) * 1000, 1),
                user_id=user_id,
            )
