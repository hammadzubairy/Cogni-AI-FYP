"""Password policy, temporary secrets, and common-password rejection."""

from __future__ import annotations

import secrets
import string

# Compact top-common list (lowercase). Enough to block obvious choices.
_COMMON = frozenset(
    {
        "password",
        "password1",
        "password12",
        "password123",
        "123456",
        "1234567",
        "12345678",
        "123456789",
        "1234567890",
        "qwerty",
        "qwerty123",
        "abc123",
        "abcdef",
        "letmein",
        "welcome",
        "welcome1",
        "admin",
        "admin123",
        "root",
        "passw0rd",
        "iloveyou",
        "monkey",
        "dragon",
        "master",
        "login",
        "princess",
        "football",
        "baseball",
        "starwars",
        "shadow",
        "sunshine",
        "trustno1",
        "whatever",
        "donald",
        "access",
        "hello",
        "charlie",
        "donald",
        "freedom",
        "whatever",
        "qazwsx",
        "michael",
        "jennifer",
        "hunter",
        "buster",
        "soccer",
        "hockey",
        "ranger",
        "jordan",
        "harley",
        "batman",
        "andrew",
        "tigger",
        "robert",
        "matthew",
        "daniel",
        "ashley",
        "bailey",
        "pass",
        "pass1234",
        "changeme",
        "secret",
        "secret123",
        "demo123",
        "test",
        "test1234",
        "testing",
        "guest",
        "default",
        "p@ssw0rd",
        "p@ssword",
        "1q2w3e4r",
        "zaq12wsx",
        "111111",
        "000000",
        "654321",
        "superman",
        "pokemon",
        "killer",
        "pepper",
        "cheese",
        "computer",
        "internet",
        "mustang",
        "cookie",
        "pepper",
        "flower",
        "summer",
        "winter",
        "spring",
        "autumn",
        "orange",
        "purple",
        "silver",
        "golden",
        "junior",
        "senior",
        "school",
        "college",
        "teacher",
        "student",
        "cogni",
        "cogni123",
        "cogni.ai",
    }
)


def validate_password(password: str, *, email: str = "", name: str = "") -> str | None:
    """Return an error message, or None if the password is acceptable."""
    if not isinstance(password, str):
        return "Password is required."
    if len(password) < 10:
        return "Password must be at least 10 characters."
    if len(password) > 128:
        return "Password is too long."
    lowered = password.lower()
    if lowered in _COMMON:
        return "Choose a less common password."
    email_l = (email or "").strip().lower()
    if email_l and (lowered == email_l or lowered == email_l.split("@")[0]):
        return "Password must not match your email."
    name_l = (name or "").strip().lower()
    if name_l and lowered == name_l:
        return "Password must not match your name."
    return None


def generate_temporary_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    # Ensure mix of classes
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c.isdigit() for c in pw)
            and validate_password(pw) is None
        ):
            return pw


def hash_reset_token(token: str) -> str:
    import hashlib

    return hashlib.sha256(token.encode("utf-8")).hexdigest()
