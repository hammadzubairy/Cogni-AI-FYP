"""Paper blueprint: page/slide weightage + pinned source counts."""

from __future__ import annotations

from dataclasses import dataclass, field
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


def page_in_set(page: Any, pages: set[int]) -> bool:
    span = parse_page_span(page)
    if span is None or not pages:
        return False
    lo, hi = span
    return any(p in pages for p in range(lo, hi + 1))


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
    page_from: int | None = None,
    page_to: int | None = None,
    pages: list[int] | None = None,
    chunk_idxs: list[int] | None = None,
) -> list[dict]:
    mid = str(material_id)
    page_set = {int(p) for p in (pages or []) if int(p) >= 1}
    idx_set = {int(i) for i in (chunk_idxs or []) if int(i) >= 0}
    if page_from is not None and page_to is not None and not page_set and not idx_set:
        page_set = set(range(int(page_from), int(page_to) + 1))

    selected: list[dict] = []
    for c in chunks:
        if str(c.get("material_id") or "") != mid:
            continue
        if idx_set and int(c.get("idx", -1)) in idx_set:
            selected.append(c)
            continue
        if page_set and page_in_set(c.get("page"), page_set):
            selected.append(c)
    return selected


def _largest_remainder_split(total: int, weights: list[float]) -> list[int]:
    """Split `total` into len(weights) non-negative ints proportional to weights."""
    if total <= 0 or not weights:
        return [0] * len(weights)
    wsum = sum(max(0.0, w) for w in weights)
    if wsum <= 0:
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


def _scope_pages(row: Any) -> tuple[int, int, list[int], list[int]]:
    pages = list(getattr(row, "pages", None) or (row.get("pages") if isinstance(row, dict) else []) or [])
    idxs = list(
        getattr(row, "chunk_idxs", None)
        or (row.get("chunk_idxs") if isinstance(row, dict) else [])
        or []
    )
    pf = getattr(row, "page_from", None)
    if pf is None and isinstance(row, dict):
        pf = row.get("page_from")
    pt = getattr(row, "page_to", None)
    if pt is None and isinstance(row, dict):
        pt = row.get("page_to")
    if pages:
        return min(pages), max(pages), [int(p) for p in pages], [int(i) for i in idxs]
    if pf is not None and pt is not None:
        return int(pf), int(pt), list(range(int(pf), int(pt) + 1)), [int(i) for i in idxs]
    return 1, 1, [], [int(i) for i in idxs]


def _row_material_id(row: Any) -> str:
    mid = row.material_id if hasattr(row, "material_id") else row["material_id"]
    return str(mid)


def _scopes_overlap(
    pages_a: list[int],
    idxs_a: list[int],
    pages_b: list[int],
    idxs_b: list[int],
) -> bool:
    if set(pages_a) & set(pages_b):
        return True
    if set(idxs_a) & set(idxs_b):
        return True
    return False


@dataclass
class GenScope:
    material_id: str
    page_from: int
    page_to: int
    counts: dict[str, int]
    kind: str  # "pin" | "weight"
    pages: list[int] = field(default_factory=list)
    chunk_idxs: list[int] = field(default_factory=list)


