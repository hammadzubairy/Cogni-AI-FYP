"""Guard: demo strings must not reappear in runtime app / docs (except audits)."""

from __future__ import annotations

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]  # repo root
BACKEND_APP = ROOT / "backend" / "app"
FRONTEND_SRC = ROOT / "frontend" / "src"
DOCS = ROOT / "docs"
READMES = [ROOT / "README.md", ROOT / "backend" / "README.md", ROOT / "frontend" / "README.md"]

BANNED = [
    "demo123",
    "demo-accounts",
    "demo_accounts",
    "getDemoAccounts",
    "Demo mode",
    "Try the demo",
    "Open the demo",
    "Switch demo",
    "Reset demo",
    "sample data",
    "app.seed",
    "Fall 2026",
    "umt.edu.pk",
]

ALLOW_PATH_PARTS = (
    "REAL_WORKFLOW_AUDIT",
    "REAL_WORKFLOW_REPORT",
    "REAL_WORKFLOW.md",
    "docs/test/",
    "/reference/",
    "test-results",
    "playwright-report",
)


def _iter_files():
    for base in (BACKEND_APP, FRONTEND_SRC):
        for p in base.rglob("*"):
            if p.is_file() and p.suffix in {".py", ".js", ".jsx", ".css", ".md", ".json"}:
                yield p
    for p in READMES:
        if p.exists():
            yield p
    if DOCS.exists():
        for p in DOCS.rglob("*.md"):
            yield p


@pytest.mark.security
def test_no_demo_strings_in_runtime():
    hits: list[str] = []
    for path in _iter_files():
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        if any(a in rel for a in ALLOW_PATH_PARTS):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for ban in BANNED:
            if ban not in text:
                continue
            # purge-demo + common-password list intentionally mention legacy secrets
            if ban in ("demo123", "umt.edu.pk") and rel.endswith(
                ("app/cli.py", "app/services/passwords.py")
            ):
                continue
            hits.append(f"{rel}: contains {ban!r}")
    assert not hits, "Demo leftovers:\n" + "\n".join(hits[:50])
