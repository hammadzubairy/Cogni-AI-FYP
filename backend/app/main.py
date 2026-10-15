from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import lifespan
from app.core.errors import register_exception_handlers
from app.core.logging import setup_logging
from app.core.middleware import RequestLoggingMiddleware, RequestSizeLimitMiddleware
from app.routers import (
    admin,
    attempts,
    auth,
    classes,
    dashboard,
    exams,
    materials,
    notifications,
    public,
    requests,
    setup,
)

setup_logging()

app = FastAPI(title="Cogni.ai API", lifespan=lifespan)

app.add_middleware(RequestLoggingMiddleware)

app.add_middleware(RequestSizeLimitMiddleware, max_bytes=settings.MAX_REQUEST_MB * 1024 * 1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(public.router)
app.include_router(setup.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(classes.router)
app.include_router(materials.router)
app.include_router(exams.router)
app.include_router(attempts.router)
app.include_router(requests.router)
app.include_router(notifications.router)
app.include_router(dashboard.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