def plan_generation_scopes(
    global_counts: dict[str, int],
    *,
    weightage: list[Any] | None,
    pins: list[Any] | None,
) -> list[GenScope]:
    """Pin-aware band allocation: split by weight %, deduct pins from overlapping bands."""
    totals = {k: int(v) for k, v in global_counts.items() if int(v) > 0}
    scopes: list[GenScope] = []
    weight_rows = list(weightage or [])
    pin_rows = list(pins or [])

    # ---- Pins only (no weightage): reserve pins; caller fills remainder ----
    if not weight_rows:
        remaining = dict(totals)
        for pin in pin_rows:
            label = pin.type_label if hasattr(pin, "type_label") else pin["type_label"]
            count = int(pin.count if hasattr(pin, "count") else pin["count"])
            mid = _row_material_id(pin)
            pf, pt, pages, idxs = _scope_pages(pin)
            have = remaining.get(label, 0)
            take = min(count, have)
            if take <= 0:
                continue
            remaining[label] = have - take
            scopes.append(
                GenScope(
                    material_id=mid,
                    page_from=pf,
                    page_to=pt,
                    counts={label: take},
                    kind="pin",
                    pages=pages,
                    chunk_idxs=idxs,
                )
            )
        return scopes

    # ---- Weight bands: split each type by % ----
    weights = [
        float(r.weight_pct if hasattr(r, "weight_pct") else r["weight_pct"]) for r in weight_rows
    ]
    band_meta: list[tuple[str, int, int, list[int], list[int]]] = []
    for row in weight_rows:
        mid = _row_material_id(row)
        pf, pt, pages, idxs = _scope_pages(row)
        band_meta.append((mid, pf, pt, pages, idxs))

    band_quotas: list[dict[str, int]] = [{} for _ in weight_rows]
    for label, need in totals.items():
        parts = _largest_remainder_split(need, weights)
        for i, n in enumerate(parts):
            if n > 0:
                band_quotas[i][label] = n

    # ---- Deduct pins from overlapping band quotas, emit pin scopes ----
    for pin in pin_rows:
        label = pin.type_label if hasattr(pin, "type_label") else pin["type_label"]
        count = int(pin.count if hasattr(pin, "count") else pin["count"])
        if count <= 0 or label not in totals:
            continue
        mid = _row_material_id(pin)
        pf, pt, pages, idxs = _scope_pages(pin)

        # Prefer bands that overlap this pin (same material).
        overlap_idxs = [
            i
            for i, (bmid, _, _, bpages, bidxs) in enumerate(band_meta)
            if bmid == mid and _scopes_overlap(pages, idxs, bpages, bidxs)
        ]
        # Fall back: same material bands, then any band with remaining quota.
        same_mid = [i for i, (bmid, *_) in enumerate(band_meta) if bmid == mid]
        order = overlap_idxs or same_mid or list(range(len(band_meta)))

        taken = 0
        need = count
        for i in order:
            if need <= 0:
                break
            have = band_quotas[i].get(label, 0)
            if have <= 0:
                continue
            take = min(need, have)
            band_quotas[i][label] = have - take
            if band_quotas[i][label] <= 0:
                band_quotas[i].pop(label, None)
            taken += take
            need -= take

        # Steal from any remaining band if pin exceeds preferred band quota.
        if need > 0:
            for i in range(len(band_meta)):
                if need <= 0:
                    break
                if i in order:
                    continue
                have = band_quotas[i].get(label, 0)
                if have <= 0:
                    continue
                take = min(need, have)
                band_quotas[i][label] = have - take
                if band_quotas[i][label] <= 0:
                    band_quotas[i].pop(label, None)
                taken += take
                need -= take

        if taken <= 0:
            continue
        scopes.append(
            GenScope(
                material_id=mid,
                page_from=pf,
                page_to=pt,
                counts={label: taken},
                kind="pin",
                pages=pages,
                chunk_idxs=idxs,
            )
        )

    # ---- Emit remaining weight-band scopes ----
    for i, row in enumerate(weight_rows):
        counts = {k: v for k, v in band_quotas[i].items() if v > 0}
        if not counts:
            continue
        mid, pf, pt, pages, idxs = band_meta[i]
        scopes.append(
            GenScope(
                material_id=mid,
                page_from=pf,
                page_to=pt,
                counts=counts,
                kind="weight",
                pages=pages,
                chunk_idxs=idxs,
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


def shortfall_counts(
    requested: dict[str, int], questions: list[dict]
) -> dict[str, int]:
    """Return missing counts per type after generation."""
    have: dict[str, int] = {}
    for q in questions:
        t = q.get("type")
        if t:
            have[t] = have.get(t, 0) + 1
    out: dict[str, int] = {}
    for label, need in requested.items():
        n = int(need)
        got = have.get(label, 0)
        if got < n:
            out[label] = n - got
    return out
