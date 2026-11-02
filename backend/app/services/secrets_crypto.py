"""Encrypt short secrets at rest (teacher LLM API keys) with Fernet."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet() -> Fernet:
    digest = hashlib.sha256((settings.JWT_SECRET or "cogni-dev").encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_secret(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError) as exc:
        raise ValueError("Stored secret could not be decrypted.") from exc


def mask_secret(plaintext: str) -> str:
    raw = (plaintext or "").strip()
    if len(raw) <= 4:
        return "••••"
    return f"••••{raw[-4:]}"
