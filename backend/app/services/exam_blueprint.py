"""Paper blueprint: page/slide weightage + pinned source counts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def parse_page_span(page: Any) -> tuple[int, int] | None:
    """Return (lo, hi) inclusive page numbers, or None if unknown."""
    if page is None:
        return None
    if isinstance(page, bool):
        return None
    if isinstance(page, int):
        return (page, page) if page >= 1 else None
    if isinstance(page, float) and page == int(page) and page >= 1:
        return (int(page), int(page))
    if isinstance(page, str):
        s = page.strip()
        if not s:
            return None
        if "-" in s:
            a, _, b = s.partition("-")
            try:
                lo, hi = int(a.strip()), int(b.strip())
            except ValueError:
                return None
            if lo < 1 or hi < 1:
                return None
            return (min(lo, hi), max(lo, hi))
        try:
            n = int(s)
        except ValueError:
            return None
        return (n, n) if n >= 1 else None
    return None


def pages_overlap(page: Any, page_from: int, page_to: int) -> bool:
    span = parse_page_span(page)
    if span is None:
        return False
    lo, hi = span
    return not (hi < page_from or lo > page_to)


def tag_chunks_with_material(materials: list[dict]) -> list[dict]:
    """Flatten material chunks and stamp material_id (and preserve idx)."""
    out: list[dict] = []
    for m in materials:
        mid = str(m.get("id") or m.get("_id") or "")
        for c in m.get("chunks") or []:
            if not isinstance(c, dict):
                continue
            tagged = dict(c)
            tagged["material_id"] = mid
            out.append(tagged)
    return out


def chunks_for_pages(
    chunks: list[dict],
    *,
    material_id: str,
    page_from: int,
    page_to: int,
) -> list[dict]:
    mid = str(material_id)
    return [
        c
        for c in chunks
        if str(c.get("material_id") or "") == mid
        and pages_overlap(c.get("page"), page_from, page_to)
    ]


def _largest_remainder_split(total: int, weights: list[float]) -> list[int]:
    """Split `total` into len(weights) non-negative ints proportional to weights."""
    if total <= 0 or not weights:
        return [0] * len(weights)
    wsum = sum(max(0.0, w) for w in weights)
    if wsum <= 0:
        # Even split fallback
        base = total // len(weights)
        rem = total % len(weights)
        return [base + (1 if i < rem else 0) for i in range(len(weights))]
    raw = [total * max(0.0, w) / wsum for w in weights]
    floors = [int(x) for x in raw]
    leftover = total - sum(floors)
    order = sorted(range(len(weights)), key=lambda i: raw[i] - floors[i], reverse=True)
    for i in order[:leftover]:
        floors[i] += 1
    return floors


@dataclass
class GenScope:
    material_id: str
    page_from: int
    page_to: int
    counts: dict[str, int]
    kind: str  # "pin" | "weight"


def plan_generation_scopes(
    global_counts: dict[str, int],
    *,
    weightage: list[Any] | None,
    pins: list[Any] | None,
) -> list[GenScope]:
    """Reserve pin counts, split the remainder across weightage ranges by %."""
    remaining = {k: int(v) for k, v in global_counts.items() if int(v) > 0}
    scopes: list[GenScope] = []

    for pin in pins or []:
        label = pin.type_label if hasattr(pin, "type_label") else pin["type_label"]
        count = int(pin.count if hasattr(pin, "count") else pin["count"])
        mid = pin.material_id if hasattr(pin, "material_id") else pin["material_id"]
        pf = int(pin.page_from if hasattr(pin, "page_from") else pin["page_from"])
        pt = int(pin.page_to if hasattr(pin, "page_to") else pin["page_to"])
        have = remaining.get(label, 0)
        take = min(count, have)
        if take <= 0:
            continue
        remaining[label] = have - take
        scopes.append(
            GenScope(
                material_id=str(mid),
                page_from=pf,
                page_to=pt,
                counts={label: take},
                kind="pin",
            )
        )

    weight_rows = list(weightage or [])
    rem_total = sum(remaining.values())
    if rem_total <= 0:
        return scopes

    if not weight_rows:
        # No weightage: one synthetic “all remaining” scope is handled by caller
        # using full chunk pool — signal via empty weight scopes.
        return scopes

    weights = [
        float(r.weight_pct if hasattr(r, "weight_pct") else r["weight_pct"]) for r in weight_rows
    ]
    # Allocate each type separately so proportions stay fair.
    per_row: list[dict[str, int]] = [{} for _ in weight_rows]
    for label, need in remaining.items():
        if need <= 0:
            continue
        parts = _largest_remainder_split(need, weights)
        for i, n in enumerate(parts):
            if n > 0:
                per_row[i][label] = n

    for i, row in enumerate(weight_rows):
        counts = {k: v for k, v in per_row[i].items() if v > 0}
        if not counts:
            continue
        mid = row.material_id if hasattr(row, "material_id") else row["material_id"]
        pf = int(row.page_from if hasattr(row, "page_from") else row["page_from"])
        pt = int(row.page_to if hasattr(row, "page_to") else row["page_to"])
        scopes.append(
            GenScope(
                material_id=str(mid),
                page_from=pf,
                page_to=pt,
                counts=counts,
                kind="weight",
            )
        )
    return scopes


def remaining_counts_after_pins(
    global_counts: dict[str, int], pins: list[Any] | None
) -> dict[str, int]:
    remaining = {k: int(v) for k, v in global_counts.items() if int(v) > 0}
    for pin in pins or []:
        label = pin.type_label if hasattr(pin, "type_label") else pin["type_label"]
        count = int(pin.count if hasattr(pin, "count") else pin["count"])
        if label in remaining:
            remaining[label] = max(0, remaining[label] - count)
    return {k: v for k, v in remaining.items() if v > 0}
