from datetime import UTC, datetime

from fastapi import HTTPException

from app.core.config import settings as app_settings
from app.core.db import get_db, oid, to_out
from app.core.deps import CurrentUser
from app.services import settings as settings_service
from app.services.chunker import chunk_pages
from app.services.notify import log_activity, notify
from app.services.pdf import extract_pdf_pages

PDF_MAGIC = b"%PDF"
MIN_PASTED_CHARS = 300


async def _get_class_or_404(class_id: str) -> dict:
    db = get_db()
    cls = await db.classes.find_one({"_id": oid(class_id)})
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found.")
    return cls


def _assert_read_access(user: CurrentUser, cls: dict) -> None:
    if user.role == "admin":
        return
    if user.role == "teacher" and cls["teacher_id"] == user.id:
        return
    if user.role == "hod" and cls["dept_id"] == user.dept_id:
        return
    if user.role == "student" and user.id in cls.get("student_ids", []):
        return
    raise HTTPException(status_code=403, detail="You do not have access to this class.")


def _assert_teacher_owns(user: CurrentUser, cls: dict) -> None:
    if user.role != "teacher" or cls["teacher_id"] != user.id:
        raise HTTPException(status_code=403, detail="You do not own this class.")


async def _max_upload_bytes() -> int:
    doc = await settings_service.get_settings()
    mb = doc.get("max_upload_mb") if doc else None
    return (mb or app_settings.MAX_UPLOAD_MB) * 1024 * 1024


def _word_count(text: str) -> int:
    return len(text.split())


def _material_summary(doc: dict) -> dict:
    out = to_out(doc)
    out["chunk_count"] = len(doc.get("chunks", []))
    out["word_count"] = _word_count(doc.get("text", ""))
    out.pop("text", None)
    out.pop("chunks", None)
    return out


async def _insert_material(
    actor: CurrentUser, cls: dict, *, name: str, kind: str, text: str, chunks: list[dict]
) -> dict:
    db = get_db()
    doc = {
        "class_id": str(cls["_id"]),
        "owner_id": actor.id,
        "name": name,
        "kind": kind,
        "text": text,
        "chunks": chunks,
        "created_at": datetime.now(UTC),
    }
    result = await db.materials.insert_one(doc)
    doc["_id"] = result.inserted_id

    await notify(
        cls.get("student_ids", []),
        f"New material in {cls['code']}: {name}",
        "materials",
        str(result.inserted_id),
        actor.id,
    )
    await log_activity(actor, f"Uploaded material '{name}' to {cls['code']}")
    return _material_summary(doc)


async def upload_pdf_material(
    actor: CurrentUser, class_id: str, *, filename: str, data: bytes
) -> dict:
    cls = await _get_class_or_404(class_id)
    _assert_teacher_owns(actor, cls)

    max_bytes = await _max_upload_bytes()
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File is larger than the {max_bytes // (1024 * 1024)} MB limit.",
        )
    if not data.startswith(PDF_MAGIC):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    pages = extract_pdf_pages(data)
    chunks = chunk_pages(pages)
    text = "\n\n".join(p["text"] for p in pages)
    return await _insert_material(actor, cls, name=filename, kind="pdf", text=text, chunks=chunks)


async def upload_text_material(actor: CurrentUser, class_id: str, *, name: str, text: str) -> dict:
    cls = await _get_class_or_404(class_id)
    _assert_teacher_owns(actor, cls)

    text = text.strip()
    if len(text) < MIN_PASTED_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Pasted text must be at least {MIN_PASTED_CHARS} characters.",
        )
    chunks = chunk_pages([{"page": None, "text": text}])
    return await _insert_material(actor, cls, name=name, kind="text", text=text, chunks=chunks)


async def list_materials(user: CurrentUser, class_id: str) -> list[dict]:
    cls = await _get_class_or_404(class_id)
    _assert_read_access(user, cls)
    db = get_db()
    cursor = db.materials.find({"class_id": class_id}).sort("created_at", -1)
    return [_material_summary(m) async for m in cursor]


async def _get_material_or_404(material_id: str) -> dict:
    db = get_db()
    doc = await db.materials.find_one({"_id": oid(material_id)})
    if doc is None:
        raise HTTPException(status_code=404, detail="Material not found.")
    return doc


async def get_material(user: CurrentUser, material_id: str) -> dict:
    doc = await _get_material_or_404(material_id)
    cls = await _get_class_or_404(doc["class_id"])
    _assert_read_access(user, cls)
    return to_out(doc)


async def delete_material(actor: CurrentUser, material_id: str) -> None:
    doc = await _get_material_or_404(material_id)
    cls = await _get_class_or_404(doc["class_id"])
    _assert_teacher_owns(actor, cls)

    db = get_db()
    blocking = await db.exams.find_one(
        {"material_ids": material_id, "status": {"$ne": "draft"}}
    )
    if blocking:
        raise HTTPException(
            status_code=409,
            detail="This material is used by a non-draft exam and cannot be deleted.",
        )
    await db.materials.delete_one({"_id": doc["_id"]})
    await log_activity(actor, f"Deleted material '{doc['name']}' from {cls['code']}")
