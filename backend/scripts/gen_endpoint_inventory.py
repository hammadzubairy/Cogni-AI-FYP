#!/usr/bin/env python3
"""Generate a raw OpenAPI path+method markdown table for docs/test/ENDPOINT_INVENTORY.md.

Sets isolated env, imports app.main:app, calls app.openapi(), and writes a table.
The inventory file is then enriched by hand (roles, side effects, etc.).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Must be set before importing app (pydantic-settings reads env at import time).
os.environ["LLM_PROVIDER"] = "mock"
os.environ["MONGO_DB"] = "cogni_inventory_tmp_dev"
os.environ["JWT_SECRET"] = "test-secret"

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app  # noqa: E402

OUT_PATH = REPO_ROOT / "docs" / "test" / "_openapi_routes_raw.md"


def _ref_name(schema: dict | None) -> str:
    if not schema:
        return "—"
    if "$ref" in schema:
        return schema["$ref"].rsplit("/", 1)[-1]
    if "items" in schema and isinstance(schema["items"], dict) and "$ref" in schema["items"]:
        return f"list[{schema['items']['$ref'].rsplit('/', 1)[-1]}]"
    if "anyOf" in schema or "oneOf" in schema:
        parts = schema.get("anyOf") or schema.get("oneOf") or []
        names = [_ref_name(p) for p in parts if isinstance(p, dict)]
        names = [n for n in names if n != "—"]
        return " | ".join(names) if names else "—"
    if schema.get("type") == "object" and "properties" in schema:
        return "inline object"
    if schema.get("type"):
        return schema["type"]
    return "—"


def request_model(op: dict) -> str:
    body = op.get("requestBody") or {}
    content = body.get("content") or {}
    for media in ("application/json", "multipart/form-data", "*/*"):
        if media in content:
            return _ref_name(content[media].get("schema"))
    return "—"


def response_model(op: dict) -> str:
    responses = op.get("responses") or {}
    for code in ("200", "201", "204"):
        if code not in responses:
            continue
        if code == "204":
            return "204 empty"
        content = (responses[code].get("content") or {})
        for media in ("application/json", "*/*"):
            if media in content:
                return _ref_name(content[media].get("schema"))
        return code
    return "—"


def main() -> None:
    spec = app.openapi()
    rows: list[tuple[str, str, str, str]] = []
    for path, methods in sorted(spec.get("paths", {}).items()):
        for method, op in sorted(methods.items()):
            if method.upper() not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
                continue
            rows.append(
                (
                    method.upper(),
                    path,
                    request_model(op if isinstance(op, dict) else {}),
                    response_model(op if isinstance(op, dict) else {}),
                )
            )

    lines = [
        "# OpenAPI routes (raw)",
        "",
        f"Generated from `app.openapi()` — {len(rows)} operations.",
        "",
        "| Method | Path | Request model | Response model |",
        "|--------|------|---------------|----------------|",
    ]
    for method, path, req, resp in rows:
        lines.append(f"| {method} | {path} | {req} | {resp} |")
    lines.append("")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(rows)} routes)")


if __name__ == "__main__":
    main()
