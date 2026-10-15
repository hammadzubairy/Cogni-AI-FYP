"""Vercel / ASGI entrypoint — re-exports the FastAPI app.

Vercel looks for a top-level `app` in main.py (or app.py / index.py).
Locally you can still run: uvicorn app.main:app --reload
"""

from app.main import app

__all__ = ["app"]
