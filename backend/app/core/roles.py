"""Multi-role helpers. Users store `roles: list[str]`; legacy docs may only have `role`."""

from __future__ import annotations

from typing import Iterable

VALID_ROLES = ("admin", "hod", "teacher", "student")
# Higher first — used as denormalized default `role` for listings.
ROLE_PRIORITY = ("admin", "hod", "teacher", "student")


def normalize_roles(roles: Iterable[str] | None, *, fallback: str | None = None) -> list[str]:
    """Unique roles; hod implies teacher; ordered by ROLE_PRIORITY."""
    raw = [str(r).strip().lower() for r in (roles or []) if r]
    if not raw and fallback:
        raw = [fallback]
    seen: set[str] = set()
    out: list[str] = []
    for r in raw:
        if r not in VALID_ROLES or r in seen:
            continue
        seen.add(r)
        out.append(r)
    if "hod" in seen and "teacher" not in seen:
        seen.add("teacher")
        out.append("teacher")
    if not out:
        raise ValueError("At least one role is required.")
    return sorted(out, key=lambda r: ROLE_PRIORITY.index(r))


def user_roles(doc: dict | None) -> list[str]:
    """Read roles from a user document (supports legacy singular `role`)."""
    if not doc:
        return []
    if isinstance(doc.get("roles"), list) and doc["roles"]:
        try:
            return normalize_roles(doc["roles"])
        except ValueError:
            pass
    legacy = doc.get("role")
    if legacy:
        try:
            return normalize_roles([legacy])
        except ValueError:
            return []
    return []


def primary_role(roles: list[str]) -> str:
    """Denormalized singular role for admin filters / activity logs."""
    if not roles:
        raise ValueError("roles empty")
    for r in ROLE_PRIORITY:
        if r in roles:
            return r
    return roles[0]


def has_role(doc: dict | None, role: str) -> bool:
    return role in user_roles(doc)


def roles_query(role: str) -> dict:
    """Mongo filter matching users who hold `role` (array or legacy singular)."""
    return {"$or": [{"roles": role}, {"role": role, "roles": {"$exists": False}}]}


def with_roles_fields(roles: list[str]) -> dict:
    """Fields to $set when writing roles onto a user."""
    norm = normalize_roles(roles)
    return {"roles": norm, "role": primary_role(norm)}


def add_role(doc: dict, role: str) -> list[str]:
    return normalize_roles([*user_roles(doc), role])


def remove_role(doc: dict, role: str) -> list[str]:
    remaining = [r for r in user_roles(doc) if r != role]
    if not remaining:
        raise ValueError("Cannot remove the last role.")
    return normalize_roles(remaining)
